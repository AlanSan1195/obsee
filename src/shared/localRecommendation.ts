import type { AIRecommendation, AIRecommendationExplanation, AIRecommendationExplanationRequest, AIRecommendationField, AIRecommendationRequest, AIRecommendationSettings, SystemInfo } from './types';

export function getPreferredEncoder(systemInfo: SystemInfo): string {
  const vendor = systemInfo.gpu.vendor.toLowerCase();
  const model = systemInfo.gpu.model.toLowerCase();

  if (systemInfo.gpu.hasNvenc || vendor.includes('nvidia')) return 'nvenc';
  if (vendor.includes('apple') || model.includes('apple')) return 'apple vt h264';
  if (vendor.includes('intel')) return 'qsv';
  if (vendor.includes('amd')) return 'amd';

  return 'x264';
}

export function getPreferredRecordingEncoder(systemInfo: SystemInfo): string {
  const vendor = systemInfo.gpu.vendor.toLowerCase();
  const model = systemInfo.gpu.model.toLowerCase();

  // OBS en Apple Silicon expone VideoToolbox HEVC por hardware. En otros
  // proveedores conservamos el encoder H.264 ya verificado para no asumir IDs
  // HEVC que cambian entre generaciones y plugins.
  if (vendor.includes('apple') || model.includes('apple')) return 'apple vt hevc';
  return getPreferredEncoder(systemInfo);
}

export function getRecordingBitrate(resolution: string, fps: number, encoder: string): number {
  const dims = readResolutionDims(resolution);
  if (!dims) return 16000;

  const pixels = dims.width * dims.height;
  const highFrameRate = fps >= 50;
  const usesHevc = /hevc|h265|h\.265/.test(encoder.toLowerCase());

  if (pixels >= 3840 * 2160) {
    if (usesHevc) return highFrameRate ? 40000 : 30000;
    return highFrameRate ? 60000 : 40000;
  }
  if (pixels >= 2560 * 1440) return highFrameRate ? (usesHevc ? 20000 : 24000) : 16000;
  if (pixels >= 1920 * 1080) return highFrameRate ? (usesHevc ? 12000 : 16000) : 10000;
  return highFrameRate ? 7500 : 5000;
}

function readResolutionDims(resolution: string): { width: number; height: number } | null {
  const [width, height] = resolution.split('x').map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

function getHardwareVideoProfile(request: AIRecommendationRequest, encoder: string) {
  const { cpu, ram } = request.systemInfo;
  const hasHardwareEncoder = encoder !== 'x264';
  const canUse1080p60 = ram.total >= 16 && (hasHardwareEncoder || cpu.cores >= 8);
  const wantsRecording = request.mode !== 'stream_only';

  if (canUse1080p60) {
    return {
      resolution: '1920x1080',
      fps: 60,
      bitrate: request.platform === 'youtube' && wantsRecording ? 9000 : 6000,
    };
  }

  return {
    resolution: '1280x720',
    fps: 30,
    bitrate: request.platform === 'youtube' ? 4500 : 3500,
  };
}

// Combina lo que OBS ya tiene configurado (afinado por su asistente inicial segun
// hardware y red) con el techo seguro del hardware: respeta la config del usuario
// salvo que supere lo que su equipo puede sostener.
function getVideoProfile(request: AIRecommendationRequest, encoder: string) {
  const hardware = getHardwareVideoProfile(request, encoder);
  const baseline = request.currentSettings;
  if (!baseline) {
    return { ...hardware, usedBaseline: false };
  }

  const baseDims = readResolutionDims(baseline.resolution);
  const hwDims = readResolutionDims(hardware.resolution);
  if (!baseDims || !hwDims) {
    return { ...hardware, usedBaseline: false };
  }

  const baseWorkload = baseDims.width * baseDims.height * baseline.fps;
  const hardwareCeiling = hwDims.width * hwDims.height * hardware.fps;

  // Si lo que OBS tiene supera el techo del hardware, usamos el perfil seguro.
  if (baseWorkload > hardwareCeiling * 1.05) {
    return { ...hardware, usedBaseline: false };
  }

  return {
    resolution: baseline.resolution,
    fps: Math.min(baseline.fps, 120),
    bitrate: baseline.bitrate > 0 ? baseline.bitrate : hardware.bitrate,
    usedBaseline: true,
  };
}

export function getLocalRecommendation(request: AIRecommendationRequest): AIRecommendation {
  const encoder = getPreferredEncoder(request.systemInfo);
  const recordingEncoder = request.mode === 'stream_only'
    ? encoder
    : getPreferredRecordingEncoder(request.systemInfo);
  const videoProfile = getVideoProfile(request, encoder);
  const recordingQuality = request.mode === 'stream_only' ? 'stream' : 'high';

  const reasoning = videoProfile.usedBaseline
    ? 'Recomendacion local basada en la configuracion que OBS ya tenia (definida en su asistente inicial segun tu hardware y red), ajustando el encoder al optimo de tu equipo (la IA no estuvo disponible).'
    : 'Recomendacion local generada a partir de los nucleos de CPU, la RAM, el proveedor de GPU, la plataforma y el modo seleccionados (la IA no estuvo disponible).';

  return {
    source: 'local',
    recommendations: {
      canvas_resolution: videoProfile.resolution,
      resolution: videoProfile.resolution,
      recording_resolution: videoProfile.resolution,
      fps: videoProfile.fps,
      encoder,
      bitrate: videoProfile.bitrate,
      recording_encoder: recordingEncoder,
      recording_bitrate: request.mode === 'stream_only'
        ? videoProfile.bitrate
        : getRecordingBitrate(videoProfile.resolution, videoProfile.fps, recordingEncoder),
      audio_bitrate: 320,
      recording_format: 'mkv',
      recording_quality: recordingQuality,
    },
    reasoning,
  };
}

const fieldLabels: Record<AIRecommendationField, string> = {
  canvas_resolution: 'lienzo base',
  resolution: 'resolucion del stream',
  recording_resolution: 'resolucion de grabacion',
  fps: 'FPS',
  encoder: 'encoder del stream',
  bitrate: 'bitrate del stream',
  recording_encoder: 'encoder de grabacion',
  recording_bitrate: 'bitrate de grabacion',
  audio_bitrate: 'bitrate de audio',
  recording_format: 'formato de grabacion',
  recording_quality: 'calidad de grabacion',
};

function readResolutionPixels(resolution: string): number {
  const [width, height] = resolution.split('x').map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 0;
  return width * height;
}

function getWorkload(settings: AIRecommendationSettings): number {
  const streamPixels = readResolutionPixels(settings.resolution);
  const recordingPixels = readResolutionPixels(settings.recording_resolution);
  return Math.max(streamPixels, recordingPixels) * settings.fps;
}

function getBitrateGuidance(settings: AIRecommendationSettings, platform: AIRecommendationRequest['platform']): string {
  const bitrate = settings.bitrate;

  if (platform === 'twitch' && bitrate > 8000) {
    return 'En Twitch ese bitrate puede superar lo que muchos viewers reciben de forma estable; si no eres partner o tu audiencia tiene conexiones variadas, conviene vigilar cortes y buffering.';
  }

  if (readResolutionPixels(settings.resolution) >= 1920 * 1080 && settings.fps >= 60 && bitrate < 6000) {
    return 'Para 1080p a 60 FPS el bitrate esta en el borde bajo; prioriza estabilidad, pero puede mostrar artefactos si hay mucho movimiento.';
  }

  if (bitrate > 20000 && settings.resolution === '1280x720') {
    return 'Ese bitrate es alto para 720p; no deberia mejorar mucho la nitidez y si aumentara consumo de red y archivo.';
  }

  const expectedRecordingBitrate = getRecordingBitrate(
    settings.recording_resolution,
    settings.fps,
    settings.recording_encoder,
  );
  if (settings.recording_bitrate < expectedRecordingBitrate * 0.75) {
    return `El stream queda en un rango razonable, pero la grabacion local puede perder detalle; para ${settings.recording_resolution} conviene acercarse a ${expectedRecordingBitrate} kbps con ${settings.recording_encoder}.`;
  }

  return 'Los bitrates de stream y grabacion quedan separados: estabilidad para emitir y mayor calidad para el archivo local.';
}

function getEncoderGuidance(settings: AIRecommendationSettings, request: AIRecommendationExplanationRequest): string {
  const encoder = settings.encoder.toLowerCase();
  const gpuVendor = request.systemInfo.gpu.vendor.toLowerCase();

  if (encoder.includes('x264')) {
    return `Usar x264 movera mas trabajo al CPU (${request.systemInfo.cpu.cores} nucleos); puede dar buena calidad, pero tambien puede subir el riesgo de frames perdidos si juegas o grabas algo pesado.`;
  }

  if (encoder.includes('nvenc') && !request.systemInfo.gpu.hasNvenc && !gpuVendor.includes('nvidia')) {
    return 'NVENC suele ser ideal en NVIDIA, pero este equipo no reporta NVENC; revisa disponibilidad real en OBS antes de aplicarlo.';
  }

  if (encoder.includes('apple')) {
    return 'Apple VT descarga el encode al hardware de video, lo que normalmente mantiene el sistema mas fresco y estable durante streaming o grabacion.';
  }

  if (encoder.includes('qsv')) {
    return 'QSV usa el encoder de Intel y puede ser una buena opcion de bajo consumo si OBS lo detecta correctamente.';
  }

  if (encoder.includes('amd')) {
    return 'El encoder de AMD reduce carga del CPU y suele favorecer estabilidad, aunque la calidad final depende bastante de la generacion de GPU.';
  }

  return 'El encoder seleccionado deberia definir principalmente si la carga cae sobre CPU o hardware dedicado.';
}

export function getLocalRecommendationExplanation(request: AIRecommendationExplanationRequest): AIRecommendationExplanation {
  const { currentRecommendations, originalRecommendations, changedFields } = request;
  const changedText = changedFields
    .map((field) => `${fieldLabels[field]}: ${String(originalRecommendations[field]).toUpperCase()} -> ${String(currentRecommendations[field]).toUpperCase()}`)
    .join(', ');
  const originalWorkload = getWorkload(originalRecommendations);
  const currentWorkload = getWorkload(currentRecommendations);
  const workloadRatio = originalWorkload > 0 ? currentWorkload / originalWorkload : 1;
  const workloadText = workloadRatio > 1.15
    ? `La carga de video sube aproximadamente ${Math.round((workloadRatio - 1) * 100)}%, asi que OBS necesitara mas GPU/CPU y red.`
    : workloadRatio < 0.85
      ? `La carga de video baja aproximadamente ${Math.round((1 - workloadRatio) * 100)}%, lo que deberia mejorar estabilidad y margen termico.`
      : 'La carga de video queda muy parecida a la recomendacion original.';

  return {
    source: 'local',
    reasoning: `${changedText}. ${workloadText} ${getBitrateGuidance(currentRecommendations, request.platform)} ${getEncoderGuidance(currentRecommendations, request)}`,
  };
}
