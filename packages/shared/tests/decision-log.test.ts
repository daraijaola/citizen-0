import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DecisionLog } from "../src/log/decision-log.js";

describe("decision log", () => {
  it("chains hashes and verifies", () => {
    const log = new DecisionLog();
    log.append({ type: "BOOT", atMs: 1, summary: "boot" });
    log.append({ type: "TICK", atMs: 2, summary: "tick 1" });
    log.append({ type: "SOLVENCY", atMs: 3, summary: "ok", data: { s: 1 } });
    assert.equal(log.length, 3);
    assert.equal(log.verify().ok, true);
  });

  it("detects tampering", () => {
    const log = new DecisionLog();
    log.append({ type: "BOOT", atMs: 1, summary: "boot" });
    const snap = log.snapshot();
    snap.entries[0]!.summary = "tampered";
    const broken = DecisionLog.prototype;
    // manual verify on mutated entry
    const log2 = new DecisionLog();
    log2.append({ type: "BOOT", atMs: 1, summary: "boot" });
    const entries = log2.list();
    entries[0]!.data = { hacked: true };
    // re-verify via private path: reconstruct
    const forged = new DecisionLog();
    forged.append({ type: "BOOT", atMs: 1, summary: "boot" });
    const s = forged.snapshot();
    s.entries[0]!.summary = "nope";
    assert.throws(() => DecisionLog.fromSnapshot(s));
  });
});
