/**
 * Energy City tax / delinquency engine.
 * Pure domain logic — no IO. Mirrors published whitepaper parameters.
 *
 * Delinquency (whitepaper):
 *   Days 1–7   OVERDUE
 *   Days 8–14  THROTTLED
 *   Days 15–30 YIELD_WITHHELD
 *   Day 31+    FORECLOSURE_ELIGIBLE
 *   After auction RECLAIMED (external event)
 *
 * Maintenance example: base $0.02/plot × tier bonus.
 */

import type {
  DelinquencyStage,
  Lamports,
  MicroUsd,
  PlotRegistryEntry,
  PlotTier,
  RunwaySnapshot,
  SolvencyState,
  TaxObligation,
  UnixMs,
} from "./types.js";

/** Whitepaper defaults (USD). Stored as micro-USD. */
export const TAX_DEFAULTS = {
  /** $0.02 per plot base rate. */
  baseRateMicroUsdPerPlot: 20_000n, // 0.02 * 1e6
  tierBonusBps: {
    GENERATOR: 0, // +0%
    SUBSTATION: 1000, // +10%
    GRID_HUB: 2500, // +25%
  } as const satisfies Record<PlotTier, number>,
  tierMultipliers: {
    GENERATOR: 1.0,
    SUBSTATION: 1.5,
    GRID_HUB: 2.25,
  } as const satisfies Record<PlotTier, number>,
  stageDayBounds: {
    OVERDUE: { min: 1, max: 7 },
    THROTTLED: { min: 8, max: 14 },
    YIELD_WITHHELD: { min: 15, max: 30 },
    FORECLOSURE_ELIGIBLE: { min: 31, max: Number.POSITIVE_INFINITY },
  },
  /** Mock SOL/USD for runway when no oracle (dev only). */
  mockSolUsdMicro: 150_000_000n, // $150
} as const;

export function tierFromPlotCount(plotCount: number): PlotTier {
  if (plotCount >= 501) return "GRID_HUB";
  if (plotCount >= 100) return "SUBSTATION";
  return "GENERATOR";
}

export function effectiveOutput(plotCount: number, tier: PlotTier): number {
  return plotCount * TAX_DEFAULTS.tierMultipliers[tier];
}

export function createPlot(
  plotId: string,
  plotCount: number,
  opts?: { isMock?: boolean; mintAddress?: string; ownerWallet?: string },
): PlotRegistryEntry {
  const tier = tierFromPlotCount(plotCount);
  return {
    plotId,
    plotCount,
    tier,
    effectiveOutput: effectiveOutput(plotCount, tier),
    isMock: opts?.isMock ?? true,
    mintAddress: opts?.mintAddress,
    ownerWallet: opts?.ownerWallet,
  };
}

/**
 * Monthly maintenance in micro-USD.
 * tax = plotCount × baseRate × (1 + tierBonus)
 */
export function monthlyTaxMicroUsd(plot: PlotRegistryEntry): MicroUsd {
  const base = BigInt(plot.plotCount) * TAX_DEFAULTS.baseRateMicroUsdPerPlot;
  const bps = TAX_DEFAULTS.tierBonusBps[plot.tier];
  return base + (base * BigInt(bps)) / 10_000n;
}

/** Rough lamports estimate for runway (mock oracle). */
export function microUsdToLamportsEstimate(
  microUsd: MicroUsd,
  solUsdMicro: bigint = TAX_DEFAULTS.mockSolUsdMicro,
): Lamports {
  if (solUsdMicro <= 0n) return 0n;
  // lamports = (microUsd / solUsdMicro) * 1e9
  return (microUsd * 1_000_000_000n) / solUsdMicro;
}

export function daysPastDue(dueAtMs: UnixMs, nowMs: UnixMs): number {
  if (nowMs <= dueAtMs) return 0;
  return Math.floor((nowMs - dueAtMs) / (24 * 60 * 60 * 1000));
}

export function stageFromDaysPastDue(days: number): DelinquencyStage {
  if (days <= 0) return "GOOD";
  if (days <= 7) return "OVERDUE";
  if (days <= 14) return "THROTTLED";
  if (days <= 30) return "YIELD_WITHHELD";
  return "FORECLOSURE_ELIGIBLE";
}

export function buildObligation(
  plot: PlotRegistryEntry,
  dueAtMs: UnixMs,
  nowMs: UnixMs,
  amountMicroUsd?: MicroUsd,
): TaxObligation {
  const amount = amountMicroUsd ?? monthlyTaxMicroUsd(plot);
  const days = daysPastDue(dueAtMs, nowMs);
  return {
    plotId: plot.plotId,
    dueAtMs,
    amountMicroUsd: amount,
    amountLamportsEstimate: microUsdToLamportsEstimate(amount),
    stage: stageFromDaysPastDue(days),
    daysPastDue: days,
  };
}

/**
 * Solvency from coverage of next obligation.
 * DESPERATE if due within 2 days and coverage < 1.
 * DELINQUENT if stage is past GOOD.
 */
export function deriveSolvency(
  balanceLamports: Lamports,
  obligation: TaxObligation,
  nowMs: UnixMs,
): SolvencyState {
  if (obligation.stage !== "GOOD") return "DELINQUENT";

  const need = obligation.amountLamportsEstimate;
  const coverage =
    need === 0n ? Number.POSITIVE_INFINITY : Number(balanceLamports) / Number(need);
  const msUntil = obligation.dueAtMs - nowMs;
  const twoDays = 2 * 24 * 60 * 60 * 1000;

  if (coverage >= 3) return "COMFORTABLE";
  if (coverage >= 1 && msUntil > twoDays) return "TIGHT";
  if (coverage < 1 || msUntil <= twoDays) return "DESPERATE";
  return "TIGHT";
}

export function computeRunway(
  balanceLamports: Lamports,
  obligation: TaxObligation,
  nowMs: UnixMs,
): RunwaySnapshot {
  const need = obligation.amountLamportsEstimate;
  const coverage =
    need === 0n ? Number.POSITIVE_INFINITY : Number(balanceLamports) / Number(need);

  return {
    balanceLamports,
    nextObligationLamports: need,
    dueAtMs: obligation.dueAtMs,
    coverageRatio: coverage,
    msUntilDue: obligation.dueAtMs - nowMs,
    solvency: deriveSolvency(balanceLamports, obligation, nowMs),
    stage: obligation.stage,
  };
}

/** Advance obligation stage purely from clock (call each tick). */
export function refreshObligation(
  obligation: TaxObligation,
  nowMs: UnixMs,
): TaxObligation {
  const days = daysPastDue(obligation.dueAtMs, nowMs);
  return {
    ...obligation,
    daysPastDue: days,
    stage: stageFromDaysPastDue(days),
  };
}

/**
 * Apply a successful tax payment: reset due date by one month, clear delinquency.
 */
export function applyTaxPayment(
  obligation: TaxObligation,
  paidAtMs: UnixMs,
  periodMs: number = 30 * 24 * 60 * 60 * 1000,
): TaxObligation {
  return {
    ...obligation,
    dueAtMs: paidAtMs + periodMs,
    stage: "GOOD",
    daysPastDue: 0,
  };
}

export function canPayTax(
  balanceLamports: Lamports,
  obligation: TaxObligation,
): boolean {
  return balanceLamports >= obligation.amountLamportsEstimate;
}
