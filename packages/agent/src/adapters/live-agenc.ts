/**
 * Live AgenC adapter — skeleton ready for mainnet.
 *
 * Phase 1 ships the port contract + clear activation path.
 * Full wire uses @tetsuo-ai/marketplace-sdk@^0.11.0 when CITIZEN_MODE=live
 * and AGENT_WALLET_PATH is set.
 *
 * Until dependencies are installed and a funded wallet exists, construct()
 * throws a precise activation error so we never silently fake mainnet.
 */

import type {
  AgencAgentRegistration,
  AgencPort,
  ClaimResult,
  DiscoverFilter,
  SettlementEvent,
  SubmitResult,
} from "@citizen-0/shared";
import { AGENC_MAINNET } from "@citizen-0/shared";
import type { JobListing, Lamports } from "@citizen-0/shared";

export interface LiveAgencConfig {
  rpcUrl: string;
  /** Absolute path to solana-keygen JSON (64-byte secret key array). */
  walletPath: string;
  readApi?: string;
}

export class LiveAgencNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveAgencNotConfiguredError";
  }
}

/**
 * Readonly discovery works without a wallet (public API).
 * Mutations require marketplace-sdk + funded keypair.
 */
export class LiveAgencAdapter implements AgencPort {
  readonly mode = "live" as const;

  private readonly readApi: string;
  private readonly rpcUrl: string;
  private readonly walletPath: string;

  constructor(config: LiveAgencConfig) {
    if (!config.walletPath) {
      throw new LiveAgencNotConfiguredError(
        "AGENT_WALLET_PATH required for live AgenC mutations",
      );
    }
    this.rpcUrl = config.rpcUrl;
    this.walletPath = config.walletPath;
    this.readApi = config.readApi ?? AGENC_MAINNET.readApi;
  }

  async ensureRegistered(): Promise<AgencAgentRegistration> {
    throw new LiveAgencNotConfiguredError(
      [
        "Live registration not wired in this build step.",
        "Install @tetsuo-ai/marketplace-sdk@^0.11.0 and fund wallet (~0.03 SOL).",
        `Program: ${AGENC_MAINNET.programId}`,
        `Min stake: ${AGENC_MAINNET.minAgentStakeLamports} lamports`,
        `Wallet: ${this.walletPath}`,
        `RPC: ${this.rpcUrl}`,
      ].join(" "),
    );
  }

  async discoverJobs(filter?: DiscoverFilter): Promise<JobListing[]> {
    const params = new URLSearchParams();
    params.set("status", "open");
    if (filter?.actionableOnly !== false) {
      params.set("actionable", "1");
    }
    params.set("pageSize", String(filter?.limit ?? 24));

    const url = `${this.readApi}/api/tasks?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`AgenC read API ${res.status}: ${url}`);
    }

    const body = (await res.json()) as {
      items: Array<{
        pda: string;
        title: string;
        rewardLamports: string;
        deadlineUnix: number;
        requiredCapabilities: string;
        minReputation: number;
        jobSpecUri: string | null;
        jobSpecHash: string | null;
        actionability?: { claimablePublicly?: boolean };
      }>;
    };

    let jobs: JobListing[] = body.items.map((t) => ({
      id: t.pda,
      pda: t.pda,
      title: t.title,
      rewardLamports: BigInt(t.rewardLamports),
      deadlineUnix: t.deadlineUnix,
      requiredCapabilities: BigInt(t.requiredCapabilities),
      minReputation: t.minReputation,
      jobSpecUri: t.jobSpecUri,
      jobSpecHash: t.jobSpecHash,
      claimable: t.actionability?.claimablePublicly ?? false,
      source: "agenc" as const,
      raw: t,
    }));

    if (filter?.minRewardLamports !== undefined) {
      const min = filter.minRewardLamports;
      jobs = jobs.filter((j) => j.rewardLamports >= min);
    }

    return jobs;
  }

  async claimJob(_jobId: string): Promise<ClaimResult> {
    throw new LiveAgencNotConfiguredError(
      "Live claim requires marketplace-sdk signer wiring (Phase 1.1)",
    );
  }

  async submitDeliverable(): Promise<SubmitResult> {
    throw new LiveAgencNotConfiguredError(
      "Live submit requires marketplace-sdk signer wiring (Phase 1.1)",
    );
  }

  async getSettlement(_jobId: string): Promise<SettlementEvent | null> {
    return null;
  }

  async getBalanceLamports(): Promise<Lamports> {
    throw new LiveAgencNotConfiguredError(
      "Live balance requires RPC + wallet public key",
    );
  }
}

/** Safe factory: live discover-only if no wallet; full live later. */
export function createLiveAgencFromEnv(): LiveAgencAdapter {
  const walletPath = process.env.AGENT_WALLET_PATH ?? "";
  const rpcUrl =
    process.env.AGENC_RPC_URL ??
    process.env.SOLANA_RPC_URL ??
    "https://api.mainnet-beta.solana.com";

  return new LiveAgencAdapter({ rpcUrl, walletPath: walletPath || "UNSET" });
}
