import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateIntent,
  DEFAULT_LIMITS,
  type IntentProposal,
} from "../src/policy/charter.js";

function intent(over: Partial<IntentProposal> = {}): IntentProposal {
  const now = Date.now();
  return {
    id: "i1",
    kind: "CLAIM_JOB",
    rationale: "test",
    confidence: 0.9,
    spendLamports: 0n,
    counterparty: DEFAULT_LIMITS.allowedCounterparties[0],
    payload: { rewardLamports: "1000000" },
    proposedAtMs: now,
    expiresAtMs: now + 60_000,
    ...over,
  };
}

describe("policy charter", () => {
  it("approves valid claim", () => {
    const d = evaluateIntent(
      intent(),
      DEFAULT_LIMITS,
      { dayKey: "2026-07-14", spentLamports: 0n },
      Date.now(),
      0,
    );
    assert.equal(d.status, "APPROVED");
  });

  it("denies overspend", () => {
    const d = evaluateIntent(
      intent({
        kind: "PAY_TAX",
        spendLamports: DEFAULT_LIMITS.maxSpendPerTxLamports + 1n,
        counterparty: DEFAULT_LIMITS.allowedCounterparties[1],
      }),
      DEFAULT_LIMITS,
      { dayKey: "2026-07-14", spentLamports: 0n },
      Date.now(),
      0,
    );
    assert.equal(d.status, "DENIED");
  });

  it("denies unknown counterparty", () => {
    const d = evaluateIntent(
      intent({ counterparty: "Evil111111111111111111111111111111111111111" }),
      DEFAULT_LIMITS,
      { dayKey: "2026-07-14", spentLamports: 0n },
      Date.now(),
      0,
    );
    assert.equal(d.status, "DENIED");
  });

  it("expires stale intents", () => {
    const now = Date.now();
    const d = evaluateIntent(
      intent({ expiresAtMs: now - 1 }),
      DEFAULT_LIMITS,
      { dayKey: "2026-07-14", spentLamports: 0n },
      now,
      0,
    );
    assert.equal(d.status, "EXPIRED");
  });
});
