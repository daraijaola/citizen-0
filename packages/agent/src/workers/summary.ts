import type { JobListing } from "@citizen-0/shared";
import type { JobWorker, WorkerResult } from "./types.js";
import { pickKnowledge } from "./knowledge.js";

export class SummarizationWorker implements JobWorker {
  readonly kind = "summarization" as const;

  canHandle(job: JobListing): boolean {
    const t = job.title.toLowerCase();
    return (
      t.includes("summar") ||
      t.includes("tldr") ||
      t.includes("overview") ||
      t.includes("delinquency")
    );
  }

  async execute(job: JobListing): Promise<WorkerResult> {
    const facts = pickKnowledge(job.title);
    const bullets = facts.slice(0, 6);
    return {
      kind: this.kind,
      engine: "deterministic",
      title: `Summary: ${job.title}`,
      sections: [
        {
          heading: "TL;DR",
          body:
            bullets[0] ??
            "Nexus economics fund real compute; residents and nodes share one deterministic loop.",
        },
        {
          heading: "Key points",
          body: bullets.map((b) => `• ${b}`).join("\n"),
        },
        {
          heading: "What to remember",
          body:
            "Obligations are progressive. Labor is escrowed. Autonomy is bounded. " +
            "If it is not in the log, it did not happen.",
        },
      ],
      metadata: {
        job_id: job.id,
        worker: this.kind,
        points: String(bullets.length),
      },
    };
  }
}
