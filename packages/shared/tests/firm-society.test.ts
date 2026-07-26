import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decomposeJob,
  isFirmEligible,
  isLargeJob,
  LARGE_JOB_REWARD_LAMPORTS,
  createWorkerCitizen,
  populationSummary,
  applyWorkerTaxPayment,
  workerCanPayTax,
  economicAct,
} from "../src/index.js";

describe("firm + society", () => {
  it("detects firm eligibility and large jobs", () => {
    assert.equal(isFirmEligible(3.5, "COMFORTABLE"), true);
    assert.equal(isFirmEligible(2, "COMFORTABLE"), false);
    assert.equal(isFirmEligible(10, "DESPERATE"), false);
    assert.equal(
      isLargeJob({
        id: "1",
        title: "big",
        rewardLamports: LARGE_JOB_REWARD_LAMPORTS,
        deadlineUnix: 9e9,
        requiredCapabilities: 1n,
        minReputation: 0,
        jobSpecUri: "x",
        jobSpecHash: "y",
        claimable: true,
        source: "mock",
      }),
      true,
    );
  });

  it("decomposes job with margin", () => {
    const plan = decomposeJob({
      id: "p",
      title: "Parent package",
      rewardLamports: 30_000_000n,
      deadlineUnix: 9e9,
      requiredCapabilities: 1n,
      minReputation: 0,
      jobSpecUri: null,
      jobSpecHash: null,
      claimable: true,
      source: "mock",
    });
    assert.equal(plan.subtasks.length, 3);
    const childSum = plan.subtasks.reduce((a, s) => a + s.rewardLamports, 0n);
    assert.equal(childSum + plan.parentMarginLamports, 30_000_000n);
    assert.ok(plan.parentMarginLamports > 0n);
  });

  it("spawns workers and pays tax", () => {
    const w = createWorkerCitizen("CITIZEN-1");
    assert.equal(w.citizenId, "CITIZEN-1");
    assert.ok(w.balanceLamports > 0n);
    // fund enough for tax
    w.balanceLamports = w.obligation.amountLamportsEstimate * 2n;
    assert.equal(workerCanPayTax(w), true);
    const paid = applyWorkerTaxPayment(w, Date.now());
    assert.ok(paid.taxesPaidLamports > 0n);
    assert.equal(paid.obligation.stage, "GOOD");
    const pop = populationSummary([paid, createWorkerCitizen("CITIZEN-2")]);
    assert.equal(pop.count, 2);
  });

  it("economic act ladder", () => {
    assert.equal(economicAct(1, "TIGHT", false, false), "SURVIVAL");
    assert.equal(economicAct(5, "COMFORTABLE", true, false), "PROSPERITY");
    assert.equal(economicAct(5, "COMFORTABLE", true, true), "SOCIETY");
  });
});
