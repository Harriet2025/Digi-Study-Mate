import {
  ArrowRight,
  BookOpenText,
  FileText,
  GraduationCap,
  Headphones,
  Layers,
  type LucideIcon,
  MessageCircleQuestion,
  Mic,
  Network,
  Play,
  Presentation,
  ShieldCheck,
  Sparkles,
  Trophy,
  Upload,
  Youtube,
} from "lucide-react";
import Link from "next/link";
import { Float, Reveal } from "@/components/home/Motion";
import Typewriter from "@/components/home/Typewriter";

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Eyebrow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <p className={`text-xs font-semibold tracking-[0.18em] uppercase ${dark ? "text-brand-soft" : "text-brand"}`}>{children}</p>
  );
}

function IconTile({ icon: Icon, dark = false, className = "" }: { icon: LucideIcon; dark?: boolean; className?: string }) {
  return (
    <span
      className={`grid size-11 shrink-0 place-items-center rounded-xl ${dark ? "bg-canvas/10 text-canvas" : "bg-brand-soft text-brand"} ${className}`}
      aria-hidden="true"
    >
      <Icon className="size-5" strokeWidth={1.8} />
    </span>
  );
}

/** A small floating chip for the hero illustration. */
function Chip({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-canvas px-3.5 py-2.5 shadow-lg shadow-ink/5">
      <span className="" aria-hidden="true">
        <Icon className="size-4.5" strokeWidth={2} />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-subtle">{detail}</span>
      </span>
    </div>
  );
}

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-3.5 font-medium text-white shadow-md shadow-brand/20 transition " +
  "hover:bg-brand-deep focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:outline-none";

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Faint grid backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--color-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-line)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)] opacity-60"
      />

      <div className="relative mx-auto grid grid-cols-1 max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 md:pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:pt-20 lg:pb-24">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1 text-xs font-medium text-subtle">
            <Sparkles className="size-3.5 text-brand" aria-hidden="true" />
            AI study partner for university
          </span>
          <h1 className="mt-6 font-display text-[2.15rem] leading-[1.1] font-bold tracking-tight min-[400px]:text-[2.5rem] sm:text-6xl">
            Lecture notes,
            <br />
            made <Typewriter className="whitespace-nowrap text-brand" words={["simple.", "visual.", "memorable.", "exam-ready."]} />
          </h1>
          <p className="mx-auto mt-5 max-w-md text-lg text-subtle lg:mx-0">Upload your slides. Learn, practise and present with confidence.</p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Link href="/upload" className={`${PRIMARY_BUTTON} w-full sm:w-auto`}>
              <Upload className="size-4" aria-hidden="true" /> Upload your notes
            </Link>
            <Link
              href="/listen/demo"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-line bg-canvas px-6 py-3.5 font-medium transition hover:border-ink/30 sm:w-auto"
            >
              <Play className="size-4 fill-current" aria-hidden="true" /> Try a demo
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-subtle lg:justify-start">
            {TRUST.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1.5">
                <Icon className="size-4 text-brand" aria-hidden="true" /> {label}
              </li>
            ))}
          </ul>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

const TRUST: { icon: LucideIcon; label: string }[] = [
  { icon: FileText, label: "PDF & PowerPoint" },
  { icon: ShieldCheck, label: "Private to you" },
  { icon: GraduationCap, label: "Built for university" },
];

/** Decorative: a lesson card with study tools floating around it. */
function HeroVisual() {
  return (
    <div className="relative mx-auto h-[400px] w-full max-w-[520px] sm:h-[440px]" aria-hidden="true">
      {/* Lesson card */}
      <Float className="absolute inset-x-6 top-14 sm:inset-x-14" distance={6} duration={6}>
        <div className="rounded-2xl border border-line bg-canvas p-5 shadow-2xl shadow-ink/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wide text-brand uppercase">Step 2 of 5</span>
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">Beginner</span>
          </div>
          <p className="mt-2 font-display text-xl font-bold">Database normalisation</p>
          {/* Mini diagram */}
          <div className="mt-4 flex items-center justify-between gap-2 text-[11px] font-medium">
            {["Student", "Enrolment", "Course"].map((label, i) => (
              <div key={label} className="flex flex-1 items-center gap-2">
                <span className="flex-1 rounded-lg border border-brand/30 bg-brand-soft px-2 py-2 text-center text-brand-deep">{label}</span>
                {i < 2 && <ArrowRight className="size-3.5 shrink-0 text-subtle" />}
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            <span className="block h-2 w-full rounded-full bg-muted" />
            <span className="block h-2 w-4/5 rounded-full bg-muted" />
            <span className="block h-2 w-3/5 rounded-full bg-muted" />
          </div>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted">
            <span className="block h-full w-2/5 rounded-full bg-brand" />
          </div>
        </div>
      </Float>

      {/* Floating tools */}
      <Float className="absolute top-0 left-0 sm:-left-4" delay={0.2} duration={4.5}>
        <Chip icon={Layers} title="Flashcards" detail="12 due today" />
      </Float>
      <Float className="absolute top-2 right-0" delay={0.8} duration={5.2}>
        <Chip icon={Trophy} title="Quiz: 92%" detail="Excellent" />
      </Float>
      <Float className="absolute bottom-20 left-0 sm:-left-6" delay={1.2} duration={5.6}>
        <Chip icon={MessageCircleQuestion} title="Ask the tutor" detail="Cites your pages" />
      </Float>
      <Float className="absolute right-0 bottom-6 sm:-right-4" delay={0.5} duration={4.8}>
        <Chip icon={Headphones} title="Podcast mode" detail="Listen on the go" />
      </Float>
    </div>
  );
}

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: BookOpenText, title: "Step-by-step lessons", body: "Plain language, real examples." },
  { icon: Network, title: "Diagrams", body: "See how ideas connect." },
  { icon: MessageCircleQuestion, title: "AI tutor", body: "Ask anything, get page citations." },
  { icon: Layers, title: "Flashcards", body: "Spaced repetition that sticks." },
  { icon: Trophy, title: "Rated quizzes", body: "Know when you're ready." },
  { icon: Youtube, title: "Videos & reading", body: "Hand-picked extra help." },
  { icon: Headphones, title: "Podcast mode", body: "Two hosts explain it aloud." },
  { icon: Mic, title: "Defense practice", body: "Answer out loud, get graded." },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-24">
      <Reveal className="mx-auto max-w-xl text-center">
        <Eyebrow>Features</Eyebrow>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Everything you need to study</h2>
      </Reveal>
      <ul className=" ">
        {FEATURES.map((f, i) => (
          <li key={f.title}>
            <Reveal delay={(i % 4) * 0.06} className="h-full">
              <div className="group h-full rounded-2xl border border-line bg-canvas p-4 transition hover:-translate-y-1 hover:border-brand/30 hover:shadow-lg hover:shadow-ink/5 sm:p-6">
                <IconTile icon={f.icon} className="transition group-hover:bg-brand group-hover:text-white" />
                <h3 className="mt-4 font-display font-semibold sm:text-lg">{f.title}</h3>
                <p className="mt-1 text-sm text-subtle">{f.body}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Upload, title: "Upload", body: "Slides or notes, PDF or PowerPoint." },
  { icon: BookOpenText, title: "Learn", body: "Read, see, listen, ask." },
  { icon: Trophy, title: "Practise", body: "Flashcards, quizzes, a final rating." },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-line bg-canvas py-20 md:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <Reveal className="text-center">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Three steps. About a minute.</h2>
        </Reveal>
        <ol className="relative mt-14 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-6">
          <span aria-hidden="true" className="absolute top-8 right-[16%] left-[16%] hidden border-t-2 border-dashed border-line md:block" />
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <Reveal delay={i * 0.12} className="relative flex flex-col items-center text-center">
                <Float distance={5} duration={4 + i} delay={i * 0.4}>
                  <span className=" ">
                    <step.icon className="size-7" strokeWidth={1.8} aria-hidden="true" />
                    <span className=" ">
                      {i + 1}
                    </span>
                  </span>
                </Float>
                <h3 className="mt-5 font-display text-xl font-semibold">{step.title}</h3>
                <p className="mt-1 text-subtle">{step.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const PROJECT_POINTS: { icon: LucideIcon; label: string }[] = [
  { icon: Presentation, label: "A designed PowerPoint" },
  { icon: FileText, label: "A timed presenter script" },
  { icon: MessageCircleQuestion, label: "Likely questions + answers" },
  { icon: Mic, label: "Practice with an examiner" },
];

function Projects() {
  return (
    <section id="projects" className="bg-ink py-20 text-canvas md:py-24">
      <div className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-16 px-4 sm:px-6 md:grid-cols-2 md:gap-12">
        <Reveal>
          <Eyebrow dark>Projects &amp; presentations</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Upload the brief. Walk in prepared.
          </h2>
          <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
            {PROJECT_POINTS.map((p) => (
              <li key={p.label} className="flex items-center gap-3 rounded-xl bg-canvas/5 p-3 ring-1 ring-canvas/10">
                <IconTile icon={p.icon} dark />
                <span className="font-medium">{p.label}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/projects"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-canvas px-6 py-3.5 font-medium text-ink transition hover:bg-brand-soft"
          >
            Start a project <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Reveal>

        <div className="relative mx-auto w-full max-w-md pb-8 md:max-w-none" aria-hidden="true">
          <Float distance={8} duration={6}>
            <div className="aspect-video rounded-2xl bg-canvas p-[7%] text-ink shadow-2xl">
              <p className="text-[10px] font-bold tracking-wide text-brand uppercase sm:text-[11px]">BCP 202 · Database Design</p>
              <span className="mt-3 block h-1.5 w-14 bg-brand" />
              <p className="mt-3 font-display text-xl leading-tight font-bold sm:text-3xl">DreamHome Rental Database</p>
              <p className="mt-2 text-xs text-subtle sm:text-sm">ER model, normalisation and SQL</p>
            </div>
          </Float>
          <Float className="absolute -bottom-2 -left-2 sm:-left-6" distance={10} duration={5} delay={0.6}>
            <div className="max-w-[15rem] rounded-2xl bg-brand p-4 shadow-xl">
              <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-brand-soft uppercase">
                <MessageCircleQuestion className="size-3.5" /> Likely question
              </p>
              <p className="mt-1 text-sm font-medium">“Why surrogate keys over natural keys?”</p>
            </div>
          </Float>
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="px-4 py-20 sm:px-6 md:py-24">
      <Reveal className="mx-auto max-w-3xl text-center">
        <span className=" " aria-hidden="true">
          <GraduationCap className="size-7" strokeWidth={1.8} />
        </span>
        <h2 className="mt-6 font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">Study smarter, starting today.</h2>
        <p className="mt-4 text-lg text-subtle">Free to start. Your notes stay private.</p>
        <Link href="/upload" className={`${PRIMARY_BUTTON} mt-8`}>
          Get started <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </Reveal>
    </section>
  );
}

export default function Home() {
  return (
    <main>
      <Hero />
      <Features />
      <HowItWorks />
      <Projects />
      <FinalCTA />
    </main>
  );
}
