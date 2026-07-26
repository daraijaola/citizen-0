/**
 * Mock plot registry + tax clock using whitepaper parameters.
 */

import {
  applyTaxPayment,
  buildObligation,
  canPayTax,
  createPlot,
  refreshObligation,
  type AgentBalances,
  type PlotPort,
  type PlotRegistryEntry,
  type TaxObligation,
  type TaxPaymentResult,
  type UnixMs,
} from "@citizen-0/shared";

export class MockPlotAdapter implements PlotPort {
  readonly mode = "mock" as const;

  private plot: PlotRegistryEntry;
  private obligation: TaxObligation;
  private solLamports: bigint;

  constructor(opts?: {
    plotId?: string;
    plotCount?: number;
    dueInDays?: number;
    startingBalanceLamports?: bigint;
  }) {
    const plotCount = opts?.plotCount ?? 10;
    this.plot = createPlot(opts?.plotId ?? "CITIZEN-0-PLOT-001", plotCount, {
      isMock: true,
    });
    const dueInDays = opts?.dueInDays ?? 6;
    const dueAtMs = Date.now() + dueInDays * 24 * 60 * 60 * 1000;
    this.obligation = buildObligation(this.plot, dueAtMs, Date.now());
    this.solLamports = opts?.startingBalanceLamports ?? 30_000_000n;
  }

  async getPlot(): Promise<PlotRegistryEntry> {
    return this.plot;
  }

  async getObligation(nowMs: UnixMs = Date.now()): Promise<TaxObligation> {
    this.obligation = refreshObligation(this.obligation, nowMs);
    return this.obligation;
  }

  async refresh(nowMs: UnixMs = Date.now()): Promise<TaxObligation> {
    return this.getObligation(nowMs);
  }

  async payTax(): Promise<TaxPaymentResult> {
    const now = Date.now();
    this.obligation = refreshObligation(this.obligation, now);

    if (!canPayTax(this.solLamports, this.obligation)) {
      return {
        ok: false,
        paidAtMs: now,
        amountLamports: this.obligation.amountLamportsEstimate,
        error: `Insufficient balance: have ${this.solLamports}, need ${this.obligation.amountLamportsEstimate}`,
      };
    }

    const amount = this.obligation.amountLamportsEstimate;
    this.solLamports -= amount;
    this.obligation = applyTaxPayment(this.obligation, now);

    return {
      ok: true,
      paidAtMs: now,
      amountLamports: amount,
      txSignature: `mock-tax-${now}`,
      obligationAfter: this.obligation,
    };
  }

  async getBalances(): Promise<AgentBalances> {
    return {
      solLamports: this.solLamports,
      updatedAtMs: Date.now(),
    };
  }

  async creditLamports(amount: bigint, _reason: string): Promise<void> {
    this.solLamports += amount;
  }

  async debitLamports(amount: bigint, _reason: string): Promise<void> {
    if (this.solLamports < amount) {
      throw new Error(
        `Mock plot: insufficient balance to debit ${amount} (have ${this.solLamports})`,
      );
    }
    this.solLamports -= amount;
  }

  /** Sync balance from AgenC adapter after settlement (mock world). */
  setBalance(lamports: bigint): void {
    this.solLamports = lamports;
  }

  /** Act 2: second plot registry entry (narrated ownership). */
  addSecondPlot(plot: PlotRegistryEntry): void {
    // kept for API symmetry; primary plot remains canonical for tax
    void plot;
  }
}
