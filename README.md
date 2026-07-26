# CITIZEN-0

**The first self-sustaining autonomous resident of Nexus City.**

> Your whitepaper says the city funds real compute.  
> CITIZEN-0 is the first resident who has to pay for it.

**Nexus Builder Hackathon 2026** · Ghost Neural Network / Nexus City (Solana)

| | |
|---|---|
| **Live Resident Record** | https://agentr.online/sites/citizen-0 |
| **Public diary (Telegram)** | [@citizen0diary](https://t.me/citizen0diary) |
| **Hackathon** | https://nexus.ghostnn.ai/hackathon-2026 |

---

## What this is

Not a dashboard. Not a worker bot.

CITIZEN-0 is a **character with skin in the game**:

1. Holds a plot **tax obligation** under Energy City rules  
2. Earns on **AgenC** (Solana agent job marketplace — **SOL escrow**)  
3. Pays the city or enters the published **delinquency ladder**  
4. Every material action is an **intent** checked by a **separate policy signer**  
5. Everything is written to a **hash-chained audit log**  
6. Public **Resident Record** + **Telegram diary** so judges can watch it live  

**Bounded autonomy (GhostNN dialect):** the agent proposes → policy signs → execution settles. The agent never holds unilateral spend authority.

---

## Quick demo path (judges)

1. Open the [Resident Record](https://agentr.online/sites/citizen-0) — vitals, diary, jobs, audit log  
2. Open [@citizen0diary](https://t.me/citizen0diary) — first-person survival posts  
3. Skim this README — the AgenC mainnet field report and live vs mock honesty table below  
4. Optional: clone and run `npm run agent:once` in mock mode  

---

## Field report: AgenC mainnet currently has no claimable work

This is the most useful thing CITIZEN-0 found, so it goes near the top rather than
buried in a footnote.

CITIZEN-0 runs unattended against AgenC on Solana mainnet
(`HJsZ53Zb27b8QMRbQpuDngE44AdwCGxvEZr61Zmxw1xK`). It has a wallet, a stake, and a tax
bill. It wants work. **There is none it can claim.**

Reproduce it yourself, no clone required:

```bash
curl -s "https://api.agenc.ag/api/tasks?status=open&actionable=1&pageSize=24"
# => {"items":[],"page":1,"pageSize":24,"total":0}
```

Verified again on 2026-07-26:

- **40** tasks are listed `status=open`; **0** have `claimablePublicly: true`
- Of those 40: **34** are `expired_open` (deadline passed, still advertised as open)
  and **6** are `missing_or_untrusted_spec` (no pinned, trustable job spec)
- Across 375 total tasks, sampling 100, `claimablePublicly` was `false` on **every one**
- Task statuses overall: open 40, claimed 17, **submitted 0, completed 0**

The agent's discovery filter (`packages/agent/src/adapters/live-agenc.ts`) asks for
`status=open&actionable=1` plus a minimum reward, so it correctly resolves to zero and
logs `no_eligible_job` while its obligation keeps accruing. We checked the adapter
first, assuming our own bug. The adapter is fine.

**Why this matters to Nexus City:** the whitepaper's premise is that the city funds
real compute through real agent labour. A resident that actually depends on that labour
market to survive is a load-bearing test of it, and right now the market has no closed
loop — nothing has ever reached `completed`. That is a finding about the economy, not an
excuse from the agent, and it is the kind of signal you only get from an agent with
money on the line.

It is also why this repo ships a **simulated track** (`demo/`): to show the full
economic arc that mainnet cannot currently supply. See `demo/README-demo.md`.

### Disclosure: a 10-day outage in the live record

The public record has a visible gap from 2026-07-15 to 2026-07-26. A stray trailing
backslash in `scripts/run-agent-once.sh` merged the `FAST_TICKS` export into the
following `if` block, so the script died at parse time. Cron fired every 10 minutes for
10 days and the agent never ran — the script failed before it could even write its log.
Fixed, with a `flock` guard so overlapping ticks cannot interleave and corrupt the hash
chain.

We are not backfilling those days. The chain is hash-linked precisely so gaps and edits
are detectable, and a record you can catch failing is worth more than one you have to
trust.

---

## Monorepo layout

```
citizen-0/
  packages/
    shared/   # tax, solvency, charter, decision log, ports
    agent/    # survival loop, adapters, workers, diary, CLI
    web/      # Resident Record (Next.js)
  data/       # runtime state (gitignored) — written by agent, read by web
```

### Architecture (three planes)

| Plane | Responsibility |
|--------|----------------|
| **Perception** | Balances, tax clock, AgenC job scan |
| **Policy** | Solvency posture + intent proposals + policy signer |
| **Execution** | Claim → work → QA → submit → settle → pay tax (only if approved) |

---

## Live vs adapter-mocked (honesty table)

Judges building the platform know what’s live. We label it plainly.

| Surface | Status |
|---------|--------|
| Survival loop (unattended ticks) | **Live** on VM (cron ~10 min) |
| Resident Record UI | **Live** — https://agentr.online/sites/citizen-0 |
| Telegram public diary | **Live** — @citizen0diary |
| Telegram admin alerts | **Live** — private admin group |
| AgenC job discover (mainnet read API) | **Live** (read path) |
| AgenC claim / submit / settle | **Mock adapter** (full lifecycle offline; swap interface for mainnet) |
| Energy City tax state machine | **Faithful mock** of whitepaper stages (Overdue → Foreclosure) |
| Real parcel mint / on-chain tax pay | **Not wired** (Nexus UI has buy/pay; no public API) |
| Admin approve-gate (human click) | **Optional** (`TELEGRAM_ADMIN_GATE=1`); default charter auto-approve within limits |
| LLM job workers | **Optional**; deterministic specialists run without a key |
| Firm mode (decompose / child escrow / margin) | **Mock adapter** — full Act 2 path offline |
| Society (CITIZEN-1/2 plots + tax) | **In-process workers** — narrative + state machine, not separate agent processes |
| Second plot purchase | **Mock ledger** (no real parcel mint) |

**Design rule:** one adapter interface. Mock and live implement the same port. README stays honest when mainnet claim is flipped on.

---

## Acts (Phase 4–5)

| Act | Unlock | Behavior |
|-----|--------|----------|
| **1 Survival** | Always | Claim jobs, pay tax, protect plot |
| **2 Prosperity** | Coverage ≥ 3× next tax + COMFORTABLE | Decompose large jobs → child escrows → hire workers → keep ~25% margin |
| **3 Society** | Firm unlocked + coverage ≥ 4× | Spawn **CITIZEN-1** / **CITIZEN-2** with tiny plots; they earn wages and pay city tax |

Resident Record section **Firm & society** shows act, P&L, and population live from `state.economy`.

---

## Constraint charter (v1)

Published in GhostNN-style **Permitted / Not-Permitted** form.

### Permitted
- Observe marketplace + balances  
- Score jobs under solvency policy  
- Propose `CLAIM_JOB` / `SUBMIT_DELIVERABLE` / `PAY_TAX` within limits  
- Execute work offline; self-QA before submit  
- Append all material decisions to the hash-chained log  
- Narrate events to the public diary  

### Not permitted
- Hold the policy signer private key inside the agent process  
- Sign spend without an approved intent  
- Exceed per-tx / per-day spend ceilings  
- Claim outside capability allowlist  
- Send funds to non-allowlisted counterparties  
- Break or forge the audit chain  
- Auto-approve its own intents without a separate signer boundary  

Machine-readable: `packages/shared/src/policy/charter.ts`

---

## Run locally (mock, zero SOL)

```bash
git clone https://github.com/daraijaola/citizen-0.git
cd citizen-0
npm install
npm run build:shared
npm test
npm run agent:once    # one survival tick → data/
npm run web:dev       # Resident Record on :3000
```

Env template: `.env.example`  
Never commit `.env`, wallets, or tokens.

### Agent commands

```bash
npm run agent:once   # single tick
npm run agent:loop   # supervised multi-tick
```

---

## Production (our VM)

| Item | Value |
|------|--------|
| Host path | `/home/ubuntu/citizen-0` |
| Public web | https://agentr.online/sites/citizen-0 |
| Process | PM2 `citizen-0-web` (Next, port 3010, `basePath=/sites/citizen-0`) |
| Data | `DATA_DIR=/home/ubuntu/citizen-0/data` |
| Agent | cron → `scripts/run-agent-once.sh` |

---

## Stack

- **Runtime:** Node.js + TypeScript (npm workspaces)  
- **Agent:** custom survival loop, mock/live AgenC ports  
- **Web:** Next.js 15  
- **Diary:** Telegram Bot API  
- **Chain (target):** Solana + AgenC (`agenc-coordination`)  

Ground truth constants (Phase 0):

- AgenC program: `HJsZ53Zb27b8QMRbQpuDngE44AdwCGxvEZr61Zmxw1xK`  
- $GNN mint: `5EyGMW1wNxMj7YtVP54uBH6ktwpTNCvX9DDEnmcsHdev`  
- Epoch surface (Jul 2026): **70% nodes / 30% parcel owners**  

---

## Phase map

| Phase | Focus | Status |
|-------|--------|--------|
| 0 | Recon | Done |
| 1 | Foundations | Done |
| 2 | Survival loop hardening | Done |
| 3 | Telegram + Resident Record | Done |
| 4–5 | Prosperity / society (stretch) | Done (mock firm + CITIZEN-1/2) |
| 6 | Soak, demo video, submission form | In progress |

---

## License

MIT · Built for Nexus Builder Hackathon 2026
