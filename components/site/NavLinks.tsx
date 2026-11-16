"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const APP_NAV = [
  { href: "/library", label: "Library" },
  { href: "/projects", label: "Projects" },
  { href: "/flashcards", label: "Flashcards" },
  { href: "/practice", label: "Practice" },
  { href: "/progress", label: "Progress" },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 text-sm font-medium md:flex">
      {APP_NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3.5 py-2 transition ${
              active ? "bg-cream-deep text-charcoal" : "text-stone hover:text-charcoal"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
