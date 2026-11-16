"use client";

import { useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "starting" | "recording";

const MAX_RECORDING_MS = 5 * 60_000;

function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));
}

/** Records microphone audio. `stop()` resolves with the recording (or null if nothing usable). */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const resolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  const release = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    if (state !== "recording") return;
    const timer = window.setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsed(Math.floor(ms / 1000));
      if (ms > MAX_RECORDING_MS) recorderRef.current?.stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => () => release(), []);

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording isn't supported in this browser. You can type your answer instead.");
      return;
    }
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        release();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        const tooShort = Date.now() - startedAtRef.current < 1000 || blob.size < 2000;
        setState("idle");
        if (tooShort) setError("That recording was too short. Try again and speak your full answer.");
        resolveRef.current?.(tooShort ? null : blob);
        resolveRef.current = null;
      };
      recorder.start();
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setState("recording");
    } catch (err) {
      release();
      setState("idle");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access is blocked. Allow it in your browser's site settings, or type your answer."
          : "Couldn't start the microphone.",
      );
    }
  };

  const stop = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state !== "recording") return resolve(null);
      resolveRef.current = resolve;
      recorder.stop();
    });

  return { state, error, elapsed, start, stop };
}
