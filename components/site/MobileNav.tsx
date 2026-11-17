"use client";

import { Plus } from "lucide-react";
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
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        className=""
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="absolute inset-x-0 top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-line bg-canvas px-4 pt-2 pb-5 shadow-lg sm:px-6">
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {[{ href: "/upload", label: "Study new notes", icon: Plus }, ...APP_NAV].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 font-medium ${
                    isActive(pathname, item.href) ? "bg-muted" : "hover:bg-muted/60"
                  }`}
                >
                  <item.icon className="size-5 text-brand" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-line pt-3">
            {user ? (
              <div className="flex items-center gap-3 px-4 py-2">
                <Avatar user={user} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{user.name}</p>
                  <p className="truncate text-sm text-subtle">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-full px-3 py-2 text-sm font-medium text-brand-deep hover:bg-brand-soft"
                >
                  Log out
                </button>
              </div>
            ) : (
              <div className="">
                <Link href="/login" className="rounded-full border border-line px-4 py-3 text-center font-medium">
                  Log in
                </Link>
                <Link href="/signup" className="rounded-full bg-brand px-4 py-3 text-center font-medium text-white">
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
