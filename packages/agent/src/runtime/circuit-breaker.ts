/**
 * Circuit breaker — after N failures, open and cool down.
 * Protects the agent from thrashing a dead RPC / marketplace.
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  name?: string;
}

export class CircuitBreaker {
  readonly name: string;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private failures = 0;
  private openedAtMs = 0;
  private state: CircuitState = "CLOSED";

  constructor(opts: CircuitBreakerOptions = {}) {
    this.name = opts.name ?? "default";
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
  }

  getStatus(): { state: CircuitState; failures: number } {
    this.maybeHalfOpen();
    return { state: this.state, failures: this.failures };
  }

  canExecute(nowMs: number = Date.now()): boolean {
    this.maybeHalfOpen(nowMs);
    return this.state !== "OPEN";
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = "CLOSED";
  }

  recordFailure(nowMs: number = Date.now()): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.state = "OPEN";
      this.openedAtMs = nowMs;
    }
  }

  private maybeHalfOpen(nowMs: number = Date.now()): void {
    if (this.state === "OPEN" && nowMs - this.openedAtMs >= this.cooldownMs) {
      this.state = "HALF_OPEN";
    }
  }
}
