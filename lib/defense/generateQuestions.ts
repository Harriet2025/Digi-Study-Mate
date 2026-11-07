import type { SupabaseClient } from "@supabase/supabase-js";
import { GROQ_MODEL, groqJson, MAX_INPUT_CHARS } from "@/lib/ai/groq";
import { DefenseError } from "./errors";
import { buildQuestionGenerationMessage, QUESTION_GENERATION_SYSTEM_PROMPT, QUESTIONS_PER_SET } from "./prompts";
import { GeneratedQuestionSetSchema } from "./schemas";
import type { DefenseQuestion, DefenseQuestionSet } from "./types";

const MAX_MATERIAL_CHARS = MAX_INPUT_CHARS;

/** Loads a stored document's chunks as text, with page markers the questions can cite. */
export async function loadDocumentMaterial(
  db: SupabaseClient,
  documentId: string,
): Promise<{ material: string; title: string }> {
  const { data: doc, error: docError } = await db
    .from("documents")
    .select("filename, source_type")
    .eq("id", documentId)
    .maybeSingle<{ filename: string; source_type: "pdf" | "pptx" }>();
  if (docError) throw new DefenseError("STORAGE_FAILED", 502, "The document couldn't be loaded.", { cause: docError });
  if (!doc) throw new DefenseError("NOT_FOUND", 404, "That document doesn't exist.");

  const { data: chunks, error } = await db
    .from("document_chunks")
    .select("content, page_start, page_end")
    .eq("document_id", documentId)
    .order("chunk_index", { ascending: true })
    .returns<{ content: string; page_start: number; page_end: number }[]>();
  if (error) throw new DefenseError("STORAGE_FAILED", 502, "The document couldn't be loaded.", { cause: error });

  const unit = doc.source_type === "pptx" ? "Slide" : "Page";
  const material = (chunks ?? [])
    .map((c) => {
      const range = c.page_start === c.page_end ? `${c.page_start}` : `${c.page_start}–${c.page_end}`;
      return `[${unit}${c.page_start === c.page_end ? "" : "s"} ${range}]\n${c.content}`;
    })
    .join("\n\n");

  return { material, title: doc.filename.replace(/\.(pdf|pptx)$/i, "") };
}

/**
 * Generates 5 rigorous defense questions with rubrics, stores the set,
 * and returns it without rubrics (those stay server-side until answering).
 */
export async function generateDefenseQuestions(
  db: SupabaseClient,
  input: { documentId?: string; text?: string; title?: string },
  options: { signal?: AbortSignal } = {},
): Promise<DefenseQuestionSet> {
  let material: string;
  let title = input.title;

  if (input.documentId) {
    const loaded = await loadDocumentMaterial(db, input.documentId);
    material = loaded.material;
    title ??= loaded.title;
  } else {
    material = input.text?.trim() ?? "";
  }

  if (!material) throw new DefenseError("EMPTY_INPUT", 422, "There's no text in this material to generate questions from.");
  if (material.length > MAX_MATERIAL_CHARS) {
    throw new DefenseError(
      "INPUT_TOO_LARGE",
      413,
      `This material is ${material.length.toLocaleString()} characters; the limit is ${MAX_MATERIAL_CHARS.toLocaleString()}. Try a single chapter or slide deck.`,
    );
  }

  // High reasoning effort: finding real weak points is the hard part of this task.
  const generated = await groqJson({
    system: QUESTION_GENERATION_SYSTEM_PROMPT,
    user: buildQuestionGenerationMessage(material, title),
    schema: GeneratedQuestionSetSchema,
    schemaName: "defense_question_set",
    maxTokens: 32_000,
    reasoningEffort: "high",
    signal: options.signal,
  });

  if (generated.questions.length < QUESTIONS_PER_SET) {
    throw new DefenseError("INVALID_OUTPUT", 502, "The questions couldn't be generated properly. Please try again.");
  }

  // Assign stable IDs; keep exactly 5 questions.
  const questions: DefenseQuestion[] = generated.questions.slice(0, QUESTIONS_PER_SET).map((q, qi) => {
    const id = `q${qi + 1}`;
    if (q.rubric.keyPoints.length === 0) {
      throw new DefenseError("INVALID_OUTPUT", 502, "A question was generated without a rubric. Please try again.");
    }
    return {
      id,
      question: q.question.trim(),
      category: q.category,
      targetsWeakness: q.targetsWeakness.trim(),
      sourceReference: q.sourceReference.trim(),
      rubric: {
        ...q.rubric,
        keyPoints: q.rubric.keyPoints.map((k, ki) => ({ ...k, id: `${id}-k${ki + 1}` })),
      },
    };
  });

  const { data, error } = await db
    .from("defense_question_sets")
    .insert({
      document_id: input.documentId ?? null,
      source_title: title ?? null,
      overall_weaknesses: generated.overallWeaknesses,
      questions,
      model: GROQ_MODEL,
    })
    .select("id, created_at")
    .single<{ id: string; created_at: string }>();
  if (error || !data) throw new DefenseError("STORAGE_FAILED", 502, "The questions couldn't be saved.", { cause: error });

  return {
    setId: data.id,
    documentId: input.documentId ?? null,
    createdAt: data.created_at,
    overallWeaknesses: generated.overallWeaknesses,
    questions: questions.map(({ rubric: _rubric, ...publicQuestion }) => publicQuestion),
  };
}
