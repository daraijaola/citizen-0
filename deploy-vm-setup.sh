#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/ubuntu/citizen-0
cd "$ROOT"

# Prefer DATA_DIR in load-state
python3 <<'PY'
from pathlib import Path
p = Path("/home/ubuntu/citizen-0/packages/web/src/lib/load-state.ts")
t = p.read_text()
if "fromEnv" not in t:
    old = """function monorepoCandidates(filename: string): string[] {
  return [
    join(process.cwd(), \"data\", filename),"""
    new = """function monorepoCandidates(filename: string): string[] {
  const fromEnv = process.env.DATA_DIR
    ? [join(process.env.DATA_DIR, filename)]
    : [];
  return [
    ...fromEnv,
    join(process.cwd(), \"data\", filename),"""
    if old not in t:
        raise SystemExit("pattern not found in load-state.ts")
    p.write_text(t.replace(old, new, 1))
    print("patched load-state.ts")
else:
    print("load-state already patched")
PY

# rebuild web with basePath
cd "$ROOT/packages/web"
export NEXT_BASE_PATH=/sites/citizen-0
export NEXT_PUBLIC_BASE_PATH=/sites/citizen-0
npm run build

# ecosystem
cat > "$ROOT/ecosystem.config.cjs" <<'EOF'
module.exports = {
  apps: [
    {
      name: "citizen-0-web",
      cwd: "/home/ubuntu/citizen-0/packages/web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3010",
      env: {
        NODE_ENV: "production",
        PORT: "3010",
        NEXT_BASE_PATH: "/sites/citizen-0",
        NEXT_PUBLIC_BASE_PATH: "/sites/citizen-0",
        DATA_DIR: "/home/ubuntu/citizen-0/data",
      },
    },
  ],
};
EOF

# nginx
if ! grep -q "/sites/citizen-0" /etc/nginx/sites-enabled/agentr; then
  sudo python3 <<'PY'
from pathlib import Path
p = Path("/etc/nginx/sites-enabled/agentr")
t = p.read_text()
block = """
    location /sites/citizen-0 {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

"""
needle = "    location /sites/recall/app {"
if needle not in t:
    raise SystemExit("nginx needle not found")
p.write_text(t.replace(needle, block + needle, 1))
print("nginx patched")
PY
else
  echo "nginx already configured"
fi

sudo nginx -t
sudo systemctl reload nginx

# seed state
cd "$ROOT"
mkdir -p data
rm -f packages/shared/tsconfig.tsbuildinfo
npm run build:shared
npm run agent:once || true

# pm2
pm2 delete citizen-0-web 2>/dev/null || true
pm2 start "$ROOT/ecosystem.config.cjs"
pm2 save

sleep 2
echo "=== local ==="
curl -sI http://127.0.0.1:3010/sites/citizen-0 | head -15
echo "=== public ==="
curl -sI https://agentr.online/sites/citizen-0 | head -15
echo "=== pm2 ==="
pm2 list | grep citizen || true
