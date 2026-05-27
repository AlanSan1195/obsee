import type { AIRecommendation, AIRecommendationRequest, OBSConfig, OBSConnectionSettings, OBSMode, OBSPlatform, SystemInfo } from './types';

type ValidationResult<T> =
  | { success: true; value: T }
  | { success: false; message: string };

const modes: OBSMode[] = ['stream_record', 'stream_only', 'record_only'];
const platforms: OBSPlatform[] = ['twitch', 'youtube'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function parseResolution(value: string): ValidationResult<{ width: number; height: number }> {
  const match = /^(\d{3,4})x(\d{3,4})$/.exec(value.trim());
  if (!match) {
    return { success: false, message: 'Resolution must use the format 1920x1080.' };
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (width < 1 || width > 4096 || height < 1 || height > 4096) {
    return { success: false, message: 'Resolution must be between 1 and 4096 pixels per side.' };
  }

  return { success: true, value: { width, height } };
}

export function validateOBSConfig(value: unknown): ValidationResult<OBSConfig> {
  if (!isRecord(value)) {
    return { success: false, message: 'OBS configuration must be an object.' };
  }

  if (!modes.includes(value.mode as OBSMode)) {
    return { success: false, message: 'Invalid OBS mode.' };
  }

  if (!platforms.includes(value.platform as OBSPlatform)) {
    return { success: false, message: 'Invalid streaming platform.' };
  }

  if (!isNonEmptyString(value.resolution)) {
    return { success: false, message: 'Resolution is required.' };
  }

  const resolution = parseResolution(value.resolution);
  if (!resolution.success) {
    return resolution;
  }

  if (!isPositiveNumber(value.fps) || value.fps > 240) {
    return { success: false, message: 'FPS must be a number between 1 and 240.' };
  }

  if (!isNonEmptyString(value.encoder)) {
    return { success: false, message: 'Encoder is required.' };
  }

  if (!isPositiveNumber(value.bitrate) || value.bitrate > 100000) {
    return { success: false, message: 'Bitrate must be a number between 1 and 100000.' };
  }

  if (!isPositiveNumber(value.audioBitrate) || value.audioBitrate > 1024) {
    return { success: false, message: 'Audio bitrate must be a number between 1 and 1024.' };
  }

  if (!isNonEmptyString(value.recordingFormat)) {
    return { success: false, message: 'Recording format is required.' };
  }

  return {
    success: true,
    value: {
      mode: value.mode as OBSMode,
      platform: value.platform as OBSPlatform,
      resolution: value.resolution.trim(),
      fps: Math.round(value.fps),
      encoder: value.encoder.trim().toLowerCase(),
      bitrate: Math.round(value.bitrate),
      audioBitrate: Math.round(value.audioBitrate),
      recordingFormat: value.recordingFormat.trim().toLowerCase(),
      recordingQuality: isNonEmptyString(value.recordingQuality) ? value.recordingQuality.trim().toLowerCase() : undefined,
      streamKey: isNonEmptyString(value.streamKey) ? value.streamKey.trim() : undefined,
    },
  };
}

export function validateOBSConnectionSettings(value: unknown): ValidationResult<OBSConnectionSettings> {
  if (!isRecord(value)) {
    return { success: false, message: 'OBS connection settings must be an object.' };
  }

  if (!isNonEmptyString(value.host)) {
    return { success: false, message: 'OBS host is required.' };
  }

  if (!isPositiveNumber(value.port) || value.port > 65535) {
    return { success: false, message: 'OBS port must be a number between 1 and 65535.' };
  }

  if (value.port === 5173) {
    return { success: false, message: 'Port 5173 belongs to the app dev server. Use the OBS WebSocket port, usually 4455.' };
  }

  return {
    success: true,
    value: {
      host: value.host.trim(),
      port: Math.round(value.port),
      password: typeof value.password === 'string' ? value.password.trim() : '',
    },
  };
}

export function validateSystemInfo(value: unknown): ValidationResult<SystemInfo> {
  if (!isRecord(value) || !isRecord(value.cpu) || !isRecord(value.gpu) || !isRecord(value.ram) || !isRecord(value.os)) {
    return { success: false, message: 'System info is incomplete.' };
  }

  if (!isNonEmptyString(value.cpu.model) || !isPositiveNumber(value.cpu.cores) || !isPositiveNumber(value.cpu.speed)) {
    return { success: false, message: 'CPU info is incomplete.' };
  }

  if (!isNonEmptyString(value.gpu.model) || typeof value.gpu.vram !== 'number' || !isNonEmptyString(value.gpu.vendor) || typeof value.gpu.hasNvenc !== 'boolean') {
    return { success: false, message: 'GPU info is incomplete.' };
  }

  if (!isPositiveNumber(value.ram.total)) {
    return { success: false, message: 'RAM info is incomplete.' };
  }

  if (!isNonEmptyString(value.os.platform) || !isNonEmptyString(value.os.distro) || !isNonEmptyString(value.os.release)) {
    return { success: false, message: 'OS info is incomplete.' };
  }

  return {
    success: true,
    value: {
      cpu: {
        model: value.cpu.model,
        cores: value.cpu.cores,
        speed: value.cpu.speed,
      },
      gpu: {
        model: value.gpu.model,
        vram: value.gpu.vram,
        vendor: value.gpu.vendor,
        hasNvenc: value.gpu.hasNvenc,
      },
      ram: {
        total: value.ram.total,
      },
      os: {
        platform: value.os.platform,
        distro: value.os.distro,
        release: value.os.release,
      },
    },
  };
}

export function validateAIRecommendationRequest(value: unknown): ValidationResult<AIRecommendationRequest> {
  if (!isRecord(value)) {
    return { success: false, message: 'AI recommendation request must be an object.' };
  }

  const systemInfo = validateSystemInfo(value.systemInfo);
  if (!systemInfo.success) {
    return systemInfo;
  }

  if (!modes.includes(value.mode as OBSMode)) {
    return { success: false, message: 'Invalid OBS mode for AI recommendation.' };
  }

  if (!platforms.includes(value.platform as OBSPlatform)) {
    return { success: false, message: 'Invalid platform for AI recommendation.' };
  }

  return {
    success: true,
    value: {
      systemInfo: systemInfo.value,
      mode: value.mode as OBSMode,
      platform: value.platform as OBSPlatform,
    },
  };
}

export function validateAIRecommendation(value: unknown): ValidationResult<AIRecommendation> {
  if (!isRecord(value) || !isRecord(value.recommendations)) {
    return { success: false, message: 'AI recommendation is incomplete.' };
  }

  const recommendation = value.recommendations;

  if (!isNonEmptyString(recommendation.resolution)) {
    return { success: false, message: 'AI recommendation is missing resolution.' };
  }

  const resolution = parseResolution(recommendation.resolution);
  if (!resolution.success) {
    return resolution;
  }

  if (!isPositiveNumber(recommendation.fps) || recommendation.fps > 240) {
    return { success: false, message: 'AI recommendation has invalid FPS.' };
  }

  if (!isNonEmptyString(recommendation.encoder)) {
    return { success: false, message: 'AI recommendation is missing encoder.' };
  }

  if (!isPositiveNumber(recommendation.bitrate) || recommendation.bitrate > 100000) {
    return { success: false, message: 'AI recommendation has invalid bitrate.' };
  }

  if (!isPositiveNumber(recommendation.audio_bitrate) || recommendation.audio_bitrate > 1024) {
    return { success: false, message: 'AI recommendation has invalid audio bitrate.' };
  }

  if (!isNonEmptyString(recommendation.recording_format) || !isNonEmptyString(recommendation.recording_quality)) {
    return { success: false, message: 'AI recommendation has invalid recording settings.' };
  }

  return {
    success: true,
    value: {
      recommendations: {
        resolution: recommendation.resolution.trim(),
        fps: Math.round(recommendation.fps),
        encoder: recommendation.encoder.trim().toLowerCase(),
        bitrate: Math.round(recommendation.bitrate),
        audio_bitrate: Math.round(recommendation.audio_bitrate),
        recording_format: recommendation.recording_format.trim().toLowerCase(),
        recording_quality: recommendation.recording_quality.trim().toLowerCase(),
      },
      reasoning: isNonEmptyString(value.reasoning) ? value.reasoning : 'No reasoning was provided.',
    },
  };
}
