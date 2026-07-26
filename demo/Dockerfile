# CITIZEN-0 — reproducible demo container
#
# Runs the resident in MOCK mode against a seeded local marketplace so the
# full economic arc (survival -> solvency -> firm mode -> society) replays
# the same way on any machine. No mainnet, no wallet, no Telegram.
FROM node:22-slim

WORKDIR /app

# Install deps first so source edits don't bust the dependency layer.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/agent/package.json packages/agent/
COPY packages/web/package.json packages/web/
RUN npm ci --no-audit --no-fund

COPY packages/ packages/
COPY tsconfig*.json ./

# shared is imported by both agent and web, so it must be compiled.
# Drop any stale incremental build info first: a tsbuildinfo copied from the
# host makes tsc think it is up to date and emit nothing, leaving dist empty.
# The final ls is an assertion so a silent no-op build fails the image build.
RUN rm -f packages/*/tsconfig.tsbuildinfo \
 && npm run build:shared \
 && ls -l packages/shared/dist/index.js

# Demo state lives here; both services share it via a named volume.
ENV DATA_DIR=/data
RUN mkdir -p /data

# Build the web record with no basePath so the demo serves at "/".
ENV NEXT_BASE_PATH=""
RUN npm run build -w @citizen-0/web

EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@citizen-0/web"]
