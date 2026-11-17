"use client";

import { Layers, Library, type LucideIcon, Mic, Presentation, TrendingUp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const APP_NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/library", label: "Library", icon: Library },
  { href: "/projects", label: "Projects", icon: Presentation },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/practice", label: "Practice", icon: Mic },
  { href: "/progress", label: "Progress", icon: TrendingUp },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 text-sm font-medium lg:flex">
      {APP_NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 transition ${
              active ? "bg-muted text-ink" : "text-subtle hover:text-ink"
            }`}
          >
            <item.icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
