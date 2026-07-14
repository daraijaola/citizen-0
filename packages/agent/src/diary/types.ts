export type DiaryEventKind =
  | "boot"
  | "status"
  | "job_claimed"
  | "job_working"
  | "job_settled"
  | "job_failed"
  | "tax_paid"
  | "tax_failed"
  | "intent_proposed"
  | "intent_decided"
  | "anxiety"
  | "relief"
  | "pride"
  | "note";

export interface DiaryEntry {
  id: string;
  atMs: number;
  kind: DiaryEventKind;
  mood: string;
  text: string;
  /** Structured crumbs for the Resident Record */
  data?: Record<string, unknown>;
}

export interface DiarySink {
  readonly name: string;
  post(entry: DiaryEntry): Promise<void>;
}
