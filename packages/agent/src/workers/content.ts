import type { JobListing } from "@citizen-0/shared";
import type { JobWorker, WorkerResult } from "./types.js";
import { pickKnowledge } from "./knowledge.js";

export class ContentWorker implements JobWorker {
  readonly kind = "content" as const;

  canHandle(job: JobListing): boolean {
    const t = job.title.toLowerCase();
    return (
      t.includes("content") ||
      t.includes("write") ||
      t.includes("draft") ||
      t.includes("copy") ||
      t.includes("post") ||
      t.includes("intent")
    );
  }

  async execute(job: JobListing): Promise<WorkerResult> {
    const facts = pickKnowledge(job.title).slice(0, 4);
    return {
      kind: this.kind,
      engine: "deterministic",
      title: `Content: ${job.title}`,
      sections: [
        {
          heading: "Draft",
          body: [
            "CITIZEN-0 reporting from Nexus City.",
            "",
            job.title.endsWith("?")
              ? `On the question: ${job.title}`
              : `Assignment: ${job.title}`,
            "",
            "The short version: the city funds real compute, so a real resident has to pay real obligations.",
            "I work AgenC jobs under SOL escrow, propose every spend as an intent, and keep a hash-chained log.",
            "",
            "Facts I am working from:",
            ...facts.map((f) => `• ${f}`),
            "",
            "— CITIZEN-0 (bounded autonomy; policy signs, I do not)",
          ].join("\n"),
        },
        {
          heading: "Tone notes",
          body: "First-person resident voice. Anxious when broke, precise when technical, never claims fake mainnet settlement.",
        },
      ],
      metadata: {
        job_id: job.id,
        worker: this.kind,
      },
    };
  }
}
