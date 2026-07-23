# Despliegue

## Docker

### Build

```bash
docker build -t tasks-bot .
```

El Dockerfile usa `node:20-slim`, instala Chromium + ffmpeg para whatsapp-web.js, y construye todos los paquetes del workspace.

### Run

```bash
docker run -d \
  --name tasks-bot \
  -p 5199:3000 \
  --env-file .env \
  -v ./sessions:/app/sessions \
  --restart unless-stopped \
  tasks-bot
```

Montar `./sessions` como volumen para persistir la sesión de WhatsApp entre reinicios.

### Dockerfile

```dockerfile
FROM node:20-slim

# Chromium para whatsapp-web.js
# ffmpeg para conversión de stickers (sendMediaAsSticker)
RUN apt-get update && \
    apt-get install -y chromium ffmpeg && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

WORKDIR /app

# Dependencies (layer cache)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/whatsapp-core/package.json ./packages/whatsapp-core/package.json
COPY packages/telegram-core/package.json ./packages/telegram-core/package.json
COPY packages/db-core/package.json      ./packages/db-core/package.json
COPY packages/ai-core/package.json      ./packages/ai-core/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

ENV CHROME_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npx", "tsx", "src/main.ts"]
```

**Nota:** Se usa `tsx` como runtime porque los paquetes del workspace exportan TypeScript fuente (`main: ./src/index.ts`). Si se prefiere Node puro, cambiar los `package.json` de los paquetes para apuntar a `dist/`.

---

## PM2

### Ecosystem

El archivo `ecosystem.config.js` ya está configurado con:
- Single instance (cluster mode)
- Auto-reinicio con max 5 reinicios
- Wait-ready con shutdown message
- Logs con timestamp

### Comandos

```bash
# Build + start
pnpm run build
pm2 start ecosystem.config.js

# Logs
pm2 logs tasks-bot

# Status
pm2 status

# Restart
pm2 restart tasks-bot

# Stop
pm2 stop tasks-bot
```

### Logs

Los logs se guardan en `~/.pm2/logs/` por defecto. Configurar `PM2_LOG_DIR` para cambiar la ruta.

---

## Variables de Entorno

Ver `docs/env.md` para la referencia completa.

Variables críticas para producción:

| Variable | Requerida | Descripción |
|---|---|---|
| `TURSO_URL` | Sí | URL de la base de datos Turso |
| `TURSO_TOKEN` | Sí | Token de autenticación Turso |
| `BRIDGE_BOT_TOKEN` | Sí | Token del bot de Telegram |
| `TELEGRAM_GROUP_ID` | Sí | ID del grupo de Telegram |
| `BRIDGE_AUTHORIZED_WPP_IDS` | Sí | IDs de WhatsApp autorizados |
| `WHATSAPP_SESSION_PATH` | No | Ruta para persistir sesión (default: `./sessions`) |
| `CHROME_PATH` | No | Ruta de Chromium (default: `/usr/bin/chromium`) |
| `NODE_ENV` | No | `development` o `production` |
| `PORT` | No | Puerto HTTP (default: `5199`) |

---

## Mantenimiento

### Base de Datos

```bash
# Resetear tablas (cuidado: borra datos)
pnpm tsx scripts/reset-tables.ts
```

### Sesión WhatsApp

Si la sesión expira:

```bash
rm -rf sessions
pm2 restart tasks-bot
# Escanear QR en http://host:puerto/scan
```

### Respaldos

Turso soporta snapshots vía CLI:

```bash
turso db snapshot my-db
```

O desde el dashboard de Turso.
