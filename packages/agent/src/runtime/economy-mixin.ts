/**
 * Act 2/3 state helpers mixed into SurvivalLoop via composition.
 */

import {
  createWorkerCitizen,
  createPlot,
  economicAct,
  emptyFirmPnL,
  isFirmEligible,
  isLargeJob,
  SOCIETY_COVERAGE_THRESHOLD,
  tickWorkerObligations,
  applyWorkerTaxPayment,
  workerCanPayTax,
  populationSummary,
  WORKER_SEED_BALANCE,
  type FirmPnL,
  type WorkerCitizen,
  type EconomySnapshot,
  type JobListing,
  type PlotRegistryEntry,
} from "@citizen-0/shared";

export class EconomyState {
  firmUnlocked = false;
  firmUnlockedAtMs?: number;
  societySpawned = false;
  firmPnL: FirmPnL = emptyFirmPnL();
  workers: WorkerCitizen[] = [];
  secondPlot?: PlotRegistryEntry;

  tryUnlockFirm(coverage: number, solvency: string): boolean {
    if (this.firmUnlocked) return false;
    if (isFirmEligible(coverage, solvency as never)) {
      this.firmUnlocked = true;
      this.firmUnlockedAtMs = Date.now();
      return true;
    }
    return false;
  }

  trySpawnSociety(coverage: number): WorkerCitizen[] | null {
    if (this.societySpawned || !this.firmUnlocked) return null;
    if (coverage < SOCIETY_COVERAGE_THRESHOLD) return null;
    const now = Date.now();
    this.workers = [
      createWorkerCitizen("CITIZEN-1", now),
      createWorkerCitizen("CITIZEN-2", now),
    ];
    this.societySpawned = true;
    return this.workers;
  }

  payWorker(citizenId: string, lamports: bigint): void {
    const w = this.workers.find((x) => x.citizenId === citizenId);
    if (!w) return;
    w.balanceLamports += lamports;
    w.jobsCompleted += 1;
    w.status = "ACTIVE";
  }

  seedCostLamports(): bigint {
    return WORKER_SEED_BALANCE * BigInt(this.workers.length || 2);
  }

  recordFirmJob(input: {
    gross: bigint;
    paidWorkers: bigint;
    margin: bigint;
  }): void {
    this.firmPnL.parentJobsCompleted += 1;
    this.firmPnL.childrenHired += 0; // set by caller if needed
    this.firmPnL.grossRewardLamports += input.gross;
    this.firmPnL.paidToWorkersLamports += input.paidWorkers;
    this.firmPnL.marginKeptLamports += input.margin;
  }

  recordChildrenHired(n: number): void {
    this.firmPnL.childrenHired += n;
  }

  buySecondPlot(): PlotRegistryEntry {
    const plot = createPlot("CITIZEN-0-PLOT-002", 10, { isMock: true });
    this.secondPlot = plot;
    this.firmPnL.secondPlotPurchased = true;
    return plot;
  }

  tickWorkers(nowMs: number): void {
    this.workers = tickWorkerObligations(this.workers, nowMs);
  }

  collectWorkerTaxes(nowMs: number): Array<{ id: string; amount: bigint }> {
    const paid: Array<{ id: string; amount: bigint }> = [];
    const dueSoonMs = 3 * 24 * 60 * 60 * 1000;
    this.workers = this.workers.map((w) => {
      // Only pay when due soon / overdue — avoid spamming tax every tick
      const msUntil = w.obligation.dueAtMs - nowMs;
      const due =
        msUntil < dueSoonMs ||
        w.obligation.stage !== "GOOD" ||
        w.status === "DELINQUENT";
      if (!due || !workerCanPayTax(w)) return w;
      const amount = w.obligation.amountLamportsEstimate;
      const next = applyWorkerTaxPayment(w, nowMs);
      paid.push({ id: w.citizenId, amount });
      return next;
    });
    return paid;
  }

  snapshot(
    coverage: number,
    solvency: string,
  ): EconomySnapshot {
    const pop = populationSummary(this.workers);
    const act = economicAct(
      coverage,
      solvency as never,
      this.firmUnlocked,
      this.societySpawned,
    );
    return {
      act,
      firmMode: this.firmUnlocked,
      firmUnlockedAtMs: this.firmUnlockedAtMs,
      societySpawned: this.societySpawned,
      secondPlot: this.secondPlot,
      firm: {
        parentJobsCompleted: this.firmPnL.parentJobsCompleted,
        childrenHired: this.firmPnL.childrenHired,
        grossRewardLamports: this.firmPnL.grossRewardLamports.toString(),
        paidToWorkersLamports: this.firmPnL.paidToWorkersLamports.toString(),
        marginKeptLamports: this.firmPnL.marginKeptLamports.toString(),
        secondPlotPurchased: this.firmPnL.secondPlotPurchased,
      },
      population: {
        count: pop.count,
        active: pop.active,
        totalBalanceLamports: pop.totalBalanceLamports.toString(),
        totalTaxesPaidLamports: pop.totalTaxesPaidLamports.toString(),
        totalJobsCompleted: pop.totalJobsCompleted,
        citizens: this.workers.map((w) => ({
          citizenId: w.citizenId,
          balanceLamports: w.balanceLamports.toString(),
          status: w.status,
          jobsCompleted: w.jobsCompleted,
          taxesPaidLamports: w.taxesPaidLamports.toString(),
          plotId: w.plot.plotId,
          stage: w.obligation.stage,
        })),
      },
    };
  }
}

export function preferFirmJob(
  jobs: JobListing[],
  firmUnlocked: boolean,
): JobListing | null {
  if (!firmUnlocked) return null;
  const firmJobs = jobs.filter((j) => j.claimable && (isLargeJob(j) || j.firmEligible));
  if (firmJobs.length === 0) return null;
  return firmJobs.sort((a, b) =>
    a.rewardLamports > b.rewardLamports ? -1 : 1,
  )[0]!;
}
