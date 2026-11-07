import { z } from "zod";
import { withRetry } from "@/lib/tts/async";

/**
 * Minimal Groq client (OpenAI-compatible REST API) used by every AI feature.
 * Docs: https://console.groq.com/docs
 */

const BASE_URL = "https://api.groq.com/openai/v1";

/** Groq's flagship production model; supports strict JSON-schema output. */
export const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
/** Speech-to-text. "whisper-large-v3" is slower but slightly more accurate. */
export const GROQ_WHISPER_MODEL = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";

/** gpt-oss-120b has a 131k-token context window. Leave room for the response. */
export const MAX_INPUT_CHARS = 320_000;

const REQUEST_TIMEOUT_MS = 120_000;

export type GroqErrorKind =
  | "CONFIGURATION" // missing API key
  | "RATE_LIMITED" // 429 after retries
  | "TRUNCATED" // hit max_completion_tokens
  | "INVALID_OUTPUT" // response didn't match the schema
  | "UPSTREAM"; // other API / network failure

export class GroqError extends Error {
  readonly kind: GroqErrorKind;
  readonly status?: number;
  /** Read by withRetry: worth retrying (429 / 5xx / network). */
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    kind: GroqErrorKind,
    message: string,
    options: { status?: number; retryable?: boolean; retryAfterMs?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "GroqError";
    this.kind = kind;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
  }
}

function apiKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new GroqError("CONFIGURATION", "GROQ_API_KEY is not set.");
  return key;
}

function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** Turns a failed HTTP response into a GroqError, marking 429/5xx as retryable. */
async function errorFromResponse(res: Response): Promise<GroqError> {
  const body = await res.text().catch(() => "");
  const retryAfter = Number(res.headers.get("retry-after"));
  return new GroqError(res.status === 429 ? "RATE_LIMITED" : "UPSTREAM", `Groq ${res.status}: ${body.slice(0, 500)}`, {
    status: res.status,
    retryable: res.status === 429 || res.status >= 500,
    retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
  });
}

async function post(path: string, body: BodyInit, headers: Record<string, string>, signal?: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey()}`, ...headers },
      body,
      signal: withTimeout(signal),
    });
  } catch (err) {
    if (err instanceof GroqError || signal?.aborted) throw err;
    throw new GroqError("UPSTREAM", "Couldn't reach Groq.", { retryable: true, cause: err });
  }
  if (!res.ok) throw await errorFromResponse(res);
  return res;
}

// ---------------------------------------------------------------------------
// Chat completions
// ---------------------------------------------------------------------------

export interface ChatOptions {
  system: string;
  user: string;
  /** Upper bound on output, including the model's hidden reasoning. */
  maxTokens?: number;
  /** How hard gpt-oss thinks before answering. */
  reasoningEffort?: "low" | "medium" | "high";
  signal?: AbortSignal;
}

interface ChatResponse {
  choices: { message: { content: string | null }; finish_reason: string }[];
}

async function chat(options: ChatOptions, responseFormat?: unknown): Promise<string> {
  const res = await withRetry(
    () =>
      post(
        "/chat/completions",
        JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: options.system },
            { role: "user", content: options.user },
          ],
          max_completion_tokens: options.maxTokens ?? 16_000,
          reasoning_effort: options.reasoningEffort ?? "medium",
          ...(responseFormat ? { response_format: responseFormat } : {}),
        }),
        { "content-type": "application/json" },
        options.signal,
      ),
    { maxAttempts: 4, signal: options.signal },
  );

  const data = (await res.json()) as ChatResponse;
  const choice = data.choices?.[0];
  if (!choice) throw new GroqError("INVALID_OUTPUT", "Groq returned no choices.");
  if (choice.finish_reason === "length") {
    throw new GroqError("TRUNCATED", "The response was cut off before it finished.");
  }
  return choice.message.content ?? "";
}

/** Plain-text completion. */
export async function groqText(options: ChatOptions): Promise<string> {
  return (await chat(options)).trim();
}

/**
 * Completion constrained to a zod schema via Groq's strict structured outputs,
 * then parsed and validated with the same schema.
 */
export async function groqJson<Schema extends z.ZodType>(
  options: ChatOptions & { schema: Schema; schemaName: string },
): Promise<z.infer<Schema>> {
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(options.schema, { target: "draft-7", io: "output" }) as Record<
    string,
    unknown
  >;

  const content = await chat(options, {
    type: "json_schema",
    json_schema: { name: options.schemaName, strict: true, schema: jsonSchema },
  });

  try {
    return options.schema.parse(JSON.parse(content));
  } catch (err) {
    throw new GroqError("INVALID_OUTPUT", "Groq's response didn't match the expected format.", { cause: err });
  }
}

// ---------------------------------------------------------------------------
// Speech to text
// ---------------------------------------------------------------------------

/** Transcribes an audio recording with Groq Whisper. */
export async function groqTranscribe(
  audio: Blob,
  filename: string,
  options: { prompt?: string; signal?: AbortSignal } = {},
): Promise<string> {
  const res = await withRetry(
    () => {
      const form = new FormData();
      form.append("file", audio, filename);
      form.append("model", GROQ_WHISPER_MODEL);
      form.append("response_format", "json");
      // Whisper's prompt is capped at 224 tokens; a title is plenty.
      if (options.prompt) form.append("prompt", options.prompt.slice(0, 400));
      return post("/audio/transcriptions", form, {}, options.signal);
    },
    { maxAttempts: 3, signal: options.signal },
  );
  const data = (await res.json()) as { text?: unknown };
  return typeof data.text === "string" ? data.text.trim() : "";
}
