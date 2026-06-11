# Plan 004: Actualizar Electron y electron-builder para eliminar CVEs conocidos

> **Instrucciones para el ejecutor**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de avanzar.
> Si ocurre algo de la sección "Condiciones de STOP", detente y reporta — no
> improvises. Al terminar, actualiza la fila de este plan en `plans/README.md`.
>
> **Chequeo de deriva (ejecutar primero)**: `git diff --stat 86bec05..HEAD -- package.json pnpm-lock.yaml src/main`
> Si algún archivo en alcance cambió desde que se escribió este plan, compara
> los extractos de "Estado actual" contra el código vivo antes de continuar;
> si no coinciden, trátalo como condición de STOP.

## Estado

- **Prioridad**: P2
- **Esfuerzo**: M
- **Riesgo**: MED
- **Depende de**: plans/003-base-de-tests.md (red de seguridad recomendada)
- **Categoría**: security
- **Planeado en**: commit `86bec05`, 2026-06-10

## Por qué importa

El proyecto fija `electron: ^33.0.0`, una línea que ya superó su fin de vida y
acumula vulnerabilidades publicadas. `pnpm audit` (corrido el 2026-06-10 en
`86bec05`) reporta 28 vulnerabilidades: 1 critical, 11 high. Las high de
Electron (varios use-after-free, inyección de switches de línea de comandos
vía `webPreferences`) se corrigen en `electron >= 39.8.5`. El resto
(`tar`, `tmp`, `shell-quote`) viene de las cadenas de dependencias de
`electron-builder` y `concurrently`, y se resuelve actualizándolos. Es una app
de escritorio que se distribuye como DMG/NSIS: el runtime con CVEs viaja
dentro del instalador.

## Estado actual

- `package.json:31-32` — `"electron": "^33.0.0"`, `"electron-builder": "^25.0.0"`.
- `package.json:30` — `"concurrently": "^9.0.0"` (trae la cadena con `shell-quote` vulnerable).
- Superficie de API de Electron usada (toda en `src/main/`): `app`,
  `BrowserWindow`, `ipcMain.handle`, `contextBridge.exposeInMainWorld`,
  `ipcRenderer.invoke`. No se usan APIs exóticas ni módulos nativos propios.
- `src/main/index.ts:21-25` — webPreferences ya siguen las prácticas seguras
  actuales:

```ts
webPreferences: {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
},
```

- El proceso main se compila con `tsc -p tsconfig.main.json` a CommonJS
  (`module: "CommonJS"`, `types: ["node"]`), con `@types/node: ^22.0.0`.

## Comandos que necesitarás

| Propósito  | Comando                          | Esperado en éxito                 |
|------------|----------------------------------|-----------------------------------|
| Instalar   | `pnpm install`                   | exit 0                            |
| Typecheck  | `pnpm run typecheck`             | exit 0                            |
| Lint       | `pnpm run lint`                  | exit 0                            |
| Tests      | `pnpm test`                      | todos pasan (si el plan 003 ya corrió) |
| Auditoría  | `pnpm audit`                     | 0 critical, 0 high de `electron`  |
| Build      | `pnpm run build:main && pnpm run build:renderer` | exit 0            |

## Alcance

**En alcance**:
- `package.json` (versiones de `electron`, `electron-builder`, `concurrently`,
  y `@types/node` solo si el typecheck lo exige)
- `pnpm-lock.yaml` (regenerado por pnpm)
- `src/main/**` — solo si la migración de Electron exige cambios puntuales de
  API (documenta cada uno en el commit)

**Fuera de alcance**:
- Subir de versión React, Vite, Tailwind, TypeScript, ESLint o cualquier otra
  dependencia no listada arriba — aunque `pnpm outdated` los muestre viejos.
- Cambiar la configuración de `webPreferences` (ya es segura).
- Reestructurar scripts de build.

## Flujo de git

- Rama: `advisor/004-actualizar-electron`
- Un commit por dependencia mayor actualizada (electron, electron-builder,
  concurrently), mensajes en español.
- NO hagas push ni abras PR salvo que el operador lo indique.

## Pasos

### Paso 1: Actualizar Electron a la última estable

```bash
pnpm add -D electron@latest
```

Anota en tu reporte la versión exacta instalada (debe ser ≥ 39.8.5; en
2026-06 la estable será posterior). Lee las "Breaking changes" de las notas de
versión de Electron entre la 33 y la instalada **solo para las APIs usadas**
(`app`, `BrowserWindow`, `ipcMain`, `contextBridge`, `ipcRenderer`): la
superficie usada es mínima y estable, no se esperan cambios.

**Verificar**: `pnpm run typecheck && pnpm run lint` → ambos exit 0

### Paso 2: Actualizar electron-builder y concurrently

```bash
pnpm add -D electron-builder@latest concurrently@latest
```

**Verificar**: `pnpm install` exit 0 y `pnpm run build:main && pnpm run build:renderer` → exit 0

### Paso 3: Verificar la auditoría

**Verificar**: `pnpm audit` → 0 vulnerabilidades critical y 0 high
provenientes de `electron`. Si quedan advisories en cadenas de dev-deps sin
versión parcheada publicada, lístalas en el reporte con su advisory y por qué
no son corregibles hoy.

### Paso 4: Humo manual (si el entorno lo permite)

Ejecuta `pnpm run dev` (requiere el plan 001 aplicado; si no lo está, ejecuta
`NODE_ENV=development pnpm run dev`). La ventana debe abrir, y la UI debe
renderizar sin errores en la consola de DevTools relacionados con el preload
(`window.electronAPI` debe existir: evalúa `!!window.electronAPI` en la
consola → `true`).

Si no puedes abrir GUI en tu entorno, marca el paso como "no verificado" en el
reporte.

**Verificar**: ventana abre, `!!window.electronAPI` → `true`

### Paso 5: Tests

**Verificar**: `pnpm test` → todos pasan (si el script `test` no existe porque
el plan 003 no ha corrido, anótalo y continúa).

## Plan de pruebas

Sin tests nuevos: los tests del plan 003 cubren la lógica pura, y la
verificación del runtime es el humo del Paso 4 más los builds. Si la migración
exigió cambios de código en `src/main/`, cada cambio debe quedar listado en el
reporte con la nota de versión de Electron que lo motivó.

## Criterios de terminado

- [ ] `package.json` fija `electron` ≥ 39.8.5 (idealmente la última estable)
- [ ] `pnpm audit` sin critical ni high de `electron`
- [ ] `pnpm run typecheck`, `pnpm run lint` exit 0
- [ ] `pnpm run build:main && pnpm run build:renderer` exit 0
- [ ] `pnpm test` exit 0 (si existe)
- [ ] Ningún archivo fuera del alcance modificado (`git status`)
- [ ] Fila de estado actualizada en `plans/README.md`

## Condiciones de STOP

Detente y reporta si:

- El typecheck o el arranque fallan tras la actualización y el error apunta a
  una API de Electron que el código usa de forma que no tiene reemplazo de una
  línea (no improvises una refactorización del main).
- `electron-builder` nuevo rechaza la configuración `build` existente de
  `package.json` con errores que exijan reestructurar `files`/targets.
- Resolver la auditoría requiere actualizar dependencias fuera del alcance
  (React, Vite, etc.).
- pnpm no puede resolver el árbol tras dos intentos (`pnpm install` falla).

## Notas de mantenimiento

- Electron publica una major ~cada 8 semanas y mantiene las 3 últimas:
  conviene repetir `pnpm audit` + bump al menos 2 veces al año.
- Revisor: el diff debe ser casi solo `package.json` + lockfile; cualquier
  cambio en `src/main/` merece escrutinio línea por línea.
- Diferido a propósito: actualizar Vite 5→7 y groq-sdk (sin CVEs conocidos en
  uso actual; menor beneficio/costo).
