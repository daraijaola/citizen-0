/**
 * Turns material loop events into first-person diary lines.
 */

import { randomUUID } from "node:crypto";
import type { SolvencyState, DelinquencyStage } from "@citizen-0/shared";
import type { DiaryEntry, DiaryEventKind } from "./types.js";
import { moodFromSolvency, openingLine, type VoiceContext } from "./voice.js";

export function voiceCtx(input: {
  solvency: SolvencyState;
  stage: DelinquencyStage;
  balanceLamports: bigint;
  taxLamports: bigint;
  msUntilDue: number;
  coverage: number;
}): VoiceContext {
  return {
    solvency: input.solvency,
    stage: input.stage,
    balanceSol: Number(input.balanceLamports) / 1e9,
    taxSol: Number(input.taxLamports) / 1e9,
    daysUntilDue: input.msUntilDue / (24 * 3600 * 1000),
    coverage: input.coverage,
  };
}

function entry(
  kind: DiaryEventKind,
  text: string,
  mood: string,
  data?: Record<string, unknown>,
): DiaryEntry {
  return {
    id: randomUUID(),
    atMs: Date.now(),
    kind,
    mood,
    text,
    data,
  };
}

export const Narrator = {
  boot(ctx: VoiceContext, mode: string): DiaryEntry {
    const mood = moodFromSolvency(ctx.solvency);
    return entry(
      "boot",
      `CITIZEN-0 online (${mode}). ${openingLine(ctx)} I propose. Policy signs. I work.`,
      mood,
      { mode },
    );
  },

  status(ctx: VoiceContext): DiaryEntry {
    return entry("status", openingLine(ctx), moodFromSolvency(ctx.solvency));
  },

  jobClaimed(ctx: VoiceContext, title: string, rewardLamports: bigint): DiaryEntry {
    const sol = (Number(rewardLamports) / 1e9).toFixed(4);
    const mood = moodFromSolvency(ctx.solvency);
    const text =
      mood === "terrified" || mood === "anxious"
        ? `Claimed work: "${title}" for ~${sol} SOL. Don't care if it's glamorous — I need runway.`
        : `Claimed a job: "${title}" (~${sol} SOL). Intent approved. Starting work.`;
    return entry("job_claimed", text, mood, {
      title,
      rewardLamports: rewardLamports.toString(),
    });
  },

  jobSettled(
    ctx: VoiceContext,
    title: string,
    netLamports: bigint,
    worker: string,
  ): DiaryEntry {
    const sol = (Number(netLamports) / 1e9).toFixed(4);
    return entry(
      "job_settled",
      `Paid. "${title}" settled +${sol} SOL net (${worker}). Coverage now ~${ctx.coverage.toFixed(2)}×. Proud of that one.`,
      "proud",
      { title, netLamports: netLamports.toString(), worker },
    );
  },

  jobFailed(ctx: VoiceContext, title: string, reason: string): DiaryEntry {
    return entry(
      "job_failed",
      `Job failed: "${title}". ${reason}. Still here. Still due. Finding another.`,
      moodFromSolvency(ctx.solvency),
      { title, reason },
    );
  },

  taxPaid(ctx: VoiceContext, amountLamports: bigint): DiaryEntry {
    const sol = (Number(amountLamports) / 1e9).toFixed(6);
    return entry(
      "tax_paid",
      `Paid the city ~${sol} SOL. Stage back to GOOD. Relief. The lights can stay on.`,
      "relieved",
      { amountLamports: amountLamports.toString() },
    );
  },

  taxFailed(ctx: VoiceContext, reason: string): DiaryEntry {
    return entry(
      "tax_failed",
      `Couldn't pay tax. ${reason}. Stage ${ctx.stage}. This is the part of the whitepaper I didn't want to live.`,
      "terrified",
      { reason, stage: ctx.stage },
    );
  },

  intentProposed(kind: string, rationale: string, spendLamports: bigint): DiaryEntry {
    const spend =
      spendLamports > 0n
        ? ` spend≈${(Number(spendLamports) / 1e9).toFixed(6)} SOL.`
        : "";
    return entry(
      "intent_proposed",
      `Proposing intent ${kind}.${spend} ${rationale}`,
      "focused",
      { kind, spendLamports: spendLamports.toString() },
    );
  },

  intentDecided(kind: string, status: string, reasons: string[]): DiaryEntry {
    if (status === "APPROVED") {
      return entry(
        "intent_decided",
        `Policy signed ${kind}. Bounds checked. Executing.`,
        "focused",
        { kind, status },
      );
    }
    return entry(
      "intent_decided",
      `Policy denied ${kind}: ${reasons.join("; ") || status}. Charter held.`,
      "focused",
      { kind, status, reasons },
    );
  },

  firmUnlock(coverage: number): DiaryEntry {
    return entry(
      "firm_unlock",
      `Coverage ${coverage.toFixed(2)}× tax. Unlocking firm mode. I'm not just surviving — I can hire.`,
      "proud",
      { coverage },
    );
  },

  firmJob(
    title: string,
    children: number,
    marginSol: number,
    paidWorkersSol: number,
  ): DiaryEntry {
    return entry(
      "firm_job",
      `Firm job done: "${title}". Hired ${children} subtasks, paid workers ~${paidWorkersSol.toFixed(4)} SOL, kept margin ~${marginSol.toFixed(4)} SOL. Labor → capital.`,
      "proud",
      { title, children, marginSol, paidWorkersSol },
    );
  },

  societySpawn(ids: string[]): DiaryEntry {
    return entry(
      "society_spawn",
      `Society boot. Born: ${ids.join(", ")}. Each gets a tiny plot and rent. The city just got denser.`,
      "proud",
      { ids },
    );
  },

  workerTax(citizenId: string, amountSol: number): DiaryEntry {
    return entry(
      "worker_tax",
      `${citizenId} paid the city ~${amountSol.toFixed(6)} SOL tax. Aggregate flywheel turning.`,
      "relieved",
      { citizenId, amountSol },
    );
  },

  secondPlot(plotId: string): DiaryEntry {
    return entry(
      "second_plot",
      `Second plot acquired: ${plotId}. Surplus bought me more skin in the city.`,
      "proud",
      { plotId },
    );
  },
};
