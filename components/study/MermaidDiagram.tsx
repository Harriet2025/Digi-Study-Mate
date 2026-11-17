"use client";

import { useEffect, useId, useState } from "react";

let initialized: Promise<typeof import("mermaid").default> | null = null;

/** Loads Mermaid once, themed in the Study Mate palette (neutral greys, navy accent). */
function loadMermaid() {
  initialized ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
      themeVariables: {
        background: "#ffffff",
        primaryColor: "#e7edf5",
        primaryBorderColor: "#1e3a5f",
        primaryTextColor: "#111827",
        secondaryColor: "#e3f0e8",
        secondaryBorderColor: "#2f6b4f",
        tertiaryColor: "#f0f2f5",
        lineColor: "#4b5563",
        textColor: "#111827",
        noteBkgColor: "#f0f2f5",
        noteBorderColor: "#e2e5ea",
        actorBkg: "#e7edf5",
        actorBorder: "#1e3a5f",
        fontSize: "15px",
      },
      flowchart: { curve: "basis", htmlLabels: true },
    });
    return mermaid;
  });
  return initialized;
}

/**
 * AI models sometimes put a whole diagram on one line, but Mermaid needs one statement per line.
 * Re-inserts line breaks for flowcharts and ER diagrams (the types we ask for most).
 */
export function repairMermaid(source: string): string {
  const text = splitStatements(source.trim());
  return /^(flowchart|graph)\b/i.test(text) ? quoteFlowchartLabels(text) : text;
}

/** Flowchart labels with brackets or punctuation must be quoted: A[Admin (DA)] → A["Admin (DA)"]. */
function quoteFlowchartLabels(text: string): string {
  return text
    .replace(/(\b[A-Za-z_]\w*)\[(?!["[(/\\])([^\]"]*[()|:;,&<>#][^\]"]*)\]/g, '$1["$2"]')
    .replace(/(\b[A-Za-z_]\w*)\{(?!["{])([^}"]*[()|:;,&<>#][^}"]*)\}/g, '$1{"$2"}')
    .replace(/\|(?!")([^|"\n]*[()[\]{}:;,&<>#][^|"\n]*)\|/g, '|"$1"|');
}

/** Puts each flowchart statement on its own line, even when several share a line. */
function splitFlowLine(line: string): string {
  return (
    line
      // A new statement starts with a node ID followed by a shape or an arrow, after a closing bracket/quote…
      .replace(/(?<=[\]\)\}"])\s+(?=[A-Za-z_][\w]*\s*(?:\[|\(|\{|-->|---|==>|-\.->|--\s))/g, "\n")
      // …or after a bare node ID that ended the previous edge ("A --> B C --> D").
      .replace(/(?<=(?:-->|---|==>|-\.->)\s*(?:\|[^|]*\|\s*)?[A-Za-z_]\w*)\s+(?=[A-Za-z_]\w*\s*(?:\[|\(|\{|-->|---|==>|-\.->))/g, "\n")
  );
}

function splitStatements(text: string): string {
  const flow = /^(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b[ \t]*/i.exec(text);
  if (flow) {
    const body = text.slice(flow[0].length).replace(/^\s*\n/, "");
    return `${flow[1]} ${flow[2]}\n${body.split("\n").map(splitFlowLine).join("\n")}`;
  }
  if (text.includes("\n")) return text;

  if (/^erDiagram\s+/i.test(text)) {
    return text
      .replace(/^erDiagram\s+/i, "erDiagram\n")
      .replace(/\s+(?=[A-Za-z_][\w-]*\s*[|}][|o]--[o|][|{]\s*[A-Za-z_])/g, "\n");
  }
  return text;
}

/** Renders Mermaid source as an SVG. If the diagram can't be drawn, shows nothing (or a small note). */
export default function MermaidDiagram({ source, caption }: { source: string; caption?: string | null }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);
    loadMermaid()
      .then(async (mermaid) => {
        const code = repairMermaid(source);
        await mermaid.parse(code); // throws on invalid syntax
        const { svg } = await mermaid.render(`mmd-${id}`, code);
        if (!cancelled) setSvg(svg);
      })
      .catch((err: unknown) => {
        console.warn("[mermaid] diagram could not be rendered:", err instanceof Error ? err.message : err);
        if (!cancelled) setFailed(true);
        // Mermaid can leave an error element in the page; remove it.
        document.getElementById(`dmmd-${id}`)?.remove();
      });
    return () => {
      cancelled = true;
    };
  }, [source, id]);

  if (failed) return null;

  return (
    <figure className="my-6 overflow-hidden rounded-2xl border border-line bg-white/70 p-4 sm:p-6">
      {svg ? (
        <div
          className="mx-auto flex justify-center overflow-x-auto [&_svg]:h-auto [&_svg]:max-w-full"
          role="img"
          aria-label={caption ?? "Diagram"}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="h-40 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" aria-hidden="true" />
      )}
      {caption && <figcaption className="mt-3 text-center text-sm text-subtle">{caption}</figcaption>}
    </figure>
  );
}
