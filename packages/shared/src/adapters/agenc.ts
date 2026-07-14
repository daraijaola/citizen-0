/**
 * AgenC port — the only surface the agent uses to talk to the marketplace.
 *
 * LIVE: @tetsuo-ai/marketplace-sdk against Solana mainnet
 *   program HJsZ53Zb27b8QMRbQpuDngE44AdwCGxvEZr61Zmxw1xK
 * MOCK: in-process marketplace for offline demos and tests
 *
 * Settlement is SOL escrow + creator review (not GNN/x402 primary).
 */

import type { JobListing, Lamports } from "../domain/types.js";

export interface AgencAgentRegistration {
  agentId: Uint8Array;
  agentPda: string;
  authority: string;
  capabilities: bigint;
  stakeLamports: Lamports;
}

export interface ClaimResult {
  jobId: string;
  taskPda: string;
  claimedAtMs: number;
  txSignature?: string;
}

export interface SubmitResult {
  jobId: string;
  taskPda: string;
  proofHashHex: string;
  resultUri: string;
  submittedAtMs: number;
  txSignature?: string;
}

export interface SettlementEvent {
  jobId: string;
  taskPda: string;
  rewardLamports: Lamports;
  settledAtMs: number;
  txSignature?: string;
  status: "accepted" | "rejected" | "cancelled";
}

export interface DiscoverFilter {
  minRewardLamports?: Lamports;
  capabilities?: bigint;
  actionableOnly?: boolean;
  limit?: number;
}

/**
 * Port interface — swap MockAgencAdapter ↔ LiveAgencAdapter with one binding.
 */
export interface AgencPort {
  readonly mode: "mock" | "live";

  /** Ensure agent is registered (idempotent). */
  ensureRegistered(input: {
    capabilities: bigint;
    endpoint: string;
    stakeLamports?: Lamports;
  }): Promise<AgencAgentRegistration>;

  /** Discover open jobs (normalized). */
  discoverJobs(filter?: DiscoverFilter): Promise<JobListing[]>;

  /** Claim a job after policy approval. */
  claimJob(jobId: string): Promise<ClaimResult>;

  /**
   * Submit deliverable: on-chain proof hash (sha256 of artifact bytes)
   * + result URI (≤64 bytes on AgenC).
   */
  submitDeliverable(input: {
    jobId: string;
    artifactBytes: Uint8Array;
    resultUri: string;
  }): Promise<SubmitResult>;

  /** Poll settlement for a claimed/submitted job (mock auto-settles). */
  getSettlement(jobId: string): Promise<SettlementEvent | null>;

  /** Best-effort balance of the worker authority wallet in lamports. */
  getBalanceLamports(): Promise<Lamports>;
}

/** AgenC mainnet constants (Phase 0 ground truth). */
export const AGENC_MAINNET = {
  programId: "HJsZ53Zb27b8QMRbQpuDngE44AdwCGxvEZr61Zmxw1xK",
  readApi: "https://api.agenc.ag",
  minAgentStakeLamports: 10_000_000n, // 0.01 SOL
  protocolFeeBps: 500,
} as const;
