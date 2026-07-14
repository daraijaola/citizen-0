import { DecisionLog, type RuntimeMode } from "@citizen-0/shared";
import { join } from "node:path";
import { MockAgencAdapter } from "./adapters/mock-agenc.js";
import { MockPlotAdapter } from "./adapters/mock-plot.js";
import { LiveAgencAdapter } from "./adapters/live-agenc.js";
import { LocalPolicySigner } from "./runtime/policy-signer.js";
import { SurvivalLoop } from "./runtime/survival-loop.js";
import { DiaryService } from "./diary/service.js";
import { createAdminGate } from "./runtime/admin-gate.js";

export interface BootstrapOptions {
  mode?: RuntimeMode;
  startingBalanceLamports?: bigint;
  dueInDays?: number;
  plotCount?: number;
  dataDir?: string;
  /** Disable diary (tests). Default true. */
  diary?: boolean;
}

export function resolveDataDir(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  const cwd = process.cwd();
  if (cwd.endsWith("packages\\agent") || cwd.endsWith("packages/agent")) {
    return join(cwd, "..", "..", "data");
  }
  return join(cwd, "data");
}

export function bootstrapCitizen(opts: BootstrapOptions = {}) {
  const mode: RuntimeMode =
    opts.mode ??
    ((process.env.CITIZEN_MODE as RuntimeMode | undefined) || "mock");

  const starting =
    opts.startingBalanceLamports ??
    BigInt(
      process.env.STARTING_BALANCE_SOL
        ? Number(process.env.STARTING_BALANCE_SOL) * 1e9
        : 30_000_000,
    );

  const dueInDays = opts.dueInDays ?? Number(process.env.TAX_DUE_IN_DAYS ?? 6);
  const plotCount = opts.plotCount ?? Number(process.env.PLOT_SIZE ?? 10);
  const dataDir = resolveDataDir(opts.dataDir);

  const log = new DecisionLog();
  const signer = new LocalPolicySigner();
  const diaryEnabled = opts.diary !== false;
  const diary = diaryEnabled
    ? new DiaryService({ dataDir, log })
    : undefined;
  const adminGate = createAdminGate();

  const plot = new MockPlotAdapter({
    plotId: process.env.PLOT_ID ?? "CITIZEN-0-PLOT-001",
    plotCount,
    dueInDays,
    startingBalanceLamports: starting,
  });

  let agenc;
  if (mode === "live") {
    const walletPath = process.env.AGENT_WALLET_PATH ?? "";
    const rpcUrl =
      process.env.AGENC_RPC_URL ??
      process.env.SOLANA_RPC_URL ??
      "https://api.mainnet-beta.solana.com";
    agenc = new LiveAgencAdapter({
      rpcUrl,
      walletPath: walletPath || "UNSET",
    });
  } else {
    agenc = new MockAgencAdapter({
      startingBalanceLamports: starting,
      seedJobs: true,
    });
  }

  const loop = new SurvivalLoop({
    mode,
    agenc,
    plot,
    signer,
    log,
    diary,
    adminGate,
  });

  return { loop, log, signer, agenc, plot, mode, diary, dataDir };
}
