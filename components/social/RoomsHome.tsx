"use client";

import { ArrowRight, DoorOpen, Plus, Swords, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import AppHero from "@/components/app/AppHero";
import { RevealGroup } from "@/components/motion/Gsap";
import { api, ApiError, timeAgo, type BattleSummary, type RoomSummary } from "@/lib/api";
import { Button, ErrorNote, LoadingBlock, Spinner } from "@/components/ui";

export default function RoomsHome() {
  const router = useRouter();
  const params = useSearchParams();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [battles, setBattles] = useState<BattleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState((params.get("join") ?? "").toUpperCase());
  const [name, setName] = useState("");
  const [course, setCourse] = useState("");
  const [busy, setBusy] = useState<"join" | "create" | null>(null);

  useEffect(() => {
    Promise.all([api.rooms(), api.battles()])
      .then(([r, b]) => {
        setRooms(r);
        setBattles(b);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your rooms."));
  }, []);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("join");
    setError(null);
    try {
      const room = await api.joinRoom(code);
      router.push(`/rooms/${room.roomId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't join that room.");
      setBusy(null);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Give your room a name.");
    setBusy("create");
    setError(null);
    try {
      const room = await api.createRoom({ name: name.trim(), course: course.trim() || undefined });
      router.push(`/rooms/${room.roomId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the room.");
      setBusy(null);
    }
  };

  return (
    <div className="space-y-12">
      <AppHero
        icon={Users}
        eyebrow="Study rooms"
        title="Study together"
        description="Share study spaces with your coursemates, climb the weekly leaderboard and challenge each other to quiz battles."
        aside={
          <div className="grid grid-cols-1 gap-3">
            <form onSubmit={join} className="rounded-2xl border border-line bg-canvas/90 p-4 backdrop-blur">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <DoorOpen className="size-4 text-brand" aria-hidden="true" /> Join with a code
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  maxLength={8}
                  placeholder="e.g. K7Q2MX"
                  aria-label="Room code"
                  className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2.5 font-mono tracking-[0.2em] uppercase focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
                />
                <Button type="submit" disabled={code.length < 4 || busy !== null} className="px-4">
                  {busy === "join" ? <Spinner className="size-4" /> : "Join"}
                </Button>
              </div>
            </form>
            <form onSubmit={create} className="rounded-2xl border border-line bg-canvas/90 p-4 backdrop-blur">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Plus className="size-4 text-brand" aria-hidden="true" /> Create a room
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  placeholder="Room name"
                  aria-label="Room name"
                  className="rounded-full border border-line bg-white px-4 py-2.5 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
                />
                <input
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  maxLength={200}
                  placeholder="Course (optional)"
                  aria-label="Course"
                  className="rounded-full border border-line bg-white px-4 py-2.5 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
                />
              </div>
              <Button type="submit" variant="dark" disabled={busy !== null} className="mt-2 w-full">
                {busy === "create" ? <Spinner className="size-4" /> : <Plus className="size-4" aria-hidden="true" />} Create room
              </Button>
            </form>
          </div>
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}
      {!rooms && !error && <LoadingBlock label="Loading your rooms…" />}

      {rooms && (
        <section>
          <Heading icon={Users} title="Your rooms" count={rooms.length} />
          {rooms.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-dashed border-line px-6 py-10 text-center text-subtle">
              No rooms yet. Create one and share the code with your coursemates, or join theirs.
            </p>
          ) : (
            <RevealGroup className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rooms.map((r) => (
                <Link
                  data-reveal
                  key={r.roomId}
                  href={`/rooms/${r.roomId}`}
                  className="group flex flex-col rounded-2xl border border-line bg-canvas p-5 transition hover:-translate-y-1 hover:border-brand/30 hover:shadow-xl hover:shadow-ink/5"
                >
                  <div className="flex -space-x-2" aria-hidden="true">
                    {Array.from({ length: Math.min(4, r.memberCount) }, (_, i) => (
                      <span key={i} className="grid size-9 place-items-center rounded-full border-2 border-canvas bg-brand-soft text-brand">
                        <Users className="size-4" />
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 font-display text-xl font-bold">{r.name}</p>
                  {r.course && <p className="text-sm text-subtle">{r.course}</p>}
                  <span className="mt-auto flex items-center justify-between pt-5 text-sm text-subtle">
                    {r.memberCount} member{r.memberCount === 1 ? "" : "s"} · {r.shareCount} shared
                    <ArrowRight className="size-4 text-brand transition group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </RevealGroup>
          )}
        </section>
      )}

      {battles.length > 0 && (
        <section>
          <Heading icon={Swords} title="Recent battles" count={battles.length} />
          <ul className="mt-5 space-y-3">
            {battles.slice(0, 6).map((b) => (
              <li key={b.battleId}>
                <Link href={`/battle/${b.code}`} className="flex items-center gap-4 rounded-2xl border border-line bg-canvas p-4 hover:border-brand/30">
                  <span className="grid size-11 place-items-center rounded-xl bg-ink text-canvas" aria-hidden="true">
                    <Swords className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{b.title}</span>
                    <span className="text-xs text-subtle">
                      {b.playerCount} players · {b.status === "finished" ? `won by ${b.winner}` : b.status === "live" ? "in progress" : "waiting to start"} · {timeAgo(b.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Heading({ icon: Icon, title, count }: { icon: LucideIcon; title: string; count?: number }) {
  return (
    <h2 className="flex items-center gap-3 font-display text-2xl font-bold tracking-tight">
      <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden="true">
        <Icon className="size-4.5" />
      </span>
      {title}
      {count ? <span className="rounded-full bg-muted px-2.5 py-0.5 font-sans text-sm font-medium text-subtle">{count}</span> : null}
    </h2>
  );
}
