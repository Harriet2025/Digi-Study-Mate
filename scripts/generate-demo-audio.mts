/**
 * Writes silent placeholder MP3s for the demo episode to public/demo/.
 * Run: npx tsx scripts/generate-demo-audio.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { DEMO_FRAME_SEC, DEMO_LINES, demoDurationSec, demoFileName } from "../lib/demo/demoManifest.ts";

// MPEG-1 Layer III, 32 kbps, 32 kHz, mono, no padding: 144-byte frames of 1152 samples (36 ms).
const FRAME_HEADER = [0xff, 0xfb, 0x18, 0xc4];
const FRAME_BYTES = 144;

mkdirSync("public/demo", { recursive: true });
DEMO_LINES.forEach((line, i) => {
  const frames = Math.round(demoDurationSec(line.text) / DEMO_FRAME_SEC);
  const mp3 = new Uint8Array(frames * FRAME_BYTES);
  for (let f = 0; f < frames; f++) mp3.set(FRAME_HEADER, f * FRAME_BYTES);
  writeFileSync(`public/demo/${demoFileName(i)}`, mp3);
});
console.log(`Wrote ${DEMO_LINES.length} files to public/demo`);
