/**
 * Optional human-in-the-loop for high-stakes intents.
 *
 * Default: OFF — local charter auto-approves within limits (demo-friendly).
 * TELEGRAM_ADMIN_GATE=1 + TELEGRAM_BOT_TOKEN + TELEGRAM_ADMIN_CHAT_ID:
 *   posts to admin chat and waits briefly for a reply containing APPROVE/DENY.
 * On timeout → auto-approve if charter already ok (visibility without blocking forever).
 */

export type AdminGateResult = "APPROVED" | "DENIED" | "TIMEOUT_AUTO";

export interface AdminGate {
  review(input: {
    intentId: string;
    kind: string;
    rationale: string;
    spendLamports: bigint;
  }): Promise<AdminGateResult>;
}

export class NoopAdminGate implements AdminGate {
  async review(): Promise<AdminGateResult> {
    return "APPROVED";
  }
}

export class TelegramAdminGate implements AdminGate {
  constructor(
    private readonly token: string,
    private readonly chatId: string,
    private readonly timeoutMs = Number(process.env.TELEGRAM_ADMIN_TIMEOUT_MS ?? 45_000),
  ) {}

  async review(input: {
    intentId: string;
    kind: string;
    rationale: string;
    spendLamports: bigint;
  }): Promise<AdminGateResult> {
    const spend = (Number(input.spendLamports) / 1e9).toFixed(6);
    const marker = input.intentId.slice(0, 8);
    const text = [
      `CITIZEN-0 ADMIN GATE`,
      `Intent: ${input.kind}`,
      `Marker: ${marker}`,
      `Spend: ${spend} SOL`,
      input.rationale,
      "",
      `Reply within ${Math.round(this.timeoutMs / 1000)}s:`,
      `APPROVE ${marker}`,
      `or DENY ${marker}`,
    ].join("\n");

    await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: this.chatId, text }),
      signal: AbortSignal.timeout(12_000),
    });

    const deadline = Date.now() + this.timeoutMs;
    let offset = 0;

    while (Date.now() < deadline) {
      const url = new URL(`https://api.telegram.org/bot${this.token}/getUpdates`);
      url.searchParams.set("timeout", "5");
      url.searchParams.set("offset", String(offset));
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) {
          await sleep(2000);
          continue;
        }
        const json = (await res.json()) as {
          result?: Array<{
            update_id: number;
            message?: { chat?: { id?: number | string }; text?: string };
          }>;
        };
        for (const u of json.result ?? []) {
          offset = u.update_id + 1;
          const msg = u.message?.text?.toUpperCase() ?? "";
          const chat = String(u.message?.chat?.id ?? "");
          if (chat !== String(this.chatId)) continue;
          if (msg.includes("APPROVE") && msg.includes(marker.toUpperCase())) {
            return "APPROVED";
          }
          if (msg.includes("DENY") && msg.includes(marker.toUpperCase())) {
            return "DENIED";
          }
        }
      } catch {
        await sleep(2000);
      }
      await sleep(1500);
    }

    return "TIMEOUT_AUTO";
  }
}

export function createAdminGate(): AdminGate {
  const enabled = process.env.TELEGRAM_ADMIN_GATE === "1";
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (enabled && token && chat) {
    return new TelegramAdminGate(token, chat);
  }
  return new NoopAdminGate();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
