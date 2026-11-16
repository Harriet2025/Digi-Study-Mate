"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/auth/AccountMenu";
import { useCurrentUser } from "@/components/auth/useCurrentUser";
import { logout } from "@/lib/auth";
import { APP_NAV, isActive } from "./NavLinks";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const user = useCurrentUser();

  // Close the menu after navigating.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        className="grid size-10 place-items-center rounded-full text-charcoal hover:bg-cream-deep focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none"
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="absolute inset-x-0 top-16 border-b border-sand bg-cream px-4 pt-2 pb-5 shadow-lg">
          <ul className="space-y-1">
            {[{ href: "/upload", label: "Study new notes" }, ...APP_NAV].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  className={`block rounded-2xl px-4 py-3 font-medium ${
                    isActive(pathname, item.href) ? "bg-cream-deep" : "hover:bg-cream-deep/60"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-sand pt-3">
            {user ? (
              <div className="flex items-center gap-3 px-4 py-2">
                <Avatar user={user} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{user.name}</p>
                  <p className="truncate text-sm text-stone">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-full px-3 py-2 text-sm font-medium text-terracotta-deep hover:bg-terracotta-soft"
                >
                  Log out
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link href="/login" className="rounded-full border border-sand px-4 py-3 text-center font-medium">
                  Log in
                </Link>
                <Link href="/signup" className="rounded-full bg-terracotta px-4 py-3 text-center font-medium text-white">
                  Sign up free
                </Link>
              </div>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
