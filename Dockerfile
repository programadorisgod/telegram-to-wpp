FROM node:20-slim

# ── System dependencies ─────────────────────────────────────
# Chromium is required by whatsapp-web.js (puppeteer)
# ffmpeg is required for sendMediaAsSticker conversion
RUN apt-get update && \
    apt-get install -y chromium ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# ── pnpm ────────────────────────────────────────────────────
RUN npm install -g pnpm

WORKDIR /app

# ── Dependencies (layer cache) ──────────────────────────────
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/whatsapp-core/package.json ./packages/whatsapp-core/package.json
COPY packages/ai-core/package.json      ./packages/ai-core/package.json
COPY packages/db-core/package.json      ./packages/db-core/package.json

RUN pnpm install --frozen-lockfile

# ── Source ──────────────────────────────────────────────────
COPY . .

# ── Build ───────────────────────────────────────────────────
RUN pnpm run build

# ── Runtime ─────────────────────────────────────────────────
ENV CHROME_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Usamos tsx como runtime porque los paquetes del workspace
# exportan TypeScript fuente (main: ./src/index.ts)
CMD ["npx", "tsx", "src/main.ts"]
