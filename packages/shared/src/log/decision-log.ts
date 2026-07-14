/**
 * Append-only, hash-chained decision log.
 * Every material decision is a block: previous hash + payload → this hash.
 * Tampering with any entry breaks the chain on verify().
 */

import { createHash, randomUUID } from "node:crypto";
import type { IntentDecision, IntentProposal } from "../policy/charter.js";
import type { JobAttempt, RunwaySnapshot, SolvencyState } from "../domain/types.js";

export type DecisionEventType =
  | "BOOT"
  | "TICK"
  | "PERCEPTION"
  | "SOLVENCY"
  | "JOB_SCORED"
  | "INTENT_PROPOSED"
  | "INTENT_DECIDED"
  | "INTENT_EXECUTED"
  | "JOB_STATUS"
  | "TAX_PAID"
  | "TAX_FAILED"
  | "WORKER"
  | "QA_PASS"
  | "QA_FAIL"
  | "RETRY"
  | "CIRCUIT"
  | "SUPERVISOR"
  | "ERROR"
  | "DIARY";

export interface DecisionEvent {
  type: DecisionEventType;
  atMs: number;
  summary: string;
  data?: Record<string, unknown>;
}

export interface DecisionEntry {
  seq: number;
  id: string;
  atMs: number;
  type: DecisionEventType;
  summary: string;
  data: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export interface DecisionLogSnapshot {
  genesis: string;
  entries: DecisionEntry[];
  headHash: string;
}

const GENESIS = "CITIZEN-0/DECISION-LOG/v1";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function canonicalize(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
}

export function hashEntry(
  seq: number,
  id: string,
  atMs: number,
  type: DecisionEventType,
  summary: string,
  data: Record<string, unknown>,
  prevHash: string,
): string {
  const material = canonicalize({
    seq,
    id,
    atMs,
    type,
    summary,
    data,
    prevHash,
  });
  return sha256Hex(material);
}

export class DecisionLog {
  private entries: DecisionEntry[] = [];
  private readonly genesisHash: string;

  constructor(genesis: string = GENESIS) {
    this.genesisHash = sha256Hex(genesis);
  }

  static fromSnapshot(snap: DecisionLogSnapshot): DecisionLog {
    const log = new DecisionLog();
    // Bypass construction — restore entries if chain verifies
    const probe = new DecisionLog();
    (probe as unknown as { entries: DecisionEntry[] }).entries = snap.entries;
    const v = probe.verify();
    if (!v.ok) {
      throw new Error(`Cannot restore decision log: ${v.error}`);
    }
    return probe;
  }

  get length(): number {
    return this.entries.length;
  }

  get headHash(): string {
    if (this.entries.length === 0) return this.genesisHash;
    return this.entries[this.entries.length - 1]!.hash;
  }

  append(event: DecisionEvent): DecisionEntry {
    const seq = this.entries.length;
    const id = randomUUID();
    const data = event.data ?? {};
    const prevHash = this.headHash;
    const hash = hashEntry(
      seq,
      id,
      event.atMs,
      event.type,
      event.summary,
      data,
      prevHash,
    );

    const entry: DecisionEntry = {
      seq,
      id,
      atMs: event.atMs,
      type: event.type,
      summary: event.summary,
      data,
      prevHash,
      hash,
    };
    this.entries.push(entry);
    return entry;
  }

  recordIntentProposed(intent: IntentProposal): DecisionEntry {
    return this.append({
      type: "INTENT_PROPOSED",
      atMs: intent.proposedAtMs,
      summary: `Propose ${intent.kind}: ${intent.rationale}`,
      data: {
        intentId: intent.id,
        kind: intent.kind,
        spendLamports: intent.spendLamports.toString(),
        confidence: intent.confidence,
        subjectId: intent.subjectId,
        counterparty: intent.counterparty,
        expiresAtMs: intent.expiresAtMs,
        payload: intent.payload,
      },
    });
  }

  recordIntentDecided(decision: IntentDecision): DecisionEntry {
    return this.append({
      type: "INTENT_DECIDED",
      atMs: decision.decidedAtMs,
      summary: `Intent ${decision.intentId} → ${decision.status}`,
      data: {
        ...decision,
      },
    });
  }

  recordSolvency(state: SolvencyState, runway: RunwaySnapshot): DecisionEntry {
    return this.append({
      type: "SOLVENCY",
      atMs: Date.now(),
      summary: `Solvency ${state} coverage=${runway.coverageRatio.toFixed(2)} stage=${runway.stage}`,
      data: {
        state,
        coverageRatio: runway.coverageRatio,
        balanceLamports: runway.balanceLamports.toString(),
        nextObligationLamports: runway.nextObligationLamports.toString(),
        msUntilDue: runway.msUntilDue,
        stage: runway.stage,
      },
    });
  }

  recordJobStatus(attempt: JobAttempt): DecisionEntry {
    return this.append({
      type: "JOB_STATUS",
      atMs: Date.now(),
      summary: `Job ${attempt.jobId} → ${attempt.status}`,
      data: {
        ...attempt,
        rewardLamports: attempt.rewardLamports?.toString(),
      },
    });
  }

  verify(): { ok: true } | { ok: false; error: string; atSeq?: number } {
    let prev = this.genesisHash;
    for (const e of this.entries) {
      if (e.prevHash !== prev) {
        return {
          ok: false,
          error: `prevHash mismatch at seq ${e.seq}`,
          atSeq: e.seq,
        };
      }
      const expected = hashEntry(
        e.seq,
        e.id,
        e.atMs,
        e.type,
        e.summary,
        e.data,
        e.prevHash,
      );
      if (expected !== e.hash) {
        return {
          ok: false,
          error: `hash mismatch at seq ${e.seq}`,
          atSeq: e.seq,
        };
      }
      prev = e.hash;
    }
    return { ok: true };
  }

  list(limit?: number): DecisionEntry[] {
    if (limit === undefined) return [...this.entries];
    return this.entries.slice(-limit);
  }

  snapshot(): DecisionLogSnapshot {
    return {
      genesis: GENESIS,
      entries: [...this.entries],
      headHash: this.headHash,
    };
  }
}
