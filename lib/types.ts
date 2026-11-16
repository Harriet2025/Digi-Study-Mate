/**
 * Shapes returned by the Python API (backend/). Keep in sync with
 * backend/app/episodes/service.py → manifest().
 */

export type Speaker = "Alex" | "Sam";
export type LineType = "dialogue" | "quiz_checkpoint";

export interface ScriptLine {
  speaker: Speaker;
  text: string;
  type: LineType;
}

/** One playable audio file. A long script line may span several segments. */
export interface AudioSegment {
  index: number;
  /** Index of the script line this audio belongs to. */
  lineIndex: number;
  speaker: Speaker;
  type: LineType;
  text: string;
  /** e.g. "/media/episodes/<id>/0000-alex.mp3" (served by the Python API). */
  url: string;
  storagePath: string;
  /** Position on the episode timeline, in seconds. */
  startSec: number;
  endSec: number;
  durationSec: number;
  /** Silence the player leaves after this segment (turn gap, or thinking time after a quiz question). */
  pauseAfterSec: number;
}

export interface AudioManifest {
  version: 1;
  scriptId: string;
  title?: string;
  provider: string;
  createdAt: string | null;
  totalDurationSec: number;
  manifestUrl: string;
  segments: AudioSegment[];
}

/** Where the Next.js server reaches the Python API. The browser uses relative /api and /media URLs instead. */
export const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8010";
