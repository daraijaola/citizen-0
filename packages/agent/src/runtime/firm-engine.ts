/**
 * Act 2 firm engine — decompose, subcontract, hire, assemble, margin.
 * Works against AgencPort (+ postJob). Mock-complete; live when SDK wires post/claim.
 */

import {
  decomposeJob,
  isLargeJob,
  type FirmPnL,
  type JobListing,
  type SubtaskSpec,
  emptyFirmPnL,
  AGENC_MAINNET,
} from "@citizen-0/shared";
import type { AgencPort } from "@citizen-0/shared";
import type { DecisionLog } from "@citizen-0/shared";
import { produceDeliverablePipeline } from "../workers/pipeline.js";
import type { WorkerCitizen } from "@citizen-0/shared";

export interface FirmJobResult {
  parentJobId: string;
  childJobIds: string[];
  parentRewardLamports: bigint;
  paidToWorkersLamports: bigint;
  marginLamports: bigint;
  proofHashHex: string;
  resultUri: string;
}

export async function runFirmJob(input: {
  job: JobListing;
  agenc: AgencPort;
  log: DecisionLog;
  workers: WorkerCitizen[];
  /** Credit worker citizen wallet (society). */
  onWorkerPay: (citizenId: string, lamports: bigint) => void;
  /** Debit parent ledger when wages leave (mock double-entry). */
  onDebitParent?: (lamports: bigint, reason: string) => void | Promise<void>;
}): Promise<FirmJobResult> {
  const { job, agenc, log, workers, onWorkerPay, onDebitParent } = input;
  if (!isLargeJob(job) && !job.firmEligible) {
    throw new Error("runFirmJob requires large/firm-eligible job");
  }
  if (!agenc.postJob) {
    throw new Error("AgencPort.postJob not available");
  }

  const plan = decomposeJob(job, Math.min(3, Math.max(2, workers.length || 2)));
  log.append({
    type: "FIRM_JOB",
    atMs: Date.now(),
    summary: `Firm decompose ${job.id} → ${plan.subtasks.length} subtasks margin=${plan.parentMarginLamports}`,
    data: {
      parentJobId: job.id,
      subtasks: plan.subtasks.map((s) => ({
        title: s.title,
        reward: s.rewardLamports.toString(),
      })),
      parentMargin: plan.parentMarginLamports.toString(),
    },
  });

  // Claim parent
  await agenc.claimJob(job.id);

  // Post children (escrow funded from parent balance when mock supports it)
  const childIds: string[] = [];
  const posted: Array<{ spec: SubtaskSpec; listing: JobListing }> = [];
  for (const spec of plan.subtasks) {
    // Children funded from parent job escrow (virtual) — no pre-debit of living balance
    const listing = await agenc.postJob({
      title: spec.title,
      rewardLamports: spec.rewardLamports,
      capabilities: 1n,
      parentJobId: job.id,
      escrowFromBalance: false,
    });
    childIds.push(listing.id);
    posted.push({ spec, listing });
    log.append({
      type: "SUBCONTRACT",
      atMs: Date.now(),
      summary: `Posted child ${listing.id} reward=${spec.rewardLamports}`,
      data: {
        childId: listing.id,
        parentId: job.id,
        reward: spec.rewardLamports.toString(),
      },
    });
  }

  // Hire workers: each child claimed+worked by a worker citizen (round-robin)
  let paidToWorkers = 0n;
  for (let i = 0; i < posted.length; i++) {
    const { listing } = posted[i]!;
    const worker = workers[i % Math.max(workers.length, 1)];
    // Claim as parent firm still holds registration — mock uses same agent
    await agenc.claimJob(listing.id);
    const childJob: JobListing = { ...listing, title: listing.title };
    const pipeline = await produceDeliverablePipeline(childJob);
    const sub = await agenc.submitDeliverable({
      jobId: listing.id,
      artifactBytes: pipeline.deliverable.bytes,
      resultUri: pipeline.deliverable.resultUri,
    });
    // Child settlement hits parent agenc balance in mock → transfer wage to worker
    const settle = await agenc.getSettlement(listing.id);
    const wage = settle?.rewardLamports ?? listing.rewardLamports;
    if (worker) {
      await onDebitParent?.(wage, `wage:${listing.id}:${worker.citizenId}`);
      onWorkerPay(worker.citizenId, wage);
    }
    paidToWorkers += wage;
    log.append({
      type: "SUBCONTRACT",
      atMs: Date.now(),
      summary: `Child settled ${listing.id} wage=${wage} → ${worker?.citizenId ?? "pool"}`,
      data: {
        childId: listing.id,
        wage: wage.toString(),
        worker: worker?.citizenId,
        proof: sub.proofHashHex,
      },
    });
  }

  // Assemble parent deliverable + submit
  const assembled = await produceDeliverablePipeline({
    ...job,
    title: `[FIRM ASSEMBLED] ${job.title}`,
  });
  const parentSubmit = await agenc.submitDeliverable({
    jobId: job.id,
    artifactBytes: assembled.deliverable.bytes,
    resultUri: assembled.deliverable.resultUri,
  });
  const parentSettle = await agenc.getSettlement(job.id);
  const parentReward = parentSettle?.rewardLamports ?? job.rewardLamports;

  // Margin narrative: parent reward net of wages already paid from escrow path
  // Children were escrowed from balance pre-pay; parent full settle credits balance.
  const margin = plan.parentMarginLamports;

  return {
    parentJobId: job.id,
    childJobIds: childIds,
    parentRewardLamports: parentReward,
    paidToWorkersLamports: paidToWorkers,
    marginLamports: margin,
    proofHashHex: parentSubmit.proofHashHex,
    resultUri: parentSubmit.resultUri,
  };
}

export { emptyFirmPnL };
export type { FirmPnL };
