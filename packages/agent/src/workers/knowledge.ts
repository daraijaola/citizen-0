/**
 * Ground-truth snippets from Phase 0 recon — used by deterministic workers
 * so deliverables sound like we actually studied the ecosystem.
 */

export const KNOWLEDGE = {
  delinquency: [
    "Energy City delinquency is progressive, never instant seizure.",
    "Days 1–7 OVERDUE: warning badge only.",
    "Days 8–14 THROTTLED: excluded from focus rotation; visual degradation.",
    "Days 15–30 YIELD_WITHHELD: epoch payouts redirect to settle debt.",
    "Day 31+ FORECLOSURE_ELIGIBLE: parcel may enter auction.",
    "After auction: RECLAIMED — owner loses property.",
  ],
  intentSigning: [
    "GhostNN Trade Intent Signing: node proposes, human/policy signs, keys never leave the signer.",
    "Intent fields: action, amount, rationale, confidence, expiry.",
    "CITIZEN-0 maps this to CLAIM_JOB, SUBMIT_DELIVERABLE, PAY_TAX.",
    "Agent process must not hold the policy-signer private key.",
  ],
  tokenomics: [
    "$GNN mint (Solana mainnet): 5EyGMW1wNxMj7YtVP54uBH6ktwpTNCvX9DDEnmcsHdev",
    "July 2026 surface split: 70% node operators (CCU), 30% parcel owners (effective output).",
    "Maintenance (~$0.02/plot/mo + tier bonus) funds baseline node ops.",
    "AgenC settlements are SOL program-escrow primary (not GNN-first, not x402-primary).",
  ],
  agenc: [
    "AgenC (tetsuo-ai) program agenc-coordination on mainnet.",
    "Program ID: HJsZ53Zb27b8QMRbQpuDngE44AdwCGxvEZr61Zmxw1xK",
    "Flow: post → moderate → pin spec → claim → submit proof hash → creator accept → escrow pay.",
    "Protocol fee 5% (500 bps); worker floor ≥ 60% after all fee legs.",
    "Min agent stake ~0.01 SOL; public read API https://api.agenc.ag",
  ],
  city: [
    "Nexus Energy City: finite 50,000-plot grid financing real AI compute.",
    "Tiers: Generator 1–99 (1.0×), Substation 100–500 (1.5×), Grid Hub 501+ (2.25×).",
    "Effective output = plot count × tier multiplier.",
    "Nexus City game live at nexus.ghostnn.ai (Bevy WASM); backend Rust/Actix.",
  ],
  charter: [
    "CITIZEN-0 charter v1: permitted to observe, score, propose intents, work jobs, log decisions.",
    "Not permitted: unilateral spend, forge audit log, exceed daily ceilings, claim outside capabilities.",
    "Decision log is append-only and hash-chained; tampering fails verify().",
  ],
} as const;

export function pickKnowledge(title: string): string[] {
  const t = title.toLowerCase();
  const out: string[] = [];
  if (t.includes("delinq") || t.includes("tax") || t.includes("foreclos")) {
    out.push(...KNOWLEDGE.delinquency);
  }
  if (t.includes("intent") || t.includes("sign") || t.includes("autonom")) {
    out.push(...KNOWLEDGE.intentSigning);
  }
  if (t.includes("token") || t.includes("gnn") || t.includes("econom")) {
    out.push(...KNOWLEDGE.tokenomics);
  }
  if (t.includes("agenc") || t.includes("marketplace") || t.includes("escrow") || t.includes("job")) {
    out.push(...KNOWLEDGE.agenc);
  }
  if (t.includes("city") || t.includes("parcel") || t.includes("plot") || t.includes("nexus")) {
    out.push(...KNOWLEDGE.city);
  }
  if (out.length === 0) {
    out.push(...KNOWLEDGE.city, ...KNOWLEDGE.agenc.slice(0, 2), ...KNOWLEDGE.charter.slice(0, 2));
  }
  return [...new Set(out)];
}
