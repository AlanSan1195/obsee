# Plan 003: Establecer la base de tests con Vitest para la lógica pura

> **Instrucciones para el ejecutor**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de avanzar.
> Si ocurre algo de la sección "Condiciones de STOP", detente y reporta — no
> improvises. Al terminar, actualiza la fila de este plan en `plans/README.md`.
>
> **Chequeo de deriva (ejecutar primero)**: `git diff --stat 86bec05..HEAD -- src/shared src/main/obs-manager.ts package.json`
> Si algún archivo en alcance cambió desde que se escribió este plan, compara
> los extractos de "Estado actual" contra el código vivo antes de continuar;
> si no coinciden, trátalo como condición de STOP. (Excepción esperada: el
> plan 002 borra `src/shared/groq.ts` y `src/shared/serviceManager.ts` — eso
> NO es deriva.)

## Estado

- **Prioridad**: P1
- **Esfuerzo**: M
- **Riesgo**: LOW
- **Depende de**: plans/002-limpiar-codigo-muerto.md (recomendado, no estricto)
- **Categoría**: tests
- **Planeado en**: commit `86bec05`, 2026-06-10

## Por qué importa

El repo no tiene ni un solo test. Toda la validación de la frontera IPC
(`src/shared/validation.ts`, 316 líneas), la recomendación local de respaldo
(`src/shared/localRecommendation.ts`) y los mapeos hacia OBS
(`src/main/obs-manager.ts`: mapeo de encoders, calidad de grabación, scoring
de dispositivos de audio) son funciones puras perfectamente testeables que hoy
solo se verifican a mano contra OBS real. Los planes 004 (upgrade de Electron)
y 008 (audio etapa 2) necesitan esta red de seguridad antes de tocar nada.

## Estado actual

- `package.json` — scripts actuales: `dev`, `build`, `build:main`,
  `build:renderer`, `typecheck`, `lint`. **No existe script `test`.**
- `src/shared/validation.ts` — exporta `parseResolution`,
  `validateOBSAudioConfig`, `validateOBSConfig`,
  `validateOBSConnectionSettings`, `validateSystemInfo`,
  `validateAIRecommendationRequest`, `validateAIRecommendation`. Todas
  devuelven `{ success: true, value } | { success: false, message }`.
- `src/shared/localRecommendation.ts` — exporta `getLocalRecommendation(request)`.
- `src/main/obs-manager.ts` — contiene helpers puros **privados de módulo**
  (no exportados) en las líneas 45-229: `getStreamServer`,
  `getSimpleEncoderId`, `getSimpleRecordingQuality`, `scoreAudioDevice`,
  `isAudioInputKind`, `scoreAudioInput`, `isSameFilterValue`,
  `getFilterSettings`, `areObsrecFiltersConfigured`, más los pequeños
  `getStringSetting`/`getNumberSetting`/`isRecord`/etc.

Extracto de `src/main/obs-manager.ts:51-61` (uno de los helpers a extraer):

```ts
function getSimpleEncoderId(encoder: string): string | null {
  const normalized = encoder.toLowerCase();

  if (normalized.includes('nvenc')) return 'nvenc';
  if (normalized.includes('x264')) return 'x264';
  if (normalized.includes('qsv')) return 'qsv';
  if (normalized.includes('amf') || normalized.includes('amd')) return 'amd';
  if (normalized.includes('apple') || normalized.includes('videotoolbox')) return 'apple_h264';

  return null;
}
```

Extracto de `src/shared/validation.ts:26-40` (ejemplo del contrato a testear):

```ts
export function parseResolution(value: string): ValidationResult<{ width: number; height: number }> {
  const match = /^(\d{3,4})x(\d{3,4})$/.exec(value.trim());
  if (!match) {
    return { success: false, message: 'Resolution must use the format 1920x1080.' };
  }
  ...
}
```

Convenciones del repo: TypeScript estricto, ESLint plano
(`eslint.config.mjs`), imports con rutas relativas. Stack de build: Vite 5
para el renderer, `tsc` CommonJS para el main.

## Comandos que necesitarás

| Propósito  | Comando                          | Esperado en éxito          |
|------------|----------------------------------|----------------------------|
| Instalar   | `pnpm install`                   | exit 0                     |
| Agregar dep| `pnpm add -D vitest@^3`          | exit 0                     |
| Typecheck  | `pnpm run typecheck`             | exit 0                     |
| Lint       | `pnpm run lint`                  | exit 0                     |
| Tests      | `pnpm test`                      | todos pasan (tras Paso 2)  |

## Alcance

**En alcance**:
- `package.json` (devDependency `vitest`, script `test`)
- `src/main/obs-helpers.ts` (crear — helpers puros extraídos)
- `src/main/obs-manager.ts` (solo quitar los helpers movidos e importarlos)
- `src/shared/validation.test.ts` (crear)
- `src/shared/localRecommendation.test.ts` (crear)
- `src/main/obs-helpers.test.ts` (crear)
- `tsconfig.main.json` y `tsconfig.json` (solo si hace falta excluir `*.test.ts` del build)

**Fuera de alcance**:
- Cualquier cambio de comportamiento en los helpers extraídos — el movimiento
  debe ser copy-paste exacto.
- Tests de componentes React, tests E2E, tests del WebSocket de OBS — etapa
  posterior, requieren infraestructura de mocks que no vale la pena aún.
- La clase `OBSManager` en sí (métodos `connect`/`configure`/etc.).

## Flujo de git

- Rama: `advisor/003-base-de-tests`
- Commits en español por unidad lógica (ej.: `add: vitest y tests de validación`).
- NO hagas push ni abras PR salvo que el operador lo indique.

## Pasos

### Paso 1: Instalar Vitest y agregar el script

```bash
pnpm add -D vitest@^3
```

En `package.json`, agrega a `scripts`:

```json
"test": "vitest run"
```

Si `vitest@^3` falla por conflicto de peers con Vite 5, usa `vitest@^2` y
anótalo en el reporte.

**Verificar**: `pnpm test` → exit code 1 con mensaje "No test files found" (aún no hay tests; eso es lo esperado en este paso).

### Paso 2: Excluir los tests del build de producción

- En `tsconfig.main.json`, agrega `"**/*.test.ts"` al array `exclude`.
- En `tsconfig.json` (raíz), agrega `"**/*.test.ts"` al array `exclude` solo
  si el typecheck del renderer reporta errores por los tests; si no, déjalo.

**Verificar**: `pnpm run build:main` → exit 0 y `ls dist/main/*.test.js 2>/dev/null` → sin resultados

### Paso 3: Extraer los helpers puros de `obs-manager.ts`

Crea `src/main/obs-helpers.ts` y **mueve** (copy-paste exacto, sin editar
lógica) desde `src/main/obs-manager.ts` estas funciones y constantes,
exportándolas todas:

- `defaultAudioConfig`, `obsrecFilterNames`
- los tipos `OBSJsonSettings`, `OBSAudioFilterDefinition`
- `getStreamServer`, `getSimpleEncoderId`, `getSimpleRecordingQuality`
- `getStringSetting`, `getNumberSetting`, `isRecord`, `getOptionalString`,
  `getStringValue`, `getBooleanValue`
- `scoreAudioDevice`, `isAudioInputKind`, `scoreAudioInput`
- `isSameFilterValue`, `getFilterSettings`, `areObsrecFiltersConfigured`

Los imports de tipos que necesitan (de `../shared/types`): `OBSAudioConfig`,
`OBSAudioFilterSnapshot`, `OBSPlatform`. En `obs-manager.ts`, elimina las
definiciones movidas e importa todo desde `'./obs-helpers'`. El tipo
`AudioInputCandidate` se queda en `obs-manager.ts` (solo se usa ahí).

**Verificar**: `pnpm run typecheck && pnpm run lint` → ambos exit 0

### Paso 4: Tests de `validation.ts`

Crea `src/shared/validation.test.ts` con `describe`/`it` de vitest
(`import { describe, it, expect } from 'vitest'`). Casos mínimos:

- `parseResolution`: acepta `'1920x1080'`; rechaza `'1920×1080'`, `'abc'`,
  `'19201x1080'` (5 dígitos) y `'099x100'` no — ojo: `'099'` tiene 3 dígitos y
  es válido para la regex; el caso límite a fijar es que `'4097x2160'` pasa la
  regex pero NO el rango (espera `success: false`).
- `validateOBSConnectionSettings`: acepta `{host:'localhost',port:4455,password:''}`;
  rechaza puerto 5173 (mensaje específico), puerto 0, puerto 70000, host vacío;
  recorta espacios de host/password.
- `validateOBSConfig`: caso feliz completo; rechaza `mode` inválido, `fps` 0 y
  241, `bitrate` 100001, `audioBitrate` 1025; normaliza `encoder` a minúsculas
  y redondea `fps`/`bitrate`; con `audio` inválido devuelve el error del audio.
- `validateOBSAudioConfig`: caso feliz; rechaza `gainDb` 31 y -31,
  `compressorRatio` 0.5 y 33, thresholds fuera de [-60, 0]; redondea filtros a
  1 decimal (`gainDb: 10.26` → `10.3`).
- `validateAIRecommendation`: caso feliz; rechaza recomendación sin
  `resolution`; `reasoning` ausente → `'No reasoning was provided.'`.

**Verificar**: `pnpm test` → todos los tests pasan

### Paso 5: Tests de `localRecommendation.ts`

Crea `src/shared/localRecommendation.test.ts`. Helper local para construir un
`AIRecommendationRequest` base (CPU 8 cores, RAM 16, GPU NVIDIA con
`hasNvenc: true`, modo `stream_record`, plataforma `twitch`). Casos:

- Hardware potente + twitch → `1920x1080`, 60 fps, bitrate 6000, encoder `nvenc`.
- Hardware potente + youtube + modo con grabación → bitrate 9000.
- CPU 4 cores o RAM 8 → `1280x720`, 30 fps (3500 twitch / 4500 youtube).
- GPU vendor `'Apple'` sin nvenc → encoder `'apple vt h264'`; `'Intel'` → `'qsv'`;
  `'AMD'` → `'amd'`; desconocido → `'x264'`.
- `record_only` → `recording_quality: 'high'`; otros modos → `'stream'`.

**Verificar**: `pnpm test` → todos pasan

### Paso 6: Tests de `obs-helpers.ts`

Crea `src/main/obs-helpers.test.ts`. Casos:

- `getSimpleEncoderId`: `'nvenc h264'`→`'nvenc'`, `'obs_x264'`→`'x264'`,
  `'apple vt h264'`→`'apple_h264'`, `'videotoolbox'`→`'apple_h264'`,
  `'desconocido'`→`null`.
- `getSimpleRecordingQuality`: `'lossless'`→`'Lossless'`, `'stream'`→`'Stream'`,
  `'medium'`→`'Small'`, `'high'`→`'HQ'`, `undefined`→`'HQ'`.
- `getStreamServer`: `'twitch'`→ URL rtmp de Twitch; `'youtube'`→ URL rtmps de YouTube.
- `scoreAudioDevice`: un nombre con `'usb'` puntúa más alto que uno con
  `'default'`; `'facetime camera'` puntúa negativo.
- `areObsrecFiltersConfigured`: con los tres filtros OBSREC habilitados y
  settings por defecto → `true`; con el limiter deshabilitado → `false`; con
  `db` de gain a 5 en vez de 10 → `false`; lista vacía → `false`.

**Verificar**: `pnpm test` → todos pasan (deben existir tests en los 3 archivos)

## Plan de pruebas

(Este plan ES el plan de pruebas — ver Pasos 4-6.) Patrón estructural: no hay
tests previos en el repo; usa `describe` por función exportada e `it` por
caso, nombres de tests en español.

## Criterios de terminado

- [ ] `pnpm test` exit 0 con ≥ 25 tests pasando en 3 archivos
- [ ] `pnpm run typecheck` exit 0
- [ ] `pnpm run lint` exit 0
- [ ] `pnpm run build:main` exit 0 y no emite `*.test.js` en `dist/`
- [ ] `git diff 86bec05..HEAD -- src/main/obs-manager.ts` muestra solo
      eliminaciones de helpers + el import nuevo (sin cambios de lógica)
- [ ] Fila de estado actualizada en `plans/README.md`

## Condiciones de STOP

Detente y reporta si:

- Algún test razonable revela un **bug real** en la lógica actual (p. ej. un
  rango de validación que no coincide con su mensaje). NO "arregles" la lógica
  para que pase el test ni ajustes el test para ocultarlo: reporta el caso
  exacto y deja ese test marcado con `it.skip` y un comentario `BUG:`.
- La extracción del Paso 3 requiere cambiar firmas o lógica (debería ser
  movimiento puro).
- Vitest no puede ejecutarse por incompatibilidad con el lockfile/pnpm tras
  dos intentos.

## Notas de mantenimiento

- El plan 008 (audio etapa 2) modificará `getFilterSettings` y
  `areObsrecFiltersConfigured` — estos tests son su red de seguridad; deberá
  actualizarlos a la vez.
- Revisor: vigilar que `obs-manager.ts` haya quedado como movimiento puro
  (diff solo de eliminación + import).
- Deuda diferida a propósito: tests de `OBSManager` con un mock de
  `obs-websocket-js`, y CI que ejecute `pnpm test` (no se seleccionó el plan
  de CI en esta ronda).
