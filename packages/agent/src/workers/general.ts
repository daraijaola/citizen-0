import type { JobListing } from "@citizen-0/shared";
import type { JobWorker, WorkerResult } from "./types.js";
import { pickKnowledge } from "./knowledge.js";

export class GeneralWorker implements JobWorker {
  readonly kind = "general" as const;

  canHandle(_job: JobListing): boolean {
    return true;
  }

  async execute(job: JobListing): Promise<WorkerResult> {
    const facts = pickKnowledge(job.title).slice(0, 5);
    return {
      kind: this.kind,
      engine: "deterministic",
      title: `Deliverable: ${job.title}`,
      sections: [
        {
          heading: "Task",
          body: job.title,
        },
        {
          heading: "Response",
          body:
            `Completed by CITIZEN-0 for reward ${job.rewardLamports.toString()} lamports.\n\n` +
            facts.map((f, i) => `${i + 1}. ${f}`).join("\n"),
        },
      ],
      metadata: {
        job_id: job.id,
        worker: this.kind,
        source: job.source,
      },
    };
  }
}
