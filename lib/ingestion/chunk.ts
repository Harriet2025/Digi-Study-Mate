import type { ExtractedPage, TextChunk } from "./types";

export interface ChunkOptions {
  /** Chunks below this size are merged into a neighbour when possible. */
  minTokens: number;
  /** Once a chunk reaches this size it is closed at the next paragraph boundary. */
  targetTokens: number;
  /** Hard ceiling. No chunk goes above this. */
  maxTokens: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = { minTokens: 500, targetTokens: 800, maxTokens: 1000 };

/**
 * Estimates tokens from characters (about 4 per token for English prose).
 * Good enough for sizing chunks; swap in a real tokenizer if you need exact counts.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface Block {
  text: string;
  page: number;
  tokens: number;
  isHeading: boolean;
}

/**
 * Splits page text into chunks of roughly `targetTokens`, breaking only between
 * paragraphs where possible. A new chunk starts at a heading once the current
 * one is at least `minTokens`, so sections stay together, and a heading is
 * never left as the last line of a chunk.
 */
export function chunkPages(pages: ExtractedPage[], options: ChunkOptions = DEFAULT_CHUNK_OPTIONS): TextChunk[] {
  const { minTokens, targetTokens, maxTokens } = options;
  if (!(minTokens > 0 && minTokens <= targetTokens && targetTokens <= maxTokens)) {
    throw new RangeError("Chunk options must satisfy 0 < minTokens <= targetTokens <= maxTokens.");
  }

  const blocks = pages.flatMap((page) =>
    page.text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .flatMap((p) => splitOversized(p, maxTokens))
      .map((text) => ({ text, page: page.number, tokens: estimateTokens(text), isHeading: looksLikeHeading(text) })),
  );

  const groups: Block[][] = [];
  let current: Block[] = [];
  let currentTokens = 0;

  const flush = () => {
    if (current.length === 0) return;
    // Don't end a chunk on a heading; move it to the start of the next chunk.
    const carry: Block[] = [];
    while (current.length > 1 && current.at(-1)!.isHeading) carry.unshift(current.pop()!);
    groups.push(current);
    current = carry;
    currentTokens = sumTokens(carry);
  };

  for (const block of blocks) {
    const separator = current.length > 0 ? 1 : 0;
    if (
      current.length > 0 &&
      (currentTokens + separator + block.tokens > maxTokens ||
        currentTokens >= targetTokens ||
        (block.isHeading && currentTokens >= minTokens))
    ) {
      flush();
      // A carried-over heading plus this block could still overflow.
      if (currentTokens + block.tokens + 1 > maxTokens) {
        groups.push(current);
        current = [];
        currentTokens = 0;
      }
    }
    current.push(block);
    currentTokens += (current.length > 1 ? 1 : 0) + block.tokens;
  }
  if (current.length > 0) groups.push(current);

  // Merge a short final chunk into the one before it if they fit together.
  if (groups.length >= 2) {
    const last = groups.at(-1)!;
    const prev = groups.at(-2)!;
    if (sumTokens(last) < minTokens && sumTokens(prev) + sumTokens(last) + 1 <= maxTokens) {
      prev.push(...last);
      groups.pop();
    }
  }

  return groups
    .filter((g) => g.length > 0)
    .map((group, index) => {
      const content = group.map((b) => b.text).join("\n\n");
      return {
        index,
        content,
        tokenCount: estimateTokens(content),
        pageStart: Math.min(...group.map((b) => b.page)),
        pageEnd: Math.max(...group.map((b) => b.page)),
      };
    });
}

function sumTokens(blocks: Block[]): number {
  return blocks.reduce((sum, b, i) => sum + b.tokens + (i > 0 ? 1 : 0), 0);
}

/** Short single line with no sentence-ending punctuation, e.g. "2.3 Cellular Respiration". */
function looksLikeHeading(text: string): boolean {
  return (
    !text.includes("\n") &&
    text.length <= 100 &&
    !/[.,;:!?]$/.test(text) &&
    !/^-\s/.test(text) &&
    /^[\p{Lu}\d]/u.test(text)
  );
}

/** Splits a paragraph bigger than `maxTokens` at sentence boundaries, then at word boundaries if needed. */
function splitOversized(paragraph: string, maxTokens: number): string[] {
  if (estimateTokens(paragraph) <= maxTokens) return [paragraph];

  const sentences = paragraph.split(/(?<=[.!?]["”')\]]?)\s+(?=["“(\[]?[\p{Lu}\d])|\n/u);
  const pieces = sentences.flatMap((s) => (estimateTokens(s) <= maxTokens ? [s] : splitByWords(s, maxTokens)));

  const out: string[] = [];
  let buf = "";
  for (const piece of pieces) {
    const candidate = buf ? `${buf} ${piece}` : piece;
    if (estimateTokens(candidate) > maxTokens && buf) {
      out.push(buf);
      buf = piece;
    } else {
      buf = candidate;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function splitByWords(text: string, maxTokens: number): string[] {
  const maxChars = maxTokens * 4;
  const out: string[] = [];
  let buf = "";
  for (const word of text.split(/\s+/)) {
    // A single "word" longer than the limit (e.g. a base64 blob) is cut outright.
    for (let w = word; w; w = w.slice(maxChars)) {
      const part = w.slice(0, maxChars);
      const candidate = buf ? `${buf} ${part}` : part;
      if (candidate.length > maxChars && buf) {
        out.push(buf);
        buf = part;
      } else {
        buf = candidate;
      }
    }
  }
  if (buf) out.push(buf);
  return out;
}
