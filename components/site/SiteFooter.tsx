import Link from "next/link";
import { Logo } from "./SiteHeader";

export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-muted/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-sm leading-relaxed text-subtle">
            Lecture notes, made simple. Learn, practise and present with confidence.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm sm:gap-x-16">
          <p className="col-span-2 mb-1 text-xs font-semibold tracking-[0.16em] text-brand-deep uppercase">Explore</p>
          <Link href="/#how-it-works" className="text-subtle hover:text-ink">How it works</Link>
          <Link href="/#features" className="text-subtle hover:text-ink">Features</Link>
          <Link href="/#projects" className="text-subtle hover:text-ink">Presentations</Link>
          <Link href="/#pricing" className="text-subtle hover:text-ink">Pricing</Link>
          <Link href="/listen/demo" className="text-subtle hover:text-ink">Demo episode</Link>
        </nav>
      </div>
      <div className="border-t border-line/70">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-subtle sm:px-6">
          © {new Date().getFullYear()} Study Mate ·{" "}
          <Link href="/privacy" className="hover:text-ink">Privacy</Link> ·{" "}
          <Link href="/terms" className="hover:text-ink">Terms</Link>
        </p>
      </div>
    </footer>
  );
}
