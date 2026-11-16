import Link from "next/link";

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function Eyebrow({ children, tone = "terracotta" }: { children: React.ReactNode; tone?: "terracotta" | "cream" }) {
  return (
    <p
      className={`text-xs font-semibold tracking-[0.18em] uppercase ${
        tone === "cream" ? "text-terracotta-soft" : "text-terracotta-deep"
      }`}
    >
      {children}
    </p>
  );
}

function Avatar({ who, size = "md" }: { who: "A" | "S"; size?: "sm" | "md" }) {
  const dims = size === "sm" ? "size-7 text-xs" : "size-9 text-sm";
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-serif font-semibold ${dims} ${
        who === "A" ? "bg-terracotta text-white" : "border-2 border-charcoal bg-cream text-charcoal"
      }`}
    >
      {who}
    </span>
  );
}

/** Animated audio bars. Purely decorative. */
function Waveform({ bars = 28, className = "" }: { bars?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`flex h-10 items-center justify-between gap-[3px] ${className}`}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className="w-[3px] origin-center rounded-full bg-terracotta motion-safe:animate-wave"
          style={{
            height: `${30 + ((i * 37) % 70)}%`,
            animationDelay: `${(i * 0.09) % 1.1}s`,
            opacity: i < bars * 0.45 ? 1 : 0.35,
          }}
        />
      ))}
    </div>
  );
}

function PlayGlyph({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" />
    </svg>
  );
}

function MicGlyph({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Soft background shapes */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 -right-32 size-[520px] rounded-full bg-terracotta-soft/60 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 -left-40 size-[460px] rounded-full bg-sage-soft/70 blur-3xl" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20 lg:pb-28">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-sand bg-cream/80 px-3 py-1 text-xs font-medium text-stone">
            <span className="size-1.5 rounded-full bg-sage" aria-hidden="true" />
            Audio-first studying for university students
          </span>
          <h1 className="mt-6 font-serif text-[2.6rem] leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
            Your lecture notes,{" "}
            <span className="relative whitespace-nowrap text-terracotta">
              <span className="relative z-10">talked through</span>
              <svg aria-hidden="true" viewBox="0 0 300 18" className="absolute -bottom-2 left-0 h-3 w-full text-terracotta/35" preserveAspectRatio="none">
                <path d="M3 12 C 80 2, 200 2, 297 10" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
              </svg>
            </span>{" "}
            like a podcast.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone">
            Upload your slides or notes. Alex, a friendly tutor, and Sam, a curious classmate, turn them into a conversation
            you can listen to on the bus, at the gym or the night before the exam. They pause to quiz you, and you can
            interrupt to ask anything.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href="/listen/demo"
              className="inline-flex items-center gap-2.5 rounded-full bg-terracotta px-6 py-3.5 font-medium text-white shadow-md shadow-terracotta/25 transition hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-charcoal focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:outline-none"
            >
              <PlayGlyph /> Listen to a demo lesson
            </Link>
            <Link href="#how-it-works" className="group inline-flex items-center gap-1.5 font-medium text-charcoal">
              See how it works
              <span aria-hidden="true" className="transition group-hover:translate-x-0.5">→</span>
            </Link>
          </div>
          <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-sand pt-6">
            {[
              ["PDF & PPTX", "slides and notes"],
              ["2 hosts", "tutor + student"],
              ["Quiz pauses", "built into every lesson"],
            ].map(([value, label]) => (
              <div key={value}>
                <dt className="font-serif text-lg font-semibold">{value}</dt>
                <dd className="mt-0.5 text-xs leading-snug text-stone">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <HeroPlayerPreview />
      </div>
    </section>
  );
}

/** A static, decorative preview of the player. */
function HeroPlayerPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md pb-10 sm:pb-14 lg:max-w-none" aria-hidden="true">
      <div className="motion-safe:animate-float rounded-[2rem] border border-sand bg-cream p-5 shadow-[0_30px_80px_-30px_rgba(41,37,36,0.45)] sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-terracotta-deep uppercase">Now playing</p>
            <p className="mt-1 font-serif text-xl font-semibold">Database Normalisation</p>
            <p className="text-xs text-stone">Database Systems · Chapter 4 · 12 min</p>
          </div>
          <span className="grid size-12 place-items-center rounded-full bg-charcoal text-cream">
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
              <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
              <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
            </svg>
          </span>
        </div>

        <Waveform bars={44} className="mt-5" />
        <div className="mt-1 flex justify-between text-[11px] text-stone tabular-nums">
          <span>4:12</span>
          <span>12:03</span>
        </div>

        <ol className="mt-5 space-y-2">
          <li className="flex gap-3 rounded-2xl px-3 py-2.5 text-stone">
            <Avatar who="S" size="sm" />
            <p className="font-serif text-[15px] leading-snug">Hmm… so if a student has three phone numbers, where do they go?</p>
          </li>
          <li className="flex gap-3 rounded-2xl bg-cream-deep px-3 py-2.5">
            <Avatar who="A" size="sm" />
            <p className="font-serif text-[15px] leading-snug">
              Into their own table: one row per number, each pointing back to the student.
            </p>
          </li>
          <li className="flex gap-3 rounded-2xl border-l-4 border-terracotta px-3 py-2.5">
            <Avatar who="A" size="sm" />
            <div>
              <span className="rounded-full bg-terracotta px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
                Checkpoint
              </span>
              <p className="mt-1 font-serif text-[15px] leading-snug">Quick one: what rule does first normal form add?</p>
            </div>
          </li>
        </ol>

        <div className="mt-5 flex items-center justify-between rounded-2xl bg-cream-deep/70 px-4 py-3">
          <p className="text-sm text-stone">Hold to ask a question</p>
          <span className="relative grid size-11 place-items-center rounded-full bg-terracotta text-white">
            <span className="absolute inset-0 rounded-full bg-terracotta/40 motion-safe:animate-ping" />
            <MicGlyph className="relative size-5" />
          </span>
        </div>
      </div>

      {/* Floating "you asked" bubble */}
      <div className="absolute bottom-0 -left-4 hidden max-w-[15rem] rounded-2xl border border-sand bg-white p-3.5 shadow-xl sm:block lg:-left-10">
        <p className="text-[10px] font-semibold tracking-wide text-terracotta-deep uppercase">You asked</p>
        <p className="mt-1 text-sm font-medium">“Why not just keep everything in one table?”</p>
      </div>
      {/* Thinking-time sticker */}
      <div className="absolute bottom-1 -right-3 hidden rotate-3 rounded-2xl bg-charcoal px-4 py-3 text-cream shadow-xl sm:block">
        <p className="text-[10px] tracking-wide text-terracotta-soft uppercase">Your turn</p>
        <p className="font-serif text-2xl font-semibold leading-none">3s</p>
      </div>
    </div>
  );
}

function FormatsStrip() {
  const items = ["Lecture slides (.pptx)", "Course notes (PDF)", "Thesis & project decks", "Speaker notes included", "Tables kept readable"];
  return (
    <section aria-label="Supported material" className="border-y border-sand bg-cream-deep/50">
      <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-5 text-sm text-stone sm:px-6">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <svg viewBox="0 0 20 20" className="size-4 text-sage" fill="currentColor" aria-hidden="true">
              <path d="M8.1 13.6 4.5 10l1.1-1.1 2.5 2.5 6.3-6.3 1.1 1.1z" />
            </svg>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: "Upload your material",
      body: "Drop in a PDF or PowerPoint. We strip page numbers, headers and clutter, and keep headings, tables and speaker notes.",
      icon: (
        <path d="M12 16V4m0 0-4 4m4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
      ),
    },
    {
      title: "Listen to Alex & Sam",
      body: "Pick the pages and a length. The hosts explain each idea in plain language with everyday analogies, then the precise terms.",
      icon: (
        <path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2v-3Zm16 0a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2v-3Z" />
      ),
    },
    {
      title: "Practise like it's the real thing",
      body: "Answer quiz checkpoints out loud, interrupt with your own questions, and rehearse tough panel questions with instant feedback.",
      icon: <path d="M9 12l2 2 4-4M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />,
    },
  ];

  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="max-w-2xl">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-3 font-serif text-4xl leading-tight font-semibold text-balance">
          From a 90-page PDF to something you actually want to listen to.
        </h2>
      </div>
      <ol className="mt-14 grid gap-6 md:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="relative rounded-3xl border border-sand bg-cream p-7 transition hover:-translate-y-1 hover:shadow-lg">
            <span className="font-serif text-6xl font-semibold text-terracotta/15" aria-hidden="true">
              0{i + 1}
            </span>
            <span className="absolute top-7 right-7 grid size-11 place-items-center rounded-2xl bg-terracotta-soft text-terracotta-deep">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {step.icon}
              </svg>
            </span>
            <h3 className="mt-2 font-serif text-xl font-semibold">{step.title}</h3>
            <p className="mt-2 leading-relaxed text-stone">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="bg-cream-deep/50 py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <Eyebrow>Features</Eyebrow>
          <h2 className="mt-3 font-serif text-4xl leading-tight font-semibold text-balance">
            Built around how memory actually works.
          </h2>
          <p className="mt-4 text-lg text-stone">
            Listening is easy. Remembering takes effort. Study Mate makes you do a little of that effort at exactly the
            right moments.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-6">
          {/* Two hosts */}
          <article className="rounded-3xl border border-sand bg-cream p-7 md:col-span-4">
            <h3 className="font-serif text-2xl font-semibold">Two hosts, one lesson</h3>
            <p className="mt-2 max-w-lg text-stone">
              Alex explains, Sam asks the questions you were too shy to ask. Their back-and-forth keeps you listening, and
              Sam&apos;s confusion lands right where students usually get stuck.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="flex gap-3 rounded-2xl bg-cream-deep p-4">
                <Avatar who="A" />
                <div>
                  <p className="font-semibold">Alex</p>
                  <p className="text-sm text-stone">Warm, sharp tutor. Plain words first, analogy second, jargon last.</p>
                </div>
              </div>
              <div className="flex gap-3 rounded-2xl bg-cream-deep p-4">
                <Avatar who="S" />
                <div>
                  <p className="font-semibold">Sam</p>
                  <p className="text-sm text-stone">Curious classmate. Thinks out loud, gets things half-right, pushes back.</p>
                </div>
              </div>
            </div>
          </article>

          {/* Checkpoints */}
          <article className="flex flex-col rounded-3xl bg-terracotta p-7 text-white md:col-span-2">
            <h3 className="font-serif text-2xl font-semibold">Active recall checkpoints</h3>
            <p className="mt-2 text-white/85">
              Every few minutes Alex stops and quizzes you. You get a few seconds to think before the answer.
            </p>
            <div className="mt-auto flex items-center gap-4 pt-6">
              <svg viewBox="0 0 48 48" className="size-16 -rotate-90" aria-hidden="true">
                <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="5" />
                <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray="125.6" strokeDashoffset="42" />
              </svg>
              <p className="font-serif text-lg leading-snug">“Pause and think for a second…”</p>
            </div>
          </article>

          {/* Interrupt & Ask */}
          <article className="rounded-3xl bg-charcoal p-7 text-cream md:col-span-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-serif text-2xl font-semibold">Interrupt &amp; Ask</h3>
                <p className="mt-2 max-w-sm text-cream/75">
                  Confused? Hold the mic and ask out loud. The lesson pauses, Alex answers in context, then picks up right
                  where you left off.
                </p>
              </div>
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-terracotta">
                <MicGlyph />
              </span>
            </div>
            <div className="mt-6 space-y-2 text-sm">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-cream/10 px-4 py-2.5">
                Wait, what&apos;s a partial dependency again?
              </p>
              <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-terracotta/90 px-4 py-2.5">
                Great question! It&apos;s when a column depends on only part of a composite key…
              </p>
            </div>
          </article>

          {/* Live transcript */}
          <article className="rounded-3xl border border-sand bg-cream p-7 md:col-span-3">
            <h3 className="font-serif text-2xl font-semibold">A transcript that follows along</h3>
            <p className="mt-2 text-stone">
              Every word is on screen and highlighted as it&apos;s spoken. Tap any line to jump back, or skip ahead ten
              seconds at a time.
            </p>
            <div className="mt-6 space-y-1.5" aria-hidden="true">
              {["First normal form says every column holds one value.", "No lists crammed into a single cell.", "So three phone numbers get their own table."].map(
                (line, i) => (
                  <p
                    key={line}
                    className={`rounded-xl px-3 py-2 font-serif ${i === 1 ? "bg-terracotta-soft text-charcoal" : "text-stone"}`}
                  >
                    {line}
                  </p>
                ),
              )}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function SampleConversation() {
  const lines: { who: "A" | "S"; text: string }[] = [
    { who: "A", text: "Picture a group chat where everyone keeps re-typing the same address. One person moves, and now half the messages are wrong." },
    { who: "S", text: "Oh… so that's what they mean by an update anomaly?" },
    { who: "A", text: "Exactly. Normalisation is just making sure each fact lives in one place." },
  ];
  return (
    <section className="mx-auto max-w-4xl px-4 py-24 sm:px-6">
      <div className="text-center">
        <Eyebrow>Hear the difference</Eyebrow>
        <h2 className="mt-3 font-serif text-4xl leading-tight font-semibold text-balance">
          Not a robot reading your slides.
        </h2>
      </div>
      <figure className="mt-12 rounded-[2rem] border border-sand bg-cream p-6 shadow-sm sm:p-10">
        <div className="space-y-6">
          {lines.map((line, i) => (
            <div key={i} className={`flex gap-4 ${line.who === "S" ? "sm:pl-12" : ""}`}>
              <Avatar who={line.who} />
              <blockquote className="font-serif text-xl leading-relaxed sm:text-2xl">{line.text}</blockquote>
            </div>
          ))}
        </div>
        <figcaption className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-sand pt-6">
          <span className="text-sm text-stone">From the demo lesson: Database Normalisation</span>
          <Link href="/listen/demo" className="inline-flex items-center gap-2 font-medium text-terracotta-deep hover:underline">
            <PlayGlyph className="size-3.5" /> Play the demo
          </Link>
        </figcaption>
      </figure>
    </section>
  );
}

function DefensePrep() {
  const points: { label: string; status: "covered" | "partial" | "missing" }[] = [
    { label: "Names the primary key of each table", status: "covered" },
    { label: "Identifies the functional dependencies", status: "partial" },
    { label: "Shows how transitive dependencies were removed", status: "missing" },
  ];
  const style = {
    covered: "bg-sage-soft text-sage",
    partial: "bg-terracotta-soft text-terracotta-deep",
    missing: "bg-cream/10 text-cream/60",
  } as const;

  return (
    <section id="defense" className="bg-charcoal py-24 text-cream">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <Eyebrow tone="cream">Exam &amp; defense prep</Eyebrow>
          <h2 className="mt-3 font-serif text-4xl leading-tight font-semibold text-balance">
            Rehearse with the toughest examiner you&apos;ll ever meet.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-cream/75">
            Study Mate reads your slides like a strict panel would, finds the weak spots (unjustified methods, missing
            evidence, fuzzy definitions) and asks you five hard questions. Answer by typing or speaking, and get graded
            against a real marking rubric.
          </p>
          <ul className="mt-8 space-y-3 text-cream/85">
            {[
              "Questions aimed at the logical gaps in your own material",
              "See exactly which key points you covered, half-covered or missed",
              "Get an outline of a stronger answer and the panel's likely follow-up",
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-terracotta text-[11px] font-bold">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4" aria-hidden="true">
          <div className="rounded-3xl bg-cream/[0.06] p-6 ring-1 ring-cream/10">
            <p className="text-xs font-semibold tracking-wide text-terracotta-soft uppercase">Question 2 · Methodology</p>
            <p className="mt-2 font-serif text-xl leading-snug">
              “Your schema has four tables but you never discuss normalisation. How did you make sure it&apos;s in third
              normal form?”
            </p>
          </div>
          <div className="rounded-3xl bg-cream p-6 text-charcoal shadow-2xl">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold tracking-wide text-terracotta-deep uppercase">Your result</p>
                <p className="font-serif text-5xl font-semibold">
                  58<span className="text-2xl text-stone">/100</span>
                </p>
              </div>
              <span className="rounded-full bg-terracotta-soft px-3 py-1 text-sm font-semibold text-terracotta-deep">Partial</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-sand">
              <div className="h-full w-[58%] rounded-full bg-terracotta" />
            </div>
            <ul className="mt-5 space-y-2 rounded-2xl bg-charcoal p-4 text-sm text-cream">
              {points.map((p) => (
                <li key={p.label} className="flex items-center justify-between gap-3">
                  <span>{p.label}</span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${style[p.status]}`}>{p.status}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-stone">
              <span className="font-semibold text-charcoal">Tip:</span> name each table&apos;s key first, then walk through the
              dependencies before you conclude.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const faqs = [
    {
      q: "What can I upload?",
      a: "PDF documents and PowerPoint decks (.pptx) up to 25 MB. Text, headings, tables and speaker notes are all picked up. Scanned PDFs (photos of pages) don't have readable text yet.",
    },
    {
      q: "Does it make things up?",
      a: "Your material is treated as the source of truth. Alex adds analogies and examples to explain it, but is told not to invent facts, figures or claims that aren't in your notes.",
    },
    {
      q: "How long are the lessons?",
      a: "You choose. A few minutes for a quick recap of a section, or longer for a whole chapter, with a quiz checkpoint roughly every three minutes.",
    },
    {
      q: "Can I use it for my thesis or project defense?",
      a: "Yes. Upload your presentation and the defense practice mode asks the questions a strict panel would, then grades your answers against a rubric.",
    },
  ];
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
      <div className="text-center">
        <Eyebrow>Questions</Eyebrow>
        <h2 className="mt-3 font-serif text-4xl font-semibold">Good to know</h2>
      </div>
      <div className="mt-10 divide-y divide-sand border-y border-sand">
        {faqs.map((f) => (
          <details key={f.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-serif text-lg font-semibold">
              {f.q}
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-sand text-terracotta transition group-open:rotate-45" aria-hidden="true">
                +
              </span>
            </summary>
            <p className="mt-3 leading-relaxed text-stone">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-terracotta px-6 pt-16 pb-28 text-center text-white sm:px-12">
        <div aria-hidden="true" className="absolute inset-x-8 bottom-4 opacity-25 sm:inset-x-16">
          <Waveform bars={90} className="h-16 [&>span]:bg-white" />
        </div>
        <h2 className="relative font-serif text-4xl leading-tight font-semibold text-balance sm:text-5xl">
          Your next study session could be a walk.
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-lg text-white/85">
          Hear how Alex and Sam explain database normalisation, then imagine it with your own notes.
        </p>
        <Link
          href="/listen/demo"
          className="relative mt-8 inline-flex items-center gap-2.5 rounded-full bg-cream px-7 py-3.5 font-medium text-charcoal shadow-lg transition hover:bg-white focus-visible:ring-2 focus-visible:ring-charcoal focus-visible:ring-offset-2 focus-visible:ring-offset-terracotta focus-visible:outline-none"
        >
          <PlayGlyph /> Listen to the demo
        </Link>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main>
      <Hero />
      <FormatsStrip />
      <HowItWorks />
      <Features />
      <SampleConversation />
      <DefensePrep />
      <FAQ />
      <FinalCTA />
    </main>
  );
}
