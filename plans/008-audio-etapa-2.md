# Plan 008: Audio etapa 2 — supresión de ruido, monitoreo, sincronización y ducking

> **Instrucciones para el ejecutor**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de avanzar.
> Si ocurre algo de la sección "Condiciones de STOP", detente y reporta — no
> improvises. Al terminar, actualiza la fila de este plan en `plans/README.md`.
>
> **Chequeo de deriva (ejecutar primero)**: `git diff --stat 86bec05..HEAD -- src/main src/renderer/components/AudioConfiguration.tsx src/shared`
> Los planes 003 (extrae helpers a `src/main/obs-helpers.ts`), 005, 006 y 007
> tocan estos archivos — eso es esperado. Verifica que `getFilterSettings`,
> `areObsrecFiltersConfigured`, `getAudioSnapshot` y `configureAudio` existan
> (en `obs-helpers.ts`/`obs-manager.ts`) con contratos equivalentes a los
> extractos. Si no, STOP.

## Estado

- **Prioridad**: P3
- **Esfuerzo**: L
- **Riesgo**: MED
- **Depende de**: plans/003-base-de-tests.md (obligatorio — modifica lógica testeada) y plans/006-accesibilidad-ux-idioma.md (advertencias estructuradas); recomendado después de 007 (reutiliza `ConfirmDialog`)
- **Categoría**: direction (feature de audio)
- **Planeado en**: commit `86bec05`, 2026-06-10

## Por qué importa

La etapa 1 de audio (commit `86bec05`) detecta el micrófono, recomienda
dispositivo y aplica tres filtros (ganancia, compresor, limitador) más mono.
README_AUDIO.md documenta esto como "primera etapa". Esta etapa 2 cubre lo que
un streamer necesita después, y que el mantenedor pidió explícitamente:

1. **Supresión de ruido** — limpiar estática y ruido de fondo (filtro RNNoise
   de OBS, gratis y sin configuración).
2. **Monitoreo** — poder activar "Monitorizar y emitir" en el micrófono para
   escuchar exactamente lo que sale al aire (la infraestructura ya lee
   `monitorType`; falta poder escribirlo).
3. **Sincronización labial (lip sync)** — corregir el desfase imagen/sonido
   aplicando un desplazamiento en ms al micrófono (la infraestructura ya lee
   `syncOffsetMs`; falta poder escribirlo, con ayuda de cálculo: 3 cuadros a
   60 fps = 50 ms).
4. **Audio ducking** — que la música/audio del escritorio baje sola cuando el
   usuario habla: compresor con sidechain en la fuente de audio del
   escritorio, con el micrófono como fuente de ducking.

Todo se apoya en infraestructura que ya existe en `obs-manager.ts`; el costo
marginal es bajo comparado con construirlo desde cero.

## Estado actual

(Líneas referidas a `86bec05`; tras el plan 003 los helpers viven en
`src/main/obs-helpers.ts`.)

- `src/main/obs-manager.ts:188-213` — `getFilterSettings(config)` define los
  filtros OBSREC actuales:

```ts
function getFilterSettings(config: OBSAudioConfig): Record<string, OBSAudioFilterDefinition> {
  return {
    [obsrecFilterNames.gain]: { kind: 'gain_filter', settings: { db: config.filters.gainDb } },
    [obsrecFilterNames.compressor]: { kind: 'compressor_filter', settings: { ratio: ..., threshold: ..., attack_time: 6, release_time: 60, output_gain: 0, sidechain_source: 'none' } },
    [obsrecFilterNames.limiter]: { kind: 'limiter_filter', settings: { threshold: ..., release_time: 60 } },
  };
}
```

- `src/main/obs-manager.ts:27-31` — `obsrecFilterNames = { gain: 'OBSREC - Gain', compressor: 'OBSREC - Compressor', limiter: 'OBSREC - Limiter' }`.
- `src/main/obs-manager.ts:215-229` — `areObsrecFiltersConfigured` exige que
  TODOS los filtros esperados existan con los settings por defecto — si
  agregas un filtro al set, actualiza también esta función y sus tests.
- `src/main/obs-manager.ts:689-722` — `ensureAudioFilters` crea/actualiza
  filtros de forma idempotente con `CreateSourceFilter` /
  `SetSourceFilterSettings` / `SetSourceFilterEnabled`. Reutilízalo: es
  genérico respecto al set de filtros.
- `src/main/obs-manager.ts:393-399` — el snapshot ya lee
  `GetInputAudioMonitorType` y `GetInputAudioSyncOffset` (solo lectura).
- `src/main/obs-manager.ts:601-649` — `getPrimaryAudioInput()` usa
  `GetSpecialInputs` (claves `mic1..mic4`). **Las mismas respuestas traen
  `desktop1`/`desktop2`**, que es como se localizará la fuente de escritorio
  para el ducking.
- `src/shared/types.ts:27-33` — `OBSAudioConfig` (entrada de
  `configureAudio`): `inputName, deviceId?, deviceName?, mono, filters`.
- `src/shared/types.ts:65-82` — `OBSAudioSettingsSnapshot` ya incluye
  `monitorType: string` y `syncOffsetMs: number`.
- `src/shared/validation.ts:42-91` — `validateOBSAudioConfig` valida rangos de
  los filtros; cualquier campo nuevo de `OBSAudioConfig` debe validarse ahí.
- `src/renderer/components/AudioConfiguration.tsx` — UI de la etapa 1:
  selector de dispositivo, tarjetas Mono/Filtros, botón aplicar. La etapa 2
  agrega controles aquí.
- Identificadores de filtros de OBS (fuente: código fuente de OBS Studio,
  `plugins/obs-filters`): supresión de ruido = `noise_suppress_filter` con
  setting `method: 'rnnoise'`; compresor = `compressor_filter` cuyo
  `sidechain_source` acepta el **nombre de la fuente** del micrófono;
  monitoreo = `SetInputAudioMonitorType` con
  `'OBS_MONITORING_TYPE_NONE' | 'OBS_MONITORING_TYPE_MONITOR_ONLY' | 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT'`;
  sync = `SetInputAudioSyncOffset` con `inputAudioSyncOffset` en **milisegundos**.
  Verifica estos nombres contra los tipos de
  `node_modules/obs-websocket-js/dist/types.d.ts` antes de usarlos.

## Comandos que necesitarás

| Propósito  | Comando               | Esperado en éxito   |
|------------|-----------------------|---------------------|
| Typecheck  | `pnpm run typecheck`  | exit 0              |
| Lint       | `pnpm run lint`       | exit 0              |
| Tests      | `pnpm test`           | todos pasan         |
| Dev        | `pnpm run dev`        | ventana carga       |

## Alcance

**En alcance**:
- `src/shared/types.ts` (extender `OBSAudioConfig` y `OBSAudioSettingsSnapshot`)
- `src/shared/validation.ts` (+ tests) — campos nuevos
- `src/main/obs-helpers.ts` (o `obs-manager.ts` si el plan 003 no corrió) — set de filtros, helper de ducking
- `src/main/obs-manager.ts` — monitoreo, sync offset, ducking, snapshot de escritorio
- `src/main/index.ts`, `src/main/preload.ts`, `src/renderer/hooks/useElectronAPI.ts` — sin canales nuevos si cabe en `obs:configure-audio`; extender el payload
- `src/renderer/components/AudioConfiguration.tsx` — controles de etapa 2
- `README_AUDIO.md` — documentar la etapa 2

**Fuera de alcance**:
- Captura de audio por aplicación (`application audio capture`) — depende de
  plataforma (solo Windows en OBS estable) y de crear fuentes nuevas;
  documenta en README_AUDIO.md como guía manual, no lo implementes.
- Medición automática del desfase A/V — el usuario introduce los ms (con
  ayuda de cálculo en la UI).
- VST/plugins externos.
- Tocar la mezcla de escenas, tracks de grabación o el mixer avanzado.

## Flujo de git

- Rama: `advisor/008-audio-etapa-2`
- Commits por feature (supresión, monitoreo+sync, ducking, UI, docs).
- NO hagas push ni abras PR salvo que el operador lo indique.

## Pasos

### Paso 1: Extender tipos y validación

En `src/shared/types.ts`:

- `OBSAudioFilterConfig` — agrega `noiseSuppression: boolean;`
- `OBSAudioConfig` — agrega:
  `monitorType?: 'OBS_MONITORING_TYPE_NONE' | 'OBS_MONITORING_TYPE_MONITOR_ONLY' | 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT';`
  `syncOffsetMs?: number;`
  `ducking?: { enabled: boolean; desktopInputName: string };`
- `OBSAudioSettingsSnapshot` — agrega
  `desktopAudio?: { inputName: string; duckingConfigured: boolean };`

En `src/shared/validation.ts` (`validateOBSAudioConfig`): `noiseSuppression`
booleano requerido dentro de `filters`; `syncOffsetMs` opcional, entero finito
en [-950, 950] (rango que acepta OBS); `monitorType` opcional, uno de los tres
literales; `ducking` opcional con `enabled` booleano y `desktopInputName`
string no vacío.

**Verificar**: `pnpm run typecheck` → exit 0 (los call-sites que construyen
`OBSAudioConfig` — `AudioConfiguration.tsx` `defaultFilters`/`createDefaultAudioConfig` —
necesitarán `noiseSuppression: true` por defecto)

### Paso 2: Supresión de ruido en el set de filtros OBSREC

En el módulo de helpers (post-003: `src/main/obs-helpers.ts`):

1. `obsrecFilterNames` — agrega `noise: 'OBSREC - Noise Suppression'`.
2. `getFilterSettings(config)` — agrega, **solo si**
   `config.filters.noiseSuppression` es `true`:
   `[obsrecFilterNames.noise]: { kind: 'noise_suppress_filter', settings: { method: 'rnnoise' } }`.
   Orden recomendado del objeto: noise → gain → compressor → limiter (OBS
   aplica los filtros en orden de creación; suprimir ruido antes de
   comprimir evita amplificar la estática).
3. `areObsrecFiltersConfigured` — el config esperado del snapshot ahora
   incluye `noiseSuppression: true`; ajusta para que la ausencia del filtro de
   ruido cuente como "no configurado".

Actualiza los tests del plan 003 (`obs-helpers.test.ts`): set con supresión
activada incluye el cuarto filtro; con `noiseSuppression: false` no lo incluye
y `areObsrecFiltersConfigured` se evalúa coherentemente.

**Verificar**: `pnpm test` → todos pasan

### Paso 3: Escribir monitoreo y sync offset en `configureAudio`

En `src/main/obs-manager.ts`, dentro de `configureAudio` (después del bloque
de mono, antes de `ensureAudioFilters`):

```ts
if (config.monitorType) {
  try {
    await this.obs.call('SetInputAudioMonitorType', {
      inputName: config.inputName,
      monitorType: config.monitorType,
    });
  } catch (error) { /* push a warnings, patrón existente */ }
}

if (typeof config.syncOffsetMs === 'number') {
  try {
    await this.obs.call('SetInputAudioSyncOffset', {
      inputName: config.inputName,
      inputAudioSyncOffset: config.syncOffsetMs,
    });
  } catch (error) { /* push a warnings */ }
}
```

Confirma los nombres exactos de parámetros en los tipos de `obs-websocket-js`
antes de escribir (condición de STOP si difieren).

**Verificar**: `pnpm run typecheck` → exit 0

### Paso 4: Ducking sobre el audio del escritorio

1. En `getPrimaryAudioInput` ya se llama `GetSpecialInputs`; extrae también
   `desktop1` (y `desktop2` como fallback) en un método nuevo
   `private async getDesktopAudioInputName(): Promise<string | null>`.
2. En `getAudioSnapshot`, llena `desktopAudio` del snapshot: nombre de la
   fuente de escritorio y `duckingConfigured` (existe un filtro
   `'OBSREC - Ducking'` habilitado en esa fuente).
3. Helper `getDuckingFilter(micInputName: string)` en el módulo de helpers:

```ts
{ kind: 'compressor_filter', settings: { ratio: 4, threshold: -30, attack_time: 6, release_time: 300, output_gain: 0, sidechain_source: micInputName } }
```

   con nombre `'OBSREC - Ducking'` (agrega `ducking` a `obsrecFilterNames`).
   **Nota**: `sidechain_source` recibe el nombre de la fuente del micrófono;
   `release_time` largo (300 ms) para que la música regrese suave.
4. En `configureAudio`, si `config.ducking?.enabled`, aplica ese filtro sobre
   `config.ducking.desktopInputName` con la misma mecánica idempotente de
   `ensureAudioFilters` (generaliza `ensureAudioFilters` para aceptar
   `(sourceName, filters, warnings)` en lugar de leer siempre
   `config.inputName`). Si no hay fuente de escritorio, agrega advertencia:
   `'No se encontro una fuente de audio de escritorio para el ducking.'`
   Si `config.ducking` viene con `enabled: false` y el filtro existe,
   deshabilítalo con `SetSourceFilterEnabled` (`filterEnabled: false`).

**Verificar**: `pnpm run typecheck && pnpm test` → exit 0 / todos pasan

### Paso 5: UI de etapa 2 en `AudioConfiguration.tsx`

Agrega una sección "Etapa 2" con:

- **Supresion de ruido**: checkbox, por defecto activado
  (`noiseSuppression: true` en `defaultFilters`). Texto: "Filtro RNNoise para
  limpiar estatica y ruido de fondo".
- **Monitoreo**: select con tres opciones — "Sin monitoreo" (default, no envía
  `monitorType` si no cambió), "Solo monitoreo", "Monitorizar y emitir".
  Texto de ayuda: "Usa audifonos conectados a la salida de monitoreo de OBS
  para escuchar exactamente lo que se transmite y evitar eco."
- **Sincronizacion (lip sync)**: input numérico en ms ([-950, 950], paso 5) +
  ayuda de cálculo: un mini-texto "cuadros de desfase × (1000 / FPS) = ms; ej.
  3 cuadros a 60 fps = 50 ms" y, si hay `obsSettingsSnapshot.fps` en el store,
  un select "cuadros" (1-6) que rellena el input con
  `Math.round(cuadros * 1000 / fps)`.
- **Ducking**: checkbox "Bajar la musica al hablar (ducking)", deshabilitado
  con aviso si `obsAudioSnapshot.desktopAudio` es null. Texto: "Aplica un
  compresor a {desktopAudio.inputName} que reduce su volumen cuando el
  microfono detecta voz."

El botón aplicar construye el `OBSAudioConfig` extendido. El diálogo de
confirmación (del plan 007; si no corrió, `window.confirm`) lista las acciones
de etapa 2 que se van a aplicar. Los estados actuales se siembran desde
`obsAudioSnapshot` (`monitorType`, `syncOffsetMs`, `desktopAudio.duckingConfigured`).

**Verificar**: `pnpm run typecheck && pnpm run lint` → exit 0

### Paso 6: Documentar y probar

- `README_AUDIO.md`: sección "Etapa 2" describiendo las cuatro capacidades,
  el porqué de cada default, y la guía manual de captura de audio por
  aplicación (Windows: fuente "Application Audio Capture"; macOS: requiere
  driver tipo BlackHole/Loopback — solo documentación, sin implementación).
- Tests nuevos en `validation.test.ts`: `syncOffsetMs` 951 rechazado, -950
  aceptado; `monitorType` inválido rechazado; `ducking` sin
  `desktopInputName` rechazado.
- Humo manual con OBS (si es posible): aplicar etapa 2, verificar en OBS los
  4 filtros del mic + el filtro Ducking en Audio del escritorio, el
  monitoreo y el offset en Propiedades avanzadas de audio.

**Verificar**: `pnpm test` → todos pasan

## Plan de pruebas

(Integrado en pasos 2, 4 y 6.) Patrón estructural: tests del plan 003. La
parte de OBS WebSocket real solo se cubre con el humo manual — anota en el
reporte qué quedó verificado contra OBS real y qué no.

## Criterios de terminado

- [ ] `grep -n "noise_suppress_filter\|OBSREC - Ducking" src/main` → ≥ 1 resultado cada uno
- [ ] `grep -n "SetInputAudioMonitorType\|SetInputAudioSyncOffset" src/main/obs-manager.ts` → 1 cada uno
- [ ] `pnpm run typecheck`, `pnpm run lint`, `pnpm test` exit 0
- [ ] `README_AUDIO.md` documenta la etapa 2
- [ ] Ningún archivo fuera del alcance modificado (`git status`)
- [ ] Fila de estado actualizada en `plans/README.md`

## Condiciones de STOP

Detente y reporta si:

- Los nombres de requests/params (`SetInputAudioMonitorType`,
  `inputAudioSyncOffset`, etc.) no aparecen en los tipos de
  `obs-websocket-js` instalados — no adivines nombres alternativos.
- `areObsrecFiltersConfigured` ya cambió de contrato respecto a lo descrito
  (deriva de otro ejecutor) y no puedes reconciliarlo de forma obvia.
- El plan 003 no corrió Y el plan 006 tampoco (sin tests ni advertencias
  estructuradas, el riesgo de esta etapa sube demasiado — reporta y pide que
  se ejecuten primero).
- La generalización de `ensureAudioFilters` exige cambiar la firma pública de
  `configureAudio` más allá de los campos nuevos opcionales.

## Notas de mantenimiento

- `sidechain_source`: OBS identifica la fuente por **nombre**; si el usuario
  renombra el micrófono en OBS, el ducking queda apuntando al nombre viejo.
  Futuro: re-resolver por UUID (`inputUuid` ya viaja en el snapshot).
- Si OBS cambia los ids de filtros (`noise_suppress_filter`), solo hay que
  tocar el módulo de helpers — mantener todos los ids ahí.
- Revisor: comprobar que `noiseSuppression: false` no borra el filtro de un
  usuario que lo creó a mano (solo gestionamos filtros con prefijo
  `OBSREC - `).
- Diferido explícitamente: captura por aplicación (multiplataforma compleja),
  medición automática de desfase, presets de ducking configurables.
