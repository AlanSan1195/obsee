import type { ConsoleComponentSpec, ConsoleModel, ConsoleProfileRequest, ConsoleProfileResponse } from './types';
import {
  getLocalRecommendation,
  getPreferredEncoder,
  getPreferredRecordingEncoder,
  getRecordingBitrate,
  getStreamBitrate,
} from './localRecommendation';
import { parseResolution, validateConsoleProfileResponse } from './validation';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKnownMonitorName(value: string): boolean {
  return value.trim().length > 2
    && !/^(unknown|desconocido|display|monitor|default)/i.test(value.trim());
}

// La IA aporta contexto y explicaciones, pero los datos que OBS leyó directamente
// de la capturadora y el encoder disponible en la PC son deterministas. Esta capa
// evita que un modelo pequeño los contradiga al generar el JSON.
export function normalizeConsoleProfileForRequest(
  request: ConsoleProfileRequest,
  response: ConsoleProfileResponse,
): ConsoleProfileResponse {
  const consoleInfo = CONSOLE_CAPS[request.console];
  const consoleCaps = consoleInfo.caps;
  const verifiedCaptureResolution = request.captureMaxResolution
    ? minResolution(consoleCaps.resolution, request.captureMaxResolution)
    : minResolution(consoleCaps.resolution, response.profile.captureResolution);
  const verifiedCaptureFps = Math.min(
    consoleCaps.fps,
    request.captureMaxFps ?? response.profile.captureFps,
  );
  const streamResolution = minResolution(
    request.goal?.streamResolution ?? response.recommendations.resolution,
    verifiedCaptureResolution,
  );
  const recordingResolution = request.mode === 'stream_only'
    ? streamResolution
    : minResolution(request.goal?.recordingResolution ?? verifiedCaptureResolution, verifiedCaptureResolution);
  const preferredEncoder = getPreferredEncoder(request.systemInfo);
  const wantsRecording = request.mode !== 'stream_only';
  const preferredRecordingEncoder = wantsRecording
    ? getPreferredRecordingEncoder(request.systemInfo)
    : preferredEncoder;
  const recordingBitrate = wantsRecording
    ? getRecordingBitrate(
      recordingResolution,
      Math.min(response.recommendations.fps, verifiedCaptureFps),
      preferredRecordingEncoder,
    )
    : response.recommendations.bitrate;
  const hasVerifiedCaptureCaps = Boolean(request.captureMaxResolution);
  const captureLimitsConsole = resPixels(verifiedCaptureResolution) < resPixels(consoleCaps.resolution)
    || verifiedCaptureFps < consoleCaps.fps;
  const bottleneck = hasVerifiedCaptureCaps
    ? captureLimitsConsole
      ? `OBS verifico que la capturadora fija el techo de captura en ${verifiedCaptureResolution} a ${verifiedCaptureFps}fps. El monitor solo afecta el passthrough y no reduce la grabacion de OBS.`
      : `OBS verifico captura hasta ${verifiedCaptureResolution} a ${verifiedCaptureFps}fps sin un limite inferior al de la consola. El monitor solo afecta el passthrough.`
    : response.profile.bottleneck;
  const finalFps = Math.min(
    request.goal?.fps ?? response.recommendations.fps,
    verifiedCaptureFps,
  );
  const captureMatch = hasVerifiedCaptureCaps
    ? `La **${consoleInfo.name}** y la capturadora hacen match en **${verifiedCaptureResolution} a ${verifiedCaptureFps} FPS**, capacidad comprobada directamente por OBS.`
    : `La **${consoleInfo.name}** y la capturadora se ajustaron al techo seguro de **${verifiedCaptureResolution} a ${verifiedCaptureFps} FPS**.`;
  const streamMatch = request.mode === 'record_only'
    ? ''
    : `El **stream ${streamResolution} a ${response.recommendations.bitrate} kbps** adapta esa señal a ${request.platform} para priorizar una emision estable.`;
  const recordingMatch = wantsRecording
    ? `La **grabacion ${recordingResolution} con ${preferredRecordingEncoder.toUpperCase()} a ${recordingBitrate} kbps** conserva mas detalle en el archivo local sin atarla al limite del stream.`
    : '';
  const encoderMatch = `El **encoder ${preferredEncoder.toUpperCase()}** aprovecha ${request.systemInfo.gpu.model}; los **${finalFps} FPS** mantienen fluido el movimiento.`;
  const reasoning = [captureMatch, streamMatch, recordingMatch, encoderMatch].filter(Boolean).join(' ');
  const monitorIsKnown = isKnownMonitorName(request.monitor ?? '');

  return {
    ...response,
    profile: {
      ...response.profile,
      console: {
        ...response.profile.console,
        name: consoleInfo.name,
        identified: true,
        maxResolution: consoleCaps.resolution,
        maxFps: consoleCaps.fps,
        hdr: consoleInfo.hdr,
        vrr: consoleInfo.vrr,
      },
      captureResolution: verifiedCaptureResolution,
      captureFps: verifiedCaptureFps,
      bottleneck,
      captureCard: {
        ...response.profile.captureCard,
        name: request.captureCard ?? response.profile.captureCard.name,
        maxResolution: request.captureMaxResolution ?? response.profile.captureCard.maxResolution,
        maxFps: request.captureMaxFps ?? response.profile.captureCard.maxFps,
      },
      monitor: monitorIsKnown ? response.profile.monitor : {
        ...response.profile.monitor,
        name: request.monitor ?? 'Monitor desconocido',
        identified: false,
        summary: 'Monitor no identificado; no se usa como techo de captura de OBS.',
      },
    },
    recommendations: {
      ...response.recommendations,
      canvas_resolution: verifiedCaptureResolution,
      resolution: streamResolution,
      recording_resolution: recordingResolution,
      fps: finalFps,
      encoder: preferredEncoder,
      bitrate: getStreamBitrate(request.platform, streamResolution, finalFps),
      recording_encoder: preferredRecordingEncoder,
      recording_bitrate: recordingBitrate,
    },
    reasoning,
  };
}

// Los modelos locales pequeños pueden responder el perfil descriptivo completo
// pero omitir parte de `recommendations`. Conservamos su análisis y completamos
// exclusivamente los ajustes ausentes con el perfil determinista local. Si los
// valores parciales siguen siendo inválidos, usamos el bloque local completo sin
// descartar el perfil descriptivo que sí produjo la IA.
export function resolveConsoleProfileResponse(
  request: ConsoleProfileRequest,
  payload: unknown,
): ConsoleProfileResponse {
  const local = getLocalConsoleProfile(request);
  const direct = validateConsoleProfileResponse(payload);
  if (direct.success) {
    return normalizeConsoleProfileForRequest(request, direct.value);
  }

  if (!isRecord(payload) || !isRecord(payload.profile)) {
    return local;
  }

  const partialRecommendations = isRecord(payload.recommendations)
    ? payload.recommendations
    : {};
  const completedReasoning = typeof payload.reasoning === 'string' && payload.reasoning.trim().length > 0
    ? payload.reasoning
    : `La IA identifico la cadena de consola y captura. Los ajustes de OBS que faltaban se completaron localmente usando el hardware y las capacidades detectadas.`;
  const completed = validateConsoleProfileResponse({
    ...payload,
    source: 'ai',
    recommendations: {
      ...local.recommendations,
      ...partialRecommendations,
    },
    reasoning: completedReasoning,
  });

  if (completed.success) {
    return normalizeConsoleProfileForRequest(request, completed.value);
  }

  const withLocalRecommendations = validateConsoleProfileResponse({
    ...payload,
    source: 'ai',
    recommendations: local.recommendations,
    reasoning: completedReasoning,
  });

  return withLocalRecommendations.success
    ? normalizeConsoleProfileForRequest(request, withLocalRecommendations.value)
    : local;
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
    goal: request.goal,
  }).recommendations;
  const streamResolution = minResolution(
    request.goal?.streamResolution ?? base.resolution,
    captureResolution,
  );
  const wantsRecording = request.mode !== 'stream_only';
  const recordingResolution = wantsRecording
    ? minResolution(request.goal?.recordingResolution ?? captureResolution, captureResolution)
    : streamResolution;
  const recommendations = {
    ...base,
    canvas_resolution: captureResolution,
    resolution: streamResolution,
    recording_resolution: recordingResolution,
    fps: Math.min(base.fps, captureFps),
    recording_bitrate: wantsRecording
      ? getRecordingBitrate(recordingResolution, Math.min(base.fps, captureFps), base.recording_encoder)
      : base.bitrate,
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
    reasoning: `Perfil de consola generado localmente (la IA no estuvo disponible). ${bottleneck} Stream ${recommendations.resolution} con ${recommendations.encoder} a ${recommendations.bitrate}kbps; grabacion ${recommendations.recording_resolution} con ${recommendations.recording_encoder} a ${recommendations.recording_bitrate}kbps.`,
  };
}
