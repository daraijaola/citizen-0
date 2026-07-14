/**
 * JSON file persistence for citizen state + decision log snapshots.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DecisionLogSnapshot } from "@citizen-0/shared";

export interface PersistedEnvelope {
  updatedAtMs: number;
  decisionLog: DecisionLogSnapshot;
  meta: Record<string, unknown>;
}

export interface StateStore {
  save(envelope: PersistedEnvelope): void;
  load(): PersistedEnvelope | null;
}

export class JsonFileStateStore implements StateStore {
  constructor(private readonly filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  save(envelope: PersistedEnvelope): void {
    writeFileSync(
      this.filePath,
      JSON.stringify(
        envelope,
        (_, v) => (typeof v === "bigint" ? v.toString() : v),
        2,
      ),
      "utf8",
    );
  }

  load(): PersistedEnvelope | null {
    try {
      if (!existsSync(this.filePath)) return null;
      return JSON.parse(readFileSync(this.filePath, "utf8")) as PersistedEnvelope;
    } catch {
      return null;
    }
  }
}

export function defaultDataPath(dataDir = process.env.DATA_DIR ?? "./data"): string {
  return join(dataDir, "citizen-state.json");
}
