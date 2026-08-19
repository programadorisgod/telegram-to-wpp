FROM node:20-slim

# ── Corepack (pnpm) ───────────────────────────────────
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate

WORKDIR /app

# ── Dependencies (layer cache) ──────────────────────────
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/whatsapp-core/package.json ./packages/whatsapp-core/package.json
COPY packages/ai-core/package.json      ./packages/ai-core/package.json
COPY packages/db-core/package.json      ./packages/db-core/package.json
COPY packages/telegram-core/package.json ./packages/telegram-core/package.json

RUN pnpm install --frozen-lockfile

# ── Source ──────────────────────────────────────────────
COPY . .

# ── Build ───────────────────────────────────────────────
RUN pnpm run build

# ── Runtime ─────────────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Usamos tsx como runtime porque los paquetes del workspace
# exportan TypeScript fuente (main: ./src/index.ts)
CMD ["npx", "tsx", "src/main.ts"]
