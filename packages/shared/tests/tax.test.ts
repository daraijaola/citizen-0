import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createPlot,
  monthlyTaxMicroUsd,
  stageFromDaysPastDue,
  buildObligation,
  deriveSolvency,
  computeRunway,
  applyTaxPayment,
  canPayTax,
} from "../src/domain/tax.js";

describe("tax engine", () => {
  it("computes Generator tax for 10 plots = $0.20", () => {
    const plot = createPlot("p1", 10);
    assert.equal(plot.tier, "GENERATOR");
    // 10 * 0.02 = 0.20 USD = 200_000 micro
    assert.equal(monthlyTaxMicroUsd(plot), 200_000n);
  });

  it("applies Substation +10% bonus", () => {
    const plot = createPlot("p2", 120);
    assert.equal(plot.tier, "SUBSTATION");
    // 120 * 0.02 = 2.40; +10% = 2.64 USD = 2_640_000 micro
    assert.equal(monthlyTaxMicroUsd(plot), 2_640_000n);
    assert.equal(plot.effectiveOutput, 180);
  });

  it("maps delinquency stages by days past due", () => {
    assert.equal(stageFromDaysPastDue(0), "GOOD");
    assert.equal(stageFromDaysPastDue(3), "OVERDUE");
    assert.equal(stageFromDaysPastDue(10), "THROTTLED");
    assert.equal(stageFromDaysPastDue(20), "YIELD_WITHHELD");
    assert.equal(stageFromDaysPastDue(40), "FORECLOSURE_ELIGIBLE");
  });

  it("derives DESPERATE when broke near deadline", () => {
    const plot = createPlot("p3", 10);
    const now = Date.now();
    const due = now + 1 * 24 * 60 * 60 * 1000; // 1 day
    const obl = buildObligation(plot, due, now);
    const sol = deriveSolvency(0n, obl, now);
    assert.equal(sol, "DESPERATE");
  });

  it("derives DELINQUENT when past due", () => {
    const plot = createPlot("p4", 10);
    const now = Date.now();
    const due = now - 3 * 24 * 60 * 60 * 1000;
    const obl = buildObligation(plot, due, now);
    assert.equal(obl.stage, "OVERDUE");
    assert.equal(deriveSolvency(1_000_000_000n, obl, now), "DELINQUENT");
  });

  it("applyTaxPayment resets stage and advances due", () => {
    const plot = createPlot("p5", 10);
    const now = Date.now();
    // 3 days past due → OVERDUE (floor days must be >= 1)
    const obl = buildObligation(plot, now - 3 * 24 * 60 * 60 * 1000, now);
    assert.equal(obl.stage, "OVERDUE");
    const paid = applyTaxPayment(obl, now);
    assert.equal(paid.stage, "GOOD");
    assert.ok(paid.dueAtMs > now);
  });

  it("canPayTax respects balance", () => {
    const plot = createPlot("p6", 10);
    const obl = buildObligation(plot, Date.now() + 86400000, Date.now());
    assert.equal(canPayTax(0n, obl), false);
    assert.equal(canPayTax(obl.amountLamportsEstimate, obl), true);
  });

  it("computeRunway coverage ratio", () => {
    const plot = createPlot("p7", 10);
    const now = Date.now();
    const obl = buildObligation(plot, now + 7 * 86400000, now);
    const runway = computeRunway(obl.amountLamportsEstimate * 3n, obl, now);
    assert.ok(runway.coverageRatio >= 2.9);
    assert.equal(runway.solvency, "COMFORTABLE");
  });
});
