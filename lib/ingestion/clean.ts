import type { ExtractedPage } from "./types";

/** One visual line of text as it came out of the extractor. */
export interface RawLine {
  text: string;
  /** Vertical position (larger = higher on the page). Used to find header/footer lines. */
  y?: number;
  /** True when this line starts a new block (paragraph, text box, heading). */
  breakBefore: boolean;
  /** Never remove as boilerplate (e.g. slide titles). */
  protected?: boolean;
}

export interface RawPage {
  number: number;
  lines: RawLine[];
}

export interface CleanOptions {
  /** Join soft-wrapped lines back into paragraphs (PDF). Off for slides, where each line is a bullet. */
  joinWrappedLines: boolean;
  /** How many lines at the top and bottom of each page are checked for page numbers. */
  pageNumberEdgeLines: number;
  /** Where to look for boilerplate that repeats across pages. */
  repeatedLines: { scope: "edges"; edgeLines: number } | { scope: "anywhere" };
  /**
   * When true, lines that differ only in digits count as the same ("Ch. 3 - p. 12" vs "Ch. 3 - p. 13"),
   * but they must also sit at the same height on every page when the position is known.
   * When false, only exact repeats count.
   */
  fuzzyRepeatMatch: boolean;
}

const LIGATURES: Record<string, string> = {
  "ﬀ": "ff",
  "ﬁ": "fi",
  "ﬂ": "fl",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
  "ﬅ": "st",
  "ﬆ": "st",
};

// Bullet glyphs, including Private Use Area code points that Symbol/Wingdings fonts emit in PDFs.
const BULLET_PREFIX =
  /^[•‣⁃∙·▪▫■□●○◦►▶➢➔✓✔]\s*/u;

const PAGE_NUMBER_PATTERNS: RegExp[] = [
  /^(page|pg\.?|p\.|slide)?\s*\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i, // "12", "Page 3", "3 of 10", "3/10"
  /^[-–—]\s*\d{1,4}\s*[-–—]$/, // "- 3 -"
  /^[([]\s*\d{1,4}\s*[)\]]$/, // "(3)", "[3]"
  /^(x{1,3}|x{0,3}(ix|iv|v?i{1,3}|v))$/i, // roman numerals up to xxxix, used in front matter
];

/** Normalizes one line: ligatures, invisible characters, bullet glyphs, leaders, whitespace. */
export function normalizeLine(input: string): string {
  return input
    .normalize("NFC")
    .replace(/[ﬀ-ﬆ]/g, (ch) => LIGATURES[ch] ?? ch)
    .replace(/[  -   　]/g, " ") // exotic spaces -> space
    .replace(/[­​-‏⁠﻿]/g, "") // soft hyphen, zero-width chars
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "") // control chars
    .replace(/\t/g, " ")
    .trim()
    .replace(BULLET_PREFIX, "- ")
    .replace(/[-]/g, "") // leftover private-use glyphs (icon fonts)
    .replace(/\s*(?:\.\s?){4,}\s*(\d{1,4})$/, " $1") // table-of-contents dot leaders
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Lines made only of punctuation or rules ("------", "_____", "* * *"). */
function isDecorative(line: string): boolean {
  return /^[\s\-_=.·*~|•–—]+$/.test(line);
}

export function isPageNumber(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && t.length <= 20 && PAGE_NUMBER_PATTERNS.some((re) => re.test(t));
}

/** Key for spotting the same header/footer across pages. */
function repeatKey(line: RawLine, fuzzy: boolean): string {
  const text = line.text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!fuzzy) return text;
  const position = typeof line.y === "number" ? `@${Math.round(line.y / 8)}` : "";
  return text.replace(/\d+/g, "#") + position;
}

/** Indices of the top-N and bottom-N lines on the page, by position when available. */
function edgeIndices(lines: RawLine[], n: number): Set<number> {
  const order = lines.map((_, i) => i);
  if (lines.every((l) => typeof l.y === "number")) {
    order.sort((a, b) => (lines[b]!.y as number) - (lines[a]!.y as number));
  }
  return new Set([...order.slice(0, n), ...order.slice(-n)]);
}

/**
 * Cleans raw extracted lines into per-page text:
 * 1. normalizes each line and drops empty or decorative ones,
 * 2. removes page numbers and boilerplate repeated across pages (running headers/footers),
 * 3. rebuilds paragraphs, separated by blank lines.
 */
export function cleanPages(rawPages: RawPage[], options: CleanOptions): ExtractedPage[] {
  // 1. Normalize, carrying a dropped line's paragraph break over to the next line.
  const pages = rawPages.map((page) => {
    const lines: RawLine[] = [];
    let pendingBreak = false;
    for (const line of page.lines) {
      const text = normalizeLine(line.text);
      if (!text || isDecorative(text)) {
        pendingBreak ||= line.breakBefore;
        continue;
      }
      lines.push({ ...line, text, breakBefore: line.breakBefore || pendingBreak });
      pendingBreak = false;
    }
    return { number: page.number, lines };
  });

  // 2. Count how many pages each candidate line appears on.
  const { fuzzyRepeatMatch: fuzzy, repeatedLines } = options;
  const repeatCandidates = pages.map((p) =>
    repeatedLines.scope === "anywhere" ? new Set(p.lines.keys()) : edgeIndices(p.lines, repeatedLines.edgeLines),
  );
  const pageNumberCandidates = pages.map((p) => edgeIndices(p.lines, options.pageNumberEdgeLines));

  const pageFrequency = new Map<string, number>();
  pages.forEach((page, p) => {
    const seen = new Set<string>();
    for (const i of repeatCandidates[p]!) seen.add(repeatKey(page.lines[i]!, fuzzy));
    for (const key of seen) pageFrequency.set(key, (pageFrequency.get(key) ?? 0) + 1);
  });

  // Boilerplate = appears on at least 3 pages and at least 40% of all pages.
  const minRepeats = Math.max(3, Math.ceil(pages.length * 0.4));

  return pages.map((page, p) => {
    const kept: RawLine[] = [];
    let pendingBreak = false;
    page.lines.forEach((line, i) => {
      const isBoilerplate =
        !line.protected &&
        ((pageNumberCandidates[p]!.has(i) && isPageNumber(line.text)) ||
          (repeatCandidates[p]!.has(i) && (pageFrequency.get(repeatKey(line, fuzzy)) ?? 0) >= minRepeats));
      if (isBoilerplate) {
        pendingBreak ||= line.breakBefore;
        return;
      }
      kept.push({ ...line, breakBefore: line.breakBefore || pendingBreak });
      pendingBreak = false;
    });

    // 3. Group lines into paragraphs.
    const paragraphs: string[][] = [];
    for (const line of kept) {
      const current = paragraphs.at(-1);
      if (!current || line.breakBefore) paragraphs.push([line.text]);
      else current.push(line.text);
    }

    const text = paragraphs
      .map((lines) => (options.joinWrappedLines ? joinWrappedLines(lines) : lines.join("\n")))
      .filter(Boolean)
      .join("\n\n");

    return { number: page.number, text };
  });
}

const LIST_ITEM = /^(-\s|\d{1,3}[.)]\s|[a-z][.)]\s|\([a-z0-9]{1,3}\)\s)/i;

/** Re-joins lines a PDF wrapped mid-sentence, keeping list items on their own lines and undoing hyphenation. */
function joinWrappedLines(lines: string[]): string {
  let out = "";
  for (const line of lines) {
    if (!out) out = line;
    else if (LIST_ITEM.test(line)) out += `\n${line}`;
    else if (/[a-z]-$/.test(out) && /^[a-z]/.test(line)) out = out.slice(0, -1) + line; // "infor-" + "mation"
    else out += ` ${line}`;
  }
  return out;
}
