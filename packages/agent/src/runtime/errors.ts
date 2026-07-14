/**
 * Failure taxonomy for unattended survival.
 * Transient → retry. Permanent → skip / log. Fatal → supervisor pause.
 */

export type ErrorClass =
  | "TRANSIENT" // RPC blip, rate limit, temporary network
  | "PERMANENT" // bad job, policy deny, invalid spec
  | "FATAL"; // wallet missing, unrecoverable config

export class CitizenError extends Error {
  readonly code: string;
  readonly klass: ErrorClass;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(
    code: string,
    message: string,
    klass: ErrorClass = "TRANSIENT",
    cause?: unknown,
  ) {
    super(message);
    this.name = "CitizenError";
    this.code = code;
    this.klass = klass;
    this.retryable = klass === "TRANSIENT";
    this.cause = cause;
  }
}

export function classifyError(err: unknown): CitizenError {
  if (err instanceof CitizenError) return err;

  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (
    lower.includes("not configured") ||
    lower.includes("wallet") ||
    lower.includes("unset")
  ) {
    return new CitizenError("CONFIG", msg, "FATAL", err);
  }

  if (
    lower.includes("not claimable") ||
    lower.includes("not open") ||
    lower.includes("unknown job") ||
    lower.includes("denied") ||
    lower.includes("missing required") ||
    lower.includes("qa failed")
  ) {
    return new CitizenError("JOB_REJECT", msg, "PERMANENT", err);
  }

  if (
    lower.includes("timeout") ||
    lower.includes("econnreset") ||
    lower.includes("429") ||
    lower.includes("503") ||
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("rpc")
  ) {
    return new CitizenError("NETWORK", msg, "TRANSIENT", err);
  }

  // Default: treat as transient so unattended agent keeps trying
  return new CitizenError("UNKNOWN", msg, "TRANSIENT", err);
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, err: CitizenError, delayMs: number) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 250;
  const maxDelayMs = opts.maxDelayMs ?? 4000;

  let last: CitizenError | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = classifyError(err);
      if (!last.retryable || attempt === maxAttempts) {
        throw last;
      }
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      opts.onRetry?.(attempt, last, delay);
      await sleep(delay);
    }
  }
  throw last ?? new CitizenError("RETRY_EXHAUSTED", "retry exhausted", "TRANSIENT");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
