# Plan 002: Eliminar código muerto duplicado y endurecer el empaquetado

> **Instrucciones para el ejecutor**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de avanzar.
> Si ocurre algo de la sección "Condiciones de STOP", detente y reporta — no
> improvises. Al terminar, actualiza la fila de este plan en `plans/README.md`.
>
> **Chequeo de deriva (ejecutar primero)**: `git diff --stat 86bec05..HEAD -- src/shared src/main/ai package.json`
> Si algún archivo en alcance cambió desde que se escribió este plan, compara
> los extractos de "Estado actual" contra el código vivo antes de continuar;
> si no coinciden, trátalo como condición de STOP.

## Estado

- **Prioridad**: P1
- **Esfuerzo**: S
- **Riesgo**: LOW
- **Depende de**: ninguno
- **Categoría**: tech-debt
- **Planeado en**: commit `86bec05`, 2026-06-10

## Por qué importa

Hay dos archivos en `src/shared/` que nadie importa y que son copias casi
idénticas de `src/main/ai/`: la copia muerta de Groq incluso referencia el
modelo `mixtral-8x7b-32768`, que Groq ya retiró — si alguien la "reconectara"
por error, fallaría en runtime. Además, `src/main/ai/types.ts` duplica dos
interfaces que ya viven en `src/shared/types.ts`, y el glob de empaquetado
`dist/**/*` de electron-builder mete cualquier basura que exista en `dist/`
(hoy hay carpetas accidentales `dist/main 2/` y `dist/renderer 2/` en la
máquina del mantenedor) dentro de la app distribuida. Limpiar esto reduce la
superficie de confusión antes de agregar tests (plan 003).

## Estado actual

Archivos relevantes (todos verificados en `86bec05`):

- `src/shared/groq.ts` — copia muerta de `src/main/ai/groq.ts`; nadie la
  importa (verificado con `grep -rn "shared/serviceManager\|shared/groq" src`,
  que devuelve cero resultados en archivos `.ts`/`.tsx`). Única diferencia
  real: usa `model: 'mixtral-8x7b-32768'` (retirado) en vez de
  `openai/gpt-oss-120b`, e importa los tipos desde `'../shared/types'`.
- `src/shared/serviceManager.ts` — copia muerta byte a byte de
  `src/main/ai/serviceManager.ts` (verificado con `diff`, exit 0), salvo que
  importa `./groq` local.
- `src/main/ai/types.ts` — define `AIServiceMessage` y `AIService`, que son
  textualmente las mismas interfaces de `src/shared/types.ts:1-9`:

```ts
// src/shared/types.ts:1-9
export interface AIServiceMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIService {
  name: string;
  chat(messages: AIServiceMessage[]): Promise<AsyncGenerator<string>>;
}
```

- `src/main/ai/groq.ts:2` y `src/main/ai/serviceManager.ts:2` importan esos
  tipos desde `'./types'`:

```ts
// src/main/ai/groq.ts:1-2
import Groq from 'groq-sdk';
import type { AIService, AIServiceMessage } from './types';
```

- `package.json:49-52` — config de electron-builder:

```json
"files": [
  "dist/**/*",
  "package.json"
],
```

- En `src/shared/` y `src/main/ai/` existen artefactos compilados **no
  rastreados por git** (`*.js`, `*.js.map`, `*.d.ts`) generados por una corrida
  antigua de `tsc` con otro `outDir`. Están cubiertos por `.gitignore`
  (`src/**/*.js`, etc.). En un worktree limpio del ejecutor no existirán — no
  intentes borrarlos; ver "Notas de mantenimiento".

## Comandos que necesitarás

| Propósito  | Comando               | Esperado en éxito   |
|------------|-----------------------|---------------------|
| Instalar   | `pnpm install`        | exit 0              |
| Typecheck  | `pnpm run typecheck`  | exit 0, sin errores |
| Lint       | `pnpm run lint`       | exit 0              |
| Build main | `pnpm run build:main` | exit 0              |

## Alcance

**En alcance** (los únicos archivos que debes modificar/borrar):
- `src/shared/groq.ts` (borrar)
- `src/shared/serviceManager.ts` (borrar)
- `src/main/ai/types.ts` (borrar)
- `src/main/ai/groq.ts` (cambiar un import)
- `src/main/ai/serviceManager.ts` (cambiar un import)
- `package.json` (solo el bloque `build.files`)

**Fuera de alcance** (NO tocar):
- `src/shared/types.ts` — es la fuente de verdad de los tipos; no muevas nada.
- `src/main/index.ts`, `src/main/obs-manager.ts` — no importan nada de lo borrado.
- Cualquier archivo `*.js`, `*.js.map`, `*.d.ts` dentro de `src/` — son
  artefactos no rastreados que no existen en tu worktree.

## Flujo de git

- Rama: `advisor/002-limpiar-codigo-muerto`
- Mensajes de commit en español, estilo del repo (ej.: `chore: eliminar código muerto duplicado de IA`).
- NO hagas push ni abras PR salvo que el operador lo indique.

## Pasos

### Paso 1: Borrar las copias muertas de `src/shared/`

```bash
git rm src/shared/groq.ts src/shared/serviceManager.ts
```

**Verificar**: `pnpm run typecheck` → exit 0 (nada los importaba; si falla, STOP).

### Paso 2: Consolidar los tipos de IA en `src/shared/types.ts`

1. En `src/main/ai/groq.ts:2`, cambia
   `import type { AIService, AIServiceMessage } from './types';`
   por
   `import type { AIService, AIServiceMessage } from '../../shared/types';`
2. En `src/main/ai/serviceManager.ts:2`, aplica el mismo cambio de import.
3. Borra `src/main/ai/types.ts` con `git rm src/main/ai/types.ts`.

**Verificar**: `pnpm run typecheck && pnpm run lint` → ambos exit 0

### Paso 3: Endurecer el glob de empaquetado

En `package.json`, reemplaza el bloque `files` de electron-builder:

```json
"files": [
  "dist/main/**/*",
  "dist/shared/**/*",
  "dist/renderer/**/*",
  "package.json"
],
```

(Nota: `tsc -p tsconfig.main.json` emite a `dist/main/` y `dist/shared/`
porque `rootDir` es `./src`; Vite emite a `dist/renderer/`. Estos tres globs
cubren exactamente la salida legítima y excluyen carpetas accidentales como
`dist/main 2/`.)

**Verificar**: `pnpm run build:main` → exit 0 y `ls dist/main/index.js dist/shared/types.js` → ambos existen

### Paso 4: Verificación de ausencia de referencias

**Verificar**: `grep -rn "shared/groq\|shared/serviceManager\|ai/types" src --include='*.ts' --include='*.tsx'` → sin resultados

## Plan de pruebas

No hay tests en el repo todavía (los introduce el plan 003). La verificación
es typecheck + lint + build:main + el grep del Paso 4.

## Criterios de terminado

Todos deben cumplirse:

- [ ] `src/shared/groq.ts`, `src/shared/serviceManager.ts` y `src/main/ai/types.ts` no existen
- [ ] `pnpm run typecheck` exit 0
- [ ] `pnpm run lint` exit 0
- [ ] `pnpm run build:main` exit 0
- [ ] `grep -rn "mixtral" src` → sin resultados
- [ ] Ningún archivo fuera del alcance modificado (`git status`)
- [ ] Fila de estado actualizada en `plans/README.md`

## Condiciones de STOP

Detente y reporta si:

- El grep inicial muestra que algo SÍ importa `src/shared/groq.ts` o
  `src/shared/serviceManager.ts` (la base cambió desde `86bec05`).
- El typecheck falla después del Paso 1 o 2 con errores de imports faltantes.
- `pnpm run build:main` deja la salida en rutas distintas a `dist/main/` y
  `dist/shared/` (los globs del Paso 3 estarían mal).

## Notas de mantenimiento

- **Para el humano (no el ejecutor)**: en la máquina local hay artefactos no
  rastreados (`dist/main 2/`, `dist/renderer 2/`, `src/dist/`, `src/**/*.js`).
  Limpiarlos con `git clean -nXd` (vista previa) y luego `git clean -fXd`.
- Revisor: confirmar que `dist/shared/**/*` queda incluido en `files` — el
  proceso main compilado requiere `dist/shared/*.js` en runtime
  (`localRecommendation`, `validation`).
- Si más adelante se agrega un servicio Cerebras (intención visible en
  `.env.example`), debe vivir en `src/main/ai/`, no en `src/shared/`.
