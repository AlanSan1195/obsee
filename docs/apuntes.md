# Apuntes de estudio — obsee

Lecciones aprendidas durante el desarrollo, explicadas a fondo. Cada sección
es una clase corta: qué pasó, por qué pasa, y cómo se resolvió con código
real del proyecto.

## CSP + Vite `assetsInlineLimit`: por qué las fuentes se veían en local pero no en producción

**El bug**: la tipografía Doto (pixel font del logo) funcionaba en `pnpm dev`
pero en producción caía al fallback monospace.

**La causa fue la suma de dos comportamientos correctos por separado:**

1. Vite, en build, incrusta como `data:` URI todo asset menor a
   `assetsInlineLimit` (4096 bytes por defecto) para ahorrar peticiones HTTP.
   Los `.woff2` de Doto pesan ~3.9 KB → quedaron incrustados dentro del CSS.
2. Nuestra Content Security Policy en `index.html` declara
   `default-src 'self'` sin una directiva `font-src`. Cuando falta una
   directiva específica, el navegador usa `default-src` como respaldo — y
   `'self'` **no incluye** el esquema `data:`. Resultado: el navegador bloquea
   la fuente incrustada.

**¿Por qué en dev sí funcionaba?** El servidor de desarrollo de Vite no
incrusta assets: sirve cada `.woff2` como archivo desde `'self'`, que la CSP
sí permite. El bug solo existía en el bundle de producción — por eso "funciona
en mi máquina".

**El fix** (`vite.config.ts`):

```ts
build: {
  outDir: 'dist',
  emptyOutDir: true,
  // Sin inline de assets: las fuentes Doto (~4KB) se incrustaban como data:
  // URIs y el CSP (font-src ausente -> default-src 'self') las bloqueaba.
  assetsInlineLimit: 0,
},
```

**Alternativa descartada**: agregar `font-src 'self' data:` a la CSP. Habría
funcionado, pero relajar la CSP para acomodar una optimización de build es la
dirección equivocada — mejor desactivar el inline y mantener la política
estricta.

**Cómo verificarlo**: después de `pnpm build`, los `.woff2` deben existir como
archivos en `dist/assets/` y el CSS no debe contener `data:font`. El tamaño
del CSS lo delata: pasó de 45.86 kB (fuentes incrustadas) a 28.37 kB.

## WebSocket a `ws://localhost` desde una página HTTPS

**La duda razonable**: una página servida por HTTPS no puede cargar recursos
HTTP (mixed content). ¿Cómo es que obsee, servido desde
`https://obsee.vercel.app`, se conecta a `ws://localhost:4455` (sin TLS)?

**La respuesta**: la especificación de mixed content trata `localhost` y
`127.0.0.1` como **orígenes potencialmente confiables** (*potentially
trustworthy origins*), porque el tráfico nunca sale de la máquina — no hay
red que interceptar, así que exigir TLS no aporta seguridad. Chrome, Edge y
Firefox implementan esta excepción; **Safari no**, y por eso obsee no lo
soporta.

**El límite importante**: la excepción es solo para localhost. Un
`ws://192.168.1.50:4455` (OBS en otra máquina de la LAN) sí es mixed content
y el navegador lo bloquea. Consecuencia de arquitectura: obsee solo puede
controlar el OBS de la misma computadora — que resultó ser una *feature* de
privacidad: el password de OBS y las escenas nunca viajan por internet.

**Bonus*to*: `obs-websocket-js` v5 funciona en navegador sin cambios porque solo
depende de `WebSocket` global y `cryp.subtle` (para el handshake de
autenticación SHA-256), ambos nativos del navegador. Por eso la capa
`obs-manager.ts` se migró de Electron casi verbatim.

## Detección de hardware desde el navegador: qué se puede y qué no

El navegador es una sandbox: no expone modelo de CPU ni RAM real. Lo que sí
se puede detectar, y cómo lo usa obsee:

| Dato | API | Fiabilidad |
|---|---|---|
| GPU | WebGL `WEBGL_debug_renderer_info` | Buena (viene "envuelta", ver abajo) |
| Procesadores lógicos disponibles para el navegador | `navigator.hardwareConcurrency` | Estimación; puede ser menor al hardware real |
| RAM | `navigator.deviceMemory` | Solo Chrome, **tope en 8** |
| Capturadoras | `mediaDevices.enumerateDevices()` | Buena, requiere permiso |
| Modelo de CPU | — no existe API — | Formulario manual |

`navigator.hardwareConcurrency` no es un inventario físico. El navegador puede
reducir el valor por límites internos o privacidad, así que obsee sólo lo muestra
como pista y pide confirmar el número real de núcleos antes del análisis.

### GPU: el string ANGLE

WebGL no devuelve el nombre limpio de la GPU sino el del backend gráfico. En
una Mac con Apple Silicon devuelve algo como
`ANGLE Metal Renderer: Apple M4`. El primer parser tomaba el segundo
segmento y mostraba "angle" al usuario. El fix (`src/renderer/lib/system-info.ts`):

```ts
if (model.includes(': ')) model = model.split(': ').pop();
```

Detalle extra: en Apple Silicon la GPU delata la CPU — si la GPU es
`Apple M4`, la CPU es un M4. obsee usa eso para pre-llenar el formulario:

```ts
cpuModelHint: gpu.vendor === 'Apple' && /Apple M\d/i.test(gpu.model)
  ? gpu.model
  : undefined,
```

### RAM: por qué no confiar en `deviceMemory`

`navigator.deviceMemory` existe solo en Chrome y **satura en 8** por
privacidad (evita fingerprinting): una máquina con 16, 32 o 64 GB reporta 8.
Para recomendar bitrates de stream ese dato es inútil — por eso sólo se muestra
como pista. La RAM se pide en un `<select>` con valores reales de mercado y se
persiste únicamente después de que el usuario la confirma. El registro usa una
versión de esquema para no reutilizar como confirmados valores guardados por
versiones anteriores.

### Capturadoras: el baile de permisos de `enumerateDevices`

`enumerateDevices()` sin permiso de cámara devuelve dispositivos con `label`
vacío — no puedes saber si "videoinput #2" es una webcam o una capturadora
UGREEN. El patrón correcto (`src/renderer/lib/peripherals.ts`): pedir
`getUserMedia({ video: true })`, **detener los tracks de inmediato** (no
queremos la cámara encendida, solo el permiso), y entonces enumerar — ahora
con labels reales que se filtran contra una lista de palabras clave de
capturadoras (`CAPTURE_KEYWORDS`).

## De IPC de Electron a un módulo del navegador: la costura `appAPI`

En Electron, el renderer hablaba con el proceso main vía IPC
(`window.electronAPI.obs.connect(...)` → `ipcMain.handle('obs:connect')`).
La migración web eliminó el proceso main, pero **conservó la forma exacta del
API**: `src/renderer/lib/app-api.ts` exporta un objeto `appAPI` con la misma
estructura `{ obs, system, ai }` que tenía `window.electronAPI`.

**Por qué importa**: los 31 métodos del hook `useAppAPI.ts` y todos los
componentes quedaron intactos — el diff de la migración se concentró en una
sola costura en vez de regarse por toda la UI. Es el patrón *adapter*: cuando
cambias la plataforma de abajo, mantén estable el contrato de arriba.

Los reemplazos de infraestructura siguieron la misma idea (misma firma,
distinta implementación):

- Backups: archivo en disco → `localStorage['obsrec-backup']` (mismos
  exports `saveBackup`/`loadBackup`, siguen siendo `async`).
- Install ID: `localStorage['obsrec-install-id']` con `crypto.randomUUID()`.

## Proxy de Vite en dev: esquivar CORS sin tocar el backend

En producción el frontend y las funciones serverless viven en el mismo
dominio (same-origin, sin CORS). En dev, el frontend corre en
`localhost:5173` y llamaría a `https://obsee.vercel.app/api/...` —
cross-origin, y como las peticiones llevan el header custom
`X-OBSREC-Install-Id`, el navegador exige un preflight OPTIONS que el
backend no maneja.

En vez de agregar manejo de CORS/OPTIONS al backend solo para desarrollo, el
proxy de Vite hace que el navegador crea que habla con su propio origen
(`vite.config.ts`):

```ts
server: {
  proxy: {
    '/api': {
      target: 'https://obsee.vercel.app',
      changeOrigin: true,
    },
  },
},
```

El navegador pide a `localhost:5173/api/...` (same-origin, sin preflight) y
Vite reenvía por detrás al servidor real. `changeOrigin` reescribe el header
`Host` para que Vercel acepte la petición.

## Secretos en apps frontend: la regla `VITE_*`

Todo lo que empiece con `VITE_` en las variables de entorno se **incrusta en
el bundle público** — cualquiera puede leerlo con "ver código fuente". Por
eso `GROQ_API_KEY` y `TAVILY_API_KEY` viven solo en las variables de entorno
de Vercel y se usan exclusivamente dentro de `api/*.ts` (código que corre en
el servidor). El frontend llama a `/api/recommendation` o `/api/web-search`
y el secreto nunca sale del serverless. Regla mental: *si el navegador lo
necesita para funcionar, no es un secreto; si es un secreto, el navegador no
debe tenerlo.*
