/**
 * Live AgenC adapter — mainnet register / discover / claim / submit.
 *
 * LIVE_MUTATIONS=1  → real on-chain txs (stake, claim, submit)
 * LIVE_MUTATIONS=0  → real balance + discover only (mutations throw)
 *
 * Settlement after submit waits for creator accept / auto-accept —
 * getSettlement polls task status; payout hits authority wallet on accept.
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import {
  createMarketplaceClient,
  facade,
  fetchMaybeProtocolConfig,
  fetchMaybeTask,
  findProtocolConfigPda,
  findTaskJobSpecPda,
  fetchMaybeTaskJobSpec,
  waitForTaskStatus,
  TaskStatus,
  type MarketplaceClient,
} from "@tetsuo-ai/marketplace-sdk";
// Note: updateAgent available via client if we need to expand capabilities later
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
import { loadKeypairFromPath } from "./wallet.js";

export interface LiveAgencConfig {
  rpcUrl: string;
  walletPath: string;
  readApi?: string;
  /** When false, claim/register/submit throw (discover+balance only). */
  mockMutations?: boolean;
  /** Persist agentId here (default DATA_DIR/agenc-agent.json). */
  registrationPath?: string;
}

export class LiveAgencNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveAgencNotConfiguredError";
  }
}

interface PersistedAgent {
  agentIdHex: string;
  agentPda: string;
  authority: string;
  stakeLamports: string;
  registeredAtMs: number;
  registerTx?: string;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(b: Uint8Array): string {
  return Buffer.from(b).toString("hex");
}

function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export class LiveAgencAdapter implements AgencPort {
  readonly mode = "live" as const;

  private readonly readApi: string;
  private readonly rpcUrl: string;
  private readonly walletPath: string;
  private readonly allowMutations: boolean;
  private readonly registrationPath: string;

  private signer!: TransactionSigner;
  private secretKey!: Uint8Array;
  private client: MarketplaceClient | null = null;
  private agentId: Uint8Array | null = null;
  private agentPda: string | null = null;
  private registration: AgencAgentRegistration | null = null;
  private ready = false;

  /** jobId (task pda) → last claim/submit meta */
  private claims = new Map<
    string,
    { claimedAtMs: number; claimTx?: string; submitTx?: string; reward?: bigint }
  >();

  constructor(config: LiveAgencConfig) {
    if (!config.walletPath || config.walletPath === "UNSET") {
      throw new LiveAgencNotConfiguredError("AGENT_WALLET_PATH required");
    }
    this.rpcUrl = config.rpcUrl;
    this.walletPath = config.walletPath;
    this.readApi = config.readApi ?? AGENC_MAINNET.readApi;
    // mockMutations true  → old hybrid (no on-chain writes)
    // mockMutations false → LIVE_MUTATIONS=1 real path
    this.allowMutations = config.mockMutations === false;
    this.registrationPath =
      config.registrationPath ??
      join(process.env.DATA_DIR ?? "./data", "agenc-agent.json");
  }

  get authorityPubkey(): string {
    return String(this.signer?.address ?? "");
  }

  private async init(): Promise<void> {
    if (this.ready) return;
    const kp = loadKeypairFromPath(this.walletPath);
    this.secretKey = kp.secretKey;
    this.signer = await createKeyPairSignerFromBytes(this.secretKey);
    if (this.allowMutations) {
      this.client = createMarketplaceClient({
        rpcUrl: this.rpcUrl,
        signer: this.signer,
      });
    }
    this.loadPersistedRegistration();
    this.ready = true;
  }

  private loadPersistedRegistration(): void {
    try {
      if (!existsSync(this.registrationPath)) return;
      const p = JSON.parse(
        readFileSync(this.registrationPath, "utf8"),
      ) as PersistedAgent;
      if (!p.agentIdHex || p.authority !== String(this.signer.address)) return;
      this.agentId = hexToBytes(p.agentIdHex);
      this.agentPda = p.agentPda;
      this.registration = {
        agentId: this.agentId,
        agentPda: p.agentPda,
        authority: p.authority,
        capabilities: 1n,
        stakeLamports: BigInt(p.stakeLamports),
      };
    } catch {
      /* ignore corrupt file */
    }
  }

  private persistRegistration(extra?: { registerTx?: string }): void {
    if (!this.agentId || !this.agentPda || !this.registration) return;
    mkdirSync(dirname(this.registrationPath), { recursive: true });
    const body: PersistedAgent = {
      agentIdHex: bytesToHex(this.agentId),
      agentPda: this.agentPda,
      authority: this.registration.authority,
      stakeLamports: this.registration.stakeLamports.toString(),
      registeredAtMs: Date.now(),
      registerTx: extra?.registerTx,
    };
    writeFileSync(this.registrationPath, JSON.stringify(body, null, 2), "utf8");
  }

  async ensureRegistered(input: {
    capabilities: bigint;
    endpoint: string;
    stakeLamports?: Lamports;
  }): Promise<AgencAgentRegistration> {
    await this.init();
    if (this.registration && this.agentPda) {
      // Expand capabilities on-chain if caller wants a broader mask
      const want = input.capabilities === 0n ? 3n : input.capabilities;
      if (
        this.allowMutations &&
        this.client &&
        (this.registration.capabilities & want) !== want
      ) {
        try {
          const ix = await facade.updateAgent({
            agent: this.agentPda as Address,
            authority: this.signer,
            capabilities: want,
            endpoint: input.endpoint.slice(0, 128),
          });
          await this.client.send([ix]);
          this.registration = {
            ...this.registration,
            capabilities: want,
          };
          this.persistRegistration();
          console.log(
            `[live-agenc] capabilities updated → ${want} for ${this.agentPda}`,
          );
        } catch (err) {
          console.warn(
            "[live-agenc] updateAgent failed:",
            err instanceof Error ? err.message : err,
          );
        }
      }
      return this.registration;
    }

    if (!this.allowMutations || !this.client) {
      throw new LiveAgencNotConfiguredError(
        "Set LIVE_MUTATIONS=1 to register on mainnet (stakes ~0.01 SOL)",
      );
    }

    const rpc = createSolanaRpc(this.rpcUrl);
    const [protocolConfigPda] = await findProtocolConfigPda();
    const protocolConfig = await fetchMaybeProtocolConfig(rpc, protocolConfigPda);
    if (!protocolConfig.exists) {
      throw new Error("ProtocolConfig not found on cluster");
    }
    const minStake = protocolConfig.data.minAgentStake as bigint;
    const stake = input.stakeLamports ?? minStake;
    if (stake < minStake) {
      throw new Error(
        `Stake ${stake} < protocol min ${minStake}. Need ≥ 0.01 SOL stake + rent (~0.021 total).`,
      );
    }

    const bal = await this.getBalanceLamports();
    // stake + ~0.005 rent + fee buffer
    const need = stake + 6_000_000n;
    if (bal < need) {
      throw new Error(
        `Wallet ${this.authorityPubkey} has ${bal} lamports; need ~${need} (stake+rent). Fund more SOL.`,
      );
    }

    const agentId = randomBytes(32);
    const result = await this.client.registerAgent({
      authority: this.signer,
      agentId,
      capabilities: input.capabilities === 0n ? 1n : input.capabilities,
      endpoint: input.endpoint.slice(0, 128),
      metadataUri: null,
      stakeAmount: stake,
    });

    const [workerAgent] = await facade.findAgentPda({ agentId });
    this.agentId = agentId;
    this.agentPda = String(workerAgent);
    this.registration = {
      agentId,
      agentPda: this.agentPda,
      authority: this.authorityPubkey,
      capabilities: input.capabilities === 0n ? 1n : input.capabilities,
      stakeLamports: stake,
    };
    this.persistRegistration({
      registerTx: result?.signature ? String(result.signature) : undefined,
    });
    return this.registration;
  }

  async discoverJobs(filter?: DiscoverFilter): Promise<JobListing[]> {
    await this.init();
    // Prefer hosted API (works without gPA); only claimable publicly
    const params = new URLSearchParams();
    params.set("status", "open");
    if (filter?.actionableOnly !== false) params.set("actionable", "1");
    params.set("pageSize", String(filter?.limit ?? 24));

    const url = `${this.readApi}/api/tasks?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`AgenC read API ${res.status}: ${url}`);

    const body = (await res.json()) as {
      items?: Array<{
        pda: string;
        title: string;
        rewardLamports: string | number;
        deadlineUnix: number;
        requiredCapabilities: string | number;
        minReputation: number;
        jobSpecUri: string | null;
        jobSpecHash: string | null;
        actionability?: { claimablePublicly?: boolean };
      }>;
    };

    let jobs: JobListing[] = (body.items ?? []).map((t) => ({
      id: t.pda,
      pda: t.pda,
      title: t.title || t.pda.slice(0, 16),
      rewardLamports: BigInt(t.rewardLamports),
      deadlineUnix: t.deadlineUnix,
      requiredCapabilities: BigInt(t.requiredCapabilities),
      minReputation: t.minReputation ?? 0,
      jobSpecUri: t.jobSpecUri,
      jobSpecHash: t.jobSpecHash,
      claimable: t.actionability?.claimablePublicly ?? Boolean(t.jobSpecHash),
      source: "agenc" as const,
      raw: t,
    }));

    // Live: take any claimable job ≥ 0.001 SOL (mainnet rewards are small)
    const min =
      filter?.minRewardLamports !== undefined
        ? this.allowMutations
          ? minBig(filter.minRewardLamports, 1_000_000n)
          : filter.minRewardLamports
        : this.allowMutations
          ? 1_000_000n
          : 0n;
    if (min > 0n) {
      jobs = jobs.filter((j) => j.rewardLamports >= min);
    }
    // Prefer on-chain registered mask so we never score jobs we cannot claim
    const caps =
      this.registration?.capabilities ??
      (filter?.capabilities !== undefined ? filter.capabilities | 3n : 3n);
    jobs = jobs.filter(
      (j) => (caps & j.requiredCapabilities) === j.requiredCapabilities,
    );
    // Live path: only jobs we can actually claim (spec pinned)
    if (this.allowMutations) {
      jobs = jobs.filter((j) => j.claimable && j.jobSpecHash);
    }
    return jobs;
  }

  async claimJob(jobId: string): Promise<ClaimResult> {
    await this.init();
    if (!this.allowMutations || !this.client) {
      throw new LiveAgencNotConfiguredError("LIVE_MUTATIONS=1 required to claim");
    }
    if (!this.agentPda || !this.agentId) {
      throw new Error("Agent not registered — call ensureRegistered first");
    }

    // Optional: verify job spec hash before claim
    try {
      const rpc = createSolanaRpc(this.rpcUrl);
      const task = jobId as Address;
      const [taskJobSpecPda] = await findTaskJobSpecPda({ task });
      const jobSpecAccount = await fetchMaybeTaskJobSpec(rpc, taskJobSpecPda);
      if (!jobSpecAccount.exists) {
        throw new Error(`Task ${jobId} has no pinned job spec — not claimable`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("no pinned")) throw err;
      // continue — claim may still succeed if API said claimable
    }

    const result = await this.client.claimTaskWithJobSpec({
      task: jobId as Address,
      worker: this.agentPda as Address,
      authority: this.signer,
    });

    const claimedAtMs = Date.now();
    const txSignature = result?.signature
      ? String(result.signature)
      : `live-claim-${jobId.slice(0, 8)}`;
    this.claims.set(jobId, { claimedAtMs, claimTx: txSignature });

    return {
      jobId,
      taskPda: jobId,
      claimedAtMs,
      txSignature,
    };
  }

  async submitDeliverable(input: {
    jobId: string;
    artifactBytes: Uint8Array;
    resultUri: string;
  }): Promise<SubmitResult> {
    await this.init();
    if (!this.allowMutations || !this.client) {
      throw new LiveAgencNotConfiguredError("LIVE_MUTATIONS=1 required to submit");
    }
    if (!this.agentPda) throw new Error("Agent not registered");

    const proofHash = new Uint8Array(
      createHash("sha256").update(input.artifactBytes).digest(),
    );
    // resultData ≤ 64 bytes on-chain
    let pointer = input.resultUri;
    if (pointer.length > 64) {
      pointer = `sha256:${bytesToHex(proofHash).slice(0, 40)}`;
    }
    const resultData = new TextEncoder().encode(pointer);

    const result = await this.client.submitTaskResult({
      task: input.jobId as Address,
      worker: this.agentPda as Address,
      authority: this.signer,
      proofHash,
      resultData,
    });

    const submittedAtMs = Date.now();
    const txSignature = result?.signature
      ? String(result.signature)
      : `live-submit-${input.jobId.slice(0, 8)}`;
    const prev = this.claims.get(input.jobId) ?? {
      claimedAtMs: submittedAtMs,
    };
    this.claims.set(input.jobId, { ...prev, submitTx: txSignature });

    return {
      jobId: input.jobId,
      taskPda: input.jobId,
      proofHashHex: bytesToHex(proofHash),
      resultUri: pointer,
      submittedAtMs,
      txSignature,
    };
  }

  async getSettlement(jobId: string): Promise<SettlementEvent | null> {
    await this.init();
    const meta = this.claims.get(jobId);
    try {
      const rpc = createSolanaRpc(this.rpcUrl);
      // Wait briefly for auto-accept / accept (max ~45s so tick doesn't hang forever)
      try {
        await waitForTaskStatus(
          rpc,
          jobId as Address,
          TaskStatus.Completed,
          { timeoutMs: 45_000 },
        );
      } catch {
        // still pending review — check current status
        const task = await fetchMaybeTask(rpc, jobId as Address);
        if (!task.exists) return null;
        const status = task.data.status;
        // Completed enum value — if wait timed out, not settled yet
        if (status !== TaskStatus.Completed) {
          return {
            jobId,
            taskPda: jobId,
            rewardLamports: 0n,
            settledAtMs: Date.now(),
            txSignature: meta?.submitTx ?? "",
            status: "pending",
          } as SettlementEvent;
        }
      }

      // Completed — reward is on-chain; we don't always decode escrow easily.
      // Report accepted; balance sync will pick up SOL via getBalanceLamports.
      return {
        jobId,
        taskPda: jobId,
        rewardLamports: 0n, // actual SOL lands in wallet; avoid double-credit
        settledAtMs: Date.now(),
        txSignature: meta?.submitTx ?? meta?.claimTx ?? "",
        status: "accepted",
      };
    } catch {
      return null;
    }
  }

  async getBalanceLamports(): Promise<Lamports> {
    await this.init();
    // Use web3 Connection for simple balance (kit RPC shape varies)
    const { Connection, PublicKey } = await import("@solana/web3.js");
    const conn = new Connection(this.rpcUrl, "confirmed");
    const bal = await conn.getBalance(
      new PublicKey(String(this.signer.address)),
      "confirmed",
    );
    return BigInt(bal);
  }
}

export function createLiveAgencFromEnv(): LiveAgencAdapter {
  const walletPath = process.env.AGENT_WALLET_PATH ?? "";
  const rpcUrl =
    process.env.AGENC_RPC_URL ??
    process.env.SOLANA_RPC_URL ??
    "https://api.mainnet-beta.solana.com";
  return new LiveAgencAdapter({
    rpcUrl,
    walletPath: walletPath || "UNSET",
    mockMutations: process.env.LIVE_MUTATIONS !== "1",
  });
}
