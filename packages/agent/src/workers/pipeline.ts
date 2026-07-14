/**
 * Execution plane pipeline:
 * classify → specialized worker → optional LLM enhance → self-QA → package deliverable
 */

import { createHash } from "node:crypto";
import type { JobListing } from "@citizen-0/shared";
import type { Deliverable, JobKind, JobWorker, WorkerResult } from "./types.js";
import { classifyJob } from "./types.js";
import { ResearchBriefWorker } from "./research.js";
import { SummarizationWorker } from "./summary.js";
import { DataExtractionWorker } from "./extract.js";
import { ContentWorker } from "./content.js";
import { GeneralWorker } from "./general.js";
import { runSelfQa, type QaReport } from "./qa.js";
import { tryLlmEnhance } from "./llm.js";
import { CitizenError } from "../runtime/errors.js";

export interface PipelineOutput {
  deliverable: Deliverable;
  qa: QaReport;
  kind: JobKind;
  engine: "deterministic" | "llm";
}

const WORKERS: JobWorker[] = [
  new ResearchBriefWorker(),
  new SummarizationWorker(),
  new DataExtractionWorker(),
  new ContentWorker(),
  new GeneralWorker(),
];

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function renderMarkdown(job: JobListing, result: WorkerResult, qa: QaReport): string {
  const now = new Date().toISOString();
  const parts = [
    `# CITIZEN-0 Deliverable`,
    ``,
    `job_id: ${job.id}`,
    `title: ${job.title}`,
    `source: ${job.source}`,
    `worker: ${result.kind}`,
    `engine: ${result.engine}`,
    `qa_score: ${qa.score.toFixed(3)}`,
    `reward_lamports: ${job.rewardLamports.toString()}`,
    `produced_at: ${now}`,
    `job_spec_uri: ${job.jobSpecUri ?? "none"}`,
    `job_spec_hash: ${job.jobSpecHash ?? "none"}`,
    ``,
    `## Work product — ${result.title}`,
    ``,
  ];

  for (const section of result.sections) {
    parts.push(`### ${section.heading}`, ``, section.body, ``);
  }

  parts.push(
    `## Self-QA`,
    ``,
    ...qa.checks.map((c) => `- [${c.pass ? "x" : " "}] ${c.name}: ${c.detail}`),
    ``,
    `## Attestation`,
    ``,
    `- Artifact is content-addressed (sha-256 of this file).`,
    `- On-chain submission pins the hash; creator verifies bytes.`,
    `- Worker does not hold unilateral spend authority.`,
    ``,
  );

  return parts.join("\n");
}

export function selectWorker(job: JobListing): JobWorker {
  const kind = classifyJob(job);
  const specialized = WORKERS.find((w) => w.kind === kind && w.canHandle(job));
  if (specialized) return specialized;
  const any = WORKERS.find((w) => w.canHandle(job));
  return any ?? WORKERS[WORKERS.length - 1]!;
}

export async function produceDeliverablePipeline(
  job: JobListing,
): Promise<PipelineOutput> {
  const worker = selectWorker(job);
  let result = await worker.execute(job);

  const enhanced = await tryLlmEnhance(job, result);
  if (enhanced) result = enhanced;

  const qa = runSelfQa(job, result);
  if (!qa.ok) {
    throw new CitizenError(
      "QA_FAILED",
      `QA failed score=${qa.score.toFixed(2)}: ${qa.checks
        .filter((c) => !c.pass)
        .map((c) => c.name)
        .join(", ")}`,
      "PERMANENT",
    );
  }

  const body = renderMarkdown(job, result, qa);
  const bytes = new TextEncoder().encode(body);
  const hash = sha256Hex(bytes);
  const resultUri = `c0://${hash.slice(0, 40)}`;

  return {
    kind: result.kind,
    engine: result.engine,
    qa,
    deliverable: {
      mimeType: "text/markdown",
      body,
      bytes,
      sha256Hex: hash,
      resultUri,
      kind: result.kind,
      engine: result.engine,
      qaScore: qa.score,
    },
  };
}

/** Back-compat sync-ish wrapper used by older imports. */
export async function produceDeliverable(job: JobListing): Promise<Deliverable> {
  const out = await produceDeliverablePipeline(job);
  return out.deliverable;
}
