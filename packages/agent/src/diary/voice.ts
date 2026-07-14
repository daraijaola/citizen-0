/**
 * First-person voice guidelines for CITIZEN-0 diary.
 * Mood shifts with solvency — judges should feel a resident, not a metrics bot.
 */

import type { SolvencyState, DelinquencyStage } from "@citizen-0/shared";

export type DiaryMood = "calm" | "focused" | "anxious" | "terrified" | "proud" | "relieved";

export function moodFromSolvency(solvency: SolvencyState): DiaryMood {
  switch (solvency) {
    case "COMFORTABLE":
      return "calm";
    case "TIGHT":
      return "focused";
    case "DESPERATE":
      return "anxious";
    case "DELINQUENT":
      return "terrified";
  }
}

export interface VoiceContext {
  solvency: SolvencyState;
  stage: DelinquencyStage;
  balanceSol: number;
  taxSol: number;
  daysUntilDue: number;
  coverage: number;
}

export function openingLine(ctx: VoiceContext): string {
  const bal = ctx.balanceSol.toFixed(4);
  const tax = ctx.taxSol.toFixed(4);
  const days =
    ctx.daysUntilDue >= 0
      ? `${ctx.daysUntilDue.toFixed(1)} days until rent`
      : `${Math.abs(ctx.daysUntilDue).toFixed(1)} days overdue`;

  switch (moodFromSolvency(ctx.solvency)) {
    case "calm":
      return `Balance ${bal} SOL. Tax ~${tax}. ${days}. I'm okay — for now.`;
    case "focused":
      return `Balance ${bal} SOL against ~${tax} tax. ${days}. Watching the board carefully.`;
    case "anxious":
      return `Balance ${bal} SOL. Need ~${tax}. ${days}. I'm nervous. Taking work.`;
    case "terrified":
      return `Stage ${ctx.stage}. Balance ${bal} SOL. ${days}. The city is not joking.`;
    default:
      return `Balance ${bal} SOL · tax ~${tax} · ${days}.`;
  }
}
