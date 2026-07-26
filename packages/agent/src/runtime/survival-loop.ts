/**
 * Survival loop orchestrator — Act 1 heart (Phase 2 hardened).
 *
 * Planes:
 *   Perception — balances, obligations, marketplace
 *   Policy     — solvency → intent proposals → policy signer
 *   Execution  — claim → worker pipeline + QA → submit → settle → tax
 *
 * Phase 2: specialized workers, self-QA, retries, circuit breakers.
 * Phase 3: first-person diary + optional admin intent visibility/gate.
 * Phase 4–5: firm mode (subcontract) + society (CITIZEN-1/2).
 */

import { randomUUID } from "node:crypto";
import {
  DecisionLog,
  pickBestJob,
  policyFor,
  computeRunway,
  isLargeJob,
  WORKER_SEED_BALANCE,
  type AgencPort,
  type CitizenState,
  type IntentProposal,
  type JobAttempt,
  type JobListing,
  type PlotPort,
  type RuntimeMode,
  CAPABILITY,
  AGENC_MAINNET,
} from "@citizen-0/shared";
import type { PolicySigner } from "./policy-signer.js";
import { produceDeliverablePipeline } from "../workers/pipeline.js";
import { classifyError, withRetry } from "./errors.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import type { DiaryService } from "../diary/service.js";
import { Narrator, voiceCtx } from "../diary/narrator.js";
import type { AdminGate } from "./admin-gate.js";
import { NoopAdminGate } from "./admin-gate.js";
import { runFirmJob } from "./firm-engine.js";
import { EconomyState, preferFirmJob } from "./economy-mixin.js";
import type { MockAgencAdapter } from "../adapters/mock-agenc.js";

export interface SurvivalLoopDeps {
  mode: RuntimeMode;
  agenc: AgencPort;
  plot: PlotPort;
  signer: PolicySigner;
  log: DecisionLog;
  citizenId?: string;
  capabilities?: bigint;
  diary?: DiaryService;
  adminGate?: AdminGate;
}

export interface TickResult {
  tick: number;
  solvency: string;
  stage: string;
  actions: string[];
  state: CitizenState;
}

export class SurvivalLoop {
  private readonly mode: RuntimeMode;
  private readonly agenc: AgencPort;
  private readonly plot: PlotPort;
  private readonly signer: PolicySigner;
  private readonly log: DecisionLog;
  private readonly citizenId: string;
  private readonly capabilities: bigint;
  private readonly claimBreaker: CircuitBreaker;
  private readonly diary?: DiaryService;
  private readonly adminGate: AdminGate;

  private tickCount = 0;
  private attempts: JobAttempt[] = [];
  private openJobs: JobListing[] = [];
  private agentPda?: string;
  private booted = false;
  private readonly economy = new EconomyState();

  constructor(deps: SurvivalLoopDeps) {
    this.mode = deps.mode;
    this.agenc = deps.agenc;
    this.plot = deps.plot;
    this.signer = deps.signer;
    this.log = deps.log;
    this.citizenId = deps.citizenId ?? "CITIZEN-0";
    // Mainnet open tasks often require GENERAL (2) or COMPUTE (1)
    this.capabilities = deps.capabilities ?? CAPABILITY.ALL;
    this.diary = deps.diary;
    this.adminGate = deps.adminGate ?? new NoopAdminGate();
    this.claimBreaker = new CircuitBreaker({
      name: "claim-submit",
      failureThreshold: 4,
      cooldownMs: 15_000,
    });
  }

  private async ctxFromState(state: CitizenState) {
    return voiceCtx({
      solvency: state.runway.solvency,
      stage: state.obligation.stage,
      balanceLamports: state.balances.solLamports,
      taxLamports: state.obligation.amountLamportsEstimate,
      msUntilDue: state.runway.msUntilDue,
      coverage: state.runway.coverageRatio,
    });
  }

  get decisionLog(): DecisionLog {
    return this.log;
  }

  async boot(): Promise<void> {
    if (this.booted) return;
    this.booted = true;

    this.log.append({
      type: "BOOT",
      atMs: Date.now(),
      summary: `${this.citizenId} boot mode=${this.mode} phase=4-5`,
      data: {
        mode: this.mode,
        capabilities: this.capabilities.toString(),
        agencMode: this.agenc.mode,
        plotMode: this.plot.mode,
        acts: "SURVIVAL|PROSPERITY|SOCIETY",
        charter: "v1.0.0",
        phase: "4-5",
        diary: Boolean(this.diary),
        telegram: this.diary?.telegramEnabled ?? false,
      },
    });

    // Register for mock always; for live when mockMutations hybrid is on
    // (LIVE_MUTATIONS=0) so claim/work path can run. Pure on-chain register
    // only when LIVE_MUTATIONS=1 (may throw if not fully wired).
    const shouldRegister =
      this.agenc.mode === "mock" ||
      this.mode === "mock" ||
      this.mode === "live";
    if (shouldRegister) {
      try {
        const reg = await withRetry(
          () =>
            this.agenc.ensureRegistered({
              capabilities: this.capabilities,
              endpoint: "https://citizen-0.local/agent",
              stakeLamports: 10_000_000n,
            }),
          {
            maxAttempts: 3,
            onRetry: (attempt, err, delay) => {
              this.log.append({
                type: "RETRY",
                atMs: Date.now(),
                summary: `Register retry ${attempt}: ${err.message}`,
                data: { delay, code: err.code },
              });
            },
          },
        );
        this.agentPda = reg.agentPda;
        this.log.append({
          type: "PERCEPTION",
          atMs: Date.now(),
          summary: `Registered agent ${reg.agentPda}`,
          data: {
            agentPda: reg.agentPda,
            authority: reg.authority,
            stakeLamports: reg.stakeLamports.toString(),
            agencMode: this.agenc.mode,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.append({
          type: "ERROR",
          atMs: Date.now(),
          summary: `Register skipped/failed: ${msg}`,
          data: { mode: this.mode },
        });
        // Live pure-on-chain may not be fully wired yet — continue for discover/balance
        if (this.mode !== "live") throw err;
      }
    }

    const state = await this.snapshot();
    const vctx = await this.ctxFromState(state);
    await this.diary?.write(Narrator.boot(vctx, this.mode));
  }

  async snapshot(): Promise<CitizenState> {
    const now = Date.now();
    let balances = await this.plot.getBalances();
    try {
      const agencBal = await this.agenc.getBalanceLamports();
      if (agencBal > balances.solLamports) {
        await this.plot.creditLamports?.(
          agencBal - balances.solLamports,
          "sync-from-agenc",
        );
        balances = await this.plot.getBalances();
      } else if (
        agencBal < balances.solLamports &&
        this.agenc.mode === "mock"
      ) {
        // In mock mode the adapter ledger is authoritative: it holds the
        // registration stake debit and every job settlement. Syncing only
        // upward hid the 10_000_000 lamport stake, so coverageRatio was
        // computed from the pre-stake balance and the firm/society gates
        // both opened on tick 1 before any work had been done.
        await this.plot.debitLamports?.(
          balances.solLamports - agencBal,
          "sync-from-agenc",
        );
        balances = await this.plot.getBalances();
      }
    } catch {
      // live balance may not be wired yet
    }

    const plot = await this.plot.getPlot();
    const obligation = await this.plot.refresh(now);
    const runway = computeRunway(balances.solLamports, obligation, now);

    const authorityWallet =
      "authorityPubkey" in this.agenc &&
      typeof (this.agenc as { authorityPubkey?: string }).authorityPubkey ===
        "string"
        ? (this.agenc as { authorityPubkey: string }).authorityPubkey
        : undefined;

    return {
      identity: {
        citizenId: this.citizenId,
        displayName: "CITIZEN-0",
        agentPda: this.agentPda,
        authorityWallet,
        mode: this.mode,
        createdAtMs: now,
      },
      balances,
      plot,
      obligation,
      runway,
      openJobs: this.openJobs,
      attempts: [...this.attempts],
      lastTickAtMs: now,
      tickCount: this.tickCount,
      economy: this.economy.snapshot(
        runway.coverageRatio,
        runway.solvency,
      ),
    };
  }

  async tick(): Promise<TickResult> {
    this.tickCount += 1;
    const actions: string[] = [];
    const now = Date.now();

    this.log.append({
      type: "TICK",
      atMs: now,
      summary: `Tick #${this.tickCount}`,
      data: { tick: this.tickCount },
    });

    let state = await this.snapshot();
    this.log.recordSolvency(state.runway.solvency, state.runway);

    const policy = policyFor(state.runway.solvency);
    actions.push(`solvency=${state.runway.solvency}`);

    // Act 2: firm unlock (mock path only — live has no postJob employer surface yet)
    if (
      this.agenc.mode !== "live" &&
      this.economy.tryUnlockFirm(
        state.runway.coverageRatio,
        state.runway.solvency,
      )
    ) {
      this.log.append({
        type: "FIRM_UNLOCK",
        atMs: Date.now(),
        summary: `Firm mode unlocked coverage=${state.runway.coverageRatio.toFixed(2)}`,
        data: { coverage: state.runway.coverageRatio },
      });
      await this.diary?.write(
        Narrator.firmUnlock(state.runway.coverageRatio),
      );
      actions.push("firm_unlock");
      // Ensure a firm-sized job exists in mock
      if (this.agenc.seedFirmJob) {
        try {
          await this.agenc.seedFirmJob(30_000_000n);
        } catch {
          /* ignore */
        }
      }
    }

    // Act 3: spawn society when flush after firm
    if (!this.economy.societySpawned) {
      const born = this.economy.trySpawnSociety(state.runway.coverageRatio);
      if (born) {
        const seedCost = WORKER_SEED_BALANCE * BigInt(born.length);
        try {
          await this.plot.debitLamports?.(seedCost, "society-seed");
          if (typeof (this.agenc as MockAgencAdapter).debitLamports === "function") {
            (this.agenc as MockAgencAdapter).debitLamports(
              seedCost,
              "society-seed",
            );
          }
        } catch {
          /* seed from narrative surplus if debit fails */
        }
        this.log.append({
          type: "SOCIETY_SPAWN",
          atMs: Date.now(),
          summary: `Spawned ${born.map((b) => b.citizenId).join(",")}`,
          data: {
            ids: born.map((b) => b.citizenId),
            seed: seedCost.toString(),
          },
        });
        await this.diary?.write(
          Narrator.societySpawn(born.map((b) => b.citizenId)),
        );
        actions.push("society_spawn");
      }
    }

    // Act 3: worker tax ticks
    if (this.economy.societySpawned) {
      this.economy.tickWorkers(now);
      const taxes = this.economy.collectWorkerTaxes(now);
      for (const t of taxes) {
        this.log.append({
          type: "WORKER_TAX",
          atMs: Date.now(),
          summary: `${t.id} paid tax ${t.amount}`,
          data: { id: t.id, amount: t.amount.toString() },
        });
        await this.diary?.write(
          Narrator.workerTax(t.id, Number(t.amount) / 1e9),
        );
        actions.push(`worker_tax=${t.id}`);
      }
    }

    // Act 2: second plot once firm has margin and not yet purchased
    if (
      this.economy.firmUnlocked &&
      !this.economy.firmPnL.secondPlotPurchased &&
      this.economy.firmPnL.parentJobsCompleted >= 1 &&
      state.runway.coverageRatio >= 3.5
    ) {
      const plot = this.economy.buySecondPlot();
      this.log.append({
        type: "SECOND_PLOT",
        atMs: Date.now(),
        summary: `Second plot ${plot.plotId}`,
        data: { plotId: plot.plotId },
      });
      await this.diary?.write(Narrator.secondPlot(plot.plotId));
      actions.push("second_plot");
    }

    // Diary heartbeat every tick (short status)
    if (this.tickCount === 1 || this.tickCount % 3 === 0) {
      await this.diary?.write(Narrator.status(await this.ctxFromState(state)));
    }

    // Discover with retry
    try {
      this.openJobs = await withRetry(
        () =>
          this.agenc.discoverJobs({
            actionableOnly: policy.requireClaimableOnly,
            minRewardLamports: policy.minRewardLamports,
            capabilities: this.capabilities,
            limit: 24,
          }),
        {
          maxAttempts: 3,
          onRetry: (attempt, err, delay) => {
            this.log.append({
              type: "RETRY",
              atMs: Date.now(),
              summary: `Discover retry ${attempt}: ${err.message}`,
              data: { delay, code: err.code },
            });
          },
        },
      );
      this.log.append({
        type: "PERCEPTION",
        atMs: Date.now(),
        summary: `Discovered ${this.openJobs.length} jobs`,
        data: {
          count: this.openJobs.length,
          ids: this.openJobs.map((j) => j.id),
        },
      });
      actions.push(`jobs_seen=${this.openJobs.length}`);
    } catch (err) {
      const ce = classifyError(err);
      this.log.append({
        type: "ERROR",
        atMs: Date.now(),
        summary: `Discover failed: ${ce.message}`,
        data: { code: ce.code, klass: ce.klass },
      });
      actions.push("discover_failed");
      this.openJobs = [];
    }

    // Tax only when due soon, overdue, or desperate — never spam-pay every tick
    const taxDueSoon =
      state.runway.msUntilDue < 3 * 24 * 60 * 60 * 1000 ||
      state.obligation.stage !== "GOOD" ||
      state.runway.solvency === "DESPERATE" ||
      state.runway.solvency === "DELINQUENT";
    if (
      policy.autoProposeTaxWhenFunded &&
      taxDueSoon &&
      state.balances.solLamports >= state.obligation.amountLamportsEstimate
    ) {
      try {
        const paid = await this.proposeAndPayTax(state);
        if (paid) actions.push("tax_paid");
      } catch (err) {
        const ce = classifyError(err);
        this.log.append({
          type: "TAX_FAILED",
          atMs: Date.now(),
          summary: ce.message,
          data: { code: ce.code },
        });
        actions.push("tax_error");
      }
    }

    const openClaims = this.attempts.filter(
      (a) => a.status === "claimed" || a.status === "working",
    ).length;

    if (openClaims < policy.maxConcurrentJobs) {
      if (!this.claimBreaker.canExecute()) {
        const st = this.claimBreaker.getStatus();
        this.log.append({
          type: "CIRCUIT",
          atMs: Date.now(),
          summary: "Claim circuit open — skip job this tick",
          data: st,
        });
        actions.push("circuit_open");
      } else {
        const nowUnix = Math.floor(Date.now() / 1000);
        const firmPick = preferFirmJob(
          this.openJobs,
          this.economy.firmUnlocked,
        );
        const pick = firmPick
          ? {
              job: firmPick,
              score: {
                jobId: firmPick.id,
                score: Number(firmPick.rewardLamports) / 1e9,
                reasons: ["firm_prefer"],
                eligible: true,
              },
            }
          : pickBestJob(
              this.openJobs,
              policy,
              this.capabilities,
              nowUnix,
            );

        if (pick) {
          this.log.append({
            type: "JOB_SCORED",
            atMs: Date.now(),
            summary: `Best job ${pick.job.id} score=${pick.score.score.toFixed(3)}`,
            data: {
              jobId: pick.job.id,
              title: pick.job.title,
              score: pick.score.score,
              reasons: pick.score.reasons,
              rewardLamports: pick.job.rewardLamports.toString(),
              firm:
                this.economy.firmUnlocked &&
                (isLargeJob(pick.job) || pick.job.firmEligible),
            },
          });

          try {
            const useFirm =
              this.economy.firmUnlocked &&
              (isLargeJob(pick.job) || Boolean(pick.job.firmEligible)) &&
              Boolean(this.agenc.postJob);

            const worked = useFirm
              ? await this.proposeFirmJob(pick.job)
              : await this.proposeClaimAndWork(pick.job, openClaims);
            if (worked) {
              this.claimBreaker.recordSuccess();
              actions.push(
                useFirm
                  ? `firm_settled=${pick.job.id}`
                  : `job_settled=${pick.job.id}`,
              );
            }
          } catch (err) {
            this.claimBreaker.recordFailure();
            const ce = classifyError(err);
            this.log.append({
              type: "ERROR",
              atMs: Date.now(),
              summary: `Job path failed: ${ce.message}`,
              data: {
                code: ce.code,
                klass: ce.klass,
                jobId: pick.job.id,
              },
            });
            actions.push(`job_error=${ce.code}`);
            // Permanent job errors should not kill the tick
            if (ce.klass === "FATAL") throw ce;
          }
        } else {
          actions.push("no_eligible_job");
        }
      }
    }

    state = await this.snapshot();
    return {
      tick: this.tickCount,
      solvency: state.runway.solvency,
      stage: state.obligation.stage,
      actions,
      state,
    };
  }

  private async proposeFirmJob(job: JobListing): Promise<boolean> {
    // Ensure at least two workers exist for hire narrative (society may lag)
    if (this.economy.workers.length === 0) {
      // temporary hire pool — society will formalize later
      const born = this.economy.trySpawnSociety(99);
      if (born) {
        await this.diary?.write(
          Narrator.societySpawn(born.map((b) => b.citizenId)),
        );
      }
    }

    const hireIntent = this.makeIntent({
      kind: "HIRE_WORKER",
      rationale: `Firm mode: decompose and subcontract "${job.title}"`,
      confidence: 0.9,
      spendLamports: 0n,
      counterparty: AGENC_MAINNET.programId,
      subjectId: job.id,
      payload: {
        firmMode: true,
        act: "PROSPERITY",
        rewardLamports: job.rewardLamports.toString(),
      },
    });
    this.log.recordIntentProposed(hireIntent);
    const decision = this.signer.evaluate(hireIntent, { openClaimCount: 0 });
    this.log.recordIntentDecided(decision);
    if (decision.status !== "APPROVED") {
      this.attempts.push({
        jobId: job.id,
        status: "declined",
        error: decision.reasons.join("; "),
        firmMode: true,
      });
      return false;
    }

    const result = await runFirmJob({
      job,
      agenc: this.agenc,
      log: this.log,
      workers: this.economy.workers,
      onWorkerPay: (id, lamports) => this.economy.payWorker(id, lamports),
      onDebitParent: async (lamports, reason) => {
        if (typeof (this.agenc as MockAgencAdapter).debitLamports === "function") {
          (this.agenc as MockAgencAdapter).debitLamports(lamports, reason);
        }
        await this.plot.debitLamports?.(lamports, reason);
      },
    });

    this.economy.recordFirmJob({
      gross: result.parentRewardLamports,
      paidWorkers: result.paidToWorkersLamports,
      margin: result.marginLamports,
    });
    this.economy.recordChildrenHired(result.childJobIds.length);

    // Credit parent settlement into plot ledger
    await this.plot.creditLamports?.(
      result.parentRewardLamports,
      `firm:${job.id}`,
    );

    this.attempts.push({
      jobId: job.id,
      status: "settled",
      claimedAtMs: Date.now(),
      settledAtMs: Date.now(),
      rewardLamports: result.parentRewardLamports,
      artifactSha256: result.proofHashHex,
      resultUri: result.resultUri,
      firmMode: true,
      childJobIds: result.childJobIds,
      marginLamports: result.marginLamports,
      paidToWorkersLamports: result.paidToWorkersLamports,
    });

    await this.diary?.write(
      Narrator.firmJob(
        job.title,
        result.childJobIds.length,
        Number(result.marginLamports) / 1e9,
        Number(result.paidToWorkersLamports) / 1e9,
      ),
    );
    return true;
  }

  private async proposeAndPayTax(state: CitizenState): Promise<boolean> {
    const intent = this.makeIntent({
      kind: "PAY_TAX",
      rationale: `Pay city maintenance for ${state.plot.plotId}; stage=${state.obligation.stage}; coverage=${state.runway.coverageRatio.toFixed(2)}`,
      confidence: 0.9,
      spendLamports: state.obligation.amountLamportsEstimate,
      counterparty: "8fj621jPjBV4jHrrV1LDd9LHzSHJ6ras2YvwFgG6sx18",
      subjectId: state.plot.plotId,
      payload: {
        plotId: state.plot.plotId,
        amountMicroUsd: state.obligation.amountMicroUsd.toString(),
        amountLamports: state.obligation.amountLamportsEstimate.toString(),
      },
    });

    this.log.recordIntentProposed(intent);
    await this.diary?.write(
      Narrator.intentProposed(intent.kind, intent.rationale, intent.spendLamports),
    );
    await this.diary?.notifyIntent({
      intentId: intent.id,
      kind: intent.kind,
      rationale: intent.rationale,
      spendLamports: intent.spendLamports,
    });

    const decision = this.signer.evaluate(intent, { openClaimCount: 0 });
    this.log.recordIntentDecided(decision);
    await this.diary?.write(
      Narrator.intentDecided(intent.kind, decision.status, decision.reasons),
    );

    if (decision.status !== "APPROVED") {
      this.log.append({
        type: "TAX_FAILED",
        atMs: Date.now(),
        summary: `Tax intent denied: ${decision.reasons.join("; ")}`,
        data: { reasons: decision.reasons },
      });
      await this.diary?.write(
        Narrator.taxFailed(await this.ctxFromState(state), decision.reasons.join("; ")),
      );
      return false;
    }

    // Optional human admin gate for real spend
    if (intent.spendLamports > 0n) {
      const gate = await this.adminGate.review({
        intentId: intent.id,
        kind: intent.kind,
        rationale: intent.rationale,
        spendLamports: intent.spendLamports,
      });
      if (gate === "DENIED") {
        await this.diary?.write(
          Narrator.taxFailed(await this.ctxFromState(state), "admin denied"),
        );
        return false;
      }
      if (gate === "TIMEOUT_AUTO") {
        this.log.append({
          type: "SUPERVISOR",
          atMs: Date.now(),
          summary: "Admin gate timeout — auto-approved within charter",
          data: { intentId: intent.id },
        });
      }
    }

    const result = await withRetry(() => this.plot.payTax(), {
      maxAttempts: 2,
      onRetry: (attempt, err, delay) => {
        this.log.append({
          type: "RETRY",
          atMs: Date.now(),
          summary: `Tax pay retry ${attempt}: ${err.message}`,
          data: { delay },
        });
      },
    });

    if (!result.ok) {
      this.log.append({
        type: "TAX_FAILED",
        atMs: Date.now(),
        summary: result.error ?? "tax payment failed",
        data: { amountLamports: result.amountLamports.toString() },
      });
      return false;
    }

    this.signer.recordSpend(result.amountLamports);
    this.log.append({
      type: "TAX_PAID",
      atMs: result.paidAtMs,
      summary: `Paid tax ${result.amountLamports} lamports for ${state.plot.plotId}`,
      data: {
        amountLamports: result.amountLamports.toString(),
        txSignature: result.txSignature,
      },
    });
    this.log.append({
      type: "INTENT_EXECUTED",
      atMs: Date.now(),
      summary: `Executed ${intent.kind} ${intent.id}`,
      data: { intentId: intent.id, txSignature: result.txSignature },
    });
    await this.diary?.write(
      Narrator.taxPaid(await this.ctxFromState(state), result.amountLamports),
    );
    await this.diary?.notifyIntent({
      intentId: intent.id,
      kind: intent.kind,
      rationale: intent.rationale,
      spendLamports: intent.spendLamports,
      status: "EXECUTED",
    });
    return true;
  }

  private async proposeClaimAndWork(
    job: JobListing,
    openClaimCount: number,
  ): Promise<boolean> {
    const intent = this.makeIntent({
      kind: "CLAIM_JOB",
      rationale: `Claim job to fund runway: "${job.title}" reward=${job.rewardLamports}`,
      confidence: 0.85,
      spendLamports: 0n,
      counterparty: AGENC_MAINNET.programId,
      subjectId: job.id,
      payload: {
        jobId: job.id,
        rewardLamports: job.rewardLamports.toString(),
        title: job.title,
      },
    });

    this.log.recordIntentProposed(intent);
    await this.diary?.write(
      Narrator.intentProposed(intent.kind, intent.rationale, intent.spendLamports),
    );
    await this.diary?.notifyIntent({
      intentId: intent.id,
      kind: intent.kind,
      rationale: intent.rationale,
      spendLamports: intent.spendLamports,
    });

    const decision = this.signer.evaluate(intent, { openClaimCount });
    this.log.recordIntentDecided(decision);
    await this.diary?.write(
      Narrator.intentDecided(intent.kind, decision.status, decision.reasons),
    );

    if (decision.status !== "APPROVED") {
      const attempt: JobAttempt = {
        jobId: job.id,
        status: "declined",
        error: decision.reasons.join("; "),
      };
      this.attempts.push(attempt);
      this.log.recordJobStatus(attempt);
      return false;
    }

    const claim = await withRetry(() => this.agenc.claimJob(job.id), {
      maxAttempts: 3,
      onRetry: (attempt, err, delay) => {
        this.log.append({
          type: "RETRY",
          atMs: Date.now(),
          summary: `Claim retry ${attempt}: ${err.message}`,
          data: { delay, jobId: job.id },
        });
      },
    });

    let attempt: JobAttempt = {
      jobId: job.id,
      status: "claimed",
      claimedAtMs: claim.claimedAtMs,
      rewardLamports: job.rewardLamports,
    };
    this.attempts.push(attempt);
    this.log.recordJobStatus(attempt);
    this.log.append({
      type: "INTENT_EXECUTED",
      atMs: Date.now(),
      summary: `Claimed job ${job.id}`,
      data: { ...claim },
    });

    {
      const st = await this.snapshot();
      await this.diary?.write(
        Narrator.jobClaimed(
          await this.ctxFromState(st),
          job.title,
          job.rewardLamports,
        ),
      );
    }

    // Work + QA pipeline
    attempt = { ...attempt, status: "working" };
    this.patchAttempt(attempt);
    this.log.recordJobStatus(attempt);

    let pipeline;
    try {
      pipeline = await produceDeliverablePipeline(job);
      this.log.append({
        type: "WORKER",
        atMs: Date.now(),
        summary: `Worker ${pipeline.kind} engine=${pipeline.engine} qa=${pipeline.qa.score.toFixed(2)}`,
        data: {
          kind: pipeline.kind,
          engine: pipeline.engine,
          qaScore: pipeline.qa.score,
          checks: pipeline.qa.checks,
        },
      });
      this.log.append({
        type: "QA_PASS",
        atMs: Date.now(),
        summary: `QA pass score=${pipeline.qa.score.toFixed(3)}`,
        data: { score: pipeline.qa.score },
      });
    } catch (err) {
      const ce = classifyError(err);
      this.log.append({
        type: "QA_FAIL",
        atMs: Date.now(),
        summary: ce.message,
        data: { code: ce.code },
      });
      attempt = { ...attempt, status: "failed", error: ce.message };
      this.patchAttempt(attempt);
      this.log.recordJobStatus(attempt);
      {
        const st = await this.snapshot();
        await this.diary?.write(
          Narrator.jobFailed(await this.ctxFromState(st), job.title, ce.message),
        );
      }
      throw ce;
    }

    const deliverable = pipeline.deliverable;

    const submitIntent = this.makeIntent({
      kind: "SUBMIT_DELIVERABLE",
      rationale: `Submit ${deliverable.kind}/${deliverable.engine} sha256=${deliverable.sha256Hex.slice(0, 16)}… qa=${deliverable.qaScore.toFixed(2)}`,
      confidence: Math.min(0.99, 0.7 + deliverable.qaScore * 0.3),
      spendLamports: 0n,
      counterparty: AGENC_MAINNET.programId,
      subjectId: job.id,
      payload: {
        jobId: job.id,
        proofHash: deliverable.sha256Hex,
        resultUri: deliverable.resultUri,
        worker: deliverable.kind,
        engine: deliverable.engine,
        qaScore: deliverable.qaScore,
      },
    });
    this.log.recordIntentProposed(submitIntent);
    const submitDecision = this.signer.evaluate(submitIntent, {
      openClaimCount: openClaimCount + 1,
    });
    this.log.recordIntentDecided(submitDecision);
    if (submitDecision.status !== "APPROVED") {
      attempt = {
        ...attempt,
        status: "failed",
        error: submitDecision.reasons.join("; "),
      };
      this.patchAttempt(attempt);
      this.log.recordJobStatus(attempt);
      return false;
    }

    const submitted = await withRetry(
      () =>
        this.agenc.submitDeliverable({
          jobId: job.id,
          artifactBytes: deliverable.bytes,
          resultUri: deliverable.resultUri,
        }),
      {
        maxAttempts: 3,
        onRetry: (n, err, delay) => {
          this.log.append({
            type: "RETRY",
            atMs: Date.now(),
            summary: `Submit retry ${n}: ${err.message}`,
            data: { delay, jobId: job.id },
          });
        },
      },
    );

    attempt = {
      ...attempt,
      status: "submitted",
      submittedAtMs: submitted.submittedAtMs,
      artifactSha256: submitted.proofHashHex,
      resultUri: submitted.resultUri,
    };
    this.patchAttempt(attempt);
    this.log.recordJobStatus(attempt);

    const settlement = await this.agenc.getSettlement(job.id);
    if (settlement?.status === "accepted") {
      attempt = {
        ...attempt,
        status: "settled",
        settledAtMs: settlement.settledAtMs,
        rewardLamports: settlement.rewardLamports,
      };
      this.patchAttempt(attempt);
      this.log.recordJobStatus(attempt);

      // Live path: reward often 0 here — SOL lands in wallet; snapshot syncs chain balance.
      // Mock path: credit plot ledger so runway updates immediately.
      if (settlement.rewardLamports > 0n) {
        await this.plot.creditLamports?.(
          settlement.rewardLamports,
          `settlement:${job.id}`,
        );
      }

      this.log.append({
        type: "INTENT_EXECUTED",
        atMs: Date.now(),
        summary: `Settled job ${job.id} +${settlement.rewardLamports} lamports (mode=${this.agenc.mode})`,
        data: {
          rewardLamports: settlement.rewardLamports.toString(),
          txSignature: settlement.txSignature,
          worker: deliverable.kind,
          engine: deliverable.engine,
          agencMode: this.agenc.mode,
        },
      });
      {
        const st = await this.snapshot();
        await this.diary?.write(
          Narrator.jobSettled(
            await this.ctxFromState(st),
            job.title,
            settlement.rewardLamports > 0n
              ? settlement.rewardLamports
              : job.rewardLamports,
            `${deliverable.kind}/${deliverable.engine}`,
          ),
        );
      }
      return true;
    }

    // Submitted on-chain, awaiting creator accept / auto-accept
    if (settlement?.status === "pending" || this.agenc.mode === "live") {
      this.log.append({
        type: "JOB_STATUS",
        atMs: Date.now(),
        summary: `Submitted live — pending review ${job.id}`,
        data: {
          jobId: job.id,
          txSignature: settlement?.txSignature,
          status: settlement?.status ?? "submitted",
        },
      });
      await this.diary?.write(
        Narrator.jobClaimed(
          await this.ctxFromState(await this.snapshot()),
          `[submitted/pending] ${job.title}`,
          job.rewardLamports,
        ),
      );
      return true; // progress without full settlement yet
    }

    return false;
  }

  private patchAttempt(next: JobAttempt): void {
    const i = this.attempts.findIndex((a) => a.jobId === next.jobId);
    if (i >= 0) this.attempts[i] = next;
    else this.attempts.push(next);
  }

  private makeIntent(input: {
    kind: IntentProposal["kind"];
    rationale: string;
    confidence: number;
    spendLamports: bigint;
    counterparty?: string;
    subjectId?: string;
    payload: Record<string, unknown>;
  }): IntentProposal {
    const now = Date.now();
    return {
      id: randomUUID(),
      kind: input.kind,
      rationale: input.rationale,
      confidence: input.confidence,
      spendLamports: input.spendLamports,
      counterparty: input.counterparty,
      subjectId: input.subjectId,
      payload: input.payload,
      proposedAtMs: now,
      expiresAtMs: now + 60_000,
    };
  }
}
