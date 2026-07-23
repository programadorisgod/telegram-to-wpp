# Desarrollo

## Scripts Disponibles

| Script | Descripción |
|---|---|
| `pnpm run dev` | Desarrollo con hot-reload via `tsx watch` |
| `pnpm run build` | Build de todos los paquetes (`pnpm --filter @task-bot/* build`) + tsc |
| `pnpm run start` | Build + correr desde `dist/main.js` |
| `pnpm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `pnpm run lint` | ESLint sobre `src/` |
| `pnpm run db:push` | Aplicar migraciones Drizzle a Turso |
| `pnpm run db:generate` | Generar migración desde schema Drizzle |
| `pnpm run db:migrate` | Ejecutar migraciones con Drizzle Kit |
| `pnpm run db:studio` | Abrir Drizzle Studio UI |
| `pnpm run clean` | Limpiar sessions, .wwebjs_cache, dist |
| `pnpm run clean:all` | Lo mismo + node_modules |

---

## Flujo de Trabajo

### 1. Agregar un Feature Nuevo

1. Crear archivos en `src/interface/whatsapp/features/<name>/`
2. Implementar `BotFeature`:
   - `name`: string único (namespace)
   - `getMenuEntries()`: entries para el menú principal
   - `handleSubmenuCommand()`: comandos del submenú
   - `handleWaitingInput()`: estados de espera
   - `getTextAliases()`: opcional, para routing por texto
   - `isAvailableFor()`: opcional, para gating por sender
3. Registrar en `main.ts`:

```typescript
features = [myFeature, bridgeFeature];
```

### 2. Agregar un Puerto/Adaptador Nuevo

1. Definir interfaz en `src/application/ports/`
2. Implementar en `src/infrastructure/`
3. Pasar por constructor desde `main.ts`

---

## TypeScript

### Configuración

- `target: ES2022`
- `module: NodeNext` / `moduleResolution: NodeNext`
- `strict: true`

**Importante:** Todas las importaciones relativas usan extensión `.js` (requisito de NodeNext).

---

## Estructura de Carpetas

### Convenciones

- **Screaming Architecture:** `src/application/`, `src/infrastructure/`, `src/interface/`
- **Puertos y Adaptadores:** interfaces en `application/ports/` (o en packages), implementaciones en `infrastructure/`
- **Feature Registry:** features en `interface/whatsapp/features/<name>/`

### Naming

- Archivos: `PascalCase.ts` para clases/interfaces
- Exportaciones: `export class`, `export interface`, `export type`
- Default exports: **no usar** (preferir named exports)

---

## Dependencias entre Paquetes

```
whatsapp-core  (independiente)
telegram-core  (independiente)
db-core        (independiente)
ai-core        (independiente)

app principal (root):
  ├── @task-bot/whatsapp-core
  ├── @task-bot/telegram-core
  ├── @task-bot/db-core
  └── @task-bot/ai-core
```

Todos los paquetes son `workspace:*` en `package.json`. No hay dependencias circulares.

Build order: todos los paquetes se construyen primero (`pnpm --filter @task-bot/* build`), luego tsc compila `src/`.

---

## Testing

Actualmente el proyecto **no tiene tests configurados**.

Para agregar tests:
1. Elegir framework (vitest recomendado por velocidad y compatibilidad con tsx)
2. Configurar en cada paquete y root
3. Seguir el patrón de puertos y adaptadores

---

## Troubleshooting

### Base de datos no conecta

```bash
# Verificar credenciales
cat .env | grep TURSO

# Verificar que el paquete db-core está linkeado
ls -la node_modules/@task-bot/
```

### Sesión WhatsApp expiró

```bash
rm -rf sessions
pnpm run dev
# Escanear QR nuevamente
```

### Chromium no encontrado

```bash
# Verificar ruta
which chromium || which chromium-browser

# Setear en .env
CHROME_PATH=/snap/bin/chromium
```

### Error de compilación TypeScript

```bash
pnpm run typecheck
# Buscar errores de módulo (NodeNext requiere extensión .js en imports relativos)
```

### Bridge Telegram no funciona

```bash
# Verificar que el bot token es correcto
curl https://api.telegram.org/bot<TOKEN>/getMe

# Verificar que el grupo ID es correcto
# (agregar @getidsbot al grupo para obtener el ID)
```
