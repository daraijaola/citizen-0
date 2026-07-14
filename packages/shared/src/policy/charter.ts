/**
 * CITIZEN-0 Constraint Charter
 * Written in GhostNN's Permitted / Not-Permitted dialect
 * (see Operator AI section of Nexus Energy City whitepaper + Trade Intent Signing).
 *
 * The agent NEVER holds unilateral spend authority.
 * It proposes Intents; the Policy Signer approves only within this charter.
 */

export type IntentKind =
  | "CLAIM_JOB"
  | "SUBMIT_DELIVERABLE"
  | "PAY_TAX"
  | "DECLINE_JOB"
  | "TRANSFER_SOL"
  | "BUY_PLOT"
  | "POST_JOB"
  | "HIRE_WORKER"; // Act 2 stretch

export interface IntentLimits {
  /** Max lamports per single spend intent. */
  maxSpendPerTxLamports: bigint;
  /** Rolling 24h spend ceiling. */
  maxSpendPerDayLamports: bigint;
  /** Max concurrent open claims. */
  maxOpenClaims: number;
  /** Max job reward we will bond against (claim ceiling). */
  maxJobClaimRewardLamports: bigint;
  /** Allowed counterparties (program IDs / treasuries). Empty = use allowlist check skip for mock. */
  allowedCounterparties: string[];
  /** Capability bitmask the agent may claim under. */
  allowedCapabilities: bigint;
}

export const DEFAULT_LIMITS: IntentLimits = {
  maxSpendPerTxLamports: 50_000_000n, // 0.05 SOL
  maxSpendPerDayLamports: 200_000_000n, // 0.2 SOL
  maxOpenClaims: 2,
  maxJobClaimRewardLamports: 100_000_000n, // 0.1 SOL
  allowedCounterparties: [
    // AgenC coordination program (mainnet)
    "HJsZ53Zb27b8QMRbQpuDngE44AdwCGxvEZr61Zmxw1xK",
    // Nexus treasury (from public /api/config)
    "8fj621jPjBV4jHrrV1LDd9LHzSHJ6ras2YvwFgG6sx18",
  ],
  allowedCapabilities: 1n, // COMPUTE
};

/**
 * Permitted / Not-Permitted — README will publish this block verbatim.
 */
export const CHARTER = {
  agent: "CITIZEN-0",
  version: "1.0.0",
  philosophy:
    "Bounded autonomy: the agent proposes, policy signs, chain settles. No unilateral spend.",

  permitted: [
    "Observe marketplace listings and balances",
    "Score and rank jobs under solvency policy",
    "Propose CLAIM_JOB intents within claim ceiling and capability mask",
    "Execute claimed job work offline (LLM / deterministic workers)",
    "Propose SUBMIT_DELIVERABLE with artifact hash + URI",
    "Propose PAY_TAX when balance covers the published obligation",
    "Append all decisions to the hash-chained audit log",
    "Narrate material events to the public diary channel",
  ],

  notPermitted: [
    "Hold or use the policy signer private key inside the agent process",
    "Sign spend transactions without a prior approved Intent",
    "Exceed maxSpendPerTx or maxSpendPerDay limits",
    "Claim jobs requiring capabilities outside the allowlist",
    "Move funds to counterparties not on the allowlist",
    "Seize, transfer, or modify plot ownership outside city rules",
    "Fabricate audit log entries or break the hash chain",
    "Auto-approve its own intents (signer must be a separate boundary)",
  ],

  intentKinds: [
    "CLAIM_JOB",
    "SUBMIT_DELIVERABLE",
    "PAY_TAX",
    "DECLINE_JOB",
    "TRANSFER_SOL",
    "BUY_PLOT",
    "POST_JOB",
    "HIRE_WORKER",
  ] as IntentKind[],
} as const;

export interface IntentProposal {
  id: string;
  kind: IntentKind;
  /** Human + machine readable rationale (GhostNN trade-intent style). */
  rationale: string;
  confidence: number; // 0..1
  /** Lamports that would leave the agent wallet if approved (0 if none). */
  spendLamports: bigint;
  /** Optional counterparty address / program. */
  counterparty?: string;
  /** Job or plot reference. */
  subjectId?: string;
  payload: Record<string, unknown>;
  /** Expiry — intents die; no zombie approvals. */
  expiresAtMs: number;
  proposedAtMs: number;
}

export type IntentDecisionStatus =
  | "PENDING"
  | "APPROVED"
  | "DENIED"
  | "EXPIRED"
  | "EXECUTED"
  | "FAILED";

export interface IntentDecision {
  intentId: string;
  status: IntentDecisionStatus;
  decidedAtMs: number;
  reasons: string[];
  /** Signer identity (pubkey or "mock-policy-signer"). */
  signerId: string;
  signature?: string;
}

export interface DailySpendLedger {
  dayKey: string; // YYYY-MM-DD UTC
  spentLamports: bigint;
}

export function utcDayKey(ms: number = Date.now()): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Evaluate an intent against the charter + live spend ledger.
 * Pure: returns decision without side effects.
 */
export function evaluateIntent(
  intent: IntentProposal,
  limits: IntentLimits,
  ledger: DailySpendLedger,
  nowMs: number,
  openClaimCount: number,
): IntentDecision {
  const reasons: string[] = [];

  if (nowMs > intent.expiresAtMs) {
    return {
      intentId: intent.id,
      status: "EXPIRED",
      decidedAtMs: nowMs,
      reasons: ["intent expired"],
      signerId: "policy-engine",
    };
  }

  if (intent.confidence < 0 || intent.confidence > 1) {
    reasons.push("confidence out of range");
  }

  if (intent.spendLamports < 0n) {
    reasons.push("negative spend");
  }

  if (intent.spendLamports > limits.maxSpendPerTxLamports) {
    reasons.push(
      `spend ${intent.spendLamports} exceeds maxSpendPerTx ${limits.maxSpendPerTxLamports}`,
    );
  }

  const projected = ledger.spentLamports + intent.spendLamports;
  if (projected > limits.maxSpendPerDayLamports) {
    reasons.push(
      `daily spend ${projected} would exceed maxSpendPerDay ${limits.maxSpendPerDayLamports}`,
    );
  }

  if (
    intent.counterparty &&
    limits.allowedCounterparties.length > 0 &&
    !limits.allowedCounterparties.includes(intent.counterparty)
  ) {
    reasons.push(`counterparty ${intent.counterparty} not allowlisted`);
  }

  if (intent.kind === "CLAIM_JOB") {
    if (openClaimCount >= limits.maxOpenClaims) {
      reasons.push(`open claims ${openClaimCount} at max ${limits.maxOpenClaims}`);
    }
    const reward = BigInt(String(intent.payload["rewardLamports"] ?? 0));
    if (reward > limits.maxJobClaimRewardLamports) {
      reasons.push(`job reward ${reward} exceeds claim ceiling`);
    }
  }

  if (intent.kind === "TRANSFER_SOL" && intent.spendLamports === 0n) {
    reasons.push("zero-value transfer");
  }

  // Act 2/3 kinds denied until charter upgrade
  if (intent.kind === "HIRE_WORKER" || intent.kind === "BUY_PLOT") {
    // Allow BUY_PLOT only if explicitly under spend limits (still permitted path)
    if (intent.kind === "HIRE_WORKER") {
      reasons.push("HIRE_WORKER not enabled in charter v1 (Act 2 stretch)");
    }
  }

  if (reasons.length > 0) {
    return {
      intentId: intent.id,
      status: "DENIED",
      decidedAtMs: nowMs,
      reasons,
      signerId: "policy-engine",
    };
  }

  return {
    intentId: intent.id,
    status: "APPROVED",
    decidedAtMs: nowMs,
    reasons: ["within charter limits"],
    signerId: "policy-engine",
  };
}
