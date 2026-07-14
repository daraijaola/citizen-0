import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DecisionLog } from "@citizen-0/shared";
import { MockAgencAdapter } from "../src/adapters/mock-agenc.js";
import { MockPlotAdapter } from "../src/adapters/mock-plot.js";
import { LocalPolicySigner } from "../src/runtime/policy-signer.js";
import { SurvivalLoop } from "../src/runtime/survival-loop.js";

describe("survival loop", () => {
  it("boots, works a job, and keeps a valid audit chain", async () => {
    // Start slightly broke relative to tax so agent is motivated
    const starting = 15_000_000n; // 0.015 SOL after stake will be tight
    const agenc = new MockAgencAdapter({
      startingBalanceLamports: starting,
      seedJobs: true,
    });
    const plot = new MockPlotAdapter({
      startingBalanceLamports: starting,
      dueInDays: 2,
      plotCount: 10,
    });
    const log = new DecisionLog();
    const signer = new LocalPolicySigner();
    const loop = new SurvivalLoop({
      mode: "mock",
      agenc,
      plot,
      signer,
      log,
      // tests stay quiet — no diary file noise required
    });

    await loop.boot();
    const r1 = await loop.tick();
    assert.ok(r1.tick === 1);
    assert.equal(log.verify().ok, true);

    // At least perception + solvency entries
    assert.ok(log.length >= 3);

    // Run more ticks — should settle at least one job eventually
    let settled = false;
    for (let i = 0; i < 5; i++) {
      const r = await loop.tick();
      if (r.actions.some((a) => a.startsWith("job_settled"))) {
        settled = true;
        break;
      }
    }
    assert.equal(settled, true, "expected a job to settle in mock market");
    assert.equal(log.verify().ok, true);

    const state = await loop.snapshot();
    assert.ok(state.attempts.some((a) => a.status === "settled"));
  });

  it("denies intents outside charter (HIRE_WORKER path blocked via evaluate)", async () => {
    const signer = new LocalPolicySigner();
    const now = Date.now();
    const decision = signer.evaluate(
      {
        id: "x",
        kind: "HIRE_WORKER",
        rationale: "act2",
        confidence: 1,
        spendLamports: 1_000_000n,
        counterparty: "HJsZ53Zb27b8QMRbQpuDngE44AdwCGxvEZr61Zmxw1xK",
        payload: {},
        proposedAtMs: now,
        expiresAtMs: now + 10_000,
      },
      { openClaimCount: 0 },
    );
    assert.equal(decision.status, "DENIED");
  });
});
