# OBSREC

OBSREC es una aplicacion web para OBS que analiza tu computadora, recomienda ajustes de streaming/grabacion y compara esas recomendaciones contra la configuracion actual de OBS. Corre en el navegador (Chrome, Edge o Firefox) y se conecta a OBS en tu misma computadora via WebSocket.

La idea no es reemplazar OBS. La idea es hacer que OBS sea mas facil de entender.

## Enfoque

OBS ya tiene un asistente de configuracion automatica. Ese asistente es util, pero funciona casi como una caja negra: hace una prueba, decide ajustes y los aplica.

OBSREC apunta a otra cosa:

- explicar por que una configuracion tiene sentido
- mostrar que va a cambiar antes de aplicarlo
- comparar la configuracion actual de OBS contra la recomendada
- permitir editar la recomendacion manualmente
- generar una recomendacion local si la IA falla
- evolucionar hacia diagnostico de perfiles OBS, no solo bitrate y FPS

En resumen: OBSREC busca ser una capa de diagnostico y acompanamiento para OBS, no solamente otro auto-configurador.

## Que Hace Hoy

- Aplicacion web (React + Vite) desplegada en Vercel.
- Conexion con OBS mediante WebSocket desde el navegador.
- Configuracion editable de host, puerto y password de OBS WebSocket.
- Deteccion de hardware desde el navegador:
  - GPU (automatica via WebGL)
  - hilos de CPU (automatico)
  - modelo de CPU y RAM (formulario, persistido en el navegador)
  - capturadoras HDMI (via permisos de camara)
- Recomendaciones de OBS usando IA integrada via backend serverless.
- Recomendacion local de respaldo si la IA falla.
- Edicion manual antes de importar:
  - resolucion
  - FPS
  - encoder
  - bitrate de video
  - bitrate de audio
  - formato de grabacion
  - calidad de grabacion
- Importacion de ajustes a OBS.
- Comparacion entre ajustes actuales de OBS y ajustes recomendados.
- Primera etapa de configuracion de audio documentada en [README_AUDIO.md](README_AUDIO.md).
- Validacion de datos antes de tocar OBS o llamar a la API.
- Scripts de lint y typecheck.

## Diferencia Frente al Asistente Nativo de OBS

El asistente nativo de OBS hoy es mejor para:

- hacer pruebas reales de ancho de banda
- aplicar ajustes internos de OBS con mayor seguridad
- conocer detalles nativos de OBS sin depender de integraciones externas
- configurar rapidamente con poca intervencion del usuario

OBSREC se enfoca en:

- transparencia
- explicacion
- diagnostico
- edicion antes de aplicar
- recomendaciones por plataforma
- flujos orientados a perfiles

La meta a largo plazo es que OBSREC ayude a responder preguntas como:

- Por que mi bitrate esta demasiado alto o bajo?
- Conviene tener el lienzo en 4K si la salida es 1080p?
- Me conviene grabar en MKV o MP4?
- Mi encoder es bueno para mi hardware?
- Que va a cambiar si aplico esta configuracion?
- Mi perfil actual esta alineado con Twitch, YouTube, grabacion o stream + grabacion?

## Stack Tecnico

- React
- Vite
- TypeScript
- Tailwind CSS
- Zustand
- OBS WebSocket
- Funciones serverless en Vercel (Groq SDK, Tavily)

## Requisitos

Para usar la app:

- OBS Studio abierto en la misma computadora
- OBS WebSocket habilitado
- Chrome, Edge o Firefox (Safari no permite conectarse a OBS)

Para desarrollo:

- Node.js
- pnpm

OBS WebSocket viene integrado en versiones modernas de OBS. En OBS puedes abrir:

`Herramientas > Ajustes del servidor WebSocket`

Valores locales recomendados:

- Host: `localhost`
- Puerto: `4455`
- Password: el password mostrado por OBS WebSocket

## Variables de Entorno

El frontend no necesita variables: en produccion llama a la API en el mismo origen, y en desarrollo el proxy de Vite redirige `/api` a produccion. Opcionalmente, `VITE_AI_API_URL` apunta la API a otra base (por ejemplo `vercel dev` local).

Las claves del proveedor de IA nunca van en el frontend. Configura estas variables solo en el backend de Vercel:

```bash
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
OBSREC_AI_DAILY_LIMIT=20
TAVILY_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Si el backend no esta disponible o se alcanza el limite diario, OBSREC usa su recomendacion local de respaldo.

## Desarrollo

Instalar dependencias:

```bash
pnpm install
```

Ejecutar la app (abre `http://localhost:5173`):

```bash
pnpm run dev
```

Ejecutar verificaciones:

```bash
pnpm run lint
pnpm run typecheck
```

Crear build de produccion:

```bash
pnpm run build
```

Ejecutar backend serverless localmente con Vercel CLI:

```bash
vercel dev
```

Verificar solo los endpoints serverless:

```bash
pnpm run typecheck:api
OBSREC_AI_API_URL=https://obsrec.vercel.app pnpm run test:ai-backend
OBSREC_AI_API_URL=https://obsrec.vercel.app pnpm run test:ai-backend -- --ai
```

## Estructura del Proyecto

```text
src/
  renderer/    Interfaz React
    lib/       Integracion con OBS WebSocket, deteccion de hardware, cliente de IA
  shared/      Tipos compartidos, validadores y logica de recomendacion
api/           Endpoints serverless de IA integrada para Vercel
```

## Despliegue de IA Integrada

1. Crea un proyecto en Vercel apuntando a este repositorio.
2. Crea una base Redis en Upstash y copia las credenciales REST.
3. Configura en Vercel: `GROQ_API_KEY`, `GROQ_MODEL`, `OBSREC_AI_DAILY_LIMIT`, `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.
4. Despliega y prueba `GET /api/health`.
5. Ejecuta `pnpm run test:ai-backend -- --ai` apuntando `OBSREC_AI_API_URL` a la URL desplegada.
6. La app web desplegada en ese mismo proyecto usa la API automaticamente (mismo origen).

## Estado Actual

OBSREC todavia esta en una etapa temprana. La direccion principal ya esta definida, pero debe tratarse como un asistente experimental mientras se prueba con mas versiones de OBS, perfiles y hardware.

Bases completadas:

- shell de aplicacion
- conexion con OBS
- flujo de recomendacion con IA
- fallback local
- UI editable de recomendacion
- comparacion de ajustes actuales contra recomendados
- validacion y tooling basico

Siguientes pasos importantes:

- mejorar el mapeo de parametros internos de OBS
- agregar respaldo/restauracion de perfiles
- mostrar explicaciones de diagnostico mas ricas
- guardar preferencias de conexion localmente
- soportar multiples perfiles o presets
- probar con mas configuraciones de OBS y hardware

## Notas de Seguridad

OBSREC modifica ajustes de OBS mediante WebSocket. Antes de usarlo para una transmision o grabacion importante, revisa los ajustes aplicados dentro de OBS.

Cuando sea posible, es recomendable grabar en MKV para reducir el riesgo de perder una grabacion si OBS o el sistema fallan.

El frontend no debe contener `GROQ_API_KEY` ni `TAVILY_API_KEY`. El backend recibe informacion tecnica del equipo, modo y plataforma para generar recomendaciones; no necesita archivos locales ni claves de OBS.

## Repositorio

GitHub:

https://github.com/AlanSan1195/OBSREC
