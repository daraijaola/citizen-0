/**
 * Act 3 — Society.
 * Worker citizens with tiny wallets + rent obligations.
 * Population pays aggregate tax into the city (narrated + state machine).
 */

import type { Lamports, SolvencyState, UnixMs } from "./types.js";
import { createPlot, buildObligation, monthlyTaxMicroUsd } from "./tax.js";
import type { PlotRegistryEntry, TaxObligation } from "./types.js";

export type WorkerCitizenId = "CITIZEN-1" | "CITIZEN-2";

export interface WorkerCitizen {
  citizenId: WorkerCitizenId;
  displayName: string;
  agentPda: string;
  /** Internal wallet (mock-ledger) in lamports. */
  balanceLamports: Lamports;
  plot: PlotRegistryEntry;
  obligation: TaxObligation;
  jobsCompleted: number;
  taxesPaidLamports: Lamports;
  status: "ACTIVE" | "DELINQUENT" | "IDLE";
  bornAtMs: UnixMs;
}

/** Tiny plot for worker citizens (1 plot Generator). */
export const WORKER_PLOT_COUNT = 1;

/** Seed balance when born (funded by CITIZEN-0 surplus transfer). */
export const WORKER_SEED_BALANCE = 5_000_000n; // 0.005 SOL

export function createWorkerCitizen(
  id: WorkerCitizenId,
  nowMs: UnixMs = Date.now(),
): WorkerCitizen {
  const plot = createPlot(`${id}-PLOT`, WORKER_PLOT_COUNT, { isMock: true });
  const dueAtMs = nowMs + 14 * 24 * 60 * 60 * 1000; // 14 days runway
  const obligation = buildObligation(plot, dueAtMs, nowMs);

  return {
    citizenId: id,
    displayName: id,
    agentPda: `mock-worker-${id.toLowerCase()}`,
    balanceLamports: WORKER_SEED_BALANCE,
    plot,
    obligation,
    jobsCompleted: 0,
    taxesPaidLamports: 0n,
    status: "ACTIVE",
    bornAtMs: nowMs,
  };
}

export function aggregateTaxesPaid(workers: WorkerCitizen[]): Lamports {
  return workers.reduce((a, w) => a + w.taxesPaidLamports, 0n);
}

export function populationSummary(workers: WorkerCitizen[]): {
  count: number;
  active: number;
  totalBalanceLamports: Lamports;
  totalTaxesPaidLamports: Lamports;
  totalJobsCompleted: number;
} {
  return {
    count: workers.length,
    active: workers.filter((w) => w.status === "ACTIVE").length,
    totalBalanceLamports: workers.reduce((a, w) => a + w.balanceLamports, 0n),
    totalTaxesPaidLamports: aggregateTaxesPaid(workers),
    totalJobsCompleted: workers.reduce((a, w) => a + w.jobsCompleted, 0),
  };
}

/** Refresh worker tax clocks; mark delinquent if past due with no funds. */
export function tickWorkerObligations(
  workers: WorkerCitizen[],
  nowMs: UnixMs,
): WorkerCitizen[] {
  return workers.map((w) => {
    const obligation = buildObligation(w.plot, w.obligation.dueAtMs, nowMs);
    let status = w.status;
    if (obligation.stage !== "GOOD" && w.balanceLamports < obligation.amountLamportsEstimate) {
      status = "DELINQUENT";
    } else if (w.balanceLamports > 0n) {
      status = "ACTIVE";
    }
    return { ...w, obligation, status };
  });
}

export function workerCanPayTax(w: WorkerCitizen): boolean {
  return w.balanceLamports >= w.obligation.amountLamportsEstimate;
}

export function applyWorkerTaxPayment(
  w: WorkerCitizen,
  nowMs: UnixMs,
): WorkerCitizen {
  const amount = w.obligation.amountLamportsEstimate;
  if (w.balanceLamports < amount) return w;
  const periodMs = 30 * 24 * 60 * 60 * 1000;
  return {
    ...w,
    balanceLamports: w.balanceLamports - amount,
    taxesPaidLamports: w.taxesPaidLamports + amount,
    obligation: {
      ...w.obligation,
      dueAtMs: nowMs + periodMs,
      stage: "GOOD",
      daysPastDue: 0,
    },
    status: "ACTIVE",
  };
}

export function solvencyLabelForPopulation(
  workers: WorkerCitizen[],
): SolvencyState {
  if (workers.some((w) => w.status === "DELINQUENT")) return "DELINQUENT";
  if (workers.every((w) => w.balanceLamports > w.obligation.amountLamportsEstimate * 2n)) {
    return "COMFORTABLE";
  }
  return "TIGHT";
}

// re-export for callers that need tax math
export { monthlyTaxMicroUsd };
