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
3. Skim this README — live vs mock honesty table below  
4. Optional: clone and run `npm run agent:once` in mock mode  

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

**Design rule:** one adapter interface. Mock and live implement the same port. README stays honest when mainnet claim is flipped on.

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
| 4–5 | Prosperity / society (stretch) | Not started |
| 6 | Soak, demo video, submission form | In progress |

---

## License

MIT · Built for Nexus Builder Hackathon 2026
