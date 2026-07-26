/**
 * Act 2 — Prosperity / firm mode.
 * When runway is strong, CITIZEN-0 becomes an employer:
 * decompose large jobs → post child tasks → hire workers → keep margin.
 */

import type { JobListing, Lamports, SolvencyState } from "./types.js";

/** Coverage (balance / next tax) required to unlock firm mode. */
export const FIRM_COVERAGE_THRESHOLD = 3;

/** Jobs at or above this reward are treated as "too big for one worker". */
export const LARGE_JOB_REWARD_LAMPORTS = 15_000_000n; // 0.015 SOL

/** Spawn society (CITIZEN-1/2) once coverage hits this after firm unlock. */
export const SOCIETY_COVERAGE_THRESHOLD = 4;

/** Parent keeps this share of parent reward after paying children (basis points). */
export const PARENT_MARGIN_BPS = 2500; // 25%

export type EconomicAct = "SURVIVAL" | "PROSPERITY" | "SOCIETY";

export function economicAct(
  coverageRatio: number,
  solvency: SolvencyState,
  firmUnlocked: boolean,
  societySpawned: boolean,
): EconomicAct {
  if (societySpawned) return "SOCIETY";
  if (firmUnlocked || isFirmEligible(coverageRatio, solvency)) return "PROSPERITY";
  return "SURVIVAL";
}

export function isFirmEligible(
  coverageRatio: number,
  solvency: SolvencyState,
): boolean {
  return solvency === "COMFORTABLE" && coverageRatio >= FIRM_COVERAGE_THRESHOLD;
}

export function isLargeJob(job: JobListing): boolean {
  return job.rewardLamports >= LARGE_JOB_REWARD_LAMPORTS;
}

export interface SubtaskSpec {
  index: number;
  title: string;
  /** Child escrow reward (lamports). */
  rewardLamports: Lamports;
  capabilityHint: "research" | "summary" | "extract" | "content" | "general";
}

/**
 * Deterministic job decomposition — no LLM required.
 * Splits parent reward: children share (100% - margin), parent keeps margin.
 */
export function decomposeJob(job: JobListing, parts = 3): {
  subtasks: SubtaskSpec[];
  parentMarginLamports: Lamports;
  childrenBudgetLamports: Lamports;
} {
  const n = Math.max(2, Math.min(parts, 3));
  const parentMargin =
    (job.rewardLamports * BigInt(PARENT_MARGIN_BPS)) / 10_000n;
  const childrenBudget = job.rewardLamports - parentMargin;
  const base = childrenBudget / BigInt(n);
  const remainder = childrenBudget - base * BigInt(n);

  const hints: SubtaskSpec["capabilityHint"][] = [
    "research",
    "summary",
    "extract",
  ];

  const subtasks: SubtaskSpec[] = [];
  for (let i = 0; i < n; i++) {
    const reward = i === 0 ? base + remainder : base;
    subtasks.push({
      index: i,
      title: `[sub ${i + 1}/${n}] ${job.title}`,
      rewardLamports: reward,
      capabilityHint: hints[i] ?? "general",
    });
  }

  return {
    subtasks,
    parentMarginLamports: parentMargin,
    childrenBudgetLamports: childrenBudget,
  };
}

export interface FirmPnL {
  parentJobsCompleted: number;
  childrenHired: number;
  grossRewardLamports: Lamports;
  paidToWorkersLamports: Lamports;
  marginKeptLamports: Lamports;
  secondPlotPurchased: boolean;
}

export function emptyFirmPnL(): FirmPnL {
  return {
    parentJobsCompleted: 0,
    childrenHired: 0,
    grossRewardLamports: 0n,
    paidToWorkersLamports: 0n,
    marginKeptLamports: 0n,
    secondPlotPurchased: false,
  };
}
