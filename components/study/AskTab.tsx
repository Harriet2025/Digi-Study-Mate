"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError, type ChatMessage, type GuideDetail } from "@/lib/api";
import { ErrorNote, Spinner } from "@/components/ui";
import Markdown from "./Markdown";

const SUGGESTIONS = [
  "Explain the hardest idea in this lesson more simply",
  "Give me a real-world example",
  "Draw a diagram of how these ideas connect",
  "Quiz me with one question",
  "What's most likely to come up in an exam?",
];

/** Chat with a tutor that answers from the student's own pages and cites them. */
export default function AskTab({ guide }: { guide: GuideDetail }) {
  const [messages, setMessages] = useState<ChatMessage[]>(guide.messages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const unit = "p.";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    setDraft("");
    const pending: ChatMessage = { id: -Date.now(), role: "user", content: message, pages: [], createdAt: new Date().toISOString() };
    setMessages((m) => [...m, pending]);
    try {
      const { question, answer } = await api.askTutor(guide.guideId, message);
      setMessages((m) => [...m.filter((x) => x.id !== pending.id), question, answer]);
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== pending.id));
      setDraft(message);
      setError(err instanceof ApiError ? err.message : "Couldn't get an answer. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      {messages.length === 0 && (
        <div className="rounded-3xl bg-charcoal p-6 text-cream sm:p-8">
          <p className="text-xs font-semibold tracking-[0.16em] text-terracotta-soft uppercase">Your tutor</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold">Ask anything about “{guide.title}”</h2>
          <p className="mt-2 text-cream/75">
            Answers come from your own pages, with page references, so you can check them. Ask for simpler explanations, examples,
            diagrams, or to be quizzed.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-5" aria-live="polite">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-auto w-fit max-w-[85%] rounded-3xl rounded-br-md bg-charcoal px-5 py-3 text-cream">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="flex gap-3">
              <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-full bg-terracotta font-serif text-sm font-semibold text-white" aria-hidden="true">
                S
              </span>
              <div className="min-w-0 flex-1 rounded-3xl rounded-tl-md border border-sand bg-cream px-5 py-4">
                <Markdown>{m.content}</Markdown>
                {m.pages.length > 0 && (
                  <p className="mt-3 text-xs text-stone">
                    From your notes: {m.pages.map((p) => `${unit} ${p}`).join(", ")}
                  </p>
                )}
              </div>
            </div>
          ),
        )}
        {sending && (
          <div className="flex items-center gap-3 text-stone">
            <span className="grid size-9 place-items-center rounded-full bg-terracotta-soft text-terracotta-deep">
              <Spinner className="size-4" />
            </span>
            Looking through your notes…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => send(s)}
            disabled={sending}
            className="rounded-full border border-sand bg-cream px-3.5 py-1.5 text-sm text-charcoal transition hover:border-terracotta/50 hover:bg-cream-deep disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="sticky bottom-4 mt-4 flex items-end gap-2 rounded-3xl border border-sand bg-white p-2 shadow-lg"
      >
        <label htmlFor="ask" className="sr-only">
          Your question
        </label>
        <textarea
          id="ask"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Ask a question about this lesson…"
          className="max-h-40 min-h-12 flex-1 resize-none bg-transparent px-3 py-3 focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          aria-label="Send question"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-terracotta text-white transition hover:bg-terracotta-deep disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}
