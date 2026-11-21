import Link from "next/link";
import AccountMenu from "@/components/auth/AccountMenu";
import BackButton from "./BackButton";
import MobileNav from "./MobileNav";
import NavLinks from "./NavLinks";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2.5 ${className}`} aria-label="Study Mate home">
      <span className="grid size-9 place-items-center rounded-xl bg-brand text-white shadow-sm transition group-hover:bg-brand-deep">
        {/* Two speech bubbles: Alex & Sam */}
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5.5h10a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H8.5L5 16v-2.5H4A1.5 1.5 0 0 1 2.5 12V7A1.5 1.5 0 0 1 4 5.5Z" />
          <path d="M18 9h1.5A1.5 1.5 0 0 1 21 10.5v5a1.5 1.5 0 0 1-1.5 1.5H19v2.5L15.5 17H11" />
        </svg>
      </span>
      <span className="font-display text-xl font-semibold tracking-tight">Study Mate</span>
    </Link>
  );
}

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-1">
          <BackButton />
          <Logo />
        </div>
        <NavLinks />
        <div className="flex items-center gap-2">
          <AccountMenu />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
