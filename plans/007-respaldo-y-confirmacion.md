# Plan 007: Proteger al usuario — respaldo automático antes de aplicar y restauración con un clic

> **Instrucciones para el ejecutor**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de avanzar.
> Si ocurre algo de la sección "Condiciones de STOP", detente y reporta — no
> improvises. Al terminar, actualiza la fila de este plan en `plans/README.md`.
>
> **Chequeo de deriva (ejecutar primero)**: `git diff --stat 86bec05..HEAD -- src/main src/renderer src/shared/types.ts`
> Compara los extractos de "Estado actual" contra el código vivo antes de
> continuar; los cambios de los planes 003, 005 y 006 son esperados — verifica
> que los métodos citados sigan existiendo con la misma firma. Si un método
> citado desapareció o cambió de contrato, STOP.

## Estado

- **Prioridad**: P2
- **Esfuerzo**: M/L
- **Riesgo**: MED
- **Depende de**: plans/003-base-de-tests.md y plans/006-accesibilidad-ux-idioma.md (usa `warnings` estructuradas)
- **Categoría**: direction (seguridad del usuario)
- **Planeado en**: commit `86bec05`, 2026-06-10

## Por qué importa

OBSREC escribe directamente sobre la configuración de OBS del usuario
(resolución, FPS, encoder, bitrates, formato de grabación, servidor de
stream) sin forma de deshacer. El README promete "respaldo/restauracion de
perfiles" como siguiente paso y la identidad del producto es "mostrar que va a
cambiar antes de aplicarlo". Si una recomendación resulta mala (p. ej. la IA
sugiere un bitrate inviable para la conexión del usuario), hoy el usuario debe
reconstruir su configuración de memoria. Este plan agrega: (1) un respaldo
automático en disco del estado de OBS justo antes de cada aplicación, (2) un
botón "Restaurar configuracion anterior", y (3) un diálogo de confirmación
propio que muestra exactamente qué va a cambiar (reemplazando el
`window.confirm` de audio).

## Estado actual

- `src/main/obs-manager.ts` — `getSettingsSnapshot()` (línea 297) ya captura
  todo lo necesario para un respaldo de video/salida:
  `streamServer, baseResolution, outputResolution, fps, encoder, bitrate,
  audioBitrate, recordingFormat, recordingQuality, audio?` (tipo
  `OBSSettingsSnapshot`, `src/shared/types.ts:84-95`).
- `src/main/obs-manager.ts` — `configure(config: OBSConfig)` (línea 496)
  aplica: `SetStreamServiceSettings` (solo modos con stream),
  `SetVideoSettings`, y `SetProfileParameter` para
  `Output.Mode`, `SimpleOutput.VBitrate/ABitrate/RecFormat/RecQuality/StreamEncoder`.
  Un respaldo restaurable necesita exactamente esos mismos campos.
- `src/main/index.ts` — registra handlers IPC con `ipcMain.handle('obs:...')`
  y valida toda entrada con `src/shared/validation.ts` antes de tocar
  `obsManager`. Sigue ese patrón para los handlers nuevos.
- `src/main/preload.ts` — expone métodos `invoke` bajo `electronAPI.obs`.
- `src/renderer/components/ImportButton.tsx` — `handleImport()` (línea 24)
  llama `applyConfig(...)` directamente sin confirmación.
- `src/renderer/components/OBSComparison.tsx` — ya calcula filas
  actual-vs-recomendado con `isSameValue()`; el diálogo de confirmación debe
  reutilizar esa información, no recalcularla con otra lógica.
- `src/renderer/components/AudioConfiguration.tsx:106` — usa
  `window.confirm(...)` (a reemplazar por el mismo diálogo).
- Electron: `app.getPath('userData')` es la ruta estándar para datos de la
  app; no hay persistencia alguna en el proyecto todavía.

Restauración con la API existente: el snapshot guarda `fps` como número
redondeado y `encoder` como id de Simple Output (`nvenc`, `x264`, ...), que
son entradas válidas para `configure()`-como-restauración vía
`SetVideoSettings` + `SetProfileParameter`. **Importante**: la restauración
NO debe pasar por `validateOBSConfig` (que exige modo/plataforma) ni
reescribir `SetStreamServiceSettings` con el servidor de OBSREC — debe
restaurar el `streamServer` guardado tal cual.

## Comandos que necesitarás

| Propósito  | Comando               | Esperado en éxito   |
|------------|-----------------------|---------------------|
| Typecheck  | `pnpm run typecheck`  | exit 0              |
| Lint       | `pnpm run lint`       | exit 0              |
| Tests      | `pnpm test`           | todos pasan         |
| Dev        | `pnpm run dev`        | ventana carga       |

## Alcance

**En alcance**:
- `src/main/obs-manager.ts` (métodos `restoreSnapshot`, captura previa en `configure`)
- `src/main/backup-store.ts` (crear — lectura/escritura del respaldo en disco)
- `src/main/index.ts` (handlers `obs:get-last-backup`, `obs:restore-last-backup`)
- `src/main/preload.ts`, `src/renderer/hooks/useElectronAPI.ts` (exponer/tipar)
- `src/shared/types.ts` (tipo `OBSBackup`)
- `src/shared/validation.ts` (validador del respaldo leído de disco)
- `src/renderer/components/ConfirmDialog.tsx` (crear)
- `src/renderer/components/ImportButton.tsx`, `src/renderer/components/AudioConfiguration.tsx`, `src/renderer/components/OBSComparison.tsx` (integración)
- Tests de los planes previos que haya que extender

**Fuera de alcance**:
- Respaldo de TODO el perfil de OBS (escenas, fuentes, hotkeys) — solo los
  parámetros que OBSREC escribe.
- Historial de múltiples respaldos con UI de selección — solo "el último".
- Persistir ajustes de conexión (hallazgo D1, no seleccionado en esta ronda).
- El password de OBS o el stream key NUNCA se escriben en el respaldo.

## Flujo de git

- Rama: `advisor/007-respaldo-y-confirmacion`
- Commits por unidad: respaldo en disco, restauración, diálogo, integración.
- NO hagas push ni abras PR salvo que el operador lo indique.

## Pasos

### Paso 1: Tipo y validador del respaldo

En `src/shared/types.ts`:

```ts
export interface OBSBackup {
  createdAt: string;            // ISO 8601
  appliedByObsrec: true;
  snapshot: OBSSettingsSnapshot;
}
```

En `src/shared/validation.ts`, agrega `validateOBSBackup(value: unknown):
ValidationResult<OBSBackup>` siguiendo el patrón de los validadores
existentes (chequear `createdAt` string no vacío, `snapshot` con los campos de
`OBSSettingsSnapshot`; el campo `audio` del snapshot puede validarse de forma
laxa: si está presente y no es objeto, descartarlo). Este validador protege
contra un archivo de respaldo corrupto o editado a mano.

**Verificar**: `pnpm run typecheck` → exit 0

### Paso 2: Almacenamiento del respaldo en disco

Crea `src/main/backup-store.ts`:

- `getBackupPath(): string` → `path.join(app.getPath('userData'), 'obsrec-backup.json')`
- `saveBackup(snapshot: OBSSettingsSnapshot): Promise<void>` → escribe
  `{ createdAt: new Date().toISOString(), appliedByObsrec: true, snapshot }`
  con `fs.promises.writeFile` (JSON con `null, 2`). **Antes de escribir,
  elimina del snapshot cualquier campo desconocido y nunca incluyas claves de
  stream** (el `OBSSettingsSnapshot` actual no las tiene — verifica que siga
  siendo así).
- `loadBackup(): Promise<OBSBackup | null>` → lee el archivo, pásalo por
  `validateOBSBackup`; devuelve `null` si no existe o no valida.

**Verificar**: `pnpm run typecheck && pnpm run lint` → exit 0

### Paso 3: Capturar el respaldo dentro de `configure()`

En `src/main/obs-manager.ts`, al inicio de `configure()` (tras el guard de
conexión y antes del primer `SetStreamServiceSettings`):

```ts
const backupSnapshot = await this.getSettingsSnapshot();
if (backupSnapshot.success && backupSnapshot.snapshot) {
  try {
    await saveBackup(backupSnapshot.snapshot);
  } catch (error) {
    warnings.push('No se pudo guardar el respaldo previo; los cambios se aplicaran sin respaldo.');
  }
}
```

(Si no se puede leer el snapshot, agrega la advertencia equivalente y
continúa: el respaldo es mejor-esfuerzo, no debe bloquear la importación.
Mueve la declaración `const warnings: string[] = []` arriba si hace falta.)

**Verificar**: `pnpm run typecheck` → exit 0

### Paso 4: Restauración

En `src/main/obs-manager.ts`, agrega
`restoreSnapshot(snapshot: OBSSettingsSnapshot): Promise<{ success: boolean; message: string; warnings: string[] }>`:

- Guard de conexión como los demás métodos.
- `SetVideoSettings` con `baseResolution`/`outputResolution` parseadas con
  `parseResolution` (¡son strings `"1920x1080"`!) y `fpsNumerator: snapshot.fps, fpsDenominator: 1`.
- `SetProfileParameter` para `SimpleOutput.VBitrate/ABitrate/RecFormat/RecQuality/StreamEncoder`
  con los valores del snapshot (mismo patrón try/catch por parámetro que
  `configure()`, acumulando advertencias). Omite cada parámetro cuyo valor sea
  `'Unknown'` o `0` (significa que no se pudo leer al crear el respaldo).
- `SetStreamServiceSettings` **solo si** `snapshot.streamServer` no es
  `'Unknown'`: lee primero los settings actuales (como hace `configure()`,
  línea 505-507) y reescribe únicamente `server` con el valor del respaldo,
  preservando `key` y demás campos actuales.
- NO restaura audio en esta versión (los filtros OBSREC son aditivos y el
  usuario puede borrarlos en OBS; documentado en Notas).

En `src/main/index.ts`:

```ts
ipcMain.handle('obs:get-last-backup', async () => {
  const backup = await loadBackup();
  return backup
    ? { success: true, message: 'Respaldo disponible', backup }
    : { success: false, message: 'No hay respaldo guardado' };
});

ipcMain.handle('obs:restore-last-backup', async () => {
  const backup = await loadBackup();
  if (!backup) return { success: false, message: 'No hay respaldo guardado' };
  return obsManager.restoreSnapshot(backup.snapshot);
});
```

Expón ambos en `preload.ts` (`getLastBackup`, `restoreLastBackup`) y tipa en
`useElectronAPI.ts` siguiendo los métodos existentes.

**Verificar**: `pnpm run typecheck && pnpm run lint` → exit 0

### Paso 5: Diálogo de confirmación propio

Crea `src/renderer/components/ConfirmDialog.tsx`: componente modal accesible
y reutilizable (sin dependencias nuevas):

- Props: `open: boolean`, `title: string`, `children: React.ReactNode`,
  `confirmLabel: string`, `onConfirm: () => void`, `onCancel: () => void`.
- Usa el elemento nativo `<dialog>` con `ref` + `showModal()`/`close()` en un
  `useEffect` sobre `open` (accesibilidad de foco y `Esc` gratis), estilizado
  con las clases oscuras del repo (`bg-zinc-900 border border-zinc-800
  rounded-xl`, backdrop con `backdrop:bg-black/60`).
- Botones "Cancelar" y `confirmLabel`, ambos `type="button"`.

Integración:

1. `ImportButton.tsx` — antes de `applyConfig`, abre el diálogo con título
   "Confirmar cambios en OBS" y como contenido la lista de cambios: filas
   actual → recomendado donde difieren. Para no duplicar lógica, **exporta**
   desde `OBSComparison.tsx` la función que construye las filas y
   `isSameValue` (refactor mínimo: mover `normalize*`, `isSameValue` y la
   construcción de `rows` a funciones exportadas que reciben
   `(snapshot, recommendations)`), y úsalas en ambos lugares. Incluye al final
   la nota: "Se guardara un respaldo automatico de tu configuracion actual."
2. `AudioConfiguration.tsx:98-116` — reemplaza `window.confirm(...)` por el
   mismo diálogo (mismo texto, en párrafos en vez de `\n`).
3. Botón "Restaurar configuracion anterior": agrégalo en `OBSComparison.tsx`
   (o junto al ImportButton si la comparación no está visible), visible solo
   si `getLastBackup()` devuelve éxito; al hacer clic abre el diálogo
   ("Restaurar la configuracion guardada el <fecha legible>?") y llama
   `restoreLastBackup()`, refrescando después el snapshot
   (`getSettingsSnapshot` → store, como hace `applyConfig` en
   `useElectronAPI.ts:100-115`).

**Verificar**: `pnpm run typecheck && pnpm run lint` → exit 0

### Paso 6: Tests y humo

- `validation.test.ts`: casos para `validateOBSBackup` (válido, sin
  `createdAt`, snapshot incompleto, JSON con tipos incorrectos).
- Si extrajiste las funciones de comparación de `OBSComparison`, agrega tests
  para `isSameValue`/normalizadores (encoder `'NVIDIA NVENC H.264'` ≡
  `'nvenc'`, calidad `'HQ'` ≡ `'high'`).
- Humo manual (si hay OBS): importar configuración → verificar que
  `obsrec-backup.json` aparece en `userData`; cambiar algo en OBS → restaurar
  → verificar que vuelve.

**Verificar**: `pnpm test` → todos pasan

## Plan de pruebas

(Integrado en el Paso 6.) Patrón: los tests existentes de
`src/shared/validation.test.ts` del plan 003.

## Criterios de terminado

- [ ] `grep -n "window.confirm" src/renderer` → sin resultados
- [ ] `grep -n "obs:restore-last-backup" src/main/index.ts src/main/preload.ts` → 1 en cada uno
- [ ] `pnpm run typecheck`, `pnpm run lint`, `pnpm test` exit 0
- [ ] `grep -rn "streamKey\|password" src/main/backup-store.ts` → sin resultados
- [ ] Ningún archivo fuera del alcance modificado (`git status`)
- [ ] Fila de estado actualizada en `plans/README.md`

## Condiciones de STOP

Detente y reporta si:

- `getSettingsSnapshot()` ya no devuelve los campos listados (deriva de los
  planes previos).
- La restauración exige llamadas de OBS WebSocket no usadas aún en el repo y
  cuyo nombre no puedas confirmar en los tipos de `obs-websocket-js`
  (verifícalos en `node_modules/obs-websocket-js/dist`, solo lectura).
- El elemento `<dialog>` causa problemas en la versión de Chromium del
  Electron instalado (no debería: es estable desde Chrome 37) — repórtalo en
  vez de meter una librería de modales.
- Te ves obligado a guardar el stream key o el password en el respaldo para
  que la restauración funcione — eso es señal de un diseño equivocado: STOP.

## Notas de mantenimiento

- El respaldo NO cubre los filtros de audio OBSREC (son aditivos con nombres
  `OBSREC - *` y el usuario puede quitarlos desde OBS); si el plan 008 agrega
  más filtros, evaluar incluir un "quitar filtros OBSREC" en la restauración.
- Revisor: escrutinio especial a `restoreSnapshot` — es la única ruta que
  escribe en OBS valores leídos de disco; el validador del Paso 1 es la
  defensa.
- Si en el futuro hay multi-perfil (README "soportar multiples perfiles"), el
  archivo único `obsrec-backup.json` debe volverse por-perfil.
