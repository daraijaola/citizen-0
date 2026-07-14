/**
 * Policy knobs driven by solvency state.
 * Pure functions — the survival loop asks "what may I do?" here.
 */

import type { JobListing, SolvencyState } from "./types.js";

export interface SolvencyPolicy {
  state: SolvencyState;
  /** Minimum reward (lamports) to even consider a job. */
  minRewardLamports: bigint;
  /** Max concurrent claims. */
  maxConcurrentJobs: number;
  /** Accept lower margins / weaker fit when desperate. */
  acceptLowMargin: boolean;
  /** Require pinned job spec + claimable flag. */
  requireClaimableOnly: boolean;
  /** How aggressive to poll marketplace (ms). */
  pollIntervalMs: number;
  /** Auto-propose tax payment when we can cover it. */
  autoProposeTaxWhenFunded: boolean;
  /** Human-readable posture for diary. */
  diaryMood: "calm" | "focused" | "anxious" | "terrified";
}

const POLICIES: Record<SolvencyState, SolvencyPolicy> = {
  COMFORTABLE: {
    state: "COMFORTABLE",
    minRewardLamports: 5_000_000n, // 0.005 SOL
    maxConcurrentJobs: 1,
    acceptLowMargin: false,
    requireClaimableOnly: true,
    pollIntervalMs: 60_000,
    autoProposeTaxWhenFunded: true,
    diaryMood: "calm",
  },
  TIGHT: {
    state: "TIGHT",
    minRewardLamports: 1_000_000n, // 0.001 SOL
    maxConcurrentJobs: 1,
    acceptLowMargin: false,
    requireClaimableOnly: true,
    pollIntervalMs: 30_000,
    autoProposeTaxWhenFunded: true,
    diaryMood: "focused",
  },
  DESPERATE: {
    state: "DESPERATE",
    minRewardLamports: 500_000n, // 0.0005 SOL
    maxConcurrentJobs: 2,
    acceptLowMargin: true,
    requireClaimableOnly: true,
    pollIntervalMs: 15_000,
    autoProposeTaxWhenFunded: true,
    diaryMood: "anxious",
  },
  DELINQUENT: {
    state: "DELINQUENT",
    minRewardLamports: 0n,
    maxConcurrentJobs: 2,
    acceptLowMargin: true,
    requireClaimableOnly: false, // take anything with a reward
    pollIntervalMs: 10_000,
    autoProposeTaxWhenFunded: true,
    diaryMood: "terrified",
  },
};

export function policyFor(state: SolvencyState): SolvencyPolicy {
  return POLICIES[state];
}

export interface JobScore {
  jobId: string;
  score: number;
  reasons: string[];
  eligible: boolean;
}

/**
 * Score a job under current solvency policy.
 * Higher is better. Ineligible jobs get score -Infinity.
 */
export function scoreJob(
  job: JobListing,
  policy: SolvencyPolicy,
  agentCapabilities: bigint,
  nowUnix: number,
): JobScore {
  const reasons: string[] = [];

  if (policy.requireClaimableOnly && !job.claimable) {
    return {
      jobId: job.id,
      score: Number.NEGATIVE_INFINITY,
      reasons: ["not claimable (spec/moderation gate)"],
      eligible: false,
    };
  }

  if (job.rewardLamports < policy.minRewardLamports) {
    return {
      jobId: job.id,
      score: Number.NEGATIVE_INFINITY,
      reasons: [`reward ${job.rewardLamports} below min ${policy.minRewardLamports}`],
      eligible: false,
    };
  }

  if (job.deadlineUnix <= nowUnix) {
    return {
      jobId: job.id,
      score: Number.NEGATIVE_INFINITY,
      reasons: ["deadline passed"],
      eligible: false,
    };
  }

  // Capability superset: agent bits must cover required bits
  if ((agentCapabilities & job.requiredCapabilities) !== job.requiredCapabilities) {
    return {
      jobId: job.id,
      score: Number.NEGATIVE_INFINITY,
      reasons: ["missing required capabilities"],
      eligible: false,
    };
  }

  // Base score: reward in SOL units
  let score = Number(job.rewardLamports) / 1e9;
  reasons.push(`reward_sol=${score.toFixed(6)}`);

  // Prefer sooner deadlines when desperate (urgency premium)
  const hoursLeft = (job.deadlineUnix - nowUnix) / 3600;
  if (policy.state === "DESPERATE" || policy.state === "DELINQUENT") {
    const urgency = Math.max(0, 48 - hoursLeft) / 48;
    score += urgency * 0.5;
    reasons.push(`urgency_boost=${urgency.toFixed(2)}`);
  } else if (hoursLeft < 6) {
    // Comfortable agents avoid death-march deadlines
    score *= 0.5;
    reasons.push("short_deadline_penalty");
  }

  // Spec quality
  if (job.jobSpecUri && job.jobSpecHash) {
    score += 0.1;
    reasons.push("pinned_spec");
  } else if (!policy.acceptLowMargin) {
    score *= 0.3;
    reasons.push("unpinned_spec_penalty");
  }

  return { jobId: job.id, score, reasons, eligible: true };
}

export function pickBestJob(
  jobs: JobListing[],
  policy: SolvencyPolicy,
  agentCapabilities: bigint,
  nowUnix: number,
): { job: JobListing; score: JobScore } | null {
  let best: { job: JobListing; score: JobScore } | null = null;

  for (const job of jobs) {
    const s = scoreJob(job, policy, agentCapabilities, nowUnix);
    if (!s.eligible) continue;
    if (!best || s.score > best.score.score) {
      best = { job, score: s };
    }
  }

  return best;
}
