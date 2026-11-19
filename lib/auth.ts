/** Accounts on the client. The session itself is an httpOnly cookie set by the backend. */

export type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  hasPassword: boolean;
  hasGoogle: boolean;
  /** A free trial account made by uploading before signing up. */
  isGuest: boolean;
};

export const SESSION_COOKIE = "sm_session";

/** Pages that need an account (the proxy and the API both enforce this). */
export const PROTECTED_PREFIXES = ["/upload", "/library", "/study", "/listen", "/practice", "/flashcards", "/progress", "/projects"];
export const PUBLIC_PATHS = ["/listen/demo", "/upload"];

export async function fetchMe(): Promise<User | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { user: User | null }).user;
  } catch {
    return null;
  }
}

/** Only allow returning to pages on this site. */
export function safeNext(next: string | null | undefined, fallback = "/library"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : fallback;
}

export function loginUrl(next?: string): string {
  return next ? `/login?next=${encodeURIComponent(next)}` : "/login";
}

/** Called when the API says the session has ended: go to the login page, then come back here. */
export function redirectToLogin(): void {
  if (typeof window === "undefined" || window.location.pathname === "/login" || window.location.pathname === "/signup") return;
  window.location.assign(loginUrl(window.location.pathname + window.location.search));
}

/** Starts a free trial session if there isn't one yet (returns the current user if there is). */
export async function ensureSession(): Promise<User> {
  const res = await fetch("/api/auth/guest", { method: "POST" });
  const data = (await res.json().catch(() => null)) as { user?: User; error?: { message?: string } } | null;
  if (!res.ok || !data?.user) throw new Error(data?.error?.message ?? "Couldn't start your free trial. Please try again.");
  return data.user;
}

/** Sends a guest to sign up, then back to where they were. */
export function redirectToSignup(reason = "trial"): void {
  if (typeof window === "undefined") return;
  const next = window.location.pathname + window.location.search;
  window.location.assign(`/signup?reason=${reason}&next=${encodeURIComponent(next)}`);
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  window.location.assign("/");
}
