import type { JobListing } from "@citizen-0/shared";

export type JobKind =
  | "research_brief"
  | "summarization"
  | "data_extraction"
  | "content"
  | "general";

export interface WorkerResult {
  kind: JobKind;
  engine: "deterministic" | "llm";
  title: string;
  sections: Array<{ heading: string; body: string }>;
  metadata: Record<string, string>;
}

export interface Deliverable {
  mimeType: string;
  body: string;
  bytes: Uint8Array;
  sha256Hex: string;
  resultUri: string;
  kind: JobKind;
  engine: "deterministic" | "llm";
  qaScore: number;
}

export interface JobWorker {
  readonly kind: JobKind;
  canHandle(job: JobListing): boolean;
  execute(job: JobListing): Promise<WorkerResult>;
}

export function classifyJob(job: JobListing): JobKind {
  const t = `${job.title} ${job.jobSpecUri ?? ""}`.toLowerCase();
  if (
    t.includes("research") ||
    t.includes("brief") ||
    t.includes("whitepaper") ||
    t.includes("analyze")
  ) {
    return "research_brief";
  }
  if (
    t.includes("summar") ||
    t.includes("tldr") ||
    t.includes("overview") ||
    t.includes("delinquency")
  ) {
    return "summarization";
  }
  if (
    t.includes("extract") ||
    t.includes("parameter") ||
    t.includes("tokenomic") ||
    t.includes("data") ||
    t.includes("mint")
  ) {
    return "data_extraction";
  }
  if (
    t.includes("content") ||
    t.includes("write") ||
    t.includes("draft") ||
    t.includes("copy") ||
    t.includes("post")
  ) {
    return "content";
  }
  return "general";
}
