import type { ConsoleComponentSpec, ConsoleModel, ConsoleProfileRequest, ConsoleProfileResponse } from './types';
import { getLocalRecommendation } from './localRecommendation';
import { parseResolution } from './validation';

// Respaldo offline del analisis de consola: sin IA ni web, infiere capacidades a
// partir de constantes conocidas de cada consola y de palabras clave del nombre
// de la capturadora/monitor, y reutiliza la recomendacion local de OBS capando
// resolucion/fps al techo de captura.

interface Caps { resolution: string; fps: number }

const CONSOLE_CAPS: Record<ConsoleModel, { name: string; caps: Caps; hdr: boolean; vrr: boolean }> = {
  ps5:            { name: 'PlayStation 5',     caps: { resolution: '3840x2160', fps: 120 }, hdr: true, vrr: true },
  ps5_pro:        { name: 'PlayStation 5 Pro', caps: { resolution: '3840x2160', fps: 120 }, hdr: true, vrr: true },
  xbox_series_x:  { name: 'Xbox Series X',     caps: { resolution: '3840x2160', fps: 120 }, hdr: true, vrr: true },
  xbox_series_s:  { name: 'Xbox Series S',     caps: { resolution: '2560x1440', fps: 120 }, hdr: true, vrr: true },
  switch:         { name: 'Nintendo Switch',   caps: { resolution: '1920x1080', fps: 60 },  hdr: false, vrr: false },
  switch2:        { name: 'Nintendo Switch 2', caps: { resolution: '3840x2160', fps: 60 },  hdr: true, vrr: false },
};

function resPixels(res: string): number {
  const parsed = parseResolution(res);
  return parsed.success ? parsed.value.width * parsed.value.height : 0;
}

function minResolution(a: string, b: string): string {
  return resPixels(a) <= resPixels(b) ? a : b;
}

function inferFromName(name: string | undefined, fallback: Caps): { caps: Caps; identified: boolean } {
  const n = (name ?? '').toLowerCase();
  if (!n) return { caps: fallback, identified: false };

  let resolution = fallback.resolution;
  if (n.includes('4k') || n.includes('2160')) resolution = '3840x2160';
  else if (n.includes('1440')) resolution = '2560x1440';
  else if (n.includes('1080')) resolution = '1920x1080';

  let fps = fallback.fps;
  if (n.includes('120')) fps = 120;
  else if (n.includes('60')) fps = 60;
  else if (n.includes('30')) fps = 30;

  return { caps: { resolution, fps }, identified: true };
}

export function getLocalConsoleProfile(request: ConsoleProfileRequest): ConsoleProfileResponse {
  const consoleInfo = CONSOLE_CAPS[request.console];

  // Capturadora: si OBS leyo las capacidades reales, usarlas (verificadas);
  // si no, inferir del nombre con valores conservadores (1080p30 tipico).
  let captureInfer: { caps: Caps; identified: boolean };
  let captureFromObs = false;
  if (request.captureMaxResolution) {
    captureInfer = { caps: { resolution: request.captureMaxResolution, fps: request.captureMaxFps ?? 60 }, identified: true };
    captureFromObs = true;
  } else {
    captureInfer = inferFromName(request.captureCard, { resolution: '1920x1080', fps: 30 });
    const knownGoodCard = /elgato|avermedia|razer|ripsaw|live gamer|cam link|game capture/.test((request.captureCard ?? '').toLowerCase());
    if (knownGoodCard && captureInfer.caps.fps < 60) captureInfer.caps.fps = 60;
  }

  // Monitor: solo informativo para passthrough; no limita la captura.
  const monitorInfer = inferFromName(request.monitor, { resolution: '1920x1080', fps: request.monitorRefreshRate ?? 60 });
  if (request.monitorRefreshRate) monitorInfer.caps.fps = request.monitorRefreshRate;

  // El techo de captura es el menor entre consola y capturadora.
  const captureResolution = minResolution(consoleInfo.caps.resolution, captureInfer.caps.resolution);
  const captureFps = Math.min(consoleInfo.caps.fps, captureInfer.caps.fps);

  const captureIsBottleneck =
    resPixels(captureInfer.caps.resolution) < resPixels(consoleInfo.caps.resolution)
    || captureInfer.caps.fps < consoleInfo.caps.fps;

  const bottleneck = captureIsBottleneck
    ? `La capturadora limita la cadena: captura hasta ${captureInfer.caps.resolution} a ${captureInfer.caps.fps}fps, por debajo de lo que entrega la consola.`
    : `La consola entrega ${consoleInfo.caps.resolution} a ${consoleInfo.caps.fps}fps; la capturadora puede con ello.`;

  // Ajustes de OBS: recomendacion local segun la PC, capada al techo de captura.
  const base = getLocalRecommendation({
    systemInfo: request.systemInfo,
    mode: request.mode,
    platform: request.platform,
  }).recommendations;
  const recommendations = {
    ...base,
    resolution: minResolution(base.resolution, captureResolution),
    fps: Math.min(base.fps, captureFps),
  };

  const consoleSpec: ConsoleComponentSpec = {
    name: consoleInfo.name,
    identified: true,
    summary: `${consoleInfo.name}: salida hasta ${consoleInfo.caps.resolution} a ${consoleInfo.caps.fps}fps${consoleInfo.hdr ? ', HDR' : ''}${consoleInfo.vrr ? ', VRR' : ''}.`,
    maxResolution: consoleInfo.caps.resolution,
    maxFps: consoleInfo.caps.fps,
    hdr: consoleInfo.hdr,
    vrr: consoleInfo.vrr,
  };
  const captureSpec: ConsoleComponentSpec = {
    name: request.captureCard ?? 'Capturadora desconocida',
    identified: captureInfer.identified,
    summary: captureFromObs
      ? `Capacidad real leida de OBS: captura hasta ${captureInfer.caps.resolution}${request.captureMaxFps ? ` a ${captureInfer.caps.fps}fps` : ''}.`
      : captureInfer.identified
        ? `Captura estimada hasta ${captureInfer.caps.resolution} a ${captureInfer.caps.fps}fps.`
        : 'No se identifico la capturadora; se asumen valores conservadores (1080p30).',
    maxResolution: captureInfer.caps.resolution,
    maxFps: captureInfer.caps.fps,
    notes: captureFromObs
      ? 'Verificado leyendo las resoluciones que la capturadora expone en OBS.'
      : 'Recuerda: muchas capturadoras pasan mas resolucion de la que capturan.',
  };
  const monitorSpec: ConsoleComponentSpec = {
    name: request.monitor ?? 'Monitor desconocido',
    identified: monitorInfer.identified,
    summary: monitorInfer.identified
      ? `Monitor hasta ${monitorInfer.caps.resolution} a ${monitorInfer.caps.fps}Hz (no afecta la captura, solo tu juego).`
      : 'No se identifico el monitor.',
    maxResolution: monitorInfer.caps.resolution,
    maxFps: monitorInfer.caps.fps,
  };

  return {
    source: 'local',
    profile: {
      console: consoleSpec,
      captureCard: captureSpec,
      monitor: monitorSpec,
      bottleneck,
      captureResolution,
      captureFps,
      consoleSettings: [
        `En la consola, fija la salida de video a ${captureResolution} a ${captureFps}fps para coincidir con la captura.`,
        'Desactiva HDR si tu capturadora no lo soporta para evitar imagen lavada o negra.',
        'Usa rango RGB completo solo si tu capturadora y OBS coinciden; si dudas, deja "limitado".',
      ],
    },
    recommendations,
    reasoning: `Perfil de consola generado localmente (la IA no estuvo disponible). ${bottleneck}`,
  };
}
