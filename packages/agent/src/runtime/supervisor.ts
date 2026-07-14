/**
 * Unattended supervisor — keeps the survival loop alive through bad days.
 * - respects solvency-based poll intervals
 * - circuit-breaks thrashing adapters
 * - never dies on a single tick error
 * - persists state after each successful tick
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { policyFor, type SolvencyState } from "@citizen-0/shared";
import type { SurvivalLoop, TickResult } from "./survival-loop.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { classifyError } from "./errors.js";

export interface SupervisorOptions {
  maxTicks?: number;
  /** Hard wall-clock stop (ms). 0 = no limit. */
  maxRuntimeMs?: number;
  dataDir?: string;
  onTick?: (result: TickResult) => void;
  onError?: (err: Error, tick: number) => void;
}

export interface SupervisorReport {
  ticksCompleted: number;
  ticksFailed: number;
  lastSolvency?: string;
  stoppedReason: string;
  circuit: { state: string; failures: number };
}

export class Supervisor {
  private readonly loop: SurvivalLoop;
  private readonly marketplaceBreaker: CircuitBreaker;
  private readonly opts: Required<
    Pick<SupervisorOptions, "maxTicks" | "maxRuntimeMs" | "dataDir">
  > &
    SupervisorOptions;

  constructor(loop: SurvivalLoop, opts: SupervisorOptions = {}) {
    this.loop = loop;
    this.opts = {
      maxTicks: opts.maxTicks ?? Number(process.env.MAX_TICKS ?? 50),
      maxRuntimeMs: opts.maxRuntimeMs ?? Number(process.env.MAX_RUNTIME_MS ?? 0),
      dataDir: opts.dataDir ?? process.env.DATA_DIR ?? "./data",
      onTick: opts.onTick,
      onError: opts.onError,
    };
    this.marketplaceBreaker = new CircuitBreaker({
      name: "marketplace",
      failureThreshold: 5,
      cooldownMs: 20_000,
    });
  }

  async run(): Promise<SupervisorReport> {
    const started = Date.now();
    let ticksCompleted = 0;
    let ticksFailed = 0;
    let lastSolvency: string | undefined;
    let stoppedReason = "max_ticks";

    this.loop.decisionLog.append({
      type: "SUPERVISOR",
      atMs: started,
      summary: `Supervisor start maxTicks=${this.opts.maxTicks}`,
      data: {
        maxTicks: this.opts.maxTicks,
        maxRuntimeMs: this.opts.maxRuntimeMs,
      },
    });

    await this.loop.boot();

    while (ticksCompleted + ticksFailed < this.opts.maxTicks) {
      if (
        this.opts.maxRuntimeMs > 0 &&
        Date.now() - started >= this.opts.maxRuntimeMs
      ) {
        stoppedReason = "max_runtime";
        break;
      }

      if (!this.marketplaceBreaker.canExecute()) {
        const status = this.marketplaceBreaker.getStatus();
        this.loop.decisionLog.append({
          type: "CIRCUIT",
          atMs: Date.now(),
          summary: `Circuit OPEN — cooling down (${status.failures} failures)`,
          data: status,
        });
        await sleep(5_000);
        continue;
      }

      try {
        const result = await this.loop.tick();
        ticksCompleted += 1;
        lastSolvency = result.solvency;
        this.marketplaceBreaker.recordSuccess();
        this.opts.onTick?.(result);
        this.persist(result);

        const interval = intervalFor(result.solvency as SolvencyState);
        if (ticksCompleted + ticksFailed < this.opts.maxTicks) {
          await sleep(interval);
        }
      } catch (err) {
        ticksFailed += 1;
        const ce = classifyError(err);
        this.marketplaceBreaker.recordFailure();
        this.loop.decisionLog.append({
          type: "ERROR",
          atMs: Date.now(),
          summary: `Tick failed: ${ce.code} ${ce.message}`,
          data: {
            code: ce.code,
            klass: ce.klass,
            retryable: ce.retryable,
            failures: this.marketplaceBreaker.getStatus().failures,
          },
        });
        this.opts.onError?.(ce, ticksCompleted + ticksFailed);

        if (ce.klass === "FATAL") {
          stoppedReason = `fatal:${ce.code}`;
          break;
        }

        // Back off harder on repeated failures
        await sleep(ce.retryable ? 3_000 : 1_500);
      }
    }

    this.loop.decisionLog.append({
      type: "SUPERVISOR",
      atMs: Date.now(),
      summary: `Supervisor stop: ${stoppedReason} ok=${ticksCompleted} fail=${ticksFailed}`,
      data: {
        ticksCompleted,
        ticksFailed,
        stoppedReason,
        circuit: this.marketplaceBreaker.getStatus(),
      },
    });

    // Final persist
    try {
      const state = await this.loop.snapshot();
      this.persist({
        tick: state.tickCount,
        solvency: state.runway.solvency,
        stage: state.obligation.stage,
        actions: ["supervisor_stop"],
        state,
      });
    } catch {
      /* ignore final snapshot errors */
    }

    return {
      ticksCompleted,
      ticksFailed,
      lastSolvency,
      stoppedReason,
      circuit: this.marketplaceBreaker.getStatus(),
    };
  }

  private persist(result: TickResult): void {
    const dir = this.opts.dataDir;
    mkdirSync(dir, { recursive: true });
    const log = this.loop.decisionLog;
    const envelope = {
      updatedAtMs: Date.now(),
      state: result.state,
      decisionLog: log.snapshot(),
      chainValid: log.verify(),
      supervisor: this.marketplaceBreaker.getStatus(),
    };
    writeFileSync(
      join(dir, "citizen-state.json"),
      JSON.stringify(
        envelope,
        (_, v) => (typeof v === "bigint" ? v.toString() : v),
        2,
      ),
      "utf8",
    );
  }
}

function intervalFor(solvency: SolvencyState): number {
  // Faster ticks in tests; env can override
  if (process.env.FAST_TICKS === "1") return 50;
  return policyFor(solvency).pollIntervalMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
