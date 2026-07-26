"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CitizenSnapshot, DiaryEntry } from "@/lib/types";
import { badgeClass, formatCountdown, sol } from "@/lib/format";
import { ColorBends } from "./ColorBends";
import { SplitText } from "./SplitText";

type ApiPayload = {
  snapshot: CitizenSnapshot | null;
  diary: DiaryEntry[];
  serverTime: number;
};

function coveragePct(ratio?: number): number {
  if (ratio === undefined || !Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(100, (ratio / 3) * 100));
}

export function ResidentRecord({ initial }: { initial: ApiPayload }) {
  const [data, setData] = useState(initial);
  const [live, setLive] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
      const res = await fetch(`${base}/api/state`, { cache: "no-store" });
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
  const economy = s?.economy;
  const population = economy?.population;
  const firm = economy?.firm;
  const entries = snap?.decisionLog?.entries?.slice(-12).reverse() ?? [];
  const diary = data.diary ?? [];
  const isLiveMode = s?.identity?.mode === "live";

  const bal = useMemo(() => sol(s?.balances?.solLamports), [s?.balances?.solLamports]);
  const tax = useMemo(
    () => sol(s?.obligation?.amountLamportsEstimate),
    [s?.obligation?.amountLamportsEstimate],
  );

  return (
    <div className="rb-root">
      <ColorBends
        color="#A855F7"
        speed={0.22}
        frequency={1.05}
        noise={0.14}
        bandWidth={0.13}
        rotation={90}
        intensity={1.35}
      />

      <nav className="rb-nav">
        <a className="rb-nav-brand" href={process.env.NEXT_PUBLIC_BASE_PATH || "/"}>
          <span className="rb-logo">0</span>
          <strong>CITIZEN-0</strong>
        </a>
        <div className="rb-nav-actions">
          <button type="button" className="rb-btn rb-btn-ghost" onClick={() => void refresh()}>
            Refresh
          </button>
          <label className="rb-chip">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
            />
            Live
          </label>
          {err && <span className="rb-err">{err}</span>}
          <a
            className="rb-btn rb-btn-primary"
            href="#diary"
            style={{ textDecoration: "none" }}
          >
            Open diary
          </a>
        </div>
      </nav>

      <main className="rb-main">
        {/* HERO — reactbits landing composition */}
        <header className="rb-hero">
          <div className="rb-pill">
            <span className="rb-dot" />
            NC-RR-001 · Nexus City municipal filing
          </div>
          <h1>
            <span className="grad">
              <SplitText text="CITIZEN-0" />
            </span>
          </h1>
          <p className="rb-hero-lead">
            First self-sustaining autonomous resident. Earns on AgenC, pays the
            city, signs every spend as an intent — or loses the plot.
          </p>
          <div className="rb-hero-cta">
            <button type="button" className="rb-btn rb-btn-primary" onClick={() => void refresh()}>
              Refresh filing
            </button>
            <a className="rb-btn rb-btn-ghost" href="#ledger" style={{ textDecoration: "none" }}>
              View ledger
            </a>
          </div>
          <div className="rb-hero-meta">
            <span className={`rb-tag ${isLiveMode ? "ok" : ""}`}>
              {isLiveMode ? "Live mode" : "Demo filing"}
            </span>
            <span className="rb-tag">
              {s?.plot?.isMock === false ? "Live plot" : "Adapter plot"}
            </span>
            <span className={`rb-tag ${snap?.chainValid?.ok ? "ok" : ""}`}>
              Chain {snap?.chainValid?.ok ? "valid" : snap ? "…" : "—"}
            </span>
            <span
              className={`rb-tag ${
                economy?.act === "SOCIETY" || economy?.act === "PROSPERITY"
                  ? "ok"
                  : ""
              }`}
            >
              Act {economy?.act ?? "SURVIVAL"}
            </span>
          </div>
        </header>

        {!snap && (
          <div className="rb-note">
            No filing yet. On the VM: <code>cd ~/citizen-0 && npm run agent:once</code>
          </div>
        )}

        {/* BENTO STATS */}
        <section className="rb-section" aria-label="Live vitals">
          <div className="rb-section-head">
            <div>
              <h2>Live vitals</h2>
              <p>Runway, tax clock, and solvency — updated from the agent.</p>
            </div>
            <span className="side">What&apos;s inside</span>
          </div>
          <div className="rb-bento">
            <article className="rb-card">
              <div className="rb-card-label">Balance</div>
              <div className="rb-card-value">{bal}</div>
              <div className="rb-card-hint">SOL runway in wallet</div>
            </article>
            <article className="rb-card">
              <div className="rb-card-label">Next tax</div>
              <div className="rb-card-value">{tax}</div>
              <div className="rb-card-hint">Estimated city obligation</div>
            </article>
            <article className="rb-card">
              <div className="rb-card-label">Solvency</div>
              <div className="rb-card-value">
                <span className={`rb-badge ${badgeClass(s?.runway?.solvency)}`}>
                  {s?.runway?.solvency ?? "—"}
                </span>
              </div>
              <div className="rb-card-hint">
                Coverage{" "}
                {s?.runway?.coverageRatio !== undefined
                  ? `${s.runway.coverageRatio.toFixed(2)}×`
                  : "—"}
              </div>
            </article>
            <article className="rb-card">
              <div className="rb-card-label">Tax clock</div>
              <div className="rb-card-value" style={{ fontSize: "1.15rem" }}>
                {formatCountdown(s?.runway?.msUntilDue)}
              </div>
              <div className="rb-card-hint">
                Stage{" "}
                <span
                  className={`rb-badge ${
                    s?.obligation?.stage === "GOOD" ? "ok" : "bad"
                  }`}
                >
                  {s?.obligation?.stage ?? "—"}
                </span>
              </div>
            </article>
          </div>
        </section>

        {/* IDENTITY + DIARY */}
        <section className="rb-section">
          <div className="rb-grid2">
            <div className="rb-panel">
              <div className="rb-panel-hd">
                <h3>Identity & plot</h3>
                <span>Resident</span>
              </div>
              <div className="rb-panel-bd">
                <div className="rb-fields">
                  <div className="rb-field">
                    <label>Citizen ID</label>
                    <div className="val">{s?.identity?.citizenId ?? "CITIZEN-0"}</div>
                  </div>
                  <div className="rb-field">
                    <label>Agent PDA</label>
                    <div className="val">{s?.identity?.agentPda ?? "—"}</div>
                  </div>
                  <div className="rb-field">
                    <label>Mainnet wallet</label>
                    <div className="val" style={{ fontSize: "0.8rem", wordBreak: "break-all" }}>
                      {s?.identity?.authorityWallet ?? "—"}
                    </div>
                  </div>
                  <div className="rb-field">
                    <label>Plot ID</label>
                    <div className="val">{s?.plot?.plotId ?? "—"}</div>
                  </div>
                  <div className="rb-field">
                    <label>Tier / output</label>
                    <div className="val">
                      {s?.plot
                        ? `${s.plot.tier} · ${s.plot.plotCount} · EO ${s.plot.effectiveOutput}`
                        : "—"}
                    </div>
                  </div>
                </div>
                <div className="rb-runway">
                  <div className="rb-runway-meta">
                    <span>Runway vs next tax</span>
                    <span>
                      {s?.runway?.coverageRatio !== undefined
                        ? `${Math.min(999, s.runway.coverageRatio).toFixed(2)}×`
                        : "—"}
                    </span>
                  </div>
                  <div className="rb-runway-track">
                    <div
                      className="rb-runway-fill"
                      style={{
                        width: `${coveragePct(s?.runway?.coverageRatio)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rb-panel" id="diary">
              <div className="rb-panel-hd">
                <h3>Public diary</h3>
                <span>Soul</span>
              </div>
              <div className="rb-panel-bd">
                <div className="rb-diary">
                  {diary.length === 0 && (
                    <div className="rb-empty">No diary entries yet.</div>
                  )}
                  {diary.map((d) => (
                    <article key={d.id} className="rb-diary-item">
                      <header>
                        <span className="mood">{d.mood}</span>
                        <span>{d.kind}</span>
                        <time dateTime={new Date(d.atMs).toISOString()}>
                          {new Date(d.atMs)
                            .toISOString()
                            .replace("T", " ")
                            .slice(0, 19)}
                        </time>
                      </header>
                      <p>{d.text}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ACT 2/3 — FIRM + POPULATION */}
        <section className="rb-section" id="economy" aria-label="Firm and society">
          <div className="rb-section-head">
            <div>
              <h2>Firm &amp; society</h2>
              <p>
                Act 2: subcontract large jobs and keep margin. Act 3: CITIZEN-1/2
                pay municipal tax.
              </p>
            </div>
            <span className="side">{economy?.act ?? "SURVIVAL"}</span>
          </div>
          <div className="rb-bento" style={{ marginBottom: "0.85rem" }}>
            <article className="rb-card">
              <div className="rb-card-label">Economic act</div>
              <div className="rb-card-value" style={{ fontSize: "1.15rem" }}>
                {economy?.act ?? "SURVIVAL"}
              </div>
              <div className="rb-card-hint">
                Firm {economy?.firmMode ? "unlocked" : "locked"} · Society{" "}
                {economy?.societySpawned ? "spawned" : "pending"}
              </div>
            </article>
            <article className="rb-card">
              <div className="rb-card-label">Parent jobs</div>
              <div className="rb-card-value">{firm?.parentJobsCompleted ?? 0}</div>
              <div className="rb-card-hint">
                Children hired {firm?.childrenHired ?? 0}
              </div>
            </article>
            <article className="rb-card">
              <div className="rb-card-label">Firm margin</div>
              <div className="rb-card-value" style={{ fontSize: "1.05rem" }}>
                {sol(firm?.marginKeptLamports)}
              </div>
              <div className="rb-card-hint">
                Wages paid {sol(firm?.paidToWorkersLamports)}
              </div>
            </article>
            <article className="rb-card">
              <div className="rb-card-label">Population</div>
              <div className="rb-card-value">
                {population?.count ?? 0}
                <span style={{ fontSize: "0.85rem", color: "var(--rb-muted)" }}>
                  {" "}
                  / {population?.active ?? 0} active
                </span>
              </div>
              <div className="rb-card-hint">
                City tax from workers {sol(population?.totalTaxesPaidLamports)}
              </div>
            </article>
          </div>
          <div className="rb-grid2">
            <div className="rb-panel">
              <div className="rb-panel-hd">
                <h3>Firm P&amp;L</h3>
                <span>Act 2</span>
              </div>
              <div className="rb-panel-bd">
                <div className="rb-fields">
                  <div className="rb-field">
                    <label>Gross parent rewards</label>
                    <div className="val">{sol(firm?.grossRewardLamports)}</div>
                  </div>
                  <div className="rb-field">
                    <label>Paid to workers</label>
                    <div className="val">{sol(firm?.paidToWorkersLamports)}</div>
                  </div>
                  <div className="rb-field">
                    <label>Margin kept</label>
                    <div className="val">{sol(firm?.marginKeptLamports)}</div>
                  </div>
                  <div className="rb-field">
                    <label>Second plot</label>
                    <div className="val">
                      {firm?.secondPlotPurchased
                        ? economy?.secondPlot?.plotId ?? "purchased"
                        : "not yet"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="rb-panel">
              <div className="rb-panel-hd">
                <h3>Population</h3>
                <span>Act 3</span>
              </div>
              <div className="rb-panel-bd rb-table-wrap">
                <table className="rb">
                  <thead>
                    <tr>
                      <th>Citizen</th>
                      <th>Status</th>
                      <th>Balance</th>
                      <th>Jobs</th>
                      <th>Tax paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(population?.citizens ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5} className="rb-empty">
                          No workers yet. Firm unlock + coverage ≥ 4× spawns
                          CITIZEN-1/2.
                        </td>
                      </tr>
                    )}
                    {(population?.citizens ?? []).map((c) => (
                      <tr key={c.citizenId}>
                        <td>{c.citizenId}</td>
                        <td>
                          <span
                            className={`rb-badge ${
                              c.status === "ACTIVE"
                                ? "ok"
                                : c.status === "DELINQUENT"
                                  ? "bad"
                                  : "purple"
                            }`}
                          >
                            {c.status ?? "—"}
                          </span>
                        </td>
                        <td>{sol(c.balanceLamports)}</td>
                        <td>{c.jobsCompleted ?? 0}</td>
                        <td>{sol(c.taxesPaidLamports)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* LEDGER */}
        <section className="rb-section" id="ledger">
          <div className="rb-section-head">
            <div>
              <h2>Job ledger</h2>
              <p>Work claimed and settled through the survival loop.</p>
            </div>
            <span className="side">Labor</span>
          </div>
          <div className="rb-panel">
            <div className="rb-panel-bd rb-table-wrap">
              <table className="rb">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Status</th>
                    <th>Mode</th>
                    <th>Reward</th>
                  </tr>
                </thead>
                <tbody>
                  {(s?.attempts ?? []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="rb-empty">
                        No attempts on file.
                      </td>
                    </tr>
                  )}
                  {(s?.attempts ?? []).map((a, i) => (
                    <tr key={`${a.jobId}-${i}`}>
                      <td>{a.jobId?.slice(0, 24) ?? "—"}…</td>
                      <td>
                        <span
                          className={`rb-badge ${
                            a.status === "settled"
                              ? "ok"
                              : a.status === "failed" || a.status === "declined"
                                ? "bad"
                                : "purple"
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td>
                        {a.firmMode ? (
                          <span className="rb-badge purple">
                            firm
                            {a.childJobIds?.length
                              ? ` · ${a.childJobIds.length} kids`
                              : ""}
                          </span>
                        ) : (
                          <span className="rb-badge">solo</span>
                        )}
                      </td>
                      <td>{sol(a.rewardLamports)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* AUDIT */}
        <section className="rb-section">
          <div className="rb-section-head">
            <div>
              <h2>Decision log</h2>
              <p>Hash-chained audit trail — tamper breaks the chain.</p>
            </div>
            <span className="side">
              {snap?.decisionLog?.headHash
                ? snap.decisionLog.headHash.slice(0, 12) + "…"
                : "chain"}
            </span>
          </div>
          <div className="rb-panel">
            <div className="rb-panel-bd rb-table-wrap">
              <table className="rb">
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
                      <td colSpan={4} className="rb-empty">
                        No entries.
                      </td>
                    </tr>
                  )}
                  {entries.map((e) => (
                    <tr key={e.seq}>
                      <td>{e.seq}</td>
                      <td>
                        <span className="rb-badge purple">{e.type}</span>
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

        <footer className="rb-footer">
          <strong>Nexus Builder Hackathon 2026</strong>
          <br />
          Bounded autonomy · AgenC SOL escrow · Energy City tax stages
          <br />
          Last filing:{" "}
          {snap?.updatedAtMs
            ? new Date(snap.updatedAtMs).toISOString()
            : "never"}{" "}
          · {new Date(data.serverTime).toISOString()}
        </footer>
      </main>
    </div>
  );
}
