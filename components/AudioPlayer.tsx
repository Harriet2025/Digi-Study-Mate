"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AudioManifest, AudioSegment } from "@/lib/tts/types";

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

const SKIP_SECONDS = 10;
/** Holding the ask button at least this long means push-to-talk; a shorter press toggles recording. */
const HOLD_THRESHOLD_MS = 350;
const MIN_RECORDING_MS = 600;
const MAX_RECORDING_MS = 60_000;
/** Lines of transcript sent as context with a question. */
const CONTEXT_LINES = 14;
/** After the student scrolls the transcript, leave it alone for this long. */
const USER_SCROLL_GRACE_MS = 5_000;

type AskState = "idle" | "starting" | "recording" | "thinking" | "answering";

interface TranscriptLine {
  lineIndex: number;
  speaker: AudioSegment["speaker"];
  type: AudioSegment["type"];
  text: string;
  startSec: number;
}

interface Interjection {
  id: string;
  /** Shown in the transcript after this line. */
  afterLineIndex: number;
  status: "pending" | "done" | "error";
  question?: string;
  answer?: string;
  audioSrc?: string;
  error?: string;
}

interface GapState {
  remainingMs: number;
  startedAt: number;
  timer: number | null;
}

export interface AudioPlayerProps {
  manifest: AudioManifest;
  title?: string;
  /** Endpoint for "Interrupt & Ask". */
  askEndpoint?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AudioPlayer({ manifest, title, askEndpoint = "/api/ask" }: AudioPlayerProps) {
  const segments = manifest.segments;
  const totalSec = manifest.totalDurationSec;
  const lines = useMemo(() => groupIntoLines(segments), [segments]);

  // Elements
  const audioRef = useRef<HTMLAudioElement>(null);
  const answerAudioRef = useRef<HTMLAudioElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef(new Map<number, HTMLLIElement>());
  const preloadRef = useRef<HTMLAudioElement | null>(null);

  // Mutable playback state read inside event handlers (avoids stale closures)
  const segIndexRef = useRef(0);
  const playingRef = useRef(false);
  const timeRef = useRef(0);
  const gapRef = useRef<GapState | null>(null);
  const lastUserScrollRef = useRef(0);

  // Rendered playback state
  const [segIndex, setSegIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);

  // Interrupt & Ask
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartedAtRef = useRef(0);
  const pressStartedAtRef = useRef(0);
  const maxRecordTimerRef = useRef<number | null>(null);
  const resumeAfterAskRef = useRef(false);
  const askAbortRef = useRef<AbortController | null>(null);
  const [askState, setAskState] = useState<AskState>("idle");
  const [askHint, setAskHint] = useState<string | null>(null);
  const [interjections, setInterjections] = useState<Interjection[]>([]);

  const activeLineIndex = segments[segIndex]?.lineIndex ?? 0;
  const activeLineRef = useRef(activeLineIndex);
  activeLineRef.current = activeLineIndex;

  // -------------------------------------------------------------------------
  // Playback engine: one <audio> element walks through the segment files,
  // with timed silences (turn gaps, quiz thinking time) between them.
  // -------------------------------------------------------------------------

  const setPlaying = (value: boolean) => {
    playingRef.current = value;
    setIsPlaying(value);
  };

  const setTime = (t: number) => {
    timeRef.current = t;
    setCurrentTime(t);
  };

  const clearGap = () => {
    if (gapRef.current?.timer != null) window.clearTimeout(gapRef.current.timer);
    gapRef.current = null;
  };

  const pauseGap = () => {
    const gap = gapRef.current;
    if (!gap || gap.timer === null) return;
    window.clearTimeout(gap.timer);
    gap.remainingMs = Math.max(0, gap.remainingMs - (performance.now() - gap.startedAt));
    gap.timer = null;
  };

  const resumeGap = () => {
    const gap = gapRef.current;
    if (!gap || gap.timer !== null) return;
    gap.startedAt = performance.now();
    gap.timer = window.setTimeout(advanceToNextSegment, gap.remainingMs);
  };

  const startGap = (ms: number) => {
    clearGap();
    gapRef.current = { remainingMs: ms, startedAt: performance.now(), timer: null };
    resumeGap();
  };

  /** Global timeline position, derived from the current segment and audio element. */
  const computeTime = (): number => {
    const seg = segments[segIndexRef.current];
    if (!seg) return 0;
    const gap = gapRef.current;
    if (gap) {
      const running = gap.timer !== null ? performance.now() - gap.startedAt : 0;
      const spentMs = seg.pauseAfterSec * 1000 - gap.remainingMs + running;
      return Math.min(seg.endSec + spentMs / 1000, seg.endSec + seg.pauseAfterSec);
    }
    return seg.startSec + (audioRef.current?.currentTime ?? 0);
  };

  const playElement = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return; // superseded by a newer load
      setPlaying(false);
      setPlayerError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Your browser blocked playback. Press play to start."
          : "This audio couldn't be played.",
      );
    });
  };

  /** Points the audio element at segment `i`, seeks to `offsetSec` within it, and optionally plays. */
  const loadSegment = (i: number, offsetSec: number, autoplay: boolean) => {
    const audio = audioRef.current;
    const seg = segments[i];
    if (!audio || !seg) return;

    clearGap();
    segIndexRef.current = i;
    setSegIndex(i);

    const begin = () => {
      if (segIndexRef.current !== i) return; // a newer load won
      audio.currentTime = Math.max(0, Math.min(offsetSec, Math.max(0, seg.durationSec - 0.05)));
      if (autoplay) playElement();
    };

    if (audio.dataset.src === seg.url) {
      begin();
    } else {
      audio.dataset.src = seg.url;
      audio.src = seg.url;
      audio.addEventListener("loadedmetadata", begin, { once: true });
      audio.load();
    }
  };

  function advanceToNextSegment() {
    clearGap();
    const next = segIndexRef.current + 1;
    if (next < segments.length) {
      loadSegment(next, 0, true);
    } else {
      setPlaying(false);
      setTime(totalSec);
    }
  }

  const handleSegmentEnded = () => {
    if (!playingRef.current) return;
    const seg = segments[segIndexRef.current];
    if (seg && seg.pauseAfterSec > 0 && segIndexRef.current < segments.length - 1) {
      startGap(seg.pauseAfterSec * 1000);
    } else {
      advanceToNextSegment();
    }
  };

  const seekTo = (target: number, autoplay = playingRef.current) => {
    const t = clamp(target, 0, totalSec);
    setTime(t);
    setPlayerError(null);
    if (segments.length === 0) return;

    if (t >= totalSec - 0.01) {
      clearGap();
      audioRef.current?.pause();
      segIndexRef.current = segments.length - 1;
      setSegIndex(segments.length - 1);
      setPlaying(false);
      return;
    }

    const i = findSegmentIndex(segments, t);
    const seg = segments[i]!;
    if (t >= seg.endSec) {
      // Inside the silence after this segment.
      audioRef.current?.pause();
      clearGap();
      segIndexRef.current = i;
      setSegIndex(i);
      gapRef.current = { remainingMs: (seg.endSec + seg.pauseAfterSec - t) * 1000, startedAt: performance.now(), timer: null };
      if (autoplay) resumeGap();
    } else {
      loadSegment(i, t - seg.startSec, autoplay);
    }
  };

  const play = () => {
    if (segments.length === 0) return;
    setPlayerError(null);
    setPlaying(true);

    if (timeRef.current >= totalSec - 0.05) {
      seekTo(0, true);
      return;
    }
    if (gapRef.current) {
      resumeGap();
      return;
    }
    const seg = segments[segIndexRef.current]!;
    if (audioRef.current?.dataset.src !== seg.url) {
      loadSegment(segIndexRef.current, timeRef.current - seg.startSec, true);
    } else {
      playElement();
    }
  };

  const pause = () => {
    setPlaying(false);
    audioRef.current?.pause();
    pauseGap();
    setTime(computeTime());
  };

  const togglePlay = () => (playingRef.current ? pause() : play());
  const skip = (delta: number) => seekTo(timeRef.current + delta);

  // Drive the clock while playing (throttled to ~10 renders/sec).
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let lastRendered = -1;
    const tick = () => {
      const t = computeTime();
      timeRef.current = t;
      if (Math.abs(t - lastRendered) >= 0.1) {
        lastRendered = t;
        setCurrentTime(t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // computeTime only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // Warm the browser cache with the next segment so transitions are seamless.
  useEffect(() => {
    const next = segments[segIndex + 1];
    if (!next) return;
    const preload = new Audio();
    preload.preload = "auto";
    preload.src = next.url;
    preloadRef.current = preload;
  }, [segIndex, segments]);

  // Keyboard shortcuts: Space = play/pause, ←/→ = skip 10s (when not typing or on a control).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, button, [contenteditable='true']")) return;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") {
        skip(SKIP_SECONDS);
      } else if (e.key === "ArrowLeft") {
        skip(-SKIP_SECONDS);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clean up timers, mic, and in-flight requests on unmount.
  useEffect(() => {
    return () => {
      clearGap();
      if (maxRecordTimerRef.current) window.clearTimeout(maxRecordTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      askAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Transcript auto-scroll
  // -------------------------------------------------------------------------

  useEffect(() => {
    const container = transcriptRef.current;
    const el = lineRefs.current.get(activeLineIndex);
    if (!container || !el) return;
    if (Date.now() - lastUserScrollRef.current < USER_SCROLL_GRACE_MS) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    container.scrollTo({
      top: el.offsetTop - container.clientHeight * 0.3,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [activeLineIndex, interjections.length]);

  const markUserScroll = () => {
    lastUserScrollRef.current = Date.now();
  };

  // -------------------------------------------------------------------------
  // Interrupt & Ask
  // -------------------------------------------------------------------------

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (maxRecordTimerRef.current) window.clearTimeout(maxRecordTimerRef.current);
    maxRecordTimerRef.current = null;
  };

  const resumeLectureIfNeeded = () => {
    if (resumeAfterAskRef.current) {
      resumeAfterAskRef.current = false;
      play();
    }
  };

  const startRecording = async () => {
    setAskHint(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setAskHint("Voice questions aren't supported in this browser.");
      return;
    }

    resumeAfterAskRef.current = playingRef.current;
    if (playingRef.current) pause();
    setAskState("starting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const mimeType = pickRecordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => void handleRecordingStopped(recorder.mimeType || mimeType || "audio/webm");
      recorder.start();

      recorderRef.current = recorder;
      recordStartedAtRef.current = Date.now();
      maxRecordTimerRef.current = window.setTimeout(stopRecording, MAX_RECORDING_MS);
      setAskState("recording");
    } catch (err) {
      releaseMic();
      setAskState("idle");
      setAskHint(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access is blocked. Allow it in your browser's site settings to ask questions."
          : "Couldn't start the microphone.",
      );
      resumeLectureIfNeeded();
    }
  };

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") recorder.stop();
  }

  const handleRecordingStopped = async (mimeType: string) => {
    const durationMs = Date.now() - recordStartedAtRef.current;
    const blob = new Blob(chunksRef.current, { type: mimeType });
    recorderRef.current = null;
    chunksRef.current = [];
    releaseMic();

    if (durationMs < MIN_RECORDING_MS || blob.size < 1_000) {
      setAskState("idle");
      setAskHint("That was a bit short. Hold the button while you speak, or tap once to start and again to send.");
      resumeLectureIfNeeded();
      return;
    }
    await submitQuestion(blob);
  };

  const submitQuestion = async (recording: Blob) => {
    setAskState("thinking");
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const afterLineIndex = activeLineRef.current;
    setInterjections((prev) => [...prev, { id, afterLineIndex, status: "pending" }]);

    const form = new FormData();
    form.append("audio", recording, `question.${recordingExtension(recording.type)}`);
    form.append(
      "context",
      JSON.stringify({
        lectureTitle: title,
        transcript: buildContext(lines, afterLineIndex),
        currentTimeSec: Math.round(timeRef.current),
      }),
    );

    const controller = new AbortController();
    askAbortRef.current = controller;

    try {
      const res = await fetch(askEndpoint, { method: "POST", body: form, signal: controller.signal });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok || !isAskResponse(data)) {
        throw new Error(errorMessageFrom(data) ?? "Something went wrong answering your question.");
      }

      const audioSrc = `data:${data.audio.mimeType};base64,${data.audio.base64}`;
      updateInterjection(id, { status: "done", question: data.question, answer: data.answer, audioSrc });
      playAnswer(audioSrc);
    } catch (err) {
      if (controller.signal.aborted) {
        setInterjections((prev) => prev.filter((x) => x.id !== id));
      } else {
        updateInterjection(id, {
          status: "error",
          error: err instanceof Error ? err.message : "Something went wrong answering your question.",
        });
      }
      setAskState("idle");
      resumeLectureIfNeeded();
    } finally {
      askAbortRef.current = null;
    }
  };

  const updateInterjection = (id: string, patch: Partial<Interjection>) =>
    setInterjections((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const playAnswer = (src: string) => {
    const answerAudio = answerAudioRef.current;
    if (!answerAudio) return;
    if (playingRef.current) pause();
    answerAudio.src = src;
    setAskState("answering");
    answerAudio.play().catch(() => {
      // Autoplay can be blocked after a network wait (notably Safari); the replay button still works.
      setAskState("idle");
      setAskHint("Tap “Play answer” to hear Alex's reply.");
    });
  };

  const finishAnswer = () => {
    setAskState("idle");
    resumeLectureIfNeeded();
  };

  const skipAnswer = () => {
    answerAudioRef.current?.pause();
    finishAnswer();
  };

  const cancelQuestion = () => {
    askAbortRef.current?.abort();
  };

  // Press-and-hold = push-to-talk. A quick tap starts recording; a second tap sends.
  const onAskPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pressStartedAtRef.current = Date.now();
    if (askState === "recording") stopRecording();
    else if (askState === "idle") void startRecording();
  };

  const onAskPointerUp = () => {
    const held = Date.now() - pressStartedAtRef.current;
    if (recorderRef.current?.state === "recording" && held >= HOLD_THRESHOLD_MS) stopRecording();
  };

  // Keyboard activation (Enter/Space) arrives as a click with detail === 0.
  const onAskClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.detail !== 0) return;
    if (askState === "recording") stopRecording();
    else if (askState === "idle") void startRecording();
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const displayTime = scrubTime ?? currentTime;
  const progressPct = totalSec > 0 ? (displayTime / totalSec) * 100 : 0;
  const askBusy = askState === "thinking" || askState === "answering" || askState === "starting";

  if (segments.length === 0) {
    return (
      <div className="rounded-3xl border border-sand bg-cream p-8 text-center text-stone">
        This episode has no audio yet.
      </div>
    );
  }

  return (
    <section
      aria-label={title ? `Audio lesson: ${title}` : "Audio lesson"}
      className="mx-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-sand bg-cream shadow-[0_1px_0_rgba(41,37,36,0.04),0_12px_40px_-16px_rgba(41,37,36,0.25)]"
    >
      {/* Hidden media elements */}
      <audio
        ref={audioRef}
        preload="auto"
        onEnded={handleSegmentEnded}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onCanPlay={() => setIsBuffering(false)}
        onError={() => {
          if (!audioRef.current?.dataset.src) return;
          setPlaying(false);
          setIsBuffering(false);
          setPlayerError("This part of the episode couldn't be loaded. Check your connection and press play.");
        }}
      />
      <audio ref={answerAudioRef} onEnded={finishAnswer} />

      {/* Header */}
      <header className="border-b border-sand px-5 pt-6 pb-5 sm:px-8">
        <p className="text-xs font-semibold tracking-[0.18em] text-terracotta-deep uppercase">Study session</p>
        <h2 className="mt-1 font-serif text-2xl leading-tight font-semibold text-balance sm:text-3xl">
          {title ?? "Your lecture, as a conversation"}
        </h2>
        <p className="mt-1 text-sm text-stone">
          With Alex &amp; Sam · {formatTime(totalSec)}
        </p>
      </header>

      {/* Transcript */}
      <div
        ref={transcriptRef}
        onWheel={markUserScroll}
        onTouchMove={markUserScroll}
        className="relative h-[46vh] min-h-72 overflow-y-auto overscroll-contain px-3 py-4 sm:h-[52vh] sm:px-6"
        aria-label="Transcript"
      >
        <ol className="flex flex-col gap-1">
          {lines.map((line) => {
            const isActive = line.lineIndex === activeLineIndex;
            const isPast = line.lineIndex < activeLineIndex;
            const isQuiz = line.type === "quiz_checkpoint";
            const lineInterjections = interjections.filter((x) => x.afterLineIndex === line.lineIndex);

            return (
              <li
                key={line.lineIndex}
                ref={(el) => {
                  if (el) lineRefs.current.set(line.lineIndex, el);
                  else lineRefs.current.delete(line.lineIndex);
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(true);
                    seekTo(line.startSec, true);
                  }}
                  aria-current={isActive ? "true" : undefined}
                  className={[
                    "group flex w-full gap-3 rounded-2xl px-3 py-3 text-left transition-colors duration-300",
                    "focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none",
                    isActive ? "bg-cream-deep" : "hover:bg-cream-deep/60",
                    isQuiz ? "border-l-4 border-terracotta" : "",
                  ].join(" ")}
                >
                  <SpeakerBadge speaker={line.speaker} active={isActive} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{line.speaker}</span>
                      {isQuiz && (
                        <span className="rounded-full bg-terracotta px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white uppercase">
                          Checkpoint
                        </span>
                      )}
                      <span className="ml-auto text-xs text-stone tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
                        {formatTime(line.startSec)}
                      </span>
                    </span>
                    <span
                      className={[
                        "mt-0.5 block font-serif text-[17px] leading-relaxed transition-colors duration-300",
                        isActive ? "text-charcoal" : isPast ? "text-stone" : "text-charcoal/80",
                      ].join(" ")}
                    >
                      {line.text}
                    </span>
                  </span>
                </button>

                {lineInterjections.map((x) => (
                  <InterjectionCard
                    key={x.id}
                    interjection={x}
                    onReplay={() => x.audioSrc && playAnswer(x.audioSrc)}
                    disabled={askState !== "idle"}
                  />
                ))}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Controls */}
      <div className="border-t border-sand bg-cream-deep/50 px-5 pt-4 pb-5 sm:px-8">
        {/* Progress */}
        <div className="flex items-center gap-3">
          <span className="w-12 text-right text-xs text-stone tabular-nums">{formatTime(displayTime)}</span>
          <input
            type="range"
            min={0}
            max={totalSec}
            step={0.1}
            value={displayTime}
            aria-label="Seek"
            aria-valuetext={`${formatTime(displayTime)} of ${formatTime(totalSec)}`}
            onChange={(e) => setScrubTime(Number(e.target.value))}
            onPointerUp={() => commitScrub()}
            onKeyUp={() => commitScrub()}
            onBlur={() => commitScrub()}
            style={{
              background: `linear-gradient(to right, var(--color-terracotta) ${progressPct}%, var(--color-sand) ${progressPct}%)`,
            }}
            className={[
              "h-1.5 flex-1 cursor-pointer appearance-none rounded-full",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cream",
              "[&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-terracotta [&::-webkit-slider-thumb]:shadow",
              "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-terracotta",
            ].join(" ")}
          />
          <span className="w-12 text-xs text-stone tabular-nums">{formatTime(totalSec)}</span>
        </div>

        {/* Buttons */}
        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <IconButton label={`Back ${SKIP_SECONDS} seconds`} onClick={() => skip(-SKIP_SECONDS)}>
              <SkipIcon direction="back" />
            </IconButton>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="grid size-14 place-items-center rounded-full bg-charcoal text-cream shadow-md transition hover:bg-charcoal/90 focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:outline-none active:scale-95"
            >
              {isPlaying && isBuffering ? <Spinner /> : isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <IconButton label={`Forward ${SKIP_SECONDS} seconds`} onClick={() => skip(SKIP_SECONDS)}>
              <SkipIcon direction="forward" />
            </IconButton>
          </div>

          {/* Interrupt & Ask */}
          <div className="flex items-center gap-3">
            <p className="hidden text-right text-sm leading-snug text-stone sm:block" aria-hidden="true">
              {askLabel(askState)}
            </p>
            {askState === "thinking" && (
              <button type="button" onClick={cancelQuestion} className="text-sm font-medium text-terracotta-deep underline-offset-4 hover:underline">
                Cancel
              </button>
            )}
            {askState === "answering" && (
              <button type="button" onClick={skipAnswer} className="text-sm font-medium text-terracotta-deep underline-offset-4 hover:underline">
                Skip answer
              </button>
            )}
            <button
              type="button"
              onPointerDown={onAskPointerDown}
              onPointerUp={onAskPointerUp}
              onPointerCancel={onAskPointerUp}
              onClick={onAskClick}
              onContextMenu={(e) => e.preventDefault()}
              disabled={askBusy}
              aria-pressed={askState === "recording"}
              aria-label={askState === "recording" ? "Stop recording and send question" : "Interrupt and ask a question"}
              className={[
                "relative grid size-14 shrink-0 touch-none place-items-center rounded-full text-white shadow-md transition select-none",
                "focus-visible:ring-2 focus-visible:ring-charcoal focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-60",
                askState === "recording" ? "scale-110 bg-terracotta-deep" : "bg-terracotta hover:bg-terracotta-deep active:scale-95",
              ].join(" ")}
            >
              {askState === "recording" && (
                <span className="absolute inset-0 animate-ping rounded-full bg-terracotta/40 motion-reduce:animate-none" aria-hidden="true" />
              )}
              {askState === "thinking" || askState === "starting" ? <Spinner /> : <MicIcon />}
            </button>
          </div>
        </div>

        {/* Status line for screen readers and small screens */}
        <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-stone sm:text-right">
          <span className="sm:hidden">{askHint ?? playerError ?? askLabel(askState)}</span>
          <span className="hidden sm:inline">{askHint ?? playerError ?? ""}</span>
        </p>
      </div>
    </section>
  );

  function commitScrub() {
    if (scrubTime === null) return;
    const t = scrubTime;
    setScrubTime(null);
    seekTo(t);
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SpeakerBadge({ speaker, active }: { speaker: "Alex" | "Sam"; active: boolean }) {
  const isAlex = speaker === "Alex";
  return (
    <span
      aria-hidden="true"
      className={[
        "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full font-serif text-sm font-semibold transition-transform duration-300",
        isAlex ? "bg-terracotta text-white" : "border-2 border-charcoal bg-cream text-charcoal",
        active ? "scale-110" : "",
      ].join(" ")}
    >
      {speaker[0]}
    </span>
  );
}

function InterjectionCard({
  interjection,
  onReplay,
  disabled,
}: {
  interjection: Interjection;
  onReplay: () => void;
  disabled: boolean;
}) {
  const { status, question, answer, error } = interjection;
  return (
    <div className="my-2 ml-12 rounded-2xl border border-sand bg-white/70 p-4 sm:ml-14">
      <p className="text-xs font-semibold tracking-wide text-terracotta-deep uppercase">You asked</p>
      {status === "pending" && <p className="mt-1 text-sm text-stone italic">Listening to your question…</p>}
      {status === "error" && <p className="mt-1 text-sm text-terracotta-deep">{error}</p>}
      {status === "done" && (
        <>
          <p className="mt-1 text-[15px] font-medium">“{question}”</p>
          <p className="mt-3 text-xs font-semibold tracking-wide text-stone uppercase">Alex</p>
          <p className="mt-1 font-serif text-[17px] leading-relaxed">{answer}</p>
          <button
            type="button"
            onClick={onReplay}
            disabled={disabled}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-sand px-3 py-1 text-sm font-medium transition hover:border-terracotta hover:text-terracotta-deep disabled:opacity-50"
          >
            <PlayIcon className="size-3.5" /> Play answer
          </button>
        </>
      )}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-11 place-items-center rounded-full text-charcoal transition hover:bg-sand/70 focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none active:scale-95"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function PlayIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`${className} translate-x-[1px]`} aria-hidden="true">
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-6" aria-hidden="true">
      <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
      <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
    </svg>
  );
}

function SkipIcon({ direction }: { direction: "back" | "forward" }) {
  const flip = direction === "forward" ? "scale(-1,1) translate(-24,0)" : undefined;
  return (
    <svg viewBox="0 0 24 24" className="size-7" aria-hidden="true">
      <g transform={flip} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12a8 8 0 1 0 2.4-5.7" />
        <path d="M4 3.5v4h4" />
      </g>
      <text x="12" y="15.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" fontFamily="ui-sans-serif, system-ui">
        10
      </text>
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="relative size-6" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 animate-spin motion-reduce:animate-none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Merges the audio segments of each script line back into one transcript line. */
function groupIntoLines(segments: AudioSegment[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const seg of segments) {
    const last = lines.at(-1);
    if (last && last.lineIndex === seg.lineIndex) {
      last.text += ` ${seg.text}`;
    } else {
      lines.push({ lineIndex: seg.lineIndex, speaker: seg.speaker, type: seg.type, text: seg.text, startSec: seg.startSec });
    }
  }
  return lines;
}

/** Index of the last segment starting at or before `t` (binary search). */
function findSegmentIndex(segments: AudioSegment[], t: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (segments[mid]!.startSec <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The last few lines the student has heard, as "Speaker: text". */
function buildContext(lines: TranscriptLine[], upToLineIndex: number): string {
  return lines
    .filter((l) => l.lineIndex <= upToLineIndex)
    .slice(-CONTEXT_LINES)
    .map((l) => `${l.speaker}: ${l.text}`)
    .join("\n");
}

function pickRecordingMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function recordingExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

function askLabel(state: AskState): string {
  switch (state) {
    case "starting":
      return "Opening microphone…";
    case "recording":
      return "Listening… release or tap to send";
    case "thinking":
      return "Alex is thinking…";
    case "answering":
      return "Alex is answering";
    default:
      return "Hold to ask a question";
  }
}

interface AskResponseBody {
  question: string;
  answer: string;
  audio: { mimeType: string; base64: string };
}

function isAskResponse(data: unknown): data is AskResponseBody {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  const audio = d.audio as Record<string, unknown> | undefined;
  return (
    typeof d.question === "string" &&
    typeof d.answer === "string" &&
    typeof audio?.mimeType === "string" &&
    typeof audio?.base64 === "string"
  );
}

function errorMessageFrom(data: unknown): string | undefined {
  const message = (data as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === "string" ? message : undefined;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
