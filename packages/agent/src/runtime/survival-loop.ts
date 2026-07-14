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
 */

import { randomUUID } from "node:crypto";
import {
  DecisionLog,
  pickBestJob,
  policyFor,
  computeRunway,
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

  constructor(deps: SurvivalLoopDeps) {
    this.mode = deps.mode;
    this.agenc = deps.agenc;
    this.plot = deps.plot;
    this.signer = deps.signer;
    this.log = deps.log;
    this.citizenId = deps.citizenId ?? "CITIZEN-0";
    this.capabilities = deps.capabilities ?? CAPABILITY.COMPUTE;
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
      summary: `${this.citizenId} boot mode=${this.mode} phase=3`,
      data: {
        mode: this.mode,
        capabilities: this.capabilities.toString(),
        agencMode: this.agenc.mode,
        plotMode: this.plot.mode,
        charter: "v1.0.0",
        phase: 3,
        diary: Boolean(this.diary),
        telegram: this.diary?.telegramEnabled ?? false,
      },
    });

    if (this.agenc.mode === "mock" || this.mode === "mock") {
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
          stakeLamports: reg.stakeLamports.toString(),
        },
      });
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
      }
    } catch {
      // live balance may not be wired yet
    }

    const plot = await this.plot.getPlot();
    const obligation = await this.plot.refresh(now);
    const runway = computeRunway(balances.solLamports, obligation, now);

    return {
      identity: {
        citizenId: this.citizenId,
        displayName: "CITIZEN-0",
        agentPda: this.agentPda,
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
        const pick = pickBestJob(
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
            },
          });

          try {
            const worked = await this.proposeClaimAndWork(
              pick.job,
              openClaims,
            );
            if (worked) {
              this.claimBreaker.recordSuccess();
              actions.push(`job_settled=${pick.job.id}`);
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

      await this.plot.creditLamports?.(
        settlement.rewardLamports,
        `settlement:${job.id}`,
      );

      this.log.append({
        type: "INTENT_EXECUTED",
        atMs: Date.now(),
        summary: `Settled job ${job.id} +${settlement.rewardLamports} lamports`,
        data: {
          rewardLamports: settlement.rewardLamports.toString(),
          txSignature: settlement.txSignature,
          worker: deliverable.kind,
          engine: deliverable.engine,
        },
      });
      {
        const st = await this.snapshot();
        await this.diary?.write(
          Narrator.jobSettled(
            await this.ctxFromState(st),
            job.title,
            settlement.rewardLamports,
            `${deliverable.kind}/${deliverable.engine}`,
          ),
        );
      }
      return true;
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
