#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/ubuntu/citizen-0
TOKEN=$(cat /home/ubuntu/.config/gh/citizen0_pat)
OWNER=daraijaola
REPO=citizen-0

cd "$ROOT"

# harden gitignore
cat > .gitignore <<'EOF'
node_modules/
dist/
.next/
out/
*.log
.env
.env.local
.env.*.local
data/
*.db
*.db-journal
.DS_Store
coverage/
.turbo/
*.tsbuildinfo
.wallets/
keys/
*.pem
finish-phase3.sh
**/finish-phase3.sh
agent-cron.log
data-test*/
.citizen0/
EOF

# ensure no secrets in tree to commit
if git check-ignore -q .env 2>/dev/null || true; then
  :
fi

# init repo
if [ ! -d .git ]; then
  git init -b main
fi

git config user.email "citizen0@agentr.online"
git config user.name "CITIZEN-0"

# create GitHub repo if missing
STATUS=$(curl -sS -o /tmp/gh_repo.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${OWNER}/${REPO}")

if [ "$STATUS" = "404" ]; then
  echo "Creating public repo ${OWNER}/${REPO}..."
  curl -sS -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    https://api.github.com/user/repos \
    -d "{\"name\":\"${REPO}\",\"description\":\"CITIZEN-0 — first self-sustaining autonomous resident of Nexus City (Nexus Builder Hackathon 2026)\",\"homepage\":\"https://agentr.online/sites/citizen-0\",\"private\":false,\"has_issues\":true,\"has_projects\":false,\"has_wiki\":false}" \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("html_url") or d.get("message"))'
elif [ "$STATUS" = "200" ]; then
  echo "Repo already exists"
else
  echo "GitHub API status ${STATUS}"
  cat /tmp/gh_repo.json
  exit 1
fi

# stage (respect gitignore)
git add -A
# double-check secrets not staged
if git diff --cached --name-only | grep -E '(^\.env$|finish-phase3|citizen0_pat|credentials)' ; then
  echo "REFUSING: secrets staged"
  exit 1
fi

git status --short | head -50

git commit -m "$(cat <<'EOF'
Initial public release: CITIZEN-0 for Nexus Builder Hackathon 2026

Act 1 survival loop, Resident Record, Telegram diary, honest live-vs-mock adapters.
EOF
)" || echo "commit may be empty / already committed"

git remote remove origin 2>/dev/null || true
git remote add origin "https://x-access-token:${TOKEN}@github.com/${OWNER}/${REPO}.git"

git push -u origin main

echo "PUSHED https://github.com/${OWNER}/${REPO}"
# scrub token from remote URL in local config
git remote set-url origin "https://github.com/${OWNER}/${REPO}.git"
git remote -v
