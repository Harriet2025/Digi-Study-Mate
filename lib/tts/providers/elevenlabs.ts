import type { Speaker } from "@/lib/ai/generateScript";
import { TtsError, ttsErrorFromResponse, type SynthesisContext, type TtsProvider } from "../types";
import { ELEVENLABS_VOICES } from "../voices";

const BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const REQUEST_TIMEOUT_MS = 90_000;

export class ElevenLabsProvider implements TtsProvider {
  readonly name = "elevenlabs";
  // eleven_multilingual_v2 accepts 10,000 characters; stay well under it so lines split at sentence boundaries.
  readonly maxCharsPerRequest = 2_500;
  // Free plan allows 2 concurrent multilingual_v2 requests. Raise via TTS_CONCURRENCY on paid plans.
  readonly defaultConcurrency = 2;

  constructor(
    private readonly apiKey: string,
    private readonly modelId: string = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
  ) {}

  async synthesize(text: string, speaker: Speaker, context: SynthesisContext): Promise<Uint8Array> {
    const voice = ELEVENLABS_VOICES[speaker];
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/${encodeURIComponent(voice.voiceId)}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": this.apiKey, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({
          text,
          model_id: this.modelId,
          voice_settings: voice.settings,
          previous_text: context.previousText,
          next_text: context.nextText,
        }),
        signal: AbortSignal.any([context.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      });
    } catch (err) {
      if (context.signal.aborted) throw err;
      throw new TtsError("Could not reach ElevenLabs.", { retryable: true, cause: err });
    }

    if (!res.ok) throw await ttsErrorFromResponse(this.name, res);

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new TtsError("ElevenLabs returned empty audio.", { retryable: true });
    }
    return bytes;
  }
}
