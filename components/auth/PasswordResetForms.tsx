"use client";

import { CheckCircle2, KeyRound, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Spinner } from "@/components/ui";

const INPUT =
  "mt-1.5 w-full rounded-2xl border border-line bg-white/80 px-4 py-3 text-base text-ink placeholder:text-subtle/60 " +
  "focus:border-brand focus:ring-2 focus:ring-brand/25 focus:outline-none";
const BUTTON =
  "flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 font-medium text-white shadow-sm transition " +
  "hover:bg-brand-deep focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60";

function Header({ icon: Icon, title, body }: { icon: typeof KeyRound; title: string; body: string }) {
  return (
    <>
      <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand" aria-hidden="true">
        <Icon className="size-6" />
      </span>
      <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-subtle">{body}</p>
    </>
  );
}

function ErrorText({ children }: { children: string }) {
  return (
    <p role="alert" className="rounded-2xl border border-brand/30 bg-brand-soft/60 px-4 py-3 text-sm text-brand-deep">
      {children}
    </p>
  );
}

/** "Forgot password?": asks for the email and sends a reset link. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setSent(true);
      else {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(data?.error?.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Can't reach Study Mate. Check your connection and try again.");
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="w-full max-w-md">
        <Header
          icon={MailCheck}
          title="Check your email"
          body={`If ${email} has a Study Mate account, we've sent it a link to reset your password. It works for one hour.`}
        />
        <p className="mt-6 text-sm text-subtle">No email after a few minutes? Check your spam folder, or try again.</p>
        <Link href="/login" className="mt-8 inline-block font-medium text-brand hover:underline">
          ← Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <Header icon={KeyRound} title="Forgot your password?" body="Enter your email and we'll send you a link to choose a new one." />
      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block text-sm font-medium">
          Email
          <input className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={255} />
        </label>
        {error && <ErrorText>{error}</ErrorText>}
        <button type="submit" disabled={busy} className={BUTTON}>
          {busy && <Spinner className="size-4" />}
          Send reset link
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-subtle">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}

/** The page the emailed link opens: choose a new password. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : "This reset link is incomplete. Request a new one.");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) setDone(true);
      else {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(data?.error?.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Can't reach Study Mate. Check your connection and try again.");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="w-full max-w-md">
        <Header icon={CheckCircle2} title="Password updated" body="You're logged in. Other devices have been signed out for your security." />
        <Link href="/library" className={`${BUTTON} mt-8`}>
          Go to my library
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <Header icon={KeyRound} title="Choose a new password" body="Use at least 8 characters." />
      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block text-sm font-medium">
          New password
          <input className={INPUT} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} maxLength={200} />
        </label>
        <label className="block text-sm font-medium">
          Confirm new password
          <input className={INPUT} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required minLength={8} maxLength={200} />
        </label>
        {error && <ErrorText>{error}</ErrorText>}
        {error?.includes("expired") || error?.includes("incomplete") ? (
          <Link href="/forgot-password" className="block text-sm font-medium text-brand hover:underline">
            Request a new link
          </Link>
        ) : null}
        <button type="submit" disabled={busy || !token} className={BUTTON}>
          {busy && <Spinner className="size-4" />}
          Save new password
        </button>
      </form>
    </div>
  );
}
