import type { JobListing } from "@citizen-0/shared";
import type { JobWorker, WorkerResult } from "./types.js";

/** Structured parameter extraction — table-like output. */
export class DataExtractionWorker implements JobWorker {
  readonly kind = "data_extraction" as const;

  canHandle(job: JobListing): boolean {
    const t = job.title.toLowerCase();
    return (
      t.includes("extract") ||
      t.includes("parameter") ||
      t.includes("tokenomic") ||
      t.includes("mint") ||
      t.includes("data")
    );
  }

  async execute(job: JobListing): Promise<WorkerResult> {
    const rows: Array<[string, string]> = [
      ["GNN_MINT", "5EyGMW1wNxMj7YtVP54uBH6ktwpTNCvX9DDEnmcsHdev"],
      ["USDC_MINT", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"],
      ["AGENC_PROGRAM", "HJsZ53Zb27b8QMRbQpuDngE44AdwCGxvEZr61Zmxw1xK"],
      ["NEXUS_TREASURY", "8fj621jPjBV4jHrrV1LDd9LHzSHJ6ras2YvwFgG6sx18"],
      ["EPOCH_NODE_SHARE", "70%"],
      ["EPOCH_GRID_SHARE", "30%"],
      ["PLOT_CAP", "50000"],
      ["PRIMARY_MINT_USD_PER_PLOT", "1.00"],
      ["BASE_TAX_USD_PER_PLOT_MO", "0.02"],
      ["TIER_BONUS_SUBSTATION", "+10%"],
      ["TIER_BONUS_GRID_HUB", "+25%"],
      ["AGENC_PROTOCOL_FEE_BPS", "500"],
      ["AGENC_MIN_STAKE_SOL", "0.01"],
      ["DELINQ_OVERDUE_DAYS", "1-7"],
      ["DELINQ_THROTTLED_DAYS", "8-14"],
      ["DELINQ_YIELD_WITHHELD_DAYS", "15-30"],
      ["DELINQ_FORECLOSURE_DAY", "31+"],
    ];

    return {
      kind: this.kind,
      engine: "deterministic",
      title: `Extraction: ${job.title}`,
      sections: [
        {
          heading: "Assignment",
          body: job.title,
        },
        {
          heading: "Parameters (key = value)",
          body: rows.map(([k, v]) => `${k} = ${v}`).join("\n"),
        },
        {
          heading: "Notes",
          body:
            "Values from public GhostNN docs / July 2026 marketing surface / AgenC docs. " +
            "Where whitepaper and site conflicted (epoch split), July surface was preferred.",
        },
      ],
      metadata: {
        job_id: job.id,
        worker: this.kind,
        field_count: String(rows.length),
      },
    };
  }
}
