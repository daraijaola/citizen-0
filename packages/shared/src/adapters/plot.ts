/**
 * Plot / tax payment port — Energy City obligations.
 * Live path may use Nexus wallet bridge (buyParcel, sendGnnPayment);
 * mock path runs the whitepaper state machine faithfully.
 */

import type {
  AgentBalances,
  PlotRegistryEntry,
  TaxObligation,
  UnixMs,
} from "../domain/types.js";

export interface TaxPaymentResult {
  ok: boolean;
  paidAtMs: UnixMs;
  amountLamports: bigint;
  txSignature?: string;
  error?: string;
  obligationAfter?: TaxObligation;
}

export interface PlotPort {
  readonly mode: "mock" | "live";

  getPlot(): Promise<PlotRegistryEntry>;

  getObligation(nowMs?: UnixMs): Promise<TaxObligation>;

  /** Refresh stage from clock. */
  refresh(nowMs?: UnixMs): Promise<TaxObligation>;

  /**
   * Pay the city. Mock debits internal ledger; live would send GNN/USDC
   * via Nexus payment bridge after intent approval.
   */
  payTax(): Promise<TaxPaymentResult>;

  getBalances(): Promise<AgentBalances>;

  /** Credit balance (mock settlement / faucet). Live no-ops or throws. */
  creditLamports?(amount: bigint, reason: string): Promise<void>;

  /** Debit balance (wages, seed capital). Mock only unless wired. */
  debitLamports?(amount: bigint, reason: string): Promise<void>;
}
