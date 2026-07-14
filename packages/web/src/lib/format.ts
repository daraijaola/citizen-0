export function sol(lamports: string | number | undefined): string {
  if (lamports === undefined) return "—";
  const n = typeof lamports === "string" ? Number(lamports) : lamports;
  if (!Number.isFinite(n)) return String(lamports);
  return `${(n / 1e9).toFixed(6)} SOL`;
}

export function badgeClass(solvency?: string): string {
  if (solvency === "COMFORTABLE") return "ok";
  if (solvency === "TIGHT") return "warn";
  return "bad";
}

export function formatCountdown(msUntilDue?: number): string {
  if (msUntilDue === undefined) return "—";
  const abs = Math.abs(msUntilDue);
  const days = abs / (24 * 3600 * 1000);
  if (msUntilDue >= 0) return `${days.toFixed(2)} days remaining`;
  return `${days.toFixed(2)} days OVERDUE`;
}
