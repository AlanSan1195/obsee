# Plan 005: Notificar al renderer cuando OBS se desconecta

> **Instrucciones para el ejecutor**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de avanzar.
> Si ocurre algo de la sección "Condiciones de STOP", detente y reporta — no
> improvises. Al terminar, actualiza la fila de este plan en `plans/README.md`.
>
> **Chequeo de deriva (ejecutar primero)**: `git diff --stat 86bec05..HEAD -- src/main src/renderer/hooks src/renderer/App.tsx src/renderer/store.ts`
> Si algún archivo en alcance cambió desde que se escribió este plan, compara
> los extractos de "Estado actual" contra el código vivo antes de continuar;
> si no coinciden, trátalo como condición de STOP.

## Estado

- **Prioridad**: P2
- **Esfuerzo**: M
- **Riesgo**: LOW
- **Depende de**: ninguno (compatible con 001-004)
- **Categoría**: bug
- **Planeado en**: commit `86bec05`, 2026-06-10

## Por qué importa

Si el usuario cierra OBS (o se cae la conexión WebSocket), el proceso main se
entera — `OBSManager` marca `connected = false` — pero el renderer no: no
existe ningún canal de eventos main→renderer en toda la app (cero usos de
`webContents.send`). La StatusBar sigue mostrando el punto verde "Conectado a
OBS" y el siguiente clic en "IMPORTAR A OBS" falla con "Not connected to OBS",
que contradice lo que la UI afirma. Para una app cuyo propósito es ser una
capa de diagnóstico transparente sobre OBS, mentir sobre el estado de conexión
es el peor bug posible de UX.

## Estado actual

- `src/main/obs-manager.ts:239-249` — los handlers de desconexión solo mutan
  el estado interno:

```ts
async initialize() {
  this.obs.on('ConnectionError', (err: Error) => {
    console.error('OBS WebSocket error:', err);
    this.connected = false;
  });

  this.obs.on('ConnectionClosed', () => {
    console.log('OBS connection closed');
    this.connected = false;
  });
}
```

- `src/main/index.ts:12` — `let mainWindow: BrowserWindow | null = null;` y
  `createWindow()` lo asigna; `obsManager.initialize()` se llama en
  `app.whenReady()` (línea 40-42).
- `src/main/preload.ts` — expone solo métodos `invoke`; no hay suscripción a
  eventos. Extracto completo de la rama `obs` actual:

```ts
contextBridge.exposeInMainWorld('electronAPI', {
  obs: {
    connect: (settings: OBSConnectionSettings) => ipcRenderer.invoke('obs:connect', settings),
    disconnect: () => ipcRenderer.invoke('obs:disconnect'),
    getStatus: () => ipcRenderer.invoke('obs:get-status'),
    ...
```

- `src/renderer/store.ts` — Zustand con `obsConnected: boolean`,
  `obsMessage: string`, setters `setObsConnected`, `setObsMessage`,
  `setObsSettingsSnapshot`, `setObsAudioSnapshot`.
- `src/renderer/hooks/useElectronAPI.ts:128-148` — declaración global de
  `window.electronAPI` que hay que extender.
- `src/renderer/App.tsx` — componente raíz; buen lugar para montar la
  suscripción una sola vez con `useEffect`.

Convención del repo: canales IPC con prefijo `obs:` en kebab-case
(`obs:get-settings-snapshot`). Mensajes de usuario en español.

## Comandos que necesitarás

| Propósito  | Comando               | Esperado en éxito   |
|------------|-----------------------|---------------------|
| Typecheck  | `pnpm run typecheck`  | exit 0              |
| Lint       | `pnpm run lint`       | exit 0              |
| Tests      | `pnpm test`           | todos pasan (si existe) |
| Dev        | `pnpm run dev`        | ventana carga       |

## Alcance

**En alcance**:
- `src/main/obs-manager.ts` (callback de cambio de estado)
- `src/main/index.ts` (cablear callback → `webContents.send`)
- `src/main/preload.ts` (exponer suscripción)
- `src/renderer/hooks/useElectronAPI.ts` (tipo global + helper)
- `src/renderer/App.tsx` (montar la suscripción)

**Fuera de alcance**:
- Reconexión automática a OBS — feature distinta, no la implementes.
- `src/renderer/store.ts` — los setters existentes bastan; no agregues estado.
- Cambiar los mensajes/contratos de los handlers `invoke` existentes.

## Flujo de git

- Rama: `advisor/005-notificar-desconexion-obs`
- Commits en español (ej.: `add: evento de desconexión de OBS hacia el renderer`).
- NO hagas push ni abras PR salvo que el operador lo indique.

## Pasos

### Paso 1: Emitir cambios de estado desde `OBSManager`

En `src/main/obs-manager.ts`, dentro de la clase:

1. Agrega un campo privado:
   `private statusListener: ((status: { connected: boolean; message: string }) => void) | null = null;`
2. Agrega un método público:

```ts
onStatusChange(listener: (status: { connected: boolean; message: string }) => void) {
  this.statusListener = listener;
}

private emitStatus(message: string) {
  this.statusListener?.({ connected: this.connected, message });
}
```

3. Llama `this.emitStatus(...)` en los cuatro puntos donde cambia `connected`:
   - en el handler `ConnectionError` → `this.emitStatus('Se perdió la conexión con OBS');`
   - en el handler `ConnectionClosed` → `this.emitStatus('OBS cerró la conexión');`
   - en `connect()` tras `this.connected = true` → `this.emitStatus('Conectado a OBS');`
   - en `disconnect()` tras `this.connected = false` → `this.emitStatus('Desconectado de OBS');`

**Verificar**: `pnpm run typecheck` → exit 0

### Paso 2: Reenviar el evento al renderer desde el main

En `src/main/index.ts`, dentro de `app.whenReady().then(() => { ... })`,
después de `obsManager.initialize()`:

```ts
obsManager.onStatusChange((status) => {
  mainWindow?.webContents.send('obs:connection-changed', status);
});
```

**Verificar**: `pnpm run typecheck` → exit 0

### Paso 3: Exponer la suscripción en el preload

En `src/main/preload.ts`, agrega a la rama `obs` del objeto expuesto:

```ts
onConnectionChanged: (callback: (status: { connected: boolean; message: string }) => void) => {
  const listener = (_event: Electron.IpcRendererEvent, status: { connected: boolean; message: string }) => callback(status);
  ipcRenderer.on('obs:connection-changed', listener);
  return () => ipcRenderer.removeListener('obs:connection-changed', listener);
},
```

(Devolver la función de desuscripción es obligatorio: React la usará como
cleanup del efecto.)

**Verificar**: `pnpm run typecheck` → exit 0

### Paso 4: Tipar y consumir en el renderer

1. En `src/renderer/hooks/useElectronAPI.ts`, dentro de la declaración global
   `Window.electronAPI.obs`, agrega:

```ts
onConnectionChanged: (callback: (status: { connected: boolean; message: string }) => void) => () => void;
```

2. En `src/renderer/App.tsx`, agrega un efecto de montaje (importa `useEffect`
   de react y los setters del store):

```tsx
const { setObsConnected, setObsMessage, setObsSettingsSnapshot, setObsAudioSnapshot } = useAppStore();

useEffect(() => {
  if (!window.electronAPI) return;
  return window.electronAPI.obs.onConnectionChanged((status) => {
    setObsConnected(status.connected);
    setObsMessage(status.message);
    if (!status.connected) {
      setObsSettingsSnapshot(null);
      setObsAudioSnapshot(null);
    }
  });
}, [setObsConnected, setObsMessage, setObsSettingsSnapshot, setObsAudioSnapshot]);
```

Nota: el guard `if (!window.electronAPI)` es necesario porque la UI también
puede abrirse en un navegador sin Electron (ver
`useElectronAPI.ts:4-10`, `getElectronAPI()` lanza un error explicativo).

**Verificar**: `pnpm run typecheck && pnpm run lint` → ambos exit 0

### Paso 5: Verificación manual (si el entorno lo permite)

Con OBS abierto: `pnpm run dev`, conecta con OBS desde la app, y luego
**cierra OBS**. En menos de ~2 segundos la StatusBar debe pasar a punto rojo
con "OBS cerró la conexión" (o "Se perdió la conexión"), y la sección de
importación debe volver al formulario de conexión.

Si no hay OBS/GUI en tu entorno, marca el paso como "no verificado" en el
reporte y apóyate en los pasos 1-4.

**Verificar**: la UI refleja la desconexión sin interacción del usuario.

## Plan de pruebas

La lógica nueva es cableado de eventos entre procesos; los tests unitarios del
repo (plan 003) no cubren IPC y montar esa infraestructura excede este plan.
Cobertura: typecheck + lint + verificación manual del Paso 5. Si el plan 003
ya corrió, `pnpm test` debe seguir en verde (este plan no toca lógica pura, a
menos que el plan 003 ya haya extraído helpers — en cuyo caso el chequeo de
deriva lo habrá señalado y los cambios de este plan siguen aplicando igual
sobre la clase `OBSManager`).

## Criterios de terminado

- [ ] `grep -n "obs:connection-changed" src/main/index.ts src/main/preload.ts` → 1 resultado en cada archivo
- [ ] `grep -n "onConnectionChanged" src/renderer/App.tsx src/renderer/hooks/useElectronAPI.ts src/main/preload.ts` → ≥ 1 resultado en cada uno
- [ ] `pnpm run typecheck` exit 0
- [ ] `pnpm run lint` exit 0
- [ ] `pnpm test` exit 0 (si existe)
- [ ] Ningún archivo fuera del alcance modificado (`git status`)
- [ ] Fila de estado actualizada en `plans/README.md`

## Condiciones de STOP

Detente y reporta si:

- `obs-websocket-js` en la versión instalada no emite `ConnectionClosed` /
  `ConnectionError` con esas firmas (revisa `node_modules/obs-websocket-js`
  solo en modo lectura para confirmar nombres de eventos).
- Los handlers de `initialize()` ya fueron modificados respecto al extracto
  (deriva).
- Necesitarías tocar `store.ts` para algo más que usar setters existentes.

## Notas de mantenimiento

- Si más adelante se agrega reconexión automática, debe vivir en `OBSManager`
  y reutilizar `emitStatus` para informar cada transición.
- Revisor: verificar que la desuscripción del Paso 3 realmente remueve el
  listener (fugas de listeners en recargas de Vite son el error típico aquí).
- El plan 006 puede traducir/ajustar los textos de estos mensajes; mantenerlos
  como cadenas simples en español facilita eso.
