import type { DeckSlide } from "@/lib/api";

/** An HTML rendering of a generated slide, matching the PowerPoint design (16:9). */
export function SlidePreview({ slide, number, total, course }: { slide: DeckSlide; number: number; total: number; course: string | null }) {
  if (slide.layout === "section") {
    return (
      <Frame className="bg-brand text-white">
        <div className="flex h-full flex-col justify-center px-[7%]">
          <p className="font-display text-[clamp(1.1rem,3.4cqw,2.6rem)] leading-tight font-semibold">{slide.title}</p>
          {slide.subtitle && <p className="mt-2 text-[clamp(0.7rem,1.7cqw,1.3rem)] text-canvas">{slide.subtitle}</p>}
        </div>
      </Frame>
    );
  }
  return (
    <Frame className="bg-canvas">
      <span className="absolute inset-y-0 left-0 w-[1.6%] bg-brand" aria-hidden="true" />
      <div className="flex h-full flex-col px-[6%] pt-[4.5%] pb-[4%]">
        {course && <p className="text-[clamp(0.45rem,0.9cqw,0.75rem)] font-bold tracking-wide text-brand uppercase">{course}</p>}
        <p className="mt-[0.5%] font-display text-[clamp(0.8rem,2.4cqw,1.9rem)] leading-tight font-semibold">{slide.title}</p>
        <div className="mt-[3%] min-h-0 flex-1 text-[clamp(0.55rem,1.45cqw,1.1rem)]">
          <Body slide={slide} />
        </div>
        <p className="text-right text-[clamp(0.45rem,0.85cqw,0.7rem)] text-subtle">
          {number} / {total}
        </p>
      </div>
    </Frame>
  );
}

export function TitleSlidePreview({ title, subtitle, course }: { title: string; subtitle: string; course: string | null }) {
  return (
    <Frame className="bg-ink text-canvas">
      <span className="absolute right-[6%] bottom-[-12%] aspect-square w-[22%] rounded-full bg-brand" aria-hidden="true" />
      <div className="relative flex h-full flex-col justify-center px-[6%]">
        {course && <p className="text-[clamp(0.5rem,1.1cqw,0.9rem)] font-bold tracking-wide text-brand-soft uppercase">{course}</p>}
        <span className="mt-[2%] h-[1.4%] w-[9%] bg-brand" aria-hidden="true" />
        <p className="mt-[3%] max-w-[85%] font-display text-[clamp(1.1rem,3.6cqw,2.8rem)] leading-tight font-semibold">{title}</p>
        {subtitle && <p className="mt-[2%] max-w-[80%] text-[clamp(0.65rem,1.7cqw,1.3rem)] text-line">{subtitle}</p>}
      </div>
    </Frame>
  );
}

export function ClosingSlidePreview({ message }: { message: string }) {
  return (
    <Frame className="bg-ink text-canvas">
      <div className="flex h-full flex-col justify-center px-[6%]">
        <p className="font-display text-[clamp(1.3rem,4.2cqw,3.2rem)] font-semibold">Thank you</p>
        <span className="mt-[2%] h-[1.4%] w-[9%] bg-brand" aria-hidden="true" />
        <p className="mt-[3%] text-[clamp(0.7rem,1.9cqw,1.4rem)] text-line">{message || "Questions and discussion"}</p>
      </div>
    </Frame>
  );
}

function Frame({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <div className="@container w-full">
      <div className={`relative aspect-video w-full overflow-hidden rounded-xl shadow-[0_10px_40px_-18px_rgba(41,37,36,0.5)] ring-1 ring-line ${className}`}>
        {children}
      </div>
    </div>
  );
}

function Dot() {
  return <span className="mt-[0.55em] size-[0.45em] shrink-0 rounded-full bg-brand" aria-hidden="true" />;
}

function Body({ slide }: { slide: DeckSlide }) {
  switch (slide.layout) {
    case "two_column":
      if (slide.columns.length >= 2) {
        return (
          <div className="grid h-full grid-cols-2 gap-[3%]">
            {slide.columns.slice(0, 2).map((c, i) => (
              <div key={i} className={`rounded-[0.8em] p-[5%] ${i === 0 ? "bg-muted" : "bg-brand-soft"}`}>
                <p className="font-display font-semibold">{c.heading}</p>
                <ul className="mt-[0.5em] space-y-[0.35em]">
                  {c.bullets.slice(0, 6).map((b, j) => (
                    <li key={j} className="flex gap-[0.5em]">
                      <Dot />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        );
      }
      break;
    case "process":
    case "timeline":
      if (slide.steps.length) {
        return (
          <div className="flex h-full items-stretch gap-[2%]">
            {slide.steps.slice(0, 6).map((s, i) => (
              <div key={i} className="flex flex-1 flex-col rounded-[0.8em] bg-muted p-[3%]">
                <span className="grid size-[1.8em] place-items-center rounded-full bg-brand font-bold text-white">{i + 1}</span>
                <p className="mt-[0.5em] font-display leading-tight font-semibold">{s.label}</p>
                <p className="mt-[0.3em] text-[0.82em] leading-snug text-subtle">{s.detail}</p>
              </div>
            ))}
          </div>
        );
      }
      break;
    case "stats":
      if (slide.stats.length) {
        return (
          <div className="flex h-full items-center gap-[3%]">
            {slide.stats.slice(0, 4).map((s, i) => (
              <div key={i} className="flex-1 rounded-[0.8em] bg-muted p-[4%]">
                <p className="font-display text-[2.2em] leading-none font-semibold text-brand">{s.value}</p>
                <p className="mt-[0.4em] leading-snug">{s.label}</p>
              </div>
            ))}
          </div>
        );
      }
      break;
    case "quote":
      return (
        <div className="flex h-full flex-col justify-center pl-[4%]">
          <p className="font-display text-[1.5em] leading-snug italic">“{slide.quote || slide.bullets.join(" ")}”</p>
          {slide.subtitle && <p className="mt-[0.6em] text-subtle">— {slide.subtitle}</p>}
        </div>
      );
  }
  return (
    <div>
      {slide.subtitle && <p className="mb-[0.6em] text-subtle italic">{slide.subtitle}</p>}
      <ul className="space-y-[0.55em]">
        {slide.bullets.slice(0, 7).map((b, i) => (
          <li key={i} className="flex gap-[0.6em]">
            <Dot />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}
