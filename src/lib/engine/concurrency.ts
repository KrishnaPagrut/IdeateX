import pLimit, { type LimitFunction } from "p-limit";

// ---------------------------------------------------------------------------
// Fan-out plumbing: a p-limit(20) factory for the persona swarm plus the
// single retry policy for every LLM call — 2 retries with exponential backoff
// and jitter on 429/5xx/network errors, never on abort.
// ---------------------------------------------------------------------------

export const PERSONA_CONCURRENCY = 20;
export const MAX_RETRIES = 2;
const BASE_DELAY_MS = 500;

export function createPersonaLimiter(concurrency: number = PERSONA_CONCURRENCY): LimitFunction {
  return pLimit(concurrency);
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException || error instanceof Error) && error.name === "AbortError"
  );
}

function statusCodeOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const e = error as { statusCode?: unknown; status?: unknown };
  if (typeof e.statusCode === "number") return e.statusCode;
  if (typeof e.status === "number") return e.status;
  return undefined;
}

const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

export function isRetryableError(error: unknown): boolean {
  if (isAbortError(error)) return false;
  const status = statusCodeOf(error);
  if (status !== undefined) return status === 429 || status >= 500;
  if (typeof error === "object" && error !== null) {
    const e = error as {
      isRetryable?: unknown;
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (e.isRetryable === true) return true;
    if (typeof e.code === "string" && NETWORK_ERROR_CODES.has(e.code)) return true;
    if (typeof e.message === "string" && /fetch failed|network|socket hang up/i.test(e.message)) {
      return true;
    }
    if (e.cause !== undefined && e.cause !== error) return isRetryableError(e.cause);
  }
  return false;
}

function backoffDelayMs(attempt: number): number {
  const base = BASE_DELAY_MS * 2 ** attempt;
  return base + Math.random() * base * 0.5; // full-jitter-ish: 1x–1.5x
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Run `fn`, retrying up to `retries` times on transient errors (429/5xx/
 * network). Aborts are never retried and cut short any pending backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; signal?: AbortSignal },
): Promise<T> {
  const retries = opts?.retries ?? MAX_RETRIES;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || opts?.signal?.aborted || !isRetryableError(error)) {
        throw error;
      }
      await sleep(backoffDelayMs(attempt), opts?.signal);
      attempt += 1;
    }
  }
}
