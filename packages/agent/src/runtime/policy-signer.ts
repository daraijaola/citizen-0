/**
 * Policy Signer — separate boundary from the agent brain.
 *
 * GhostNN dialect: agent proposes intents; signer approves within charter.
 * In mock/dev the signer is a local module with its own identity string.
 * In hardened deploy, this becomes a separate process / HSM / admin Telegram approve.
 */

import {
  type DailySpendLedger,
  type IntentDecision,
  type IntentLimits,
  type IntentProposal,
  DEFAULT_LIMITS,
  evaluateIntent,
  utcDayKey,
} from "@citizen-0/shared";

export interface PolicySigner {
  readonly signerId: string;
  evaluate(
    intent: IntentProposal,
    ctx: { openClaimCount: number; nowMs?: number },
  ): IntentDecision;
  recordSpend(lamports: bigint, atMs?: number): void;
  getLedger(): DailySpendLedger;
}

export class LocalPolicySigner implements PolicySigner {
  readonly signerId: string;
  private limits: IntentLimits;
  private ledger: DailySpendLedger;

  constructor(opts?: {
    signerId?: string;
    limits?: Partial<IntentLimits>;
  }) {
    this.signerId = opts?.signerId ?? "local-policy-signer";
    this.limits = { ...DEFAULT_LIMITS, ...opts?.limits };
    this.ledger = { dayKey: utcDayKey(), spentLamports: 0n };
  }

  private rollDay(nowMs: number): void {
    const key = utcDayKey(nowMs);
    if (key !== this.ledger.dayKey) {
      this.ledger = { dayKey: key, spentLamports: 0n };
    }
  }

  evaluate(
    intent: IntentProposal,
    ctx: { openClaimCount: number; nowMs?: number },
  ): IntentDecision {
    const nowMs = ctx.nowMs ?? Date.now();
    this.rollDay(nowMs);
    const decision = evaluateIntent(
      intent,
      this.limits,
      this.ledger,
      nowMs,
      ctx.openClaimCount,
    );
    return {
      ...decision,
      signerId: this.signerId,
      signature:
        decision.status === "APPROVED"
          ? `psig:${this.signerId}:${intent.id}:${decision.decidedAtMs}`
          : undefined,
    };
  }

  recordSpend(lamports: bigint, atMs: number = Date.now()): void {
    this.rollDay(atMs);
    this.ledger.spentLamports += lamports;
  }

  getLedger(): DailySpendLedger {
    return { ...this.ledger };
  }
}
