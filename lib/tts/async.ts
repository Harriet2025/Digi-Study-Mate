import { TtsError } from "./types";

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
}

/** Any error that says whether it is worth retrying (TtsError, or other HTTP-backed errors). */
interface RetryableError {
  retryable: boolean;
  retryAfterMs?: number;
}

function isRetryable(err: unknown): err is RetryableError {
  return (
    (err instanceof TtsError || (typeof err === "object" && err !== null && "retryable" in err)) &&
    (err as RetryableError).retryable === true
  );
}

/**
 * Retries retryable errors (429 / 5xx / network) with exponential backoff
 * and jitter, honouring the provider's Retry-After header when present.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxAttempts = 5, baseDelayMs = 1_000, maxDelayMs = 30_000, signal } = options;

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err) || attempt >= maxAttempts || signal?.aborted) throw err;

      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jittered = backoff / 2 + Math.random() * (backoff / 2);
      await sleep(Math.max(err.retryAfterMs ?? 0, jittered), signal);
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Runs `fn` over `items` with at most `limit` in flight, keeping result order.
 * On the first failure, stops starting new work and rejects with that error
 * once in-flight tasks have settled.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let firstError: { error: unknown } | null = null;

  const worker = async () => {
    while (!firstError && next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i]!, i);
      } catch (error) {
        firstError ??= { error };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  if (firstError) throw (firstError as { error: unknown }).error;
  return results;
}
