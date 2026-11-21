"use client";

import { BadgeCheck, ClipboardCheck, Users, Layers, Library, ListChecks, type LucideIcon, PlayCircle, Presentation, Sparkles, TrendingUp } from "lucide-react";
import { useCurrentUser } from "@/components/auth/useCurrentUser";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const APP_NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/library", label: "Library", icon: Library },
  { href: "/exams", label: "Exams", icon: ClipboardCheck },
  { href: "/projects", label: "Presentations", icon: Presentation },
  { href: "/rooms", label: "Rooms", icon: Users },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/progress", label: "Progress", icon: TrendingUp },
];

/** For visitors who aren't signed in: explain the product instead of linking to locked screens. */
export const SITE_NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/#how-it-works", label: "How it works", icon: ListChecks },
  { href: "/#features", label: "Features", icon: Sparkles },
  { href: "/#pricing", label: "Pricing", icon: BadgeCheck },
  { href: "/listen/demo", label: "Demo", icon: PlayCircle },
];

/** The app menu for anyone with a session (including free-trial guests); the site menu otherwise. */
export function useNavItems() {
  const user = useCurrentUser();
  return { user, items: user === undefined ? [] : user && !user.isGuest ? APP_NAV : SITE_NAV };
}

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavLinks() {
  const pathname = usePathname();
  const { items } = useNavItems();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 text-sm font-medium lg:flex">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={item.label}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 transition ${
              active ? "bg-muted text-ink" : "text-subtle hover:text-ink"
            }`}
          >
            <item.icon className="size-4" aria-hidden="true" />
            {/* Seven app sections: icons only on smaller laptops, labels from 1280px */}
            <span className={items.length > 5 ? "sr-only xl:not-sr-only" : ""}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
