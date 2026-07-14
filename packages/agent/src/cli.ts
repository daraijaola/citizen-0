#!/usr/bin/env node
/**
 * CITIZEN-0 agent CLI
 *   once        — single survival tick
 *   loop        — supervised multi-tick run (Phase 2 default)
 *   supervise   — alias of loop
 *   status      — one tick + dump
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { bootstrapCitizen } from "./bootstrap.js";
import { loadEnvFile } from "./load-env.js";
import { Supervisor } from "./runtime/supervisor.js";

async function main(): Promise<void> {
  loadEnvFile();
  const cmd = process.argv[2] ?? "once";
  const { loop, log, mode, diary, dataDir } = bootstrapCitizen();

  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  CITIZEN-0  ·  mode=${mode.padEnd(6)}  p3    ║`);
  console.log(`╚══════════════════════════════════════╝`);
  console.log(
    `  diary: on · telegram: ${diary?.telegramEnabled ? "on" : "off (file+console)"} · admin: ${diary?.adminEnabled ? "on" : "off"}\n`,
  );

  if (cmd === "once" || cmd === "status") {
    await loop.boot();
    const result = await loop.tick();
    printTick(result);
    dumpState(result, log, dataDir);
    return;
  }

  if (cmd === "loop" || cmd === "supervise") {
    process.env.DATA_DIR = dataDir;
    const supervisor = new Supervisor(loop, {
      dataDir,
      maxTicks: Number(process.env.MAX_TICKS ?? 8),
      onTick: (r) => printTick(r),
      onError: (err, n) =>
        console.error(`[supervisor] tick~${n} error: ${err.message}`),
    });
    // Fast ticks for local demo unless user wants real intervals
    if (!process.env.FAST_TICKS) process.env.FAST_TICKS = "1";

    const report = await supervisor.run();
    console.log(
      `\nSupervisor done: ok=${report.ticksCompleted} fail=${report.ticksFailed} ` +
        `reason=${report.stoppedReason} circuit=${report.circuit.state}`,
    );
    console.log(`State → ${join(dataDir, "citizen-state.json")}`);
    console.log(`Diary  → ${join(dataDir, "diary.json")}`);
    console.log(`Decision log valid: ${log.verify().ok}`);
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  console.error("Usage: once | loop | supervise | status");
  process.exit(1);
}

function printTick(result: {
  tick: number;
  solvency: string;
  stage: string;
  actions: string[];
  state: {
    balances: { solLamports: bigint };
    runway: { coverageRatio: number; msUntilDue: number };
    obligation: { amountLamportsEstimate: bigint };
    attempts: unknown[];
  };
}): void {
  const sol = Number(result.state.balances.solLamports) / 1e9;
  const tax = Number(result.state.obligation.amountLamportsEstimate) / 1e9;
  const days = result.state.runway.msUntilDue / (24 * 3600 * 1000);
  console.log(
    `[tick ${result.tick}] solvency=${result.solvency} stage=${result.stage} ` +
      `bal=${sol.toFixed(4)}SOL tax≈${tax.toFixed(6)}SOL due_in=${days.toFixed(2)}d ` +
      `actions=${result.actions.join(",") || "—"}`,
  );
}

function dumpState(
  result: { state: unknown },
  log: { snapshot: () => unknown; verify: () => { ok: boolean } },
  dataDir: string,
): void {
  mkdirSync(dataDir, { recursive: true });
  const envelope = {
    updatedAtMs: Date.now(),
    state: result.state,
    decisionLog: log.snapshot(),
    chainValid: log.verify(),
  };
  const path = join(dataDir, "citizen-state.json");
  writeFileSync(
    path,
    JSON.stringify(
      envelope,
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
    "utf8",
  );
  console.log(`\nState written → ${path}`);
  console.log(`Decision log valid: ${log.verify().ok}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
