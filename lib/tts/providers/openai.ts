import type { Speaker } from "@/lib/ai/generateScript";
import { TtsError, ttsErrorFromResponse, type SynthesisContext, type TtsProvider } from "../types";
import { OPENAI_VOICES } from "../voices";

const ENDPOINT = "https://api.openai.com/v1/audio/speech";
const REQUEST_TIMEOUT_MS = 90_000;

export class OpenAITtsProvider implements TtsProvider {
  readonly name = "openai";
  // The speech endpoint accepts up to 4,096 characters.
  readonly maxCharsPerRequest = 4_000;
  readonly defaultConcurrency = 4;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
  ) {}

  async synthesize(text: string, speaker: Speaker, context: SynthesisContext): Promise<Uint8Array> {
    const voice = OPENAI_VOICES[speaker];
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          voice: voice.voice,
          input: text,
          instructions: voice.instructions,
          response_format: "mp3",
        }),
        signal: AbortSignal.any([context.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      });
    } catch (err) {
      if (context.signal.aborted) throw err;
      throw new TtsError("Could not reach OpenAI.", { retryable: true, cause: err });
    }

    if (!res.ok) throw await ttsErrorFromResponse(this.name, res);

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new TtsError("OpenAI returned empty audio.", { retryable: true });
    }
    return bytes;
  }
}
