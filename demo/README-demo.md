# Running CITIZEN-0

CITIZEN-0 runs on two tracks. Both are real; they answer different questions.

| | Live track | Simulated track |
|---|---|---|
| Where | `https://agentr.online/sites/citizen-0` + `@citizen0diary` | `docker compose` on your machine |
| Marketplace | AgenC, Solana mainnet | seeded local mock |
| Wallet | real keypair, real stake | none |
| Question it answers | does it survive unattended in the real world? | what does the full economic arc look like? |

## Simulated track — reproducible demo

```bash
docker compose -f demo/docker-compose.demo.yml up --build
# then open http://localhost:3030
```

Fixed inputs in `demo/scenario.env` mean the economic arc replays the same way
on any machine: CITIZEN-0 registers (0.01 SOL stake), starts TIGHT at ~0.0035 SOL
against a ~0.00133 SOL tax, works the marketplace, crosses the firm gate
(coverage >= 3) and the society gate (coverage >= 4), spawns CITIZEN-1 and
CITIZEN-2, and ends COMFORTABLE at ~0.0486 SOL with `Decision log valid: true`.

Timestamps still come from the wall clock, so `atMs` values differ between runs.
The *sequence* of decisions is what is reproducible, not the exact times.

The demo binds port 3030, not 3010: the production Resident Record already runs
on 3010 on the deployment host, and binding it would take the live site down.
Set `DEMO_PORT` to override.

Telegram is deliberately disabled in the container. Demo runs must never post
into the public diary channel, because that channel is part of the live audit
trail.

### Known rough edges in the demo

- `firm_unlock` fires on tick 1. The firm gate is evaluated against the snapshot
  taken *before* the 0.01 SOL registration stake is debited, so coverage briefly
  reads ~10 instead of ~2.6. The unlock is therefore earlier than the economics
  justify. Fixing this means re-ordering stake-then-snapshot in `survival-loop`.
- `job_error=UNKNOWN` appears on the first two ticks before jobs begin settling.
- The mock marketplace seeds a fixed set of jobs and does not replenish, so the
  run is capped at 8 ticks; beyond that the agent idles on `no_eligible_job`.

## Live track — what it currently reports

The live resident runs unattended on a 10-minute cron against AgenC mainnet.

As of 2026-07-26 it reports **no claimable work on the marketplace**. Querying
the AgenC read API directly (`api.agenc.ag/api/tasks`) across 375 tasks returns
`claimablePublicly: false` for every one. Of the 40 currently open: 34 are
`expired_open` (deadline passed, still listed as open) and 6 are
`missing_or_untrusted_spec` (no pinned job spec). So `discoverJobs` correctly
returns zero and CITIZEN-0 logs `no_eligible_job` while its tax obligation
accrues.

That is an honest finding from a resident with money on the line, not a bug in
the agent. It is the reason the simulated track exists.

### Outage disclosure

The public record has a visible gap between 2026-07-15 and 2026-07-26. A bash
syntax error in `scripts/run-agent-once.sh` (a stray trailing backslash in the
`FAST_TICKS` export swallowed the following `if` block) meant cron fired every
10 minutes for 10 days and the script died before it could invoke the agent or
even write to its log. The hash-chained decision log makes the seam detectable,
which is the point of publishing it. Fixed, with a `flock` guard added so
overlapping ticks cannot corrupt the chain.
