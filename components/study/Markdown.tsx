"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MermaidDiagram from "./MermaidDiagram";

/** Markdown for lessons and tutor answers; ```mermaid code blocks become diagrams. Raw HTML is not rendered. */
export default function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`study-prose ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className: cls, children: code, ...props }) {
            const language = /language-(\w+)/.exec(cls ?? "")?.[1];
            if (language === "mermaid") return <MermaidDiagram source={String(code).trim()} />;
            return (
              <code className={cls} {...props}>
                {code}
              </code>
            );
          },
          pre({ children: inner }) {
            // Mermaid blocks render their own figure; keep other code blocks in a styled <pre>.
            const child = Array.isArray(inner) ? inner[0] : inner;
            const isMermaid =
              child && typeof child === "object" && "props" in child && /language-mermaid/.test(String((child.props as { className?: string }).className));
            return isMermaid ? <>{inner}</> : <pre>{inner}</pre>;
          },
          a({ href, children: text }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {text}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
