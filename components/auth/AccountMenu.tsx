"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout, type User } from "@/lib/auth";
import { useCurrentUser } from "./useCurrentUser";

export function Avatar({ user, className = "size-9" }: { user: User; className?: string }) {
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  if (user.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- small remote avatar from Google
    return <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className={`${className} rounded-full object-cover`} />;
  }
  return (
    <span className={`${className} grid place-items-center rounded-full bg-success-soft text-sm font-semibold text-success`} aria-hidden="true">
      {initials || "?"}
    </span>
  );
}

const PRIMARY =
  "items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-deep " +
  "focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none";

/** Header actions: "Log in / Sign up" when signed out; "+ Study notes" and the account menu when signed in. */
export default function AccountMenu() {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (user === undefined) return <span className="hidden h-9 w-40 sm:block" aria-hidden="true" />;

  if (user === null) {
    return (
      <div className="hidden items-center gap-1 sm:flex">
        <Link href="/login" className="rounded-full px-4 py-2 text-sm font-medium text-ink hover:bg-muted">
          Log in
        </Link>
        <Link href="/signup" className={`inline-flex ${PRIMARY}`}>
          Sign up free
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link href="/upload" className={`hidden sm:inline-flex ${PRIMARY}`}>
        <span aria-hidden="true" className="text-base leading-none">+</span> Study notes
      </Link>
      <div ref={ref} className="relative hidden sm:block">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Account: ${user.name}`}
          className="rounded-full ring-offset-2 ring-offset-canvas transition hover:ring-2 hover:ring-line focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <Avatar user={user} />
        </button>
        {open && (
          <div role="menu" className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-canvas shadow-xl">
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <Avatar user={user} className="size-10" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{user.name}</p>
                <p className="truncate text-sm text-subtle">{user.email}</p>
              </div>
            </div>
            <div className="p-1.5">
              {[
                { href: "/library", label: "My library" },
                { href: "/progress", label: "My progress" },
              ].map((item) => (
                <Link key={item.href} role="menuitem" href={item.href} className="block rounded-xl px-3 py-2 text-sm hover:bg-muted">
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                role="menuitem"
                onClick={() => void logout()}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm text-brand-deep hover:bg-brand-soft"
              >
                Log out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
