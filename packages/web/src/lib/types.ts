export type CitizenSnapshot = {
  updatedAtMs?: number;
  chainValid?: { ok: boolean };
  state?: {
    identity?: { citizenId?: string; mode?: string; agentPda?: string };
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
    }>;
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
