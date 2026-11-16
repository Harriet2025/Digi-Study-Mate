"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Spinner } from "@/components/ui";
import { fetchMe, safeNext } from "@/lib/auth";

type Mode = "login" | "signup";

const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: "Google sign-in was cancelled.",
  google_state: "That Google sign-in expired. Please try again.",
  google_failed: "We couldn't sign you in with Google. Please try again.",
  google_unverified: "Your Google account's email isn't verified, so we can't use it to sign in.",
};

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

const INPUT =
  "mt-1.5 w-full rounded-2xl border border-sand bg-white/80 px-4 py-3 text-base text-charcoal placeholder:text-stone/60 " +
  "focus:border-terracotta focus:ring-2 focus:ring-terracotta/25 focus:outline-none";

export default function AuthForm({ mode, next, error }: { mode: Mode; next?: string; error?: string }) {
  const destination = safeNext(next);
  const [google, setGoogle] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(error ? GOOGLE_ERRORS[error] ?? "Something went wrong. Please try again." : null);

  useEffect(() => {
    // Already signed in? Skip this page.
    fetchMe().then((user) => user && window.location.replace(destination));
    fetch("/api/auth/providers")
      .then((r) => (r.ok ? r.json() : { google: false }))
      .then((p: { google: boolean }) => setGoogle(p.google))
      .catch(() => setGoogle(false));
  }, [destination]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { name, email, password } : { email, password }),
      });
      if (res.ok) {
        // A full page load so the header and every screen pick up the new session.
        window.location.assign(destination);
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setMessage(data?.error?.message ?? "Something went wrong. Please try again.");
    } catch {
      setMessage("Can't reach Study Mate. Check your connection and try again.");
    }
    setBusy(false);
  }

  const isSignup = mode === "signup";
  const otherHref = `${isSignup ? "/login" : "/signup"}${next ? `?next=${encodeURIComponent(destination)}` : ""}`;

  return (
    <div className="w-full max-w-md">
      <h1 className="font-serif text-4xl font-semibold tracking-tight">{isSignup ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-2 text-stone">
        {isSignup ? "Your lessons, flashcards and projects stay private to you." : "Log in to pick up where you left off."}
      </p>

      {google && (
        <>
          <a
            href={`/api/auth/google?next=${encodeURIComponent(destination)}`}
            className="mt-8 flex w-full items-center justify-center gap-3 rounded-full border border-sand bg-white px-5 py-3 font-medium text-charcoal shadow-sm transition hover:border-stone/40 hover:bg-cream focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none"
          >
            <GoogleLogo />
            Continue with Google
          </a>
          <div className="my-6 flex items-center gap-3 text-xs font-medium tracking-wide text-stone uppercase">
            <span className="h-px flex-1 bg-sand" />
            or with email
            <span className="h-px flex-1 bg-sand" />
          </div>
        </>
      )}

      <form onSubmit={submit} className={`space-y-4 ${google ? "" : "mt-8"}`} noValidate={false}>
        {isSignup && (
          <label className="block text-sm font-medium">
            Name
            <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={120} />
          </label>
        )}
        <label className="block text-sm font-medium">
          Email
          <input
            className={INPUT}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            maxLength={255}
          />
        </label>
        <label className="block text-sm font-medium">
          <span className="flex items-center justify-between">
            Password
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="text-xs font-medium text-stone hover:text-charcoal"
              aria-pressed={showPassword}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
          <input
            className={INPUT}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            minLength={isSignup ? 8 : undefined}
            maxLength={200}
          />
          {isSignup && <span className="mt-1.5 block text-xs font-normal text-stone">At least 8 characters.</span>}
        </label>

        {message && (
          <p role="alert" className="rounded-2xl border border-terracotta/30 bg-terracotta-soft/60 px-4 py-3 text-sm text-terracotta-deep">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-terracotta px-5 py-3 font-medium text-white shadow-sm shadow-terracotta/25 transition hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-charcoal focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:outline-none disabled:opacity-60"
        >
          {busy && <Spinner className="size-4" />}
          {isSignup ? "Create account" : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-stone">
        {isSignup ? "Already have an account?" : "New to Study Mate?"}{" "}
        <Link href={otherHref} className="font-semibold text-terracotta-deep underline-offset-4 hover:underline">
          {isSignup ? "Log in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
