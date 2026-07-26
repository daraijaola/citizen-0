#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/citizen-0
set -a
# shellcheck disable=SC1091
source /home/ubuntu/citizen-0/.env
set +a
export DATA_DIR=/home/ubuntu/citizen-0/data
export FAST_TICKS="${FAST_TICKS:-1}"
export MAX_TICKS="${MAX_TICKS:-6}"

LOG=/home/ubuntu/citizen-0/agent-cron.log
PM=/usr/bin/npm

# Prevent overlapping ticks from corrupting state / the hash-chained log.
exec 9>/home/ubuntu/citizen-0/.agent.lock
if ! flock -n 9; then
  echo "[$(date -u +%FT%TZ)] previous tick still running; skipping" >> "$LOG"
  exit 0
fi

if "$PM" run agent:loop >> "$LOG" 2>&1; then
  exit 0
fi

echo "[$(date -u +%FT%TZ)] agent:loop failed; falling back to single tick" >> "$LOG"
"$PM" run agent:once >> "$LOG" 2>&1
