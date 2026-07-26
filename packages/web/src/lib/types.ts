export type EconomySnapshot = {
  act?: "SURVIVAL" | "PROSPERITY" | "SOCIETY";
  firmMode?: boolean;
  firmUnlockedAtMs?: number;
  societySpawned?: boolean;
  secondPlot?: {
    plotId?: string;
    plotCount?: number;
    tier?: string;
  };
  firm?: {
    parentJobsCompleted?: number;
    childrenHired?: number;
    grossRewardLamports?: string | number;
    paidToWorkersLamports?: string | number;
    marginKeptLamports?: string | number;
    secondPlotPurchased?: boolean;
  };
  population?: {
    count?: number;
    active?: number;
    totalBalanceLamports?: string | number;
    totalTaxesPaidLamports?: string | number;
    totalJobsCompleted?: number;
    citizens?: Array<{
      citizenId?: string;
      balanceLamports?: string | number;
      status?: string;
      jobsCompleted?: number;
      taxesPaidLamports?: string | number;
      plotId?: string;
      stage?: string;
    }>;
  };
};

export type CitizenSnapshot = {
  updatedAtMs?: number;
  chainValid?: { ok: boolean };
  state?: {
    identity?: {
      citizenId?: string;
      mode?: string;
      agentPda?: string;
      authorityWallet?: string;
    };
    balances?: { solLamports?: string | number };
    plot?: {
      plotId?: string;
      plotCount?: number;
      tier?: string;
      effectiveOutput?: number;
      isMock?: boolean;
    };
    obligation?: {
      stage?: string;
      dueAtMs?: number;
      amountLamportsEstimate?: string | number;
      daysPastDue?: number;
    };
    runway?: {
      solvency?: string;
      coverageRatio?: number;
      msUntilDue?: number;
    };
    attempts?: Array<{
      jobId?: string;
      status?: string;
      rewardLamports?: string | number;
      firmMode?: boolean;
      childJobIds?: string[];
      marginLamports?: string | number;
    }>;
    /** Act 2/3 firm + society */
    economy?: EconomySnapshot;
  };
  decisionLog?: {
    entries?: Array<{
      seq: number;
      type: string;
      summary: string;
      atMs: number;
      hash: string;
    }>;
    headHash?: string;
  };
};

export type DiaryEntry = {
  id: string;
  atMs: number;
  kind: string;
  mood: string;
  text: string;
};
