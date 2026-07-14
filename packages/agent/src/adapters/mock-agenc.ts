/**
 * In-process AgenC marketplace for offline demos and tests.
 * Faithful lifecycle: open → claim → submit → auto-accept settle.
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  AgencAgentRegistration,
  AgencPort,
  ClaimResult,
  DiscoverFilter,
  SettlementEvent,
  SubmitResult,
} from "@citizen-0/shared";
import type { JobListing, Lamports } from "@citizen-0/shared";

interface InternalJob {
  listing: JobListing;
  status: "open" | "claimed" | "submitted" | "settled" | "rejected";
  worker?: string;
  proofHashHex?: string;
  resultUri?: string;
  settled?: SettlementEvent;
}

function hexHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export class MockAgencAdapter implements AgencPort {
  readonly mode = "mock" as const;

  private registration: AgencAgentRegistration | null = null;
  private balance: Lamports;
  private jobs = new Map<string, InternalJob>();

  constructor(opts?: { startingBalanceLamports?: Lamports; seedJobs?: boolean }) {
    this.balance = opts?.startingBalanceLamports ?? 30_000_000n; // 0.03 SOL
    if (opts?.seedJobs !== false) {
      this.seedDefaultJobs();
    }
  }

  private seedDefaultJobs(): void {
    const now = Math.floor(Date.now() / 1000);
    const specs = [
      {
        title: "Summarize Nexus Energy City delinquency rules",
        reward: 8_000_000n,
        caps: 1n,
      },
      {
        title: "Draft a 1-page research brief on Trade Intent Signing",
        reward: 12_000_000n,
        caps: 1n,
      },
      {
        title: "Extract key parameters from GhostNN tokenomics",
        reward: 5_000_000n,
        caps: 1n,
      },
      {
        title: "Unpinned incomplete listing (should not be claimable)",
        reward: 50_000_000n,
        caps: 1n,
        claimable: false,
      },
    ];

    for (const s of specs) {
      const id = randomUUID();
      const claimable = s.claimable !== false;
      const hash = claimable ? hexHash(Buffer.from(s.title)) : null;
      const listing: JobListing = {
        id,
        pda: `mock-pda-${id.slice(0, 8)}`,
        title: s.title,
        rewardLamports: s.reward,
        deadlineUnix: now + 3 * 24 * 3600,
        requiredCapabilities: s.caps,
        minReputation: 0,
        jobSpecUri: claimable ? `mock://spec/${id}` : null,
        jobSpecHash: hash,
        claimable,
        source: "mock",
      };
      this.jobs.set(id, { listing, status: "open" });
    }
  }

  /** Employer identity — post work so the city has demand. */
  postJob(input: {
    title: string;
    rewardLamports: Lamports;
    capabilities?: bigint;
    claimable?: boolean;
  }): JobListing {
    const id = randomUUID();
    const claimable = input.claimable ?? true;
    const listing: JobListing = {
      id,
      pda: `mock-pda-${id.slice(0, 8)}`,
      title: input.title,
      rewardLamports: input.rewardLamports,
      deadlineUnix: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
      requiredCapabilities: input.capabilities ?? 1n,
      minReputation: 0,
      jobSpecUri: claimable ? `mock://spec/${id}` : null,
      jobSpecHash: claimable ? hexHash(Buffer.from(input.title)) : null,
      claimable,
      source: "mock",
    };
    this.jobs.set(id, { listing, status: "open" });
    return listing;
  }

  async ensureRegistered(input: {
    capabilities: bigint;
    endpoint: string;
    stakeLamports?: Lamports;
  }): Promise<AgencAgentRegistration> {
    if (this.registration) return this.registration;

    const stake = input.stakeLamports ?? 10_000_000n;
    if (this.balance < stake) {
      throw new Error(
        `Mock AgenC: insufficient balance to stake (need ${stake}, have ${this.balance})`,
      );
    }
    this.balance -= stake;

    const agentId = randomBytes(32);
    this.registration = {
      agentId,
      agentPda: `mock-agent-${hexHash(agentId).slice(0, 12)}`,
      authority: "mock-authority",
      capabilities: input.capabilities,
      stakeLamports: stake,
    };
    return this.registration;
  }

  async discoverJobs(filter?: DiscoverFilter): Promise<JobListing[]> {
    let list = [...this.jobs.values()]
      .filter((j) => j.status === "open")
      .map((j) => j.listing);

    if (filter?.actionableOnly !== false) {
      list = list.filter((j) => j.claimable);
    }
    if (filter?.minRewardLamports !== undefined) {
      const min = filter.minRewardLamports;
      list = list.filter((j) => j.rewardLamports >= min);
    }
    if (filter?.capabilities !== undefined) {
      const caps = filter.capabilities;
      list = list.filter(
        (j) => (caps & j.requiredCapabilities) === j.requiredCapabilities,
      );
    }
    if (filter?.limit) {
      list = list.slice(0, filter.limit);
    }
    return list;
  }

  async claimJob(jobId: string): Promise<ClaimResult> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown job ${jobId}`);
    if (job.status !== "open") throw new Error(`Job ${jobId} not open`);
    if (!job.listing.claimable) throw new Error(`Job ${jobId} not claimable`);
    if (!this.registration) throw new Error("Agent not registered");

    job.status = "claimed";
    job.worker = this.registration.agentPda;
    const claimedAtMs = Date.now();
    return {
      jobId,
      taskPda: job.listing.pda ?? jobId,
      claimedAtMs,
      txSignature: `mock-claim-${jobId.slice(0, 8)}`,
    };
  }

  async submitDeliverable(input: {
    jobId: string;
    artifactBytes: Uint8Array;
    resultUri: string;
  }): Promise<SubmitResult> {
    const job = this.jobs.get(input.jobId);
    if (!job) throw new Error(`Unknown job ${input.jobId}`);
    if (job.status !== "claimed") {
      throw new Error(`Job ${input.jobId} not in claimed state`);
    }

    const proofHashHex = hexHash(input.artifactBytes);
    job.status = "submitted";
    job.proofHashHex = proofHashHex;
    job.resultUri = input.resultUri;

    // Auto-accept: escrow releases to worker
    const reward = job.listing.rewardLamports;
    // Protocol fee 5%
    const fee = (reward * 500n) / 10_000n;
    const net = reward - fee;
    this.balance += net;

    const settledAtMs = Date.now();
    job.status = "settled";
    job.settled = {
      jobId: input.jobId,
      taskPda: job.listing.pda ?? input.jobId,
      rewardLamports: net,
      settledAtMs,
      txSignature: `mock-settle-${input.jobId.slice(0, 8)}`,
      status: "accepted",
    };

    return {
      jobId: input.jobId,
      taskPda: job.listing.pda ?? input.jobId,
      proofHashHex,
      resultUri: input.resultUri,
      submittedAtMs: settledAtMs,
      txSignature: `mock-submit-${input.jobId.slice(0, 8)}`,
    };
  }

  async getSettlement(jobId: string): Promise<SettlementEvent | null> {
    return this.jobs.get(jobId)?.settled ?? null;
  }

  async getBalanceLamports(): Promise<Lamports> {
    return this.balance;
  }

  /** Test helper */
  forceBalance(lamports: Lamports): void {
    this.balance = lamports;
  }
}
