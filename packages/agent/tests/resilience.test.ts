import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DecisionLog } from "@citizen-0/shared";
import { CircuitBreaker } from "../src/runtime/circuit-breaker.js";
import {
  CitizenError,
  classifyError,
  withRetry,
} from "../src/runtime/errors.js";
import { MockAgencAdapter } from "../src/adapters/mock-agenc.js";
import { MockPlotAdapter } from "../src/adapters/mock-plot.js";
import { LocalPolicySigner } from "../src/runtime/policy-signer.js";
import { SurvivalLoop } from "../src/runtime/survival-loop.js";
import { Supervisor } from "../src/runtime/supervisor.js";

describe("resilience", () => {
  it("classifies errors", () => {
    assert.equal(classifyError(new Error("fetch failed")).klass, "TRANSIENT");
    assert.equal(classifyError(new Error("not claimable")).klass, "PERMANENT");
    assert.equal(
      classifyError(new Error("wallet not configured")).klass,
      "FATAL",
    );
  });

  it("retries transient then succeeds", async () => {
    let n = 0;
    const value = await withRetry(async () => {
      n += 1;
      if (n < 3) throw new Error("timeout rpc");
      return 42;
    }, { maxAttempts: 4, baseDelayMs: 1 });
    assert.equal(value, 42);
    assert.equal(n, 3);
  });

  it("does not retry permanent errors", async () => {
    let n = 0;
    await assert.rejects(
      () =>
        withRetry(async () => {
          n += 1;
          throw new CitizenError("X", "not claimable", "PERMANENT");
        }, { maxAttempts: 5, baseDelayMs: 1 }),
    );
    assert.equal(n, 1);
  });

  it("circuit opens after threshold", () => {
    const c = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 60_000 });
    c.recordFailure();
    c.recordFailure();
    assert.equal(c.canExecute(), true);
    c.recordFailure();
    assert.equal(c.getStatus().state, "OPEN");
    assert.equal(c.canExecute(), false);
  });

  it("supervisor completes multiple ticks without dying", async () => {
    process.env.FAST_TICKS = "1";
    const agenc = new MockAgencAdapter({
      startingBalanceLamports: 40_000_000n,
      seedJobs: true,
    });
    // Keep posting jobs so later ticks have work
    agenc.postJob({
      title: "Summarize delinquency ladder",
      rewardLamports: 6_000_000n,
    });
    agenc.postJob({
      title: "Extract tokenomics parameters for GNN",
      rewardLamports: 7_000_000n,
    });

    const plot = new MockPlotAdapter({
      startingBalanceLamports: 40_000_000n,
      dueInDays: 5,
    });
    const log = new DecisionLog();
    const loop = new SurvivalLoop({
      mode: "mock",
      agenc,
      plot,
      signer: new LocalPolicySigner(),
      log,
    });

    const supervisor = new Supervisor(loop, {
      maxTicks: 4,
      dataDir: "./data-test-supervisor",
    });
    const report = await supervisor.run();
    assert.ok(report.ticksCompleted >= 3);
    assert.equal(log.verify().ok, true);
  });
});
