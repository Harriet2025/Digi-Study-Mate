import Link from "next/link";
import MobileNav from "./MobileNav";
import NavLinks from "./NavLinks";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2.5 ${className}`} aria-label="Study Mate home">
      <span className="grid size-9 place-items-center rounded-xl bg-terracotta text-white shadow-sm transition group-hover:bg-terracotta-deep">
        {/* Two speech bubbles: Alex & Sam */}
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5.5h10a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H8.5L5 16v-2.5H4A1.5 1.5 0 0 1 2.5 12V7A1.5 1.5 0 0 1 4 5.5Z" />
          <path d="M18 9h1.5A1.5 1.5 0 0 1 21 10.5v5a1.5 1.5 0 0 1-1.5 1.5H19v2.5L15.5 17H11" />
        </svg>
      </span>
      <span className="font-serif text-xl font-semibold tracking-tight">Study Mate</span>
    </Link>
  );
}

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-sand/70 bg-cream/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <NavLinks />
        <div className="flex items-center gap-2">
          <Link
            href="/upload"
            className="hidden items-center gap-1.5 rounded-full bg-terracotta px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-charcoal focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:outline-none sm:inline-flex"
          >
            <span aria-hidden="true" className="text-base leading-none">+</span> New lesson
          </Link>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
