import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** Shared building blocks for the app screens (warm editorial style). */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="text-xs font-semibold tracking-[0.18em] text-brand-deep uppercase">{eyebrow}</p>}
        <h1 className="mt-2 font-display text-4xl leading-tight font-semibold text-balance sm:text-5xl">{title}</h1>
        {description && <p className="mt-3 text-lg leading-relaxed text-subtle">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function Page({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return <main className={`mx-auto w-full px-4 py-10 sm:px-6 sm:py-14 ${narrow ? "max-w-3xl" : "max-w-6xl"}`}>{children}</main>;
}

type Variant = "primary" | "dark" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-sm shadow-brand/25 hover:bg-brand-deep",
  dark: "bg-ink text-canvas hover:bg-ink/85",
  secondary: "border border-line bg-canvas text-ink hover:border-brand/50 hover:bg-muted",
  ghost: "text-ink hover:bg-muted",
  danger: "text-brand-deep hover:bg-brand-soft",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition " +
  "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type="button" className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  // A background passed in className replaces the default cream one (otherwise CSS order decides).
  const background = /(^|\s)bg-/.test(className) ? "" : "bg-canvas";
  return <div className={`rounded-2xl border border-line p-6 ${background} ${className}`}>{children}</div>;
}

export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "brand" | "success" | "dark" | "warning" | "glass";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-muted text-subtle",
    brand: "bg-brand-soft text-brand-deep",
    success: "bg-success-soft text-success",
    dark: "bg-ink text-canvas",
    warning: "bg-brand text-white",
    glass: "bg-canvas/15 text-canvas",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Spinner({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin motion-reduce:animate-none ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`h-2 overflow-hidden rounded-full bg-line ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-4 rounded-2xl border border-brand/30 bg-brand-soft/60 px-4 py-3 text-sm text-brand-deep">
      <p>{children}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 font-semibold underline-offset-4 hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-muted/40 px-6 py-14 text-center">
      {icon && <div className=" ">{icon}</div>}
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      {children && <p className="mx-auto mt-2 max-w-md text-subtle">{children}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-subtle" role="status">
      <Spinner /> {label}
    </div>
  );
}

/** Segmented choice (radio group styled as cards). */
export function ChoiceGroup<T extends string | number>({
  label,
  value,
  onChange,
  options,
  columns = 4,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; hint?: string }[];
  columns?: 2 | 3 | 4 | 5;
}) {
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" }[columns];
  return (
    <fieldset>
      <legend className="mb-2.5 text-sm font-semibold">{label}</legend>
      <div className={`grid grid-cols-2 gap-2 ${cols}`}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <label
              key={String(o.value)}
              className={`cursor-pointer rounded-2xl border px-4 py-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${
                selected ? "border-brand bg-brand-soft/50" : "border-line bg-canvas hover:border-brand/40"
              }`}
            >
              <input type="radio" className="sr-only" checked={selected} onChange={() => onChange(o.value)} />
              <span className="block text-sm font-semibold">{o.label}</span>
              {o.hint && <span className="mt-0.5 block text-xs leading-snug text-subtle">{o.hint}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// Icons used across screens
export const Icons = {
  upload: (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4m0 0-4 4m4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
    </svg>
  ),
  headphones: (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2v-3Zm16 0a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2v-3Z" />
    </svg>
  ),
  cards: (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="14" height="14" rx="2" />
      <path d="M7 6V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 12l2 2 4-4M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
    </svg>
  ),
  flame: (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21c4 0 7-2.7 7-6.6 0-3-1.8-5.2-3.4-6.9-.4 1.9-1.4 3-2.6 3.5.3-3.3-1.3-6.3-4-8-.1 3.4-2.3 5.2-3.6 7A8 8 0 0 0 5 14.4C5 18.3 8 21 12 21Z" />
    </svg>
  ),
  mic: (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden="true">
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" />
    </svg>
  ),
};
