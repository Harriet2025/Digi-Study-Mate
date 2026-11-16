"use client";

import { useEffect, useState } from "react";
import { fetchMe, type User } from "@/lib/auth";

let cached: Promise<User | null> | null = null;

/** The signed-in user (undefined while loading). Fetched once per page load and shared by all callers. */
export function useCurrentUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    cached ??= fetchMe();
    cached.then((u) => active && setUser(u));
    return () => {
      active = false;
    };
  }, []);
  return user;
}
