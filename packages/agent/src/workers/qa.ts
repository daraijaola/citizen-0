/**
 * Self-QA gate — must pass before SUBMIT_DELIVERABLE intent is proposed.
 * Payment flow is the product; we still refuse empty / broken artifacts.
 */

import type { WorkerResult } from "./types.js";
import type { JobListing } from "@citizen-0/shared";

export interface QaReport {
  ok: boolean;
  score: number; // 0..1
  checks: Array<{ name: string; pass: boolean; detail: string }>;
}

const MIN_BODY_CHARS = 180;
const MIN_SCORE = 0.6;

export function runSelfQa(job: JobListing, result: WorkerResult): QaReport {
  const checks: QaReport["checks"] = [];
  const full = result.sections.map((s) => s.body).join("\n");
  const text = full.toLowerCase();
  const titleWords = job.title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3)
    .slice(0, 8);

  checks.push({
    name: "non_empty_sections",
    pass: result.sections.length >= 2,
    detail: `${result.sections.length} sections`,
  });

  checks.push({
    name: "min_length",
    pass: full.length >= MIN_BODY_CHARS,
    detail: `${full.length} chars (min ${MIN_BODY_CHARS})`,
  });

  checks.push({
    name: "has_headings",
    pass: result.sections.every((s) => s.heading.trim().length > 0),
    detail: "all sections headed",
  });

  const overlap = titleWords.filter((w) => text.includes(w)).length;
  const overlapOk = titleWords.length === 0 || overlap >= Math.min(1, titleWords.length);
  checks.push({
    name: "topic_overlap",
    pass: overlapOk,
    detail: `${overlap}/${titleWords.length} title tokens present`,
  });

  checks.push({
    name: "no_placeholder_spam",
    pass: !text.includes("lorem ipsum") && !text.includes("todo:"),
    detail: "no lorem/todo markers",
  });

  checks.push({
    name: "metadata_job_id",
    pass: result.metadata.job_id === job.id || result.metadata.job_id !== undefined,
    detail: `job_id=${result.metadata.job_id ?? "missing"}`,
  });

  // Soft quality: knowledge-ish signal for ecosystem jobs
  const ecosystemHit =
    text.includes("nexus") ||
    text.includes("agenc") ||
    text.includes("gnn") ||
    text.includes("solana") ||
    text.includes("delinq") ||
    text.includes("intent");
  checks.push({
    name: "ecosystem_signal",
    pass: ecosystemHit,
    detail: ecosystemHit ? "domain terms present" : "generic output",
  });

  const passed = checks.filter((c) => c.pass).length;
  const score = passed / checks.length;
  const hardFails = checks.filter(
    (c) =>
      !c.pass &&
      (c.name === "non_empty_sections" ||
        c.name === "min_length" ||
        c.name === "no_placeholder_spam"),
  );

  return {
    ok: hardFails.length === 0 && score >= MIN_SCORE,
    score,
    checks,
  };
}
