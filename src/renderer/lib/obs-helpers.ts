import type { OBSAudioConfig, OBSAudioFilterSnapshot, OBSPlatform } from '../shared/types';

export const defaultAudioConfig = {
  gainDb: 10,
  compressorRatio: 4,
  compressorThresholdDb: -10,
  limiterThresholdDb: -1,
  noiseSuppression: true,
};

export const obsrecFilterNames = {
  noise: 'obsee - Noise Suppression',
  noiseGate: 'obsee - Noise Gate',
  gain: 'obsee - Gain',
  compressor: 'obsee - Compressor',
  limiter: 'obsee - Limiter',
  ducking: 'obsee - Ducking',
};

// Cadena de voz que obsee gestiona en el microfono. Excluye 'ducking', que vive
// en el audio de escritorio. Se usa para poder ELIMINAR filtros omitidos sin
// tocar filtros propios del usuario.
export const MANAGED_MIC_FILTER_NAMES = [
  obsrecFilterNames.noise,
  obsrecFilterNames.noiseGate,
  obsrecFilterNames.gain,
  obsrecFilterNames.compressor,
  obsrecFilterNames.limiter,
];

export type OBSJsonSettings = Record<string, string | number | boolean>;
export type OBSAudioFilterDefinition = {
  kind: string;
  settings: OBSJsonSettings;
};
export type OBSDuckingInputCandidate = {
  inputName: string;
  inputKind: string;
};

export function getStreamServer(platform: OBSPlatform): string {
  return platform === 'twitch'
    ? 'rtmp://live.twitch.tv/app'
    : 'rtmps://live-upload.youtube.com/live2';
}

export function getSimpleEncoderId(encoder: string): string | null {
  const normalized = encoder.toLowerCase();

  if (normalized.includes('nvenc')) return 'nvenc';
  if (normalized.includes('x264')) return 'x264';
  if (normalized.includes('qsv')) return 'qsv';
  if (normalized.includes('amf') || normalized.includes('amd')) return 'amd';
  if (normalized.includes('apple') || normalized.includes('videotoolbox')) return 'apple_h264';

  return null;
}

export function getSimpleRecordingQuality(quality?: string): string {
  switch (quality?.toLowerCase()) {
    case 'lossless':
      return 'Lossless';
    case 'low':
    case 'same_as_stream':
    case 'stream':
      return 'Stream';
    case 'medium':
      return 'Small';
    case 'high':
    default:
      return 'HQ';
  }
}

export function getStringSetting(settings: Record<string, unknown>, key: string): string {
  const value = settings[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : 'Unknown';
}

export function getNumberSetting(settings: Record<string, unknown>, key: string): number {
  const value = settings[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function getStringValue(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = getOptionalString(record[key]);
    if (value) return value;
  }
  return '';
}

export function getBooleanValue(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false;
}

function isDuckingInputCandidate(name: string, kind: string): boolean {
  const normalized = `${name} ${kind}`.toLowerCase();
  return normalized.includes('desktop')
    || normalized.includes('output')
    || normalized.includes('media')
    || normalized.includes('multimedia')
    || normalized.includes('mp3')
    || normalized.includes('music')
    || normalized.includes('musica')
    || kind === 'ffmpeg_source'
    || kind === 'vlc_source';
}

function getDuckingCandidatePriority(candidate: OBSDuckingInputCandidate): number {
  const normalized = `${candidate.inputName} ${candidate.inputKind}`.toLowerCase();
  if (candidate.inputKind === 'special_desktop_audio') return 0;
  if (normalized.includes('desktop') || normalized.includes('output')) return 1;
  if (candidate.inputKind === 'ffmpeg_source' || candidate.inputKind === 'vlc_source') return 2;
  return 3;
}

export function collectDuckingInputCandidates(
  specialInputs: Record<string, unknown> | undefined,
  inputs: unknown[] = [],
): OBSDuckingInputCandidate[] {
  const candidates = new Map<string, OBSDuckingInputCandidate>();
  const addCandidate = (inputName: string, inputKind: string) => {
    if (!inputName || candidates.has(inputName)) return;
    candidates.set(inputName, { inputName, inputKind });
  };

  const desktop1 = getOptionalString(specialInputs?.desktop1);
  const desktop2 = getOptionalString(specialInputs?.desktop2);
  if (desktop1) addCandidate(desktop1, 'special_desktop_audio');
  if (desktop2) addCandidate(desktop2, 'special_desktop_audio');

  for (const input of inputs) {
    if (!isRecord(input)) continue;
    const inputName = getStringValue(input, ['inputName', 'name']);
    const inputKind = getStringValue(input, ['inputKind', 'kind']);
    if (inputName && isDuckingInputCandidate(inputName, inputKind)) {
      addCandidate(inputName, inputKind || 'unknown');
    }
  }

  return [...candidates.values()].sort((a, b) => getDuckingCandidatePriority(a) - getDuckingCandidatePriority(b));
}

export function scoreAudioDevice(name: string, id: string, isCurrent: boolean): { score: number; reason: string } {
  const normalized = `${name} ${id}`.toLowerCase();
  let score = isCurrent ? 20 : 0;
  const reasons: string[] = [];

  if (normalized.includes('usb')) {
    score += 35;
    reasons.push('microfono/interfaz USB');
  }
  if (normalized.includes('xlr') || normalized.includes('focusrite') || normalized.includes('scarlett') || normalized.includes('rode') || normalized.includes('shure') || normalized.includes('elgato') || normalized.includes('blue')) {
    score += 30;
    reasons.push('hardware de audio dedicado');
  }
  if (normalized.includes('microphone') || normalized.includes('mic')) {
    score += 15;
    reasons.push('microfono explicito');
  }
  if (normalized.includes('default') || normalized.includes('system')) {
    score -= 25;
    reasons.push('el dispositivo predeterminado del sistema puede cambiar sin aviso');
  }
  if (normalized.includes('webcam') || normalized.includes('camera') || normalized.includes('facetime')) {
    score -= 20;
    reasons.push('el microfono de camara suele tener menor calidad');
  }
  if (normalized.includes('virtual') || normalized.includes('blackhole') || normalized.includes('loopback') || normalized.includes('vb-audio')) {
    score -= 15;
    reasons.push('dispositivo virtual');
  }

  return {
    score,
    reason: reasons.length > 0 ? reasons.join(', ') : 'dispositivo de audio disponible en OBS',
  };
}

export function isAudioInputKind(kind: string): boolean {
  const normalized = kind.toLowerCase();
  return normalized.includes('audio') && (
    normalized.includes('input')
    || normalized.includes('capture')
    || normalized.includes('wasapi')
    || normalized.includes('coreaudio')
    || normalized.includes('pulse')
    || normalized.includes('alsa')
  );
}

export function scoreAudioInput(name: string, kind: string, isSpecialInput: boolean): number {
  const normalized = `${name} ${kind}`.toLowerCase();
  let score = isSpecialInput ? 40 : 0;

  if (isAudioInputKind(kind)) score += 35;
  if (normalized.includes('mic') || normalized.includes('microphone')) score += 25;
  if (normalized.includes('aux')) score += 10;
  if (normalized.includes('desktop') || normalized.includes('output')) score -= 40;
  if (normalized.includes('monitor')) score -= 20;

  return score;
}

export function isSameFilterValue(current: unknown, expected: number | string | boolean): boolean {
  if (typeof expected === 'number') {
    const value = typeof current === 'number' ? current : Number(current);
    return Number.isFinite(value) && Math.abs(value - expected) < 0.05;
  }

  if (typeof expected === 'boolean') {
    return current === expected;
  }

  return current === expected;
}

export function getFilterSettings(config: OBSAudioConfig): Record<string, OBSAudioFilterDefinition> {
  const filters: Record<string, OBSAudioFilterDefinition> = {};
  const f = config.filters;

  if (f.noiseSuppression) {
    filters[obsrecFilterNames.noise] = {
      kind: 'noise_suppress_filter',
      settings: { method: f.noiseSuppressionMethod ?? 'rnnoise' },
    };
  }

  if (f.noiseGate?.enabled) {
    filters[obsrecFilterNames.noiseGate] = {
      kind: 'noise_gate_filter',
      settings: {
        open_threshold: f.noiseGate.openThresholdDb,
        close_threshold: f.noiseGate.closeThresholdDb,
        attack_time: 25,
        hold_time: 200,
        release_time: 150,
      },
    };
  }

  if (f.gainEnabled !== false) {
    filters[obsrecFilterNames.gain] = {
      kind: 'gain_filter',
      settings: { db: f.gainDb },
    };
  }

  if (f.compressorEnabled !== false) {
    filters[obsrecFilterNames.compressor] = {
      kind: 'compressor_filter',
      settings: {
        ratio: f.compressorRatio,
        threshold: f.compressorThresholdDb,
        attack_time: 6,
        release_time: 60,
        output_gain: 0,
        sidechain_source: 'none',
      },
    };
  }

  if (f.limiterEnabled !== false) {
    filters[obsrecFilterNames.limiter] = {
      kind: 'limiter_filter',
      settings: {
        threshold: f.limiterThresholdDb,
        release_time: 60,
      },
    };
  }

  return filters;
}

export function getDuckingFilter(micInputName: string): Record<string, OBSAudioFilterDefinition> {
  return {
    [obsrecFilterNames.ducking]: {
      kind: 'compressor_filter',
      settings: {
        ratio: 4,
        threshold: -30,
        attack_time: 6,
        release_time: 300,
        output_gain: 0,
        sidechain_source: micInputName,
      },
    },
  };
}

export function areObsrecFiltersConfigured(filters: OBSAudioFilterSnapshot[]): boolean {
  const expectedConfig: OBSAudioConfig = {
    inputName: 'snapshot',
    mono: true,
    filters: defaultAudioConfig,
  };
  const expectedFilters = getFilterSettings(expectedConfig);

  return Object.entries(expectedFilters).every(([name, expected]) => {
    const filter = filters.find((item) => item.name === name && item.kind === expected.kind && item.enabled);
    if (!filter) return false;

    return Object.entries(expected.settings).every(([key, value]) => isSameFilterValue(filter.settings[key], value));
  });
}
