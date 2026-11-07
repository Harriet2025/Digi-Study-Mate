import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-xs font-semibold tracking-[0.18em] text-terracotta-deep uppercase">Study Mate</p>
      <h1 className="mt-2 font-serif text-4xl leading-tight font-semibold text-balance">
        Your lectures, turned into a conversation you can listen to.
      </h1>
      <p className="mt-4 text-lg text-stone">
        Upload slides or notes, and Alex &amp; Sam will talk you through them, quizzing you along the way.
      </p>
      <Link
        href="/listen/demo"
        className="mt-8 inline-flex items-center rounded-full bg-terracotta px-6 py-3 font-medium text-white transition hover:bg-terracotta-deep"
      >
        Try the demo player
      </Link>
    </main>
  );
}
