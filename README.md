# OBSREC

OBSREC es una aplicacion de escritorio para OBS que analiza tu computadora, recomienda ajustes de streaming/grabacion y compara esas recomendaciones contra la configuracion actual de OBS.

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

- Aplicacion de escritorio con Electron.
- Interfaz en React + Vite.
- Conexion con OBS mediante WebSocket.
- Configuracion editable de host, puerto y password de OBS WebSocket.
- Analisis local del sistema:
  - CPU
  - GPU
  - RAM
  - sistema operativo
- Recomendaciones de OBS usando IA via Groq.
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
- Validacion de datos entre renderer y proceso main de Electron.
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

- Electron
- React
- Vite
- TypeScript
- Tailwind CSS
- Zustand
- OBS WebSocket
- Groq SDK
- systeminformation

## Requisitos

- Node.js
- pnpm
- OBS Studio
- OBS WebSocket habilitado
- API key de Groq para recomendaciones con IA

OBS WebSocket viene integrado en versiones modernas de OBS. En OBS puedes abrir:

`Herramientas > Ajustes del servidor WebSocket`

Valores locales recomendados:

- Host: `localhost`
- Puerto: `4455`
- Password: el password mostrado por OBS WebSocket

## Variables de Entorno

Copia `.env.example` a `.env` y completa tus valores.

```bash
GROQ_API_KEY=
OBS_WEBSOCKET_HOST=localhost
OBS_WEBSOCKET_PORT=4455
OBS_WEBSOCKET_PASSWORD=
```

Los valores de conexion de OBS tambien pueden capturarse directamente desde la app.

## Desarrollo

Instalar dependencias:

```bash
pnpm install
```

Ejecutar la app:

```bash
pnpm run dev
```

Compilar el proceso main:

```bash
pnpm run build:main
```

Compilar el renderer:

```bash
pnpm run build:renderer
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

## Estructura del Proyecto

```text
src/
  main/        Proceso main de Electron, IPC e integracion con OBS
  renderer/    Interfaz React
  shared/      Tipos compartidos, validadores y logica de recomendacion
```

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

## Repositorio

GitHub:

https://github.com/AlanSan1195/OBSREC
