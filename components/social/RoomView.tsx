"use client";

import {
  BookOpenText,
  Check,
  ClipboardCheck,
  Copy,
  Crown,
  Eye,
  EyeOff,
  Flame,
  Layers,
  LogOut,
  Medal,
  Share2,
  Swords,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CountUp, DrawLine, RevealGroup, TypedHeading } from "@/components/motion/Gsap";
import { api, ApiError, timeAgo, type GuideSummary, type LeaderboardEntry, type RoomDetail } from "@/lib/api";
import { Button, ErrorNote, LoadingBlock, Spinner } from "@/components/ui";

const BADGE_ICON: Record<LeaderboardEntry["badges"][number]["id"], LucideIcon> = {
  top: Crown,
  streak3: Flame,
  streak7: Flame,
  battle: Swords,
  exam: ClipboardCheck,
  cards: Layers,
};

export default function RoomView({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myGuides, setMyGuides] = useState<GuideSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setRoom(await api.room(roomId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load this room.");
    }
  }, [roomId]);

  useEffect(() => {
    load();
    api
      .library()
      .then((lib) => setMyGuides(lib.documents.flatMap((d) => d.guides.filter((g) => g.status === "ready"))))
      .catch(() => undefined);
  }, [load]);

  if (error && !room) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!room) return <LoadingBlock label="Opening the room…" />;

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/rooms?join=${room.joinCode}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Join my Study Mate room "${room.name}": ${inviteUrl}`)}`;

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
    setBusy(null);
  };

  const sharedIds = new Set(room.shares.filter((s) => s.isMine).map((s) => s.title));
  const shareable = myGuides.filter((g) => !sharedIds.has(g.title));
  const top3 = room.leaderboard.slice(0, 3);

  return (
    <div className="space-y-10">
      <div>
        <Link href="/rooms" className="text-sm font-medium text-subtle hover:text-ink">
          ← All rooms
        </Link>
        <div className="mt-3 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-brand uppercase">
              <Users className="size-4" aria-hidden="true" /> Study room{room.course ? ` · ${room.course}` : ""}
            </p>
            <TypedHeading text={room.name} className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-5xl" />
            <DrawLine className="mt-1 h-3 w-40 text-brand/30" />
          </div>
          <div className="rounded-2xl border border-line bg-canvas p-4">
            <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">Invite code</p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-[0.25em]">{room.joinCode}</p>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" onClick={copy} className="px-4 py-2">
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />} {copied ? "Copied" : "Copy link"}
              </Button>
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#1f8f4e] px-4 py-2 text-sm font-medium text-white hover:bg-[#187240]">
                <Share2 className="size-4" aria-hidden="true" /> WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Leaderboard */}
      <section className="overflow-hidden rounded-3xl border border-line bg-canvas">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4 sm:px-8">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold">
            <Trophy className="size-5 text-brand" aria-hidden="true" /> This week&apos;s leaderboard
          </h2>
          <button
            type="button"
            onClick={() => run("vis", async () => setRoom(await api.setOnLeaderboard(roomId, !room.onLeaderboard)))}
            className="inline-flex items-center gap-1.5 text-sm text-subtle hover:text-ink"
          >
            {room.onLeaderboard ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
            {room.onLeaderboard ? "You're on the board" : "You're hidden"}
          </button>
        </div>
        {room.leaderboard.length === 0 ? (
          <p className="px-6 py-10 text-center text-subtle sm:px-8">Nobody&apos;s on the board yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_1.2fr]">
            {/* Podium */}
            <ol className="flex items-end justify-center gap-3" aria-label="Top three">
              {[top3[1], top3[0], top3[2]].map((p, i) =>
                p ? (
                  <li key={p.userId} className="flex w-1/3 max-w-36 flex-col items-center text-center">
                    {p.rank === 1 ? <Crown className="mb-1 size-6 text-brand" aria-hidden="true" /> : <Medal className="mb-1 size-5 text-subtle" aria-hidden="true" />}
                    <span className="line-clamp-1 text-sm font-semibold">{p.name}</span>
                    <span className="text-xs text-subtle">
                      <CountUp value={p.points} /> pts
                    </span>
                    <span
                      className={`mt-2 grid w-full place-items-start justify-center rounded-t-xl pt-2 font-display text-2xl font-bold ${
                        p.rank === 1 ? "h-28 bg-brand text-white" : p.rank === 2 ? "h-20 bg-brand-soft text-brand-deep" : "h-14 bg-muted text-subtle"
                      }`}
                    >
                      {p.rank}
                    </span>
                  </li>
                ) : (
                  <li key={`empty-${i}`} className="w-1/3 max-w-36" />
                ),
              )}
            </ol>
            <RevealGroup as="ul" className="divide-y divide-line">
              {room.leaderboard.map((p) => (
                <li data-reveal key={p.userId} className="flex items-center gap-3 py-3">
                  <span className="w-6 text-center font-display font-bold text-subtle">{p.rank}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {p.badges.map((b) => {
                        const Icon = BADGE_ICON[b.id];
                        return (
                          <span key={b.id} className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-deep">
                            <Icon className="size-3" aria-hidden="true" /> {b.label}
                          </span>
                        );
                      })}
                    </span>
                  </span>
                  {p.streak > 0 && (
                    <span className="hidden items-center gap-1 text-xs text-subtle sm:inline-flex" title="Study streak">
                      <Flame className="size-3.5" aria-hidden="true" /> {p.streak}
                    </span>
                  )}
                  <span className="font-display text-lg font-bold tabular-nums">{p.points}</span>
                </li>
              ))}
            </RevealGroup>
          </div>
        )}
        <p className="border-t border-line px-6 py-3 text-xs text-subtle sm:px-8">
          Points this week: flashcards 1 · quiz 5 · tutor question 1 · defence answer 3 · mock exam 10 · battle 5 (+20 for a win). Resets every Monday.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Shared study spaces */}
        <section className="rounded-3xl border border-line bg-canvas p-6">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold">
            <BookOpenText className="size-5 text-brand" aria-hidden="true" /> Shared study spaces
          </h2>
          {room.shares.length === 0 ? (
            <p className="mt-4 text-sm text-subtle">Nothing shared yet. Share one of yours below.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {room.shares.map((s) => (
                <li key={s.shareId} className="flex items-center gap-3 rounded-2xl border border-line p-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand" aria-hidden="true">
                    <BookOpenText className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 font-medium">{s.title}</span>
                    <span className="text-xs text-subtle">
                      {s.isMine ? "Shared by you" : `From ${s.sharedBy}`} · {s.saveCount} saved · {timeAgo(s.createdAt)}
                    </span>
                  </span>
                  {!s.isMine &&
                    (s.saved ? (
                      <span className="inline-flex items-center gap-1 text-sm text-success">
                        <Check className="size-4" aria-hidden="true" /> Saved
                      </span>
                    ) : (
                      <Button
                        variant="secondary"
                        className="px-3 py-1.5"
                        disabled={busy !== null}
                        onClick={() =>
                          run(s.shareId, async () => {
                            const { guideId } = await api.saveShare(roomId, s.shareId);
                            router.push(`/study/${guideId}`);
                          })
                        }
                      >
                        {busy === s.shareId ? <Spinner className="size-4" /> : "Save copy"}
                      </Button>
                    ))}
                </li>
              ))}
            </ul>
          )}
          {shareable.length > 0 && (
            <form
              className="mt-5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const id = new FormData(e.currentTarget).get("guide") as string;
                if (id) run("share", async () => setRoom(await api.shareToRoom(roomId, id)));
              }}
            >
              <select name="guide" aria-label="Choose a study space to share" className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-sm">
                {shareable.map((g) => (
                  <option key={g.guideId} value={g.guideId}>
                    {g.title}
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={busy !== null} className="px-4">
                {busy === "share" ? <Spinner className="size-4" /> : <Share2 className="size-4" aria-hidden="true" />} Share
              </Button>
            </form>
          )}
        </section>

        {/* Battles */}
        <section className="relative overflow-hidden rounded-3xl bg-ink p-6 text-canvas">
          <div aria-hidden="true" className="absolute -top-16 -right-10 size-56 rounded-full bg-brand/40 blur-3xl" />
          <h2 className="relative flex items-center gap-2 font-display text-xl font-bold">
            <Swords className="size-5 text-brand-soft" aria-hidden="true" /> Quiz battles
          </h2>
          <p className="relative mt-1 text-sm text-canvas/70">Everyone answers the same questions at the same time. Faster correct answers score more.</p>
          {myGuides.length > 0 ? (
            <form
              className="relative mt-5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const id = new FormData(e.currentTarget).get("guide") as string;
                if (id)
                  run("battle", async () => {
                    const b = await api.createBattle({ guideId: id, roomId });
                    router.push(`/battle/${b.code}`);
                  });
              }}
            >
              <select name="guide" aria-label="Battle on which study space" className="min-w-0 flex-1 rounded-full border border-canvas/20 bg-canvas/10 px-4 py-2.5 text-sm text-canvas">
                {myGuides.map((g) => (
                  <option key={g.guideId} value={g.guideId} className="text-ink">
                    {g.title}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={busy !== null} className="inline-flex items-center gap-2 rounded-full bg-canvas px-4 py-2.5 text-sm font-medium text-ink hover:bg-brand-soft disabled:opacity-60">
                {busy === "battle" ? <Spinner className="size-4" /> : <Swords className="size-4" aria-hidden="true" />} Start
              </button>
            </form>
          ) : (
            <p className="relative mt-5 text-sm text-canvas/70">Make or save a study space to start a battle.</p>
          )}
          {room.battles.length > 0 && (
            <ul className="relative mt-5 space-y-2">
              {room.battles.map((b) => (
                <li key={b.battleId}>
                  <Link href={`/battle/${b.code}`} className="flex items-center justify-between gap-3 rounded-xl bg-canvas/5 px-3 py-2.5 text-sm ring-1 ring-canvas/10 hover:bg-canvas/10">
                    <span className="truncate">{b.title}</span>
                    <span className="shrink-0 text-canvas/70">
                      {b.status === "finished" ? `Won by ${b.winner}` : b.status === "live" ? "Live now" : `Lobby · ${b.code}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Members */}
      <section>
        <h2 className="flex items-center gap-2 font-display text-xl font-bold">
          <Users className="size-5 text-brand" aria-hidden="true" /> Members <span className="text-base font-normal text-subtle">({room.members.length})</span>
        </h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {room.members.map((m) => (
            <li key={m.userId} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1.5 text-sm">
              {m.isOwner && <Crown className="size-3.5 text-brand" aria-label="Owner" />}
              {m.name}
              {m.isMe && <span className="text-subtle">(you)</span>}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            if (!window.confirm(room.isOwner ? "You own this room. Leaving closes it for everyone. Continue?" : "Leave this room?")) return;
            run("leave", async () => {
              await api.leaveRoom(roomId);
              router.push("/rooms");
            });
          }}
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-subtle hover:text-brand-deep"
        >
          <LogOut className="size-4" aria-hidden="true" /> {room.isOwner ? "Close room" : "Leave room"}
        </button>
      </section>
    </div>
  );
}
