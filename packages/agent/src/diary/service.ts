/**
 * Diary service — posts to sinks + decision log.
 */

import type { DecisionLog } from "@citizen-0/shared";
import type { DiaryEntry, DiarySink } from "./types.js";
import { createAdminSink, createDiarySink } from "./sinks.js";

export class DiaryService {
  private readonly publicSink: DiarySink;
  private readonly adminSink: DiarySink | null;
  private readonly log: DecisionLog;

  constructor(opts: { dataDir: string; log: DecisionLog }) {
    this.log = opts.log;
    this.publicSink = createDiarySink(opts.dataDir);
    this.adminSink = createAdminSink();
  }

  get telegramEnabled(): boolean {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_DIARY_CHAT_ID);
  }

  get adminEnabled(): boolean {
    return this.adminSink !== null;
  }

  async write(entry: DiaryEntry): Promise<void> {
    this.log.append({
      type: "DIARY",
      atMs: entry.atMs,
      summary: entry.text.slice(0, 160),
      data: {
        kind: entry.kind,
        mood: entry.mood,
        id: entry.id,
        ...(entry.data ?? {}),
      },
    });
    await this.publicSink.post(entry);
  }

  async admin(entry: DiaryEntry): Promise<void> {
    if (!this.adminSink) return;
    await this.adminSink.post(entry);
  }

  /** Notify admin of an intent (bounded-autonomy theater). */
  async notifyIntent(input: {
    intentId: string;
    kind: string;
    rationale: string;
    spendLamports: bigint;
    status?: string;
  }): Promise<void> {
    const spend = (Number(input.spendLamports) / 1e9).toFixed(6);
    const text = [
      `Intent ${input.status ?? "PROPOSED"}: ${input.kind}`,
      `id: ${input.intentId}`,
      `spend: ${spend} SOL`,
      input.rationale,
      "",
      input.status
        ? `Decision: ${input.status}`
        : "Charter engine evaluates automatically (v1). Telegram approve-gate optional later.",
    ].join("\n");

    await this.admin({
      id: input.intentId,
      atMs: Date.now(),
      kind: "intent_proposed",
      mood: "focused",
      text,
      data: { ...input, spendLamports: input.spendLamports.toString() },
    });
  }
}
