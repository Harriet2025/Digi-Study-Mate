import { NextResponse } from "next/server";
import { z } from "zod";
import { transcribeQuestion, whisperExtension } from "@/lib/ask/transcribe";
import { DefenseError } from "@/lib/defense/errors";
import { evaluateAnswer, MAX_ANSWER_CHARS } from "@/lib/defense/evaluateAnswer";
import { defenseErrorResponse, isUuid, type ErrorBody } from "@/lib/defense/http";
import type { AnswerEvaluation } from "@/lib/defense/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 90;

/** Whisper's upload limit; a few minutes of speech is far below it. */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const TypedSchema = z.object({
  setId: z.string().uuid(),
  questionId: z.string().regex(/^q\d{1,2}$/),
  answer: z.string().min(1).max(MAX_ANSWER_CHARS),
});

/**
 * POST /api/defense/evaluate
 * Typed answer:  JSON { setId, questionId, answer }
 * Spoken answer: multipart/form-data { setId, questionId, audio }
 * 200 → AnswerEvaluation (score, key-point results, feedback, and the rubric).
 */
export async function POST(request: Request): Promise<NextResponse<AnswerEvaluation | ErrorBody>> {
  try {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    const db = getSupabaseAdmin();
    const signal = request.signal;

    if (contentType.startsWith("multipart/form-data")) {
      if (Number(request.headers.get("content-length")) > MAX_AUDIO_BYTES + 100_000) {
        throw new DefenseError("INPUT_TOO_LARGE", 413, "That recording is too long. Keep answers under a few minutes.");
      }
      const form = await request.formData().catch((err) => {
        throw new DefenseError("INVALID_REQUEST", 400, "The request could not be read.", { cause: err });
      });

      const setId = form.get("setId");
      const questionId = form.get("questionId");
      const audio = form.get("audio");
      if (!isUuid(setId) || typeof questionId !== "string" || !/^q\d{1,2}$/.test(questionId)) {
        throw new DefenseError("INVALID_REQUEST", 400, "setId and questionId are required.");
      }
      if (!(audio instanceof File) || audio.size === 0) {
        throw new DefenseError("INVALID_REQUEST", 400, "No recording was received.");
      }
      if (audio.size > MAX_AUDIO_BYTES) {
        throw new DefenseError("INPUT_TOO_LARGE", 413, "That recording is too long. Keep answers under a few minutes.");
      }
      const extension = whisperExtension(audio.type);
      if (!extension) throw new DefenseError("INVALID_REQUEST", 415, `Unsupported recording format "${audio.type}".`);

      const transcript = await transcribeQuestion(audio, extension, { signal });
      if (!transcript) throw new DefenseError("EMPTY_INPUT", 422, "We couldn't hear an answer. Try recording again.");

      return NextResponse.json(
        await evaluateAnswer(db, { setId, questionId, answer: transcript, inputMode: "spoken" }, { signal }),
      );
    }

    if (contentType.startsWith("application/json")) {
      let body: z.infer<typeof TypedSchema>;
      try {
        body = TypedSchema.parse(await request.json());
      } catch (err) {
        throw new DefenseError("INVALID_REQUEST", 400, "Send JSON with setId, questionId and answer.", { cause: err });
      }
      return NextResponse.json(await evaluateAnswer(db, { ...body, inputMode: "typed" }, { signal }));
    }

    throw new DefenseError("INVALID_REQUEST", 415, "Send JSON for typed answers or multipart/form-data for spoken ones.");
  } catch (err) {
    return defenseErrorResponse(err, "defense/evaluate");
  }
}
