"use client";

import { useEffect, type ReactNode } from "react";
import { useCurrentUser } from "./useCurrentUser";

/**
 * App screens that need a real account (library, projects, flashcards, practice, progress…).
 * The page renders straight away and loads its data in parallel with the account check (waiting
 * for the check first would add a full round trip to the server). If there's no account, or only
 * a free-trial guest, the visitor is sent to create one. The server enforces the same rule.
 */
export default function MembersOnly({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const denied = user === null || user?.isGuest === true;

  useEffect(() => {
    if (!denied) return;
    const next = window.location.pathname + window.location.search;
    window.location.replace(user?.isGuest ? `/signup?reason=trial&next=${encodeURIComponent(next)}` : `/signup?next=${encodeURIComponent(next)}`);
  }, [denied, user]);

  if (denied) return null;
  return <>{children}</>;
}
