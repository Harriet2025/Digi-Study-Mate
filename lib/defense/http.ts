import { NextResponse } from "next/server";
import { GroqError } from "@/lib/ai/groq";
import { AskError } from "@/lib/ask/errors";
import { IngestionError } from "@/lib/ingestion/errors";
import { DefenseError } from "./errors";

export type ErrorBody = { error: { code: string; message: string } };

/** Maps any error from the defense routes to a safe JSON response. */
export function defenseErrorResponse(err: unknown, route: string): NextResponse<ErrorBody> {
  const json = (status: number, code: string, message: string) =>
    NextResponse.json({ error: { code, message } }, { status });

  if (err instanceof DefenseError || err instanceof AskError || err instanceof IngestionError) {
    if (err.status >= 500) console.error(`[${route}] ${err.code}`, err.cause ?? err);
    return json(err.status, err.code, err.message);
  }
  if (err instanceof GroqError) {
    console.error(`[${route}] Groq ${err.kind}`, err.message);
    switch (err.kind) {
      case "CONFIGURATION":
        return json(500, "CONFIGURATION_ERROR", "AI features aren't set up on this server yet.");
      case "RATE_LIMITED":
        return json(429, "BUSY", "The examiner is busy right now. Try again in a moment.");
      case "TRUNCATED":
        return json(502, "TRUNCATED", "The response was cut off. Please try again.");
      case "INVALID_OUTPUT":
        return json(502, "INVALID_OUTPUT", "The AI examiner's response was incomplete. Please try again.");
      default:
        return json(502, "AI_FAILED", "The AI examiner couldn't respond. Please try again.");
    }
  }
  if (err instanceof Error && err.name === "AbortError") {
    return json(499, "CANCELLED", "The request was cancelled.");
  }
  console.error(`[${route}] unexpected error`, err);
  return json(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
