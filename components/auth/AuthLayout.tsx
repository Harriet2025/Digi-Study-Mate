import type { ReactNode } from "react";

const POINTS = [
  ["Lessons that click", "Your slides, explained step by step with diagrams and examples."],
  ["Practice that sticks", "Flashcards, rated quizzes and a tutor that cites your pages."],
  ["Ready to present", "A draft structure and defence practice for every project."],
];

/** Two-column frame for the login and sign-up pages. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto grid grid-cols-1 w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_0.9fr] lg:gap-16">
      <div className="flex justify-center lg:justify-start">{children}</div>
      <aside className="relative hidden overflow-hidden rounded-2xl bg-ink p-10 text-canvas lg:block">
        <div aria-hidden="true" className="absolute -top-24 -right-24 size-72 rounded-full bg-brand/30 blur-3xl" />
        <p className="relative text-xs font-semibold tracking-[0.18em] text-brand-soft uppercase">Study Mate</p>
        <p className="relative mt-4 font-display text-3xl leading-tight font-semibold text-balance">
          Your lecture notes, finally clear and exam-ready.
        </p>
        <ul className="relative mt-10 space-y-6">
          {POINTS.map(([title, body]) => (
            <li key={title} className="flex gap-4">
              <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">✓</span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="text-sm text-line">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
