"use client";

import { useEffect, type ReactNode } from "react";
import { LoadingBlock } from "@/components/ui";
import { useCurrentUser } from "./useCurrentUser";

/**
 * App screens that need a real account (library, projects, flashcards, practice, progress).
 * Visitors without one, including free-trial guests, are sent to create an account first.
 * The server enforces the same rule; this just avoids flashing an empty screen.
 */
export default function MembersOnly({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const allowed = !!user && !user.isGuest;

  useEffect(() => {
    if (user === undefined || allowed) return;
    const next = window.location.pathname + window.location.search;
    window.location.replace(user?.isGuest ? `/signup?reason=trial&next=${encodeURIComponent(next)}` : `/signup?next=${encodeURIComponent(next)}`);
  }, [user, allowed]);

  if (!allowed) return <LoadingBlock label="Checking your account…" />;
  return <>{children}</>;
}
