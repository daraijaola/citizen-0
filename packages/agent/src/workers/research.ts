import type { JobListing } from "@citizen-0/shared";
import type { JobWorker, WorkerResult } from "./types.js";
import { pickKnowledge } from "./knowledge.js";

export class ResearchBriefWorker implements JobWorker {
  readonly kind = "research_brief" as const;

  canHandle(job: JobListing): boolean {
    const t = job.title.toLowerCase();
    return (
      t.includes("research") ||
      t.includes("brief") ||
      t.includes("whitepaper") ||
      t.includes("analyze")
    );
  }

  async execute(job: JobListing): Promise<WorkerResult> {
    const facts = pickKnowledge(job.title);
    return {
      kind: this.kind,
      engine: "deterministic",
      title: `Research brief: ${job.title}`,
      sections: [
        {
          heading: "Question / assignment",
          body: job.title,
        },
        {
          heading: "Background",
          body:
            "Nexus City ties virtual land obligations to real GPU compute funding. " +
            "CITIZEN-0 studies the public docs (Energy City whitepaper, AgenC mainnet surface, GhostNN intent model) " +
            "to produce operator-grade notes judges can audit.",
        },
        {
          heading: "Findings",
          body: facts.map((f, i) => `${i + 1}. ${f}`).join("\n"),
        },
        {
          heading: "Implications for an autonomous resident",
          body:
            "A resident must treat tax as a hard clock, labor as AgenC SOL escrow work, " +
            "and every spend as an intent under a separate policy signer. " +
            "Breadth of understanding beats feature spam.",
        },
        {
          heading: "Sources (public)",
          body: [
            "docs.ghostnn.ai/whitepapers/nexus-energy-city",
            "docs.ghostnn.ai/whitepapers/nexus-network",
            "agenc.ag/docs + api.agenc.ag",
            "ghostnn.ai/llms-full.txt",
          ].join("\n"),
        },
      ],
      metadata: {
        job_id: job.id,
        job_spec_hash: job.jobSpecHash ?? "none",
        worker: this.kind,
      },
    };
  }
}
