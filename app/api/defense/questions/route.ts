import { NextResponse } from "next/server";
import { z } from "zod";
import { DefenseError } from "@/lib/defense/errors";
import { generateDefenseQuestions } from "@/lib/defense/generateQuestions";
import { defenseErrorResponse, type ErrorBody } from "@/lib/defense/http";
import type { DefenseQuestionSet } from "@/lib/defense/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// Reading a whole deck and writing five rubrics takes a while.
export const maxDuration = 120;

const BodySchema = z
  .object({
    /** An uploaded document (from POST /api/upload). */
    documentId: z.string().uuid().optional(),
    /** Or raw slide notes / text. */
    text: z.string().max(400_000).optional(),
    title: z.string().max(300).optional(),
  })
  .refine((b) => Boolean(b.documentId) !== Boolean(b.text?.trim()), {
    message: "Provide either documentId or text, not both.",
  });

/**
 * POST /api/defense/questions
 * Body: { documentId } or { text, title? }
 * 201 → DefenseQuestionSet (5 questions, rubrics withheld until answered).
 */
export async function POST(request: Request): Promise<NextResponse<DefenseQuestionSet | ErrorBody>> {
  try {
    let body: z.infer<typeof BodySchema>;
    try {
      body = BodySchema.parse(await request.json());
    } catch (err) {
      throw new DefenseError("INVALID_REQUEST", 400, "Send JSON with either a documentId or the slide text.", { cause: err });
    }

    const set = await generateDefenseQuestions(getSupabaseAdmin(), body, { signal: request.signal });
    return NextResponse.json(set, { status: 201 });
  } catch (err) {
    return defenseErrorResponse(err, "defense/questions");
  }
}
