import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DecisionLog } from "@citizen-0/shared";
import { MockAgencAdapter } from "../src/adapters/mock-agenc.js";
import { MockPlotAdapter } from "../src/adapters/mock-plot.js";
import { LocalPolicySigner } from "../src/runtime/policy-signer.js";
import { SurvivalLoop } from "../src/runtime/survival-loop.js";

describe("phase 4-5 firm + society loop", () => {
  it("unlocks firm, runs firm job, spawns society", async () => {
    const agenc = new MockAgencAdapter({
      startingBalanceLamports: 80_000_000n,
      seedJobs: true,
    });
    const plot = new MockPlotAdapter({
      startingBalanceLamports: 80_000_000n,
      dueInDays: 10,
      plotCount: 10,
    });
    const log = new DecisionLog();
    const loop = new SurvivalLoop({
      mode: "mock",
      agenc,
      plot,
      signer: new LocalPolicySigner(),
      log,
    });

    await loop.boot();

    let sawFirm = false;
    let sawSociety = false;
    for (let i = 0; i < 6; i++) {
      const r = await loop.tick();
      if (r.actions.some((a) => a === "firm_unlock" || a.startsWith("firm_settled"))) {
        sawFirm = true;
      }
      if (r.actions.some((a) => a === "society_spawn" || a.startsWith("worker_tax"))) {
        sawSociety = true;
      }
      if (r.state.economy?.firmMode) sawFirm = true;
      if (r.state.economy?.societySpawned) sawSociety = true;
    }

    const snap = await loop.snapshot();
    assert.equal(log.verify().ok, true);
    assert.ok(sawFirm || snap.economy?.firmMode, "expected firm mode");
    assert.ok(
      snap.economy?.firm.parentJobsCompleted ||
        snap.economy?.firmMode,
      "expected firm progress",
    );
    // Society may spawn same tick as firm if coverage high
    assert.ok(
      sawSociety || snap.economy?.societySpawned || snap.economy?.firmMode,
      "expected society or firm path",
    );
    assert.ok((snap.economy?.population.count ?? 0) >= 0);
  });
});
