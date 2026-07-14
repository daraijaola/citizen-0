import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DecisionLog } from "@citizen-0/shared";
import { moodFromSolvency } from "../src/diary/voice.js";
import { Narrator, voiceCtx } from "../src/diary/narrator.js";
import { FileDiarySink } from "../src/diary/sinks.js";
import { DiaryService } from "../src/diary/service.js";
import { MockAgencAdapter } from "../src/adapters/mock-agenc.js";
import { MockPlotAdapter } from "../src/adapters/mock-plot.js";
import { LocalPolicySigner } from "../src/runtime/policy-signer.js";
import { SurvivalLoop } from "../src/runtime/survival-loop.js";

describe("diary", () => {
  it("maps solvency to mood", () => {
    assert.equal(moodFromSolvency("COMFORTABLE"), "calm");
    assert.equal(moodFromSolvency("DESPERATE"), "anxious");
    assert.equal(moodFromSolvency("DELINQUENT"), "terrified");
  });

  it("narrates first-person lines", () => {
    const ctx = voiceCtx({
      solvency: "TIGHT",
      stage: "GOOD",
      balanceLamports: 20_000_000n,
      taxLamports: 1_000_000n,
      msUntilDue: 2 * 24 * 3600 * 1000,
      coverage: 1.5,
    });
    const e = Narrator.jobSettled(ctx, "Summarize city", 5_000_000n, "summary");
    assert.match(e.text, /Paid|settled|Proud/i);
    assert.equal(e.mood, "proud");
  });

  it("file sink persists diary.json", async () => {
    const dir = join(process.cwd(), "data-test-diary");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const sink = new FileDiarySink(join(dir, "diary.json"));
    await sink.post({
      id: "1",
      atMs: Date.now(),
      kind: "note",
      mood: "calm",
      text: "hello from test",
    });
    assert.equal(existsSync(join(dir, "diary.json")), true);
    const arr = JSON.parse(readFileSync(join(dir, "diary.json"), "utf8")) as unknown[];
    assert.equal(arr.length, 1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("loop with diary writes entries", async () => {
    const dir = join(process.cwd(), "data-test-diary-loop");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    const log = new DecisionLog();
    const diary = new DiaryService({ dataDir: dir, log });
    const loop = new SurvivalLoop({
      mode: "mock",
      agenc: new MockAgencAdapter({
        startingBalanceLamports: 40_000_000n,
        seedJobs: true,
      }),
      plot: new MockPlotAdapter({
        startingBalanceLamports: 40_000_000n,
        dueInDays: 6,
      }),
      signer: new LocalPolicySigner(),
      log,
      diary,
    });

    await loop.boot();
    await loop.tick();

    const path = join(dir, "diary.json");
    assert.equal(existsSync(path), true);
    const entries = JSON.parse(readFileSync(path, "utf8")) as Array<{ text: string }>;
    assert.ok(entries.length >= 2);
    assert.ok(entries.some((e) => /online|Balance|Claimed|Paid/i.test(e.text)));
    assert.equal(log.verify().ok, true);

    rmSync(dir, { recursive: true, force: true });
  });
});
