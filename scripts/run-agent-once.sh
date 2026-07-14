#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/citizen-0
set -a
# shellcheck disable=SC1091
source /home/ubuntu/citizen-0/.env
set +a
export DATA_DIR=/home/ubuntu/citizen-0/data
export FAST_TICKS=1
npm run agent:once >> /home/ubuntu/citizen-0/agent-cron.log 2>&1
