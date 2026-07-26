/**
 * Core domain types for CITIZEN-0.
 * Money amounts use integer minor units where possible to avoid float bugs.
 * SOL balances: lamports (1 SOL = 1_000_000_000).
 * USD tax quotes: micro-USD (1 USD = 1_000_000) for fixed-point math.
 */

export type Lamports = bigint;
export type MicroUsd = bigint;
export type UnixMs = number;

/** Runtime mode — mock never touches mainnet; live uses real AgenC/Solana. */
export type RuntimeMode = "mock" | "live";

/**
 * Solvency posture drives job selectivity and spend appetite.
 * Derived purely from runway (balance vs next obligation).
 */
export type SolvencyState =
  | "COMFORTABLE"
  | "TIGHT"
  | "DESPERATE"
  | "DELINQUENT";

/**
 * Nexus Energy City delinquency ladder (whitepaper, progressive).
 * GOOD is our extension for "current".
 */
export type DelinquencyStage =
  | "GOOD"
  | "OVERDUE"
  | "THROTTLED"
  | "YIELD_WITHHELD"
  | "FORECLOSURE_ELIGIBLE"
  | "RECLAIMED";

export const DELINQUENCY_ORDER: readonly DelinquencyStage[] = [
  "GOOD",
  "OVERDUE",
  "THROTTLED",
  "YIELD_WITHHELD",
  "FORECLOSURE_ELIGIBLE",
  "RECLAIMED",
] as const;

/** Energy City infrastructure tiers by plot count. */
export type PlotTier = "GENERATOR" | "SUBSTATION" | "GRID_HUB";

export interface PlotRegistryEntry {
  plotId: string;
  /** Rectangular plot count (size of parcel in plots). */
  plotCount: number;
  tier: PlotTier;
  /** Effective output = plotCount × tier multiplier (whitepaper). */
  effectiveOutput: number;
  mintAddress?: string;
  /** When true, tax clock is adapter-mocked; still runs faithful stages. */
  isMock: boolean;
  ownerWallet?: string;
}

export interface TaxObligation {
  plotId: string;
  /** Next payment due (unix ms). */
  dueAtMs: UnixMs;
  /** Quoted monthly maintenance in micro-USD. */
  amountMicroUsd: MicroUsd;
  /** Optional SOL estimate for display/runway (oracle-fed or fixed mock rate). */
  amountLamportsEstimate: Lamports;
  stage: DelinquencyStage;
  /** Days past due (0 if not overdue). */
  daysPastDue: number;
}

export interface AgentBalances {
  solLamports: Lamports;
  gnnRaw?: bigint;
  usdcRaw?: bigint;
  updatedAtMs: UnixMs;
}

export interface RunwaySnapshot {
  balanceLamports: Lamports;
  nextObligationLamports: Lamports;
  dueAtMs: UnixMs;
  /** How many obligations we can cover at current balance (0 if broke). */
  coverageRatio: number;
  /** Milliseconds until due (negative if overdue). */
  msUntilDue: number;
  solvency: SolvencyState;
  stage: DelinquencyStage;
}

/** Job as seen by the agent (adapter-normalized). */
export interface JobListing {
  id: string;
  pda?: string;
  title: string;
  rewardLamports: Lamports;
  deadlineUnix: number;
  requiredCapabilities: bigint;
  minReputation: number;
  jobSpecUri: string | null;
  jobSpecHash: string | null;
  claimable: boolean;
  source: "agenc" | "mock";
  /** Act 2: parent job id if this is a child subcontract. */
  parentJobId?: string;
  /** Act 2: true when job is large enough for firm decomposition. */
  firmEligible?: boolean;
  raw?: unknown;
}

export type JobStatus =
  | "discovered"
  | "scoring"
  | "claimed"
  | "working"
  | "submitted"
  | "settled"
  | "rejected"
  | "failed"
  | "declined";

export interface JobAttempt {
  jobId: string;
  status: JobStatus;
  score?: number;
  claimedAtMs?: UnixMs;
  submittedAtMs?: UnixMs;
  settledAtMs?: UnixMs;
  rewardLamports?: Lamports;
  artifactSha256?: string;
  resultUri?: string;
  error?: string;
  /** Act 2 firm job */
  firmMode?: boolean;
  childJobIds?: string[];
  marginLamports?: Lamports;
  paidToWorkersLamports?: Lamports;
}

/** Capability bitmask: AgenC uses 1n = COMPUTE, 2n = GENERAL. */
export const CAPABILITY = {
  COMPUTE: 1n,
  GENERAL: 2n,
  /** Worker default — claim both COMPUTE and GENERAL mainnet jobs. */
  ALL: 3n,
} as const;

export interface CitizenIdentity {
  citizenId: string;
  displayName: string;
  agentPda?: string;
  authorityWallet?: string;
  mode: RuntimeMode;
  createdAtMs: UnixMs;
}

/** Act 2/3 economy snapshot for FE + diary. */
export interface EconomySnapshot {
  act: "SURVIVAL" | "PROSPERITY" | "SOCIETY";
  firmMode: boolean;
  firmUnlockedAtMs?: UnixMs;
  societySpawned: boolean;
  secondPlot?: PlotRegistryEntry;
  firm: {
    parentJobsCompleted: number;
    childrenHired: number;
    grossRewardLamports: string;
    paidToWorkersLamports: string;
    marginKeptLamports: string;
    secondPlotPurchased: boolean;
  };
  population: {
    count: number;
    active: number;
    totalBalanceLamports: string;
    totalTaxesPaidLamports: string;
    totalJobsCompleted: number;
    citizens: Array<{
      citizenId: string;
      balanceLamports: string;
      status: string;
      jobsCompleted: number;
      taxesPaidLamports: string;
      plotId: string;
      stage: string;
    }>;
  };
}

export interface CitizenState {
  identity: CitizenIdentity;
  balances: AgentBalances;
  plot: PlotRegistryEntry;
  obligation: TaxObligation;
  runway: RunwaySnapshot;
  openJobs: JobListing[];
  attempts: JobAttempt[];
  lastTickAtMs: UnixMs;
  tickCount: number;
  /** Act 2/3 */
  economy?: EconomySnapshot;
}
