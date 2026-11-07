import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DefenseError } from "./errors";
import { assertUsableResponse, DEFENSE_MODEL, getAnthropic } from "./generateQuestions";
import { buildEvaluationMessage, EVALUATION_SYSTEM_PROMPT } from "./prompts";
import { GeneratedEvaluationSchema } from "./schemas";
import type {
  AnswerEvaluation,
  DefenseQuestion,
  Grade,
  KeyPointImportance,
  KeyPointResult,
  KeyPointStatus,
} from "./types";

export const MAX_ANSWER_CHARS = 10_000;

const IMPORTANCE_WEIGHT: Record<KeyPointImportance, number> = { core: 3, important: 2, supporting: 1 };
const STATUS_CREDIT: Record<KeyPointStatus, number> = { covered: 1, partial: 0.5, missing: 0 };

/**
 * Score = importance-weighted share of key points covered (partial = half credit).
 * Computed here rather than by the model so grading is consistent and explainable.
 * Missing a "core" point caps the grade at "partial".
 */
export function scoreAnswer(results: Pick<KeyPointResult, "importance" | "status">[]): { score: number; grade: Grade } {
  const total = results.reduce((sum, r) => sum + IMPORTANCE_WEIGHT[r.importance], 0);
  const earned = results.reduce((sum, r) => sum + IMPORTANCE_WEIGHT[r.importance] * STATUS_CREDIT[r.status], 0);
  const score = total > 0 ? Math.round((earned / total) * 100) : 0;
  const missedCore = results.some((r) => r.importance === "core" && r.status === "missing");

  let grade: Grade = score >= 85 ? "excellent" : score >= 65 ? "good" : score >= 40 ? "partial" : "insufficient";
  if (missedCore && (grade === "excellent" || grade === "good")) grade = "partial";
  return { score, grade };
}

async function loadQuestion(db: SupabaseClient, setId: string, questionId: string): Promise<DefenseQuestion> {
  const { data, error } = await db
    .from("defense_question_sets")
    .select("questions")
    .eq("id", setId)
    .maybeSingle<{ questions: DefenseQuestion[] }>();
  if (error) throw new DefenseError("STORAGE_FAILED", 502, "The question set couldn't be loaded.", { cause: error });
  if (!data) throw new DefenseError("NOT_FOUND", 404, "That question set doesn't exist.");

  const question = data.questions.find((q) => q.id === questionId);
  if (!question) throw new DefenseError("NOT_FOUND", 404, "That question isn't part of this set.");
  return question;
}

/** Grades a typed answer or a spoken-answer transcript against the stored rubric, and records the attempt. */
export async function evaluateAnswer(
  db: SupabaseClient,
  input: { setId: string; questionId: string; answer: string; inputMode: "typed" | "spoken" },
  options: { signal?: AbortSignal } = {},
): Promise<AnswerEvaluation> {
  const answer = input.answer.trim();
  if (answer.split(/\s+/).length < 3) {
    throw new DefenseError("EMPTY_INPUT", 422, "Your answer is too short to grade. Try explaining your reasoning.");
  }
  if (answer.length > MAX_ANSWER_CHARS) {
    throw new DefenseError("INPUT_TOO_LARGE", 413, `Answers are limited to ${MAX_ANSWER_CHARS.toLocaleString()} characters.`);
  }

  const question = await loadQuestion(db, input.setId, input.questionId);

  const response = await getAnthropic().beta.messages.parse(
    {
      model: DEFENSE_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(GeneratedEvaluationSchema) },
      system: [{ type: "text", text: EVALUATION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildEvaluationMessage(question, answer, input.inputMode) }],
    },
    { signal: options.signal },
  );
  assertUsableResponse(response);

  const generated = response.parsed_output;
  if (!generated) {
    throw new DefenseError("INVALID_OUTPUT", 502, "The answer couldn't be graded. Please try again.");
  }

  // One result per rubric key point, in rubric order. A point the model skipped counts as missing.
  const byId = new Map(generated.keyPointResults.map((r) => [r.keyPointId, r]));
  const keyPointResults: KeyPointResult[] = question.rubric.keyPoints.map((k) => {
    const r = byId.get(k.id);
    return {
      keyPointId: k.id,
      point: k.point,
      importance: k.importance,
      status: r?.status ?? "missing",
      evidence: r?.status === "missing" ? null : (r?.evidence ?? null),
      comment: r?.comment ?? "Not addressed in the answer.",
    };
  });

  const { score, grade } = scoreAnswer(keyPointResults);

  const evaluation: Omit<AnswerEvaluation, "attemptId"> = {
    setId: input.setId,
    questionId: question.id,
    inputMode: input.inputMode,
    answer,
    score,
    grade,
    keyPointResults,
    missingTechnicalDetails: generated.missingTechnicalDetails,
    misconceptions: generated.misconceptions,
    strengths: generated.strengths,
    feedback: generated.feedback,
    improvedAnswerOutline: generated.improvedAnswerOutline,
    followUpQuestion: question.rubric.followUpQuestion,
    rubric: question.rubric,
  };

  const { data, error } = await db
    .from("defense_attempts")
    .insert({
      set_id: input.setId,
      question_id: question.id,
      answer_text: answer,
      input_mode: input.inputMode,
      score,
      evaluation,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new DefenseError("STORAGE_FAILED", 502, "Your attempt couldn't be saved.", { cause: error });

  return { attemptId: data.id, ...evaluation };
}
