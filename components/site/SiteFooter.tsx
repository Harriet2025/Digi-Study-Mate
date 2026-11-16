import Link from "next/link";
import { Logo } from "./SiteHeader";

export default function SiteFooter() {
  return (
    <footer className="border-t border-sand bg-cream-deep/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-sm leading-relaxed text-stone">
            Turn lecture slides into lessons you understand, with diagrams, a tutor, flashcards, quizzes and audio, and get
            ready for every presentation and defense.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm sm:gap-x-16">
          <p className="col-span-2 mb-1 text-xs font-semibold tracking-[0.16em] text-terracotta-deep uppercase">Explore</p>
          <Link href="/#how-it-works" className="text-stone hover:text-charcoal">How it works</Link>
          <Link href="/#features" className="text-stone hover:text-charcoal">Features</Link>
          <Link href="/#defense" className="text-stone hover:text-charcoal">Defense prep</Link>
          <Link href="/projects" className="text-stone hover:text-charcoal">Projects</Link>
          <Link href="/listen/demo" className="text-stone hover:text-charcoal">Demo episode</Link>
        </nav>
      </div>
      <div className="border-t border-sand/70">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-stone sm:px-6">
          © {new Date().getFullYear()} Study Mate. Made for students who want to actually understand.
        </p>
      </div>
    </footer>
  );
}
