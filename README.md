# obsee

![obsee — configura OBS sin saber de OBS](docs/obsee-hero.png)

**obsee** es una app web que configura OBS Studio por ti. Analiza tu computadora, pide a una IA la mejor configuración de stream/grabación para tu hardware, te muestra **qué va a cambiar y por qué**, y la aplica a OBS con un clic.

## Propósito

OBS ya trae un asistente de auto-configuración, pero funciona como caja negra: prueba, decide y aplica sin explicar nada. obsee apunta a lo contrario — que entiendas tu configuración:

- Explica **por qué** cada ajuste tiene sentido para tu equipo.
- Muestra un **diff** entre tu configuración actual y la recomendada antes de tocar nada.
- Te deja **editar** la recomendación, y la IA re-explica el impacto de tus cambios.
- Guarda un **respaldo** de tu configuración anterior para restaurarla cuando quieras.

## Cómo funciona

```text
navegador ──ws://localhost:4455──> OBS Studio        (control directo, nunca sale de tu PC)
navegador ──HTTPS──> funciones serverless en Vercel  (IA: Groq + búsqueda web Tavily)
```

Detalles importantes de su funcionamiento:

- **La conexión con OBS es 100% local.** El navegador habla con el servidor WebSocket de OBS en tu misma máquina. Tu password de OBS, tus escenas y tu configuración nunca pasan por internet; a la IA solo viajan specs anónimas de hardware (CPU, GPU, RAM, SO).
- **Detección de hardware desde el navegador**: la GPU se detecta vía WebGL y las capturadoras HDMI vía permisos de cámara (`mediaDevices`). El modelo de CPU y la RAM se piden en un formulario (el navegador no puede leerlos) y quedan guardados en `localStorage`.
- **Si la IA no está disponible** (sin red, límite diario), un motor de recomendación local genera la configuración como respaldo — la app nunca se queda sin respuesta.
- **Antes de aplicar cualquier cambio**, obsee respalda la configuración actual de OBS en tu navegador (`localStorage`) y puedes restaurarla desde la pestaña de comparación.
- **Flujo guiado en 4 pasos**: conectar → ajustes (hardware, modo, plataforma) → detección (recomendación + audio) → escenas (con vista previa en vivo de lo que verá tu stream).
- También perfila **consolas** (PS5/Xbox/Switch): detecta tu capturadora, lee sus capacidades reales desde OBS y recomienda la cadena de captura completa.

## Usarlo

Requisitos: OBS Studio abierto en la misma computadora con el servidor WebSocket activado (`Herramientas → Ajustes del servidor WebSocket`) y un navegador Chrome, Edge o Firefox (Safari bloquea la conexión local con OBS).

## Desarrollo

```bash
pnpm install
pnpm dev          # abre http://localhost:5173 (proxy /api hacia producción)
pnpm test         # suite de Vitest
pnpm typecheck && pnpm lint
pnpm build        # build de producción en dist/
```

Stack: React 19 + Vite + TypeScript + Tailwind + Zustand; `obs-websocket-js` en el navegador; funciones serverless en Vercel (`api/`) con Groq y Tavily.

```text
src/renderer/       interfaz React
src/renderer/lib/   integración OBS WebSocket, detección de hardware, cliente de IA
src/shared/         tipos, validadores y motor de recomendación local
api/                endpoints serverless de IA (Vercel)
```

Las claves (`GROQ_API_KEY`, `TAVILY_API_KEY`, rate limits) viven **solo** en las variables de entorno de Vercel — el frontend no contiene secretos.

## Nota de seguridad

obsee modifica ajustes de OBS vía WebSocket. Está en **beta**: antes de un directo o grabación importante, revisa dentro de OBS los ajustes aplicados. Cuando sea posible, graba en MKV para no perder la grabación si OBS o el sistema fallan.

---

GitHub: <https://github.com/AlanSan1195/obsee>
