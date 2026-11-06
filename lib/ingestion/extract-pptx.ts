import JSZip from "jszip";
import { cleanPages, type RawLine, type RawPage } from "./clean";
import { IngestionError } from "./errors";
import type { ExtractedDocument } from "./types";
import { MAX_PAGES } from "./validate";

/** Cap on decompressed XML read, to guard against zip bombs. */
const MAX_XML_CHARS = 60_000_000;

/** Placeholder types that hold slide numbers, footers, dates and notes-page thumbnails. */
const NOISE_PLACEHOLDER = /<p:ph\b[^>]*\btype="(?:sldNum|ftr|dt|hdr|sldImg)"/;
const TITLE_PLACEHOLDER = /<p:ph\b[^>]*\btype="(?:title|ctrTitle)"/;

export async function extractPptx(bytes: Uint8Array): Promise<ExtractedDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (err) {
    throw new IngestionError("CORRUPT_FILE", 422, "This PowerPoint file could not be opened. It may be damaged.", {
      cause: err,
    });
  }

  if (!zip.file("ppt/presentation.xml")) {
    throw new IngestionError("UNSUPPORTED_FILE_TYPE", 415, "This file is not a PowerPoint presentation.");
  }

  const reader = new BudgetedReader(zip);
  const slidePaths = await getSlideOrder(reader);

  if (slidePaths.length === 0) {
    throw new IngestionError("NO_TEXT_CONTENT", 422, "This presentation has no slides.");
  }
  if (slidePaths.length > MAX_PAGES) {
    throw new IngestionError("TOO_MANY_PAGES", 413, `This deck has ${slidePaths.length} slides; the limit is ${MAX_PAGES}.`);
  }

  const rawPages: RawPage[] = [];
  for (const [i, slidePath] of slidePaths.entries()) {
    const slideXml = await reader.read(slidePath);
    const lines = slideXml ? xmlToLines(slideXml) : [];

    const notesPath = await findRelated(reader, slidePath, "notesSlide");
    const notesXml = notesPath ? await reader.read(notesPath) : null;
    const noteLines = notesXml ? xmlToLines(notesXml) : [];
    if (noteLines.length > 0) {
      noteLines[0] = { ...noteLines[0]!, text: `Speaker notes: ${noteLines[0]!.text}`, breakBefore: true };
    }

    rawPages.push({ number: i + 1, lines: [...lines, ...noteLines] });
  }

  return {
    sourceType: "pptx",
    pageCount: slidePaths.length,
    // Footer placeholders are already gone. What's left to catch is boilerplate typed
    // into ordinary text boxes ("Confidential", course code), so match exact repeats anywhere.
    pages: cleanPages(rawPages, {
      joinWrappedLines: false,
      pageNumberEdgeLines: 1,
      repeatedLines: { scope: "anywhere" },
      fuzzyRepeatMatch: false,
    }),
  };
}

/** Reads zip entries as text and enforces a total size budget. */
class BudgetedReader {
  private used = 0;
  constructor(private readonly zip: JSZip) {}

  async read(path: string): Promise<string | null> {
    const entry = this.zip.file(path);
    if (!entry) return null;
    const text = await entry.async("string");
    this.used += text.length;
    if (this.used > MAX_XML_CHARS) {
      throw new IngestionError("FILE_TOO_LARGE", 413, "This presentation contains too much data to process.");
    }
    return text;
  }
}

/** Slide paths in presentation order (sldIdLst), which can differ from file numbering after reordering. */
async function getSlideOrder(reader: BudgetedReader): Promise<string[]> {
  const presentation = (await reader.read("ppt/presentation.xml")) ?? "";
  const rels = parseRelationships((await reader.read("ppt/_rels/presentation.xml.rels")) ?? "", "ppt");

  const ordered: string[] = [];
  for (const match of presentation.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)) {
    const target = rels.get(match[1]!);
    if (target?.type.endsWith("/slide")) ordered.push(target.path);
  }
  return ordered;
}

async function findRelated(reader: BudgetedReader, partPath: string, relType: string): Promise<string | null> {
  const dir = partPath.slice(0, partPath.lastIndexOf("/"));
  const name = partPath.slice(partPath.lastIndexOf("/") + 1);
  const relsXml = await reader.read(`${dir}/_rels/${name}.rels`);
  if (!relsXml) return null;
  for (const rel of parseRelationships(relsXml, dir).values()) {
    if (rel.type.endsWith(`/${relType}`)) return rel.path;
  }
  return null;
}

function parseRelationships(xml: string, baseDir: string): Map<string, { type: string; path: string }> {
  const rels = new Map<string, { type: string; path: string }>();
  for (const match of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = match[0];
    const id = /\bId="([^"]+)"/.exec(tag)?.[1];
    const type = /\bType="([^"]+)"/.exec(tag)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(tag)?.[1];
    if (id && type && target && !/\bTargetMode="External"/.test(tag)) {
      rels.set(id, { type, path: resolvePath(baseDir, target) });
    }
  }
  return rels;
}

function resolvePath(baseDir: string, target: string): string {
  const parts = target.startsWith("/") ? [] : baseDir.split("/");
  for (const seg of target.replace(/^\//, "").split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/**
 * Turns slide or notes XML into lines, in document order:
 * - each shape (text box, placeholder) is a block with one line per paragraph,
 * - each table is a block with one line per row, cells joined by " | ".
 * Footer/date/slide-number placeholders are skipped; titles are marked protected.
 */
function xmlToLines(xml: string): RawLine[] {
  const body = xml
    // Drop slide-number and date fields placed in ordinary text boxes.
    .replace(/<a:fld\b[^>]*\btype="(?:slidenum|datetime\d*)"[\s\S]*?<\/a:fld>/g, "")
    .replace(/<a:p\b[^>]*\/>/g, "");

  const lines: RawLine[] = [];
  // <p:sp> and <a:tbl> elements don't nest inside themselves, so lazy matching is safe.
  for (const [element] of body.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>|<a:tbl\b[\s\S]*?<\/a:tbl>/g)) {
    if (element.startsWith("<a:tbl")) {
      const rows = [...element.matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)]
        .map(([row]) => [...row.matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/g)].map(([cell]) => paragraphTexts(cell).join(" ")))
        .filter((cells) => cells.some((c) => c.trim()))
        .map((cells) => cells.join(" | "));
      rows.forEach((text, i) => lines.push({ text, breakBefore: i === 0 }));
      continue;
    }

    const nvSpPr = /<p:nvSpPr\b[\s\S]*?<\/p:nvSpPr>/.exec(element)?.[0] ?? "";
    if (NOISE_PLACEHOLDER.test(nvSpPr)) continue;
    const isTitle = TITLE_PLACEHOLDER.test(nvSpPr);
    paragraphTexts(element).forEach((text, i) => lines.push({ text, breakBefore: i === 0, protected: isTitle }));
  }
  return lines;
}

/** Text of each non-empty <a:p> paragraph in an XML fragment. */
function paragraphTexts(xml: string): string[] {
  const out: string[] = [];
  for (const [para] of xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)) {
    let text = "";
    for (const m of para.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g)) {
      text += m[1] !== undefined ? decodeXml(m[1]) : " ";
    }
    if (text.trim()) out.push(text);
  }
  return out;
}

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, ent: string) => {
    const lower = ent.toLowerCase();
    if (lower.startsWith("#x")) return safeCodePoint(parseInt(lower.slice(2), 16), whole);
    if (lower.startsWith("#")) return safeCodePoint(parseInt(lower.slice(1), 10), whole);
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as const)[lower as "amp"] ?? whole;
  });
}

function safeCodePoint(cp: number, fallback: string): string {
  return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : fallback;
}
