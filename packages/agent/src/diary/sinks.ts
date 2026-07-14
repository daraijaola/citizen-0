/**
 * Diary sinks: console (always), file (Resident Record), Telegram (optional).
 */

import { appendFileSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DiaryEntry, DiarySink } from "./types.js";

export class ConsoleDiarySink implements DiarySink {
  readonly name = "console";
  async post(entry: DiaryEntry): Promise<void> {
    const ts = new Date(entry.atMs).toISOString().slice(11, 19);
    console.log(`  📔 [${ts}] (${entry.mood}) ${entry.text}`);
  }
}

export class FileDiarySink implements DiarySink {
  readonly name = "file";
  constructor(private readonly filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
    if (!existsSync(filePath)) {
      writeFileSync(filePath, "[]\n", "utf8");
    }
  }

  async post(entry: DiaryEntry): Promise<void> {
    // Append-friendly JSONL + maintain a JSON array snapshot for the web UI
    const jsonl = this.filePath.replace(/\.json$/i, ".jsonl");
    appendFileSync(jsonl, JSON.stringify(entry) + "\n", "utf8");

    let arr: DiaryEntry[] = [];
    try {
      if (existsSync(this.filePath)) {
        arr = JSON.parse(readFileSync(this.filePath, "utf8")) as DiaryEntry[];
      }
    } catch {
      arr = [];
    }
    arr.push(entry);
    // Keep last 200 for the public page
    if (arr.length > 200) arr = arr.slice(-200);
    writeFileSync(this.filePath, JSON.stringify(arr, null, 2), "utf8");
  }
}

/**
 * Telegram Bot API sink — no extra deps.
 * Requires TELEGRAM_BOT_TOKEN + chat id.
 */
export class TelegramDiarySink implements DiarySink {
  readonly name = "telegram";
  constructor(
    private readonly token: string,
    private readonly chatId: string,
    private readonly label = "DIARY",
  ) {}

  async post(entry: DiaryEntry): Promise<void> {
    const text = [
      `*CITIZEN-0 · ${this.label}*`,
      `_${entry.mood}_ · \`${entry.kind}\``,
      "",
      escapeMd(entry.text),
    ].join("\n");

    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Fallback plain text if markdown fails
      if (res.status === 400) {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: this.chatId,
            text: `CITIZEN-0 [${entry.mood}] ${entry.text}`,
          }),
          signal: AbortSignal.timeout(12_000),
        });
        return;
      }
      throw new Error(`Telegram ${res.status}: ${body.slice(0, 200)}`);
    }
  }
}

function escapeMd(s: string): string {
  return s.replace(/([_*`\[])/g, "\\$1");
}

export class MultiDiarySink implements DiarySink {
  readonly name = "multi";
  constructor(private readonly sinks: DiarySink[]) {}

  async post(entry: DiaryEntry): Promise<void> {
    const results = await Promise.allSettled(
      this.sinks.map((s) => s.post(entry)),
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      if (r.status === "rejected") {
        console.error(
          `[diary] sink ${this.sinks[i]!.name} failed:`,
          r.reason instanceof Error ? r.reason.message : r.reason,
        );
      }
    }
  }
}

export function createDiarySink(dataDir: string): DiarySink {
  const sinks: DiarySink[] = [
    new ConsoleDiarySink(),
    new FileDiarySink(join(dataDir, "diary.json")),
  ];

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const diaryChat = process.env.TELEGRAM_DIARY_CHAT_ID;
  if (token && diaryChat) {
    sinks.push(new TelegramDiarySink(token, diaryChat, "DIARY"));
  }

  return new MultiDiarySink(sinks);
}

/** Admin channel sink (intent visibility / approvals). */
export function createAdminSink(): DiarySink | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !adminChat) return null;
  return new TelegramDiarySink(token, adminChat, "ADMIN");
}
