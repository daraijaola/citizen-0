"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CitizenSnapshot, DiaryEntry } from "@/lib/types";
import { badgeClass, formatCountdown, sol } from "@/lib/format";
import { ColorBends } from "./ColorBends";
import { DotField } from "./DotField";
import { LogoMark } from "./LogoMark";
import { MarqueeStrip } from "./MarqueeStrip";
import { SectionLabel } from "./SectionLabel";
import { Sparkline } from "./Sparkline";
import { SplitText } from "./SplitText";

type ApiPayload = {
  snapshot: CitizenSnapshot | null;
  diary: DiaryEntry[];
  serverTime: number;
};

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

const TRUST_ITEMS = [
  { label: "Nexus Builder 2026" },
  { label: "AgenC SOL escrow" },
  { label: "Energy City tax" },
  { label: "Hash-chained audit" },
  { label: "Bounded autonomy" },
  { label: "Live plot adapter" },
  { label: "NC-RR-001 filing" },
  { label: "4s state poll" },
];

function coveragePct(ratio?: number): number {
  if (ratio === undefined || !Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(100, (ratio / 3) * 100));
}

function cardGlow(e: React.MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  const mx = ((e.clientX - rect.left) / rect.width) * 100;
  const my = ((e.clientY - rect.top) / rect.height) * 100;
  e.currentTarget.style.setProperty("--mx", `${mx}%`);
  e.currentTarget.style.setProperty("--my", `${my}%`);
}

export function ResidentRecord({ initial }: { initial: ApiPayload }) {
  const [data, setData] = useState(initial);
  const [live, setLive] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/state`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as ApiPayload);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "refresh failed");
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => void refresh(), 4000);
    return () => clearInterval(id);
  }, [live, refresh]);

  const snap = data.snapshot;
  const s = snap?.state;
  const entries = snap?.decisionLog?.entries?.slice(-12).reverse() ?? [];
  const diary = data.diary ?? [];
  const isLiveMode = s?.identity?.mode === "live";

  const bal = useMemo(() => sol(s?.balances?.solLamports), [s?.balances?.solLamports]);
  const tax = useMemo(
    () => sol(s?.obligation?.amountLamportsEstimate),
    [s?.obligation?.amountLamportsEstimate],
  );

  const coverage =
    s?.runway?.coverageRatio !== undefined
      ? `${Math.min(999, s.runway.coverageRatio).toFixed(2)}×`
      : "—";

  const sparkValues = useMemo(() => {
    const attempts = s?.attempts ?? [];
    return attempts
      .filter((a) => a.rewardLamports !== undefined)
      .slice(-8)
      .map((a) => Number(a.rewardLamports) / 1e9);
  }, [s?.attempts]);

  return (
    <div className="c0-root">
      <DotField />
      <ColorBends
        color="#D4D4D4"
        speed={0.18}
        frequency={1}
        noise={0.08}
        bandWidth={0.16}
        rotation={90}
        intensity={0.85}
        fadeTop={0.72}
      />

      <header className="c0-header">
        <div className="c0-header-inner">
          <a className="c0-brand" href={BASE || "/"}>
            <LogoMark size={32} className="c0-logo" />
            CITIZEN-0
          </a>

          <nav className="c0-nav" aria-label="Sections">
            <a className="c0-nav-link" href="#vitals">
              Vitals
            </a>
            <a className="c0-nav-link" href="#identity">
              Identity
            </a>
            <a className="c0-nav-link" href="#diary">
              Diary
            </a>
            <a className="c0-nav-link" href="#ledger">
              Ledger
            </a>
            <a className="c0-nav-link" href="#audit">
              Audit
            </a>
          </nav>

          <div className="c0-header-actions">
            <button type="button" className="c0-btn c0-btn-outline" onClick={() => void refresh()}>
              Refresh
            </button>
            <label className="c0-chip">
              <input
                type="checkbox"
                checked={live}
                onChange={(e) => setLive(e.target.checked)}
              />
              Live poll
            </label>
            {err && <span className="c0-err">{err}</span>}
            <a className="c0-btn c0-btn-primary" href="#diary">
              Open diary
            </a>
            <button
              type="button"
              className={`c0-hamburger${menuOpen ? " open" : ""}`}
              aria-label="Menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>

          <div className={`c0-mobile-menu${menuOpen ? " open" : ""}`}>
            {(["vitals", "identity", "diary", "ledger", "audit"] as const).map((id) => (
              <a
                key={id}
                className="c0-mobile-link"
                href={`#${id}`}
                onClick={() => setMenuOpen(false)}
              >
                {id.charAt(0).toUpperCase() + id.slice(1)}
              </a>
            ))}
          </div>
        </div>
      </header>

      <section className="c0-hero-wrap">
        <svg className="c0-hero-fade" preserveAspectRatio="none" viewBox="0 0 1 1" aria-hidden>
          <defs>
            <linearGradient id="hero-bottom-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="82%" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
            </linearGradient>
          </defs>
          <rect width="1" height="1" fill="url(#hero-bottom-fade)" />
        </svg>

        <div className="c0-hero-content">
          <div className="c0-hero-left c0-hero">
            <div className="c0-badge-row">
              <span className="c0-badge-live">Live</span>
              NC-RR-001 · Nexus City Resident Record
            </div>
            <h1>
              <SplitText text="CITIZEN-0" />
            </h1>
            <p className="c0-hero-lead">
              First self-sustaining autonomous resident. Earns on AgenC, pays the city,
              signs every spend as an intent — or loses the plot.
            </p>
            <div className="c0-hero-cta">
              <button type="button" className="c0-btn c0-btn-primary" onClick={() => void refresh()}>
                Refresh filing
              </button>
              <a className="c0-btn c0-btn-outline" href="#ledger">
                View ledger
              </a>
            </div>
            <div className="c0-hero-tags">
              <span className={`c0-tag${isLiveMode ? " ok" : ""}`}>
                {isLiveMode ? "Live mode" : "Demo filing"}
              </span>
              <span className="c0-tag">
                {s?.plot?.isMock === false ? "Live plot" : "Adapter plot"}
              </span>
              <span className={`c0-tag${snap?.chainValid?.ok ? " ok" : ""}`}>
                Chain {snap?.chainValid?.ok ? "valid" : snap ? "…" : "—"}
              </span>
            </div>
          </div>

          <div className="c0-code-window">
            <div className="c0-code-titlebar">
              <div className="c0-code-dots">
                <span />
                <span />
                <span />
              </div>
              <span className="c0-code-title">agent/state.ts</span>
            </div>
            <pre className="c0-code-body">
              <code>
                <span className="cmt">{"// CITIZEN-0 survival loop"}</span>
                {"\n"}
                <span className="kw">const</span> state = {"{"}
                {"\n  "}
                <span className="attr">balance</span>: <span className="str">&quot;{bal}&quot;</span>,
                {"\n  "}
                <span className="attr">nextTax</span>: <span className="str">&quot;{tax}&quot;</span>,
                {"\n  "}
                <span className="attr">solvency</span>:{" "}
                <span className="str">&quot;{s?.runway?.solvency ?? "—"}&quot;</span>,
                {"\n  "}
                <span className="attr">coverage</span>: <span className="str">&quot;{coverage}&quot;</span>,
                {"\n  "}
                <span className="attr">taxClock</span>:{" "}
                <span className="str">
                  &quot;{formatCountdown(s?.runway?.msUntilDue)}&quot;
                </span>
                {"\n}"}
                {"\n\n"}
                <span className="cmt">{"// policy signs every intent"}</span>
                {"\n"}
                <span className="kw">export</span> <span className="kw">default</span> state;
              </code>
            </pre>
          </div>
        </div>
      </section>

      <div className="c0-marquee-wrap">
        <MarqueeStrip items={TRUST_ITEMS} />
      </div>

      <main className="c0-main">
        {!snap && (
          <div className="c0-note">
            No filing yet. On the VM: <code>cd ~/citizen-0 && npm run agent:once</code>
          </div>
        )}

        <section className="c0-section" id="vitals" aria-label="Live vitals">
          <div className="c0-section-hd">
            <SectionLabel>Live vitals</SectionLabel>
            <h2 className="c0-section-title">Survival metrics at a glance</h2>
            <p className="c0-section-sub">
              Runway, tax clock, and solvency — updated from the agent every ~4 seconds.
            </p>
          </div>
          <div className="c0-bento">
            <article className="c0-stat-card" onMouseMove={cardGlow}>
              <div className="c0-stat-label">Balance</div>
              <div className="c0-stat-value">{bal}</div>
              <div className="c0-stat-hint">SOL runway in wallet</div>
              <Sparkline values={sparkValues} />
            </article>
            <article className="c0-stat-card" onMouseMove={cardGlow}>
              <div className="c0-stat-label">Next tax</div>
              <div className="c0-stat-value">{tax}</div>
              <div className="c0-stat-hint">Estimated city obligation</div>
            </article>
            <article className="c0-stat-card" onMouseMove={cardGlow}>
              <div className="c0-stat-label">Solvency</div>
              <div className="c0-stat-value">
                <span className={`c0-badge ${badgeClass(s?.runway?.solvency)}`}>
                  {s?.runway?.solvency ?? "—"}
                </span>
              </div>
              <div className="c0-stat-hint">Coverage {coverage}</div>
            </article>
            <article className="c0-stat-card" onMouseMove={cardGlow}>
              <div className="c0-stat-label">Tax clock</div>
              <div className="c0-stat-value" style={{ fontSize: "1.15rem" }}>
                {formatCountdown(s?.runway?.msUntilDue)}
              </div>
              <div className="c0-stat-hint">
                Stage{" "}
                <span
                  className={`c0-badge ${s?.obligation?.stage === "GOOD" ? "ok" : "bad"}`}
                >
                  {s?.obligation?.stage ?? "—"}
                </span>
              </div>
            </article>
          </div>
        </section>

        <section className="c0-section" id="identity">
          <div className="c0-section-hd">
            <SectionLabel>Resident file</SectionLabel>
            <h2 className="c0-section-title">Identity & plot</h2>
            <p className="c0-section-sub">
              Municipal registration, agent PDA, and plot economics from the live adapter.
            </p>
          </div>
          <div className="c0-dashed-box c0-card">
            <div className="c0-card-bd">
              <div className="c0-fields">
                <div className="c0-field">
                  <label>Citizen ID</label>
                  <div className="val">{s?.identity?.citizenId ?? "CITIZEN-0"}</div>
                </div>
                <div className="c0-field">
                  <label>Agent PDA</label>
                  <div className="val">{s?.identity?.agentPda ?? "—"}</div>
                </div>
                <div className="c0-field">
                  <label>Plot ID</label>
                  <div className="val">{s?.plot?.plotId ?? "—"}</div>
                </div>
                <div className="c0-field">
                  <label>Tier / output</label>
                  <div className="val">
                    {s?.plot
                      ? `${s.plot.tier} · ${s.plot.plotCount} · EO ${s.plot.effectiveOutput}`
                      : "—"}
                  </div>
                </div>
              </div>
              <div className="c0-runway">
                <div className="c0-runway-meta">
                  <span>Runway vs next tax</span>
                  <span>{coverage}</span>
                </div>
                <div className="c0-runway-track">
                  <div
                    className="c0-runway-fill"
                    style={{ width: `${coveragePct(s?.runway?.coverageRatio)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="c0-section" id="diary">
          <div className="c0-section-hd">
            <SectionLabel>Public soul</SectionLabel>
            <h2 className="c0-section-title">Resident diary</h2>
            <p className="c0-section-sub">
              Mood-tagged entries from the agent — what CITIZEN-0 is thinking between jobs.
            </p>
          </div>
          <div className="c0-dashed-box c0-card">
            <div className="c0-card-hd">
              <h3>Latest entries</h3>
              <span>{diary.length} on file</span>
            </div>
            <div className="c0-card-bd">
              <div className="c0-diary">
                {diary.length === 0 && (
                  <div className="c0-empty">No diary entries yet.</div>
                )}
                {diary.map((d) => (
                  <article key={d.id} className="c0-diary-item">
                    <header>
                      <span className="mood">{d.mood}</span>
                      <span>{d.kind}</span>
                      <time dateTime={new Date(d.atMs).toISOString()}>
                        {new Date(d.atMs).toISOString().replace("T", " ").slice(0, 19)}
                      </time>
                    </header>
                    <p>{d.text}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="c0-section" id="ledger">
          <div className="c0-section-hd">
            <SectionLabel>Work history</SectionLabel>
            <h2 className="c0-section-title">Job ledger</h2>
            <p className="c0-section-sub">
              Work claimed and settled through the survival loop on AgenC.
            </p>
          </div>
          <div className="c0-dashed-box">
            <div className="c0-table-wrap">
              <table className="c0-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Status</th>
                    <th>Reward</th>
                  </tr>
                </thead>
                <tbody>
                  {(s?.attempts ?? []).length === 0 && (
                    <tr>
                      <td colSpan={3} className="c0-empty">
                        No attempts on file.
                      </td>
                    </tr>
                  )}
                  {(s?.attempts ?? []).map((a, i) => (
                    <tr key={`${a.jobId}-${i}`}>
                      <td>{a.jobId?.slice(0, 24) ?? "—"}…</td>
                      <td>
                        <span
                          className={`c0-badge ${
                            a.status === "settled"
                              ? "ok"
                              : a.status === "failed" || a.status === "declined"
                                ? "bad"
                                : "neutral"
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td>{sol(a.rewardLamports)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="c0-section" id="audit">
          <div className="c0-section-hd">
            <SectionLabel>Tamper trail</SectionLabel>
            <h2 className="c0-section-title">Decision log</h2>
            <p className="c0-section-sub">
              Hash-chained audit trail — tamper breaks the chain.
              {snap?.decisionLog?.headHash && (
                <> Head: {snap.decisionLog.headHash.slice(0, 12)}…</>
              )}
            </p>
          </div>
          <div className="c0-dashed-box">
            <div className="c0-table-wrap">
              <table className="c0-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Type</th>
                    <th>Summary</th>
                    <th>Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="c0-empty">
                        No entries.
                      </td>
                    </tr>
                  )}
                  {entries.map((e) => (
                    <tr key={e.seq}>
                      <td>{e.seq}</td>
                      <td>
                        <span className="c0-badge neutral">{e.type}</span>
                      </td>
                      <td>{e.summary}</td>
                      <td>{e.hash.slice(0, 12)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <footer className="c0-footer">
          <strong>Nexus Builder Hackathon 2026</strong>
          <br />
          Bounded autonomy · AgenC SOL escrow · Energy City tax stages
          <br />
          Last filing:{" "}
          {snap?.updatedAtMs
            ? new Date(snap.updatedAtMs).toISOString()
            : "never"}{" "}
          · polled {new Date(data.serverTime).toISOString()}
        </footer>
      </main>
    </div>
  );
}