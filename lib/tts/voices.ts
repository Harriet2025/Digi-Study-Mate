import type { Speaker } from "@/lib/ai/generateScript";

/**
 * Voice profiles for the two hosts. Voice IDs can be overridden with env vars
 * so you can swap voices without a code change.
 */

export interface ElevenLabsVoice {
  voiceId: string;
  settings: {
    /** Lower = more expressive and varied, higher = steadier. */
    stability: number;
    similarity_boost: number;
    /** Exaggerates the voice's speaking style. Keep low for clarity. */
    style: number;
    use_speaker_boost: boolean;
    speed: number;
  };
}


export const ELEVENLABS_VOICES: Record<Speaker, ElevenLabsVoice> = {
  // Warm, authoritative tutor: steadier delivery, slightly slower pace.
  Alex: {
    voiceId: process.env.ELEVENLABS_VOICE_ALEX || "JBFqnCBsd6RMkjVDRZzb", // "George": warm, mature narrator
    settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 0.97 },
  },
  // Energetic, relatable student: more expressive, slightly quicker.
  Sam: {
    voiceId: process.env.ELEVENLABS_VOICE_SAM || "TX3LPaxmHKxFdv7VOQHJ", // "Liam": young, energetic
    settings: { stability: 0.38, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true, speed: 1.04 },
  },
};
