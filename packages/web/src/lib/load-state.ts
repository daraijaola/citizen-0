import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CitizenSnapshot, DiaryEntry } from "./types";

export type { CitizenSnapshot, DiaryEntry } from "./types";
export { sol, badgeClass, formatCountdown } from "./format";

const DEFAULT_DATA_DIR = "/home/ubuntu/citizen-0/data";

function monorepoCandidates(filename: string): string[] {
  const dataDir = process.env.DATA_DIR || DEFAULT_DATA_DIR;
  return [
    join(dataDir, filename),
    join(process.cwd(), "data", filename),
    join(process.cwd(), "..", "..", "data", filename),
    join(process.cwd(), "..", "agent", "data", filename),
  ];
}

export async function loadSnapshot(): Promise<CitizenSnapshot | null> {
  for (const p of monorepoCandidates("citizen-state.json")) {
    try {
      return JSON.parse(await readFile(p, "utf8")) as CitizenSnapshot;
    } catch {
      /* next */
    }
  }
  return null;
}

export async function loadDiary(): Promise<DiaryEntry[]> {
  for (const p of monorepoCandidates("diary.json")) {
    try {
      const raw = JSON.parse(await readFile(p, "utf8")) as DiaryEntry[];
      return Array.isArray(raw) ? raw : [];
    } catch {
      /* next */
    }
  }
  return [];
}
