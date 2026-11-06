import { extractTextItems, getDocumentProxy } from "unpdf";
import { cleanPages, type RawLine, type RawPage } from "./clean";
import { IngestionError } from "./errors";
import type { ExtractedDocument } from "./types";
import { MAX_PAGES } from "./validate";

type TextItem = Awaited<ReturnType<typeof extractTextItems>>["items"][number][number];

export async function extractPdf(bytes: Uint8Array): Promise<ExtractedDocument> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // pdf.js may take ownership of the buffer, so give it a copy.
    pdf = await getDocumentProxy(bytes.slice());
  } catch (err) {
    if (err instanceof Error && err.name === "PasswordException") {
      throw new IngestionError("ENCRYPTED_FILE", 422, "This PDF is password-protected. Remove the password and try again.", {
        cause: err,
      });
    }
    throw new IngestionError("CORRUPT_FILE", 422, "This PDF could not be read. It may be damaged.", { cause: err });
  }

  try {
    if (pdf.numPages > MAX_PAGES) {
      throw new IngestionError("TOO_MANY_PAGES", 413, `This PDF has ${pdf.numPages} pages; the limit is ${MAX_PAGES}.`);
    }

    let items: TextItem[][];
    try {
      ({ items } = await extractTextItems(pdf));
    } catch (err) {
      throw new IngestionError("CORRUPT_FILE", 422, "Text could not be extracted from this PDF.", { cause: err });
    }

    const rawPages: RawPage[] = items.map((pageItems, i) => ({ number: i + 1, lines: itemsToLines(pageItems) }));

    return {
      sourceType: "pdf",
      pageCount: pdf.numPages,
      pages: cleanPages(rawPages, {
        joinWrappedLines: true,
        pageNumberEdgeLines: 2,
        repeatedLines: { scope: "edges", edgeLines: 2 },
        fuzzyRepeatMatch: true,
      }),
    };
  } finally {
    await pdf.loadingTask.destroy().catch(() => undefined);
  }
}

/**
 * Builds visual lines from pdf.js text items, which are often word fragments.
 * Keeps the content-stream order, which usually follows reading order in
 * multi-column layouts better than sorting by position does.
 */
function itemsToLines(items: TextItem[]): RawLine[] {
  const lines: RawLine[] = [];
  let current: { text: string; y: number; fontSize: number; endX: number } | null = null;
  let previousHadEOL = false;

  const flush = (breakBefore: boolean) => {
    if (current && current.text.trim()) {
      lines.push({ text: current.text, y: current.y, breakBefore });
    }
  };
  let currentBreakBefore = true;

  for (const item of items) {
    if (item.dir === "ttb") continue; // vertical text is almost always margin decoration
    const str = item.str;
    const fontSize = Math.max(item.fontSize, 1);

    if (!str) {
      previousHadEOL ||= item.hasEOL;
      continue;
    }

    if (!current) {
      current = { text: str, y: item.y, fontSize, endX: item.x + item.width };
      previousHadEOL = item.hasEOL;
      continue;
    }

    const lineHeight = Math.max(current.fontSize, fontSize);
    const sameLine = Math.abs(item.y - current.y) <= lineHeight * 0.5 && !previousHadEOL;

    if (sameLine) {
      const gap = item.x - current.endX;
      const needsSpace = gap > fontSize * 0.2 && !current.text.endsWith(" ") && !str.startsWith(" ");
      current.text += needsSpace ? ` ${str}` : str;
      current.endX = item.x + item.width;
    } else {
      flush(currentBreakBefore);
      const drop = current.y - item.y; // positive = moved down the page
      currentBreakBefore =
        drop > lineHeight * 1.75 || // larger than normal line spacing
        drop < -lineHeight * 0.5 || // jumped back up: new column or text box
        Math.abs(fontSize - current.fontSize) > current.fontSize * 0.15; // font size change: heading boundary
      current = { text: str, y: item.y, fontSize, endX: item.x + item.width };
    }
    previousHadEOL = item.hasEOL;
  }
  flush(currentBreakBefore);

  return lines;
}
