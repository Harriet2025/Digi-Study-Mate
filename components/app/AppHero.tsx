import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { DrawLine, Parallax, TypedHeading } from "@/components/motion/Gsap";

/** The header band at the top of each app screen: icon, eyebrow, typed title, short line and actions. */
export default function AppHero({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  aside,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Optional content on the right on large screens (stats, an illustration…). */
  aside?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-line bg-canvas">
      {/* Quiet background: a faint grid and two soft shapes that drift as you scroll */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--color-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-line)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)] opacity-50"
      />
      <Parallax speed={0.25} className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-brand-soft blur-2xl" />
      <Parallax speed={-0.15} className="pointer-events-none absolute -bottom-28 left-1/3 size-56 rounded-full bg-brand-soft/70 blur-3xl" />

      <div className={`relative grid grid-cols-1 gap-8 p-6 sm:p-10 ${aside ? "lg:grid-cols-[1.2fr_1fr] lg:items-center" : ""}`}>
        <div>
          <p className="flex items-center gap-2.5 text-xs font-semibold tracking-[0.18em] text-brand uppercase">
            <span className="grid size-8 place-items-center rounded-lg bg-brand text-white" aria-hidden="true">
              <Icon className="size-4" />
            </span>
            {eyebrow}
          </p>
          <TypedHeading text={title} className="mt-5 font-display text-3xl leading-tight font-bold tracking-tight text-balance sm:text-5xl" />
          <DrawLine className="mt-2 h-3 w-40 text-brand/30 sm:w-56" />
          {description && <p className="mt-3 max-w-xl text-subtle sm:text-lg">{description}</p>}
          {actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}
        </div>
        {aside}
      </div>
    </section>
  );
}
