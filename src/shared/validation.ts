import type { AIRecommendation, AIRecommendationExplanation, AIRecommendationExplanationRequest, AIRecommendationField, AIRecommendationRequest, AIRecommendationSettings, ApplyGuidedSourceDeviceInput, BeginGuidedSourceInput, CameraLayout, ConsoleComponentSpec, ConsoleModel, ConsoleProfileRequest, ConsoleProfileResponse, CreateGuidedSourceConfig, MicConnection, MicProfileRequest, MicProfileResponse, MicType, NoiseSuppressMethod, OBSAudioConfig, OBSAudioNoiseGate, OBSBackup, OBSConfig, OBSConnectionSettings, OBSMode, OBSPlatform, OBSSettingsSnapshot, SetCameraLayoutInput, SourceKindFriendly, SystemInfo } from './types';

type ValidationResult<T> =
  | { success: true; value: T }
  | { success: false; message: string };

const modes: OBSMode[] = ['stream_record', 'stream_only', 'record_only'];
const platforms: OBSPlatform[] = ['twitch', 'youtube'];
const recommendationFields: AIRecommendationField[] = [
  'resolution',
  'fps',
  'encoder',
  'bitrate',
  'audio_bitrate',
  'recording_format',
  'recording_quality',
];
const monitorTypes = [
  'OBS_MONITORING_TYPE_NONE',
  'OBS_MONITORING_TYPE_MONITOR_ONLY',
  'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT',
];
const sourceKindsFriendly: SourceKindFriendly[] = ['camera', 'display', 'window', 'game_console', 'image'];
const cameraLayouts: CameraLayout[] = ['facecam', 'fullscreen'];
const noiseSuppressMethods: NoiseSuppressMethod[] = ['rnnoise', 'speex', 'nvafx'];
const micTypes: MicType[] = ['condenser', 'dynamic', 'electret', 'unknown'];
const micConnections: MicConnection[] = ['usb', 'xlr', 'analog', 'wireless', 'unknown'];
const consoleModels: ConsoleModel[] = ['ps5', 'ps5_pro', 'xbox_series_x', 'xbox_series_s', 'switch', 'switch2'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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

export function validateOBSAudioConfig(value: unknown): ValidationResult<OBSAudioConfig> {
  if (!isRecord(value)) {
    return { success: false, message: 'Audio configuration must be an object.' };
  }

  if (!isNonEmptyString(value.inputName)) {
    return { success: false, message: 'Audio input name is required.' };
  }

  if (typeof value.mono !== 'boolean') {
    return { success: false, message: 'Audio mono setting must be a boolean.' };
  }

  if (!isRecord(value.filters)) {
    return { success: false, message: 'Audio filter settings are required.' };
  }

  const { filters } = value;
  if (!isFiniteNumber(filters.gainDb) || filters.gainDb < -30 || filters.gainDb > 30) {
    return { success: false, message: 'Gain must be between -30 and 30 dB.' };
  }

  if (!isFiniteNumber(filters.compressorRatio) || filters.compressorRatio < 1 || filters.compressorRatio > 32) {
    return { success: false, message: 'Compressor ratio must be between 1 and 32.' };
  }

  if (!isFiniteNumber(filters.compressorThresholdDb) || filters.compressorThresholdDb < -60 || filters.compressorThresholdDb > 0) {
    return { success: false, message: 'Compressor threshold must be between -60 and 0 dB.' };
  }

  if (!isFiniteNumber(filters.limiterThresholdDb) || filters.limiterThresholdDb < -60 || filters.limiterThresholdDb > 0) {
    return { success: false, message: 'Limiter threshold must be between -60 and 0 dB.' };
  }

  if (typeof filters.noiseSuppression !== 'boolean') {
    return { success: false, message: 'Noise suppression setting must be a boolean.' };
  }

  const noiseSuppressionMethod: NoiseSuppressMethod = noiseSuppressMethods.includes(filters.noiseSuppressionMethod as NoiseSuppressMethod)
    ? filters.noiseSuppressionMethod as NoiseSuppressMethod
    : 'rnnoise';

  let noiseGate: OBSAudioNoiseGate | undefined;
  if (filters.noiseGate !== undefined) {
    if (!isRecord(filters.noiseGate) || typeof filters.noiseGate.enabled !== 'boolean') {
      return { success: false, message: 'Noise gate settings are incomplete.' };
    }
    const close = filters.noiseGate.closeThresholdDb;
    const open = filters.noiseGate.openThresholdDb;
    if (!isFiniteNumber(close) || close < -90 || close > 0 || !isFiniteNumber(open) || open < -90 || open > 0) {
      return { success: false, message: 'Noise gate thresholds must be between -90 and 0 dB.' };
    }
    noiseGate = {
      enabled: filters.noiseGate.enabled,
      closeThresholdDb: Number(close.toFixed(1)),
      openThresholdDb: Number(open.toFixed(1)),
    };
  }

  if (value.monitorType !== undefined && (typeof value.monitorType !== 'string' || !monitorTypes.includes(value.monitorType))) {
    return { success: false, message: 'Audio monitor type is invalid.' };
  }

  if (value.syncOffsetMs !== undefined && (!isFiniteNumber(value.syncOffsetMs) || value.syncOffsetMs < -950 || value.syncOffsetMs > 950)) {
    return { success: false, message: 'Audio sync offset must be between -950 and 950 ms.' };
  }

  let ducking: OBSAudioConfig['ducking'];
  if (value.ducking !== undefined) {
    if (!isRecord(value.ducking) || typeof value.ducking.enabled !== 'boolean' || !isNonEmptyString(value.ducking.desktopInputName)) {
      return { success: false, message: 'Audio ducking settings are incomplete.' };
    }
    ducking = {
      enabled: value.ducking.enabled,
      desktopInputName: value.ducking.desktopInputName.trim(),
    };
  }

  return {
    success: true,
    value: {
      inputName: value.inputName.trim(),
      deviceId: isNonEmptyString(value.deviceId) ? value.deviceId.trim() : undefined,
      deviceName: isNonEmptyString(value.deviceName) ? value.deviceName.trim() : undefined,
      mono: value.mono,
      filters: {
        gainDb: Number(filters.gainDb.toFixed(1)),
        gainEnabled: filters.gainEnabled !== false,
        compressorRatio: Number(filters.compressorRatio.toFixed(1)),
        compressorThresholdDb: Number(filters.compressorThresholdDb.toFixed(1)),
        compressorEnabled: filters.compressorEnabled !== false,
        limiterThresholdDb: Number(filters.limiterThresholdDb.toFixed(1)),
        limiterEnabled: filters.limiterEnabled !== false,
        noiseSuppression: filters.noiseSuppression,
        noiseSuppressionMethod,
        noiseGate,
      },
      monitorType: monitorTypes.includes(value.monitorType as string) ? value.monitorType as OBSAudioConfig['monitorType'] : undefined,
      syncOffsetMs: typeof value.syncOffsetMs === 'number' ? Math.round(value.syncOffsetMs) : undefined,
      ducking,
    },
  };
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

  let audio: OBSAudioConfig | undefined;
  if (value.audio !== undefined) {
    const audioValidation = validateOBSAudioConfig(value.audio);
    if (!audioValidation.success) {
      return audioValidation;
    }
    audio = audioValidation.value;
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
      audio,
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
      currentSettings: parseOptionalObsBaseline(value.currentSettings),
    },
  };
}

// Acepta la configuracion base de OBS de forma tolerante: si falta o viene mal,
// se ignora (no debe invalidar la solicitud, para mantener compatibilidad).
function parseOptionalObsBaseline(value: unknown): AIRecommendationRequest['currentSettings'] {
  if (!isRecord(value)) return undefined;
  if (!isNonEmptyString(value.resolution) || !parseResolution(value.resolution).success) return undefined;
  if (!isPositiveNumber(value.fps) || value.fps > 240) return undefined;
  if (!isNonEmptyString(value.encoder)) return undefined;
  if (!isFiniteNumber(value.bitrate) || value.bitrate < 0) return undefined;
  if (!isNonEmptyString(value.recordingQuality)) return undefined;
  if (typeof value.hasStreamService !== 'boolean') return undefined;
  return {
    resolution: value.resolution.trim(),
    fps: Math.round(value.fps),
    encoder: value.encoder.trim().toLowerCase(),
    bitrate: Math.round(value.bitrate),
    recordingQuality: value.recordingQuality.trim().toLowerCase(),
    hasStreamService: value.hasStreamService,
  };
}

function validateAIRecommendationSettings(value: unknown, label: string): ValidationResult<AIRecommendationSettings> {
  const result = validateAIRecommendation({ recommendations: value, reasoning: 'Valid recommendation settings.' });
  if (!result.success) {
    return { success: false, message: `${label}: ${result.message}` };
  }

  return { success: true, value: result.value.recommendations };
}

export function validateAIRecommendationExplanationRequest(value: unknown): ValidationResult<AIRecommendationExplanationRequest> {
  if (!isRecord(value)) {
    return { success: false, message: 'AI recommendation explanation request must be an object.' };
  }

  const baseRequest = validateAIRecommendationRequest(value);
  if (!baseRequest.success) {
    return baseRequest;
  }

  const originalRecommendations = validateAIRecommendationSettings(value.originalRecommendations, 'Original recommendation');
  if (!originalRecommendations.success) {
    return originalRecommendations;
  }

  const currentRecommendations = validateAIRecommendationSettings(value.currentRecommendations, 'Current recommendation');
  if (!currentRecommendations.success) {
    return currentRecommendations;
  }

  if (!Array.isArray(value.changedFields) || value.changedFields.length === 0) {
    return { success: false, message: 'Changed recommendation fields are required.' };
  }

  const changedFields = Array.from(new Set(value.changedFields));
  if (!changedFields.every((field): field is AIRecommendationField => recommendationFields.includes(field as AIRecommendationField))) {
    return { success: false, message: 'Changed recommendation fields include an unsupported field.' };
  }

  return {
    success: true,
    value: {
      ...baseRequest.value,
      originalRecommendations: originalRecommendations.value,
      currentRecommendations: currentRecommendations.value,
      changedFields,
    },
  };
}

export function validateAIRecommendationExplanation(value: unknown): ValidationResult<AIRecommendationExplanation> {
  if (!isRecord(value) || !isNonEmptyString(value.reasoning)) {
    return { success: false, message: 'AI recommendation explanation is incomplete.' };
  }

  return {
    success: true,
    value: {
      source: value.source === 'local' ? 'local' : 'ai',
      reasoning: value.reasoning.trim(),
    },
  };
}

export function validateAIRecommendation(value: unknown): ValidationResult<Omit<AIRecommendation, 'source'>> {
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

export function validateOBSBackup(value: unknown): ValidationResult<OBSBackup> {
  if (!isRecord(value) || !isNonEmptyString(value.createdAt) || value.appliedByObsrec !== true || !isRecord(value.snapshot)) {
    return { success: false, message: 'OBS backup is incomplete.' };
  }

  const snapshot = value.snapshot;
  if (
    !isNonEmptyString(snapshot.streamServer)
    || !isNonEmptyString(snapshot.baseResolution)
    || !isNonEmptyString(snapshot.outputResolution)
    || !isPositiveNumber(snapshot.fps)
    || !isNonEmptyString(snapshot.encoder)
    || typeof snapshot.bitrate !== 'number'
    || typeof snapshot.audioBitrate !== 'number'
    || !isNonEmptyString(snapshot.recordingFormat)
    || !isNonEmptyString(snapshot.recordingQuality)
  ) {
    return { success: false, message: 'OBS backup snapshot is incomplete.' };
  }

  const baseResolution = parseResolution(snapshot.baseResolution);
  if (!baseResolution.success) return baseResolution;

  const outputResolution = parseResolution(snapshot.outputResolution);
  if (!outputResolution.success) return outputResolution;

  const backupSnapshot: OBSSettingsSnapshot = {
    streamServer: snapshot.streamServer.trim(),
    baseResolution: snapshot.baseResolution.trim(),
    outputResolution: snapshot.outputResolution.trim(),
    fps: Math.round(snapshot.fps),
    encoder: snapshot.encoder.trim(),
    bitrate: Math.round(snapshot.bitrate),
    audioBitrate: Math.round(snapshot.audioBitrate),
    recordingFormat: snapshot.recordingFormat.trim(),
    recordingQuality: snapshot.recordingQuality.trim(),
    audio: isRecord(snapshot.audio) ? snapshot.audio as unknown as OBSSettingsSnapshot['audio'] : undefined,
  };

  return {
    success: true,
    value: {
      createdAt: value.createdAt.trim(),
      appliedByObsrec: true,
      snapshot: backupSnapshot,
    },
  };
}

// --- Escenas y fuentes guiadas ---

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

function validateName(value: unknown, label: string, max = 64): ValidationResult<string> {
  if (!isNonEmptyString(value)) {
    return { success: false, message: `${label} es obligatorio.` };
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return { success: false, message: `${label} no puede superar ${max} caracteres.` };
  }
  if (CONTROL_CHARS.test(trimmed)) {
    return { success: false, message: `${label} contiene caracteres no validos.` };
  }
  return { success: true, value: trimmed };
}

export function validateSceneName(value: unknown): ValidationResult<string> {
  return validateName(value, 'El nombre de la escena');
}

export function validateInputName(value: unknown): ValidationResult<string> {
  return validateName(value, 'El nombre de la fuente');
}

export function validateSourceKindFriendly(value: unknown): ValidationResult<SourceKindFriendly> {
  if (typeof value !== 'string' || !sourceKindsFriendly.includes(value as SourceKindFriendly)) {
    return { success: false, message: 'Tipo de fuente no soportado.' };
  }
  return { success: true, value: value as SourceKindFriendly };
}

export function validateBeginGuidedSource(value: unknown): ValidationResult<BeginGuidedSourceInput> {
  if (!isRecord(value)) {
    return { success: false, message: 'La solicitud para agregar la fuente debe ser un objeto.' };
  }
  const sceneName = validateSceneName(value.sceneName);
  if (!sceneName.success) return sceneName;
  const friendly = validateSourceKindFriendly(value.friendly);
  if (!friendly.success) return friendly;
  return { success: true, value: { sceneName: sceneName.value, friendly: friendly.value } };
}

export function validateApplyGuidedSourceDevice(value: unknown): ValidationResult<ApplyGuidedSourceDeviceInput> {
  if (!isRecord(value)) {
    return { success: false, message: 'La solicitud para aplicar el dispositivo debe ser un objeto.' };
  }
  const inputName = validateInputName(value.inputName);
  if (!inputName.success) return inputName;
  const sceneName = validateSceneName(value.sceneName);
  if (!sceneName.success) return sceneName;
  if (typeof value.sceneItemId !== 'number' || !Number.isInteger(value.sceneItemId) || value.sceneItemId < 0) {
    return { success: false, message: 'El identificador del elemento de escena no es valido.' };
  }
  if (!isNonEmptyString(value.propertyName)) {
    return { success: false, message: 'Falta la propiedad del dispositivo.' };
  }
  if (!isNonEmptyString(value.deviceId)) {
    return { success: false, message: 'Selecciona un dispositivo valido.' };
  }
  return {
    success: true,
    value: {
      inputName: inputName.value,
      sceneName: sceneName.value,
      sceneItemId: value.sceneItemId,
      propertyName: value.propertyName.trim(),
      deviceId: value.deviceId.trim(),
    },
  };
}

export function validateSetCameraLayout(value: unknown): ValidationResult<SetCameraLayoutInput> {
  if (!isRecord(value)) {
    return { success: false, message: 'La solicitud de formato de camara debe ser un objeto.' };
  }
  const sceneName = validateSceneName(value.sceneName);
  if (!sceneName.success) return sceneName;
  if (typeof value.sceneItemId !== 'number' || !Number.isInteger(value.sceneItemId) || value.sceneItemId < 0) {
    return { success: false, message: 'El identificador del elemento de escena no es valido.' };
  }
  if (typeof value.layout !== 'string' || !cameraLayouts.includes(value.layout as CameraLayout)) {
    return { success: false, message: 'Formato de camara no soportado.' };
  }
  return {
    success: true,
    value: { sceneName: sceneName.value, sceneItemId: value.sceneItemId, layout: value.layout as CameraLayout },
  };
}

export function validateCreateGuidedSourceConfig(value: unknown): ValidationResult<CreateGuidedSourceConfig> {
  if (!isRecord(value)) {
    return { success: false, message: 'La configuracion de la fuente debe ser un objeto.' };
  }
  const sceneName = validateSceneName(value.sceneName);
  if (!sceneName.success) return sceneName;
  const friendly = validateSourceKindFriendly(value.friendly);
  if (!friendly.success) return friendly;
  const sourceName = validateInputName(value.sourceName);
  if (!sourceName.success) return sourceName;

  if (friendly.value === 'image' && !isNonEmptyString(value.imagePath)) {
    return { success: false, message: 'Selecciona un archivo de imagen.' };
  }
  if (typeof value.fitToCanvas !== 'boolean') {
    return { success: false, message: 'El ajuste a pantalla debe ser un booleano.' };
  }

  return {
    success: true,
    value: {
      sceneName: sceneName.value,
      friendly: friendly.value,
      sourceName: sourceName.value,
      deviceId: isNonEmptyString(value.deviceId) ? value.deviceId.trim() : undefined,
      imagePath: isNonEmptyString(value.imagePath) ? value.imagePath.trim() : undefined,
      fitToCanvas: value.fitToCanvas,
    },
  };
}

// --- Perfilado de microfono con IA ---

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (!isFiniteNumber(value)) return fallback;
  const clamped = Math.min(max, Math.max(min, value));
  return Number(clamped.toFixed(1));
}

function asReason(value: unknown): string {
  return isNonEmptyString(value) ? value.trim().slice(0, 400) : '';
}

export function validateMicProfileRequest(value: unknown): ValidationResult<MicProfileRequest> {
  if (!isRecord(value)) {
    return { success: false, message: 'La solicitud de perfil de microfono debe ser un objeto.' };
  }
  if (!isNonEmptyString(value.deviceName) || value.deviceName.trim().length > 128) {
    return { success: false, message: 'El nombre del microfono es obligatorio (1-128 caracteres).' };
  }
  if (!modes.includes(value.mode as OBSMode)) {
    return { success: false, message: 'Modo de OBS no valido para el perfil de microfono.' };
  }
  return {
    success: true,
    value: {
      deviceName: value.deviceName.trim(),
      mode: value.mode as OBSMode,
      inputKind: isNonEmptyString(value.inputKind) ? value.inputKind.trim() : undefined,
      os: isNonEmptyString(value.os) ? value.os.trim() : undefined,
    },
  };
}

export function validateMicProfileResponse(value: unknown): ValidationResult<MicProfileResponse> {
  if (!isRecord(value) || !isRecord(value.profile) || !isRecord(value.filters)) {
    return { success: false, message: 'El perfil de microfono devuelto esta incompleto.' };
  }

  const profileRaw = value.profile;
  const filtersRaw = value.filters;
  const ns = isRecord(filtersRaw.noiseSuppression) ? filtersRaw.noiseSuppression : {};
  const gate = isRecord(filtersRaw.noiseGate) ? filtersRaw.noiseGate : {};
  const gain = isRecord(filtersRaw.gain) ? filtersRaw.gain : {};
  const comp = isRecord(filtersRaw.compressor) ? filtersRaw.compressor : {};
  const lim = isRecord(filtersRaw.limiter) ? filtersRaw.limiter : {};

  return {
    success: true,
    value: {
      source: value.source === 'local' ? 'local' : 'ai',
      profile: {
        identified: profileRaw.identified === true,
        model: isNonEmptyString(profileRaw.model) ? profileRaw.model.trim().slice(0, 120) : 'Microfono',
        type: micTypes.includes(profileRaw.type as MicType) ? profileRaw.type as MicType : 'unknown',
        connection: micConnections.includes(profileRaw.connection as MicConnection) ? profileRaw.connection as MicConnection : 'unknown',
        hasBuiltinDsp: profileRaw.hasBuiltinDsp === true,
        summary: asReason(profileRaw.summary),
        sources: Array.isArray(profileRaw.sources)
          ? profileRaw.sources.filter(isNonEmptyString).map((url) => url.trim()).slice(0, 6)
          : undefined,
      },
      filters: {
        noiseSuppression: {
          enabled: ns.enabled !== false,
          method: noiseSuppressMethods.includes(ns.method as NoiseSuppressMethod) ? ns.method as NoiseSuppressMethod : 'rnnoise',
          reason: asReason(ns.reason),
        },
        noiseGate: {
          enabled: gate.enabled === true,
          closeThresholdDb: clampNumber(gate.closeThresholdDb, -90, 0, -45),
          openThresholdDb: clampNumber(gate.openThresholdDb, -90, 0, -35),
          reason: asReason(gate.reason),
        },
        gain: {
          enabled: gain.enabled !== false,
          db: clampNumber(gain.db, -30, 30, 0),
          reason: asReason(gain.reason),
        },
        compressor: {
          enabled: comp.enabled !== false,
          ratio: clampNumber(comp.ratio, 1, 32, 4),
          thresholdDb: clampNumber(comp.thresholdDb, -60, 0, -18),
          reason: asReason(comp.reason),
        },
        limiter: {
          enabled: lim.enabled !== false,
          thresholdDb: clampNumber(lim.thresholdDb, -60, 0, -1),
          reason: asReason(lim.reason),
        },
      },
      reasoning: isNonEmptyString(value.reasoning) ? value.reasoning.trim() : 'Sin explicacion.',
    },
  };
}

// --- Analisis de consola ---

function validateComponentSpec(value: unknown, fallbackName: string): ConsoleComponentSpec {
  const v = isRecord(value) ? value : {};
  return {
    name: isNonEmptyString(v.name) ? v.name.trim().slice(0, 80) : fallbackName,
    identified: v.identified === true,
    summary: asReason(v.summary),
    maxResolution: isNonEmptyString(v.maxResolution) && parseResolution(v.maxResolution).success ? v.maxResolution.trim() : undefined,
    maxFps: isFiniteNumber(v.maxFps) ? Math.min(240, Math.max(0, Math.round(v.maxFps))) : undefined,
    hdr: typeof v.hdr === 'boolean' ? v.hdr : undefined,
    vrr: typeof v.vrr === 'boolean' ? v.vrr : undefined,
    notes: isNonEmptyString(v.notes) ? asReason(v.notes) : undefined,
  };
}

export function validateConsoleProfileRequest(value: unknown): ValidationResult<ConsoleProfileRequest> {
  if (!isRecord(value)) {
    return { success: false, message: 'La solicitud de perfil de consola debe ser un objeto.' };
  }
  if (!consoleModels.includes(value.console as ConsoleModel)) {
    return { success: false, message: 'Consola no soportada.' };
  }
  if (!platforms.includes(value.platform as OBSPlatform)) {
    return { success: false, message: 'Plataforma no valida para el perfil de consola.' };
  }
  if (!modes.includes(value.mode as OBSMode)) {
    return { success: false, message: 'Modo no valido para el perfil de consola.' };
  }
  const systemInfo = validateSystemInfo(value.systemInfo);
  if (!systemInfo.success) return systemInfo;

  return {
    success: true,
    value: {
      console: value.console as ConsoleModel,
      platform: value.platform as OBSPlatform,
      mode: value.mode as OBSMode,
      systemInfo: systemInfo.value,
      captureCard: isNonEmptyString(value.captureCard) ? value.captureCard.trim().slice(0, 128) : undefined,
      monitor: isNonEmptyString(value.monitor) ? value.monitor.trim().slice(0, 128) : undefined,
      monitorRefreshRate: isFiniteNumber(value.monitorRefreshRate) ? Math.round(value.monitorRefreshRate) : undefined,
      captureMaxResolution: isNonEmptyString(value.captureMaxResolution) && parseResolution(value.captureMaxResolution).success
        ? value.captureMaxResolution.trim()
        : undefined,
      captureMaxFps: isFiniteNumber(value.captureMaxFps) ? Math.round(value.captureMaxFps) : undefined,
      os: isNonEmptyString(value.os) ? value.os.trim() : undefined,
    },
  };
}

export function validateConsoleProfileResponse(value: unknown): ValidationResult<ConsoleProfileResponse> {
  if (!isRecord(value) || !isRecord(value.profile)) {
    return { success: false, message: 'El perfil de consola devuelto esta incompleto.' };
  }

  // Reusa el validador de la recomendacion de OBS para el bloque recommendations.
  const rec = validateAIRecommendation(value);
  if (!rec.success) {
    return { success: false, message: `Ajustes de OBS de consola: ${rec.message}` };
  }

  const p = value.profile;
  return {
    success: true,
    value: {
      source: value.source === 'local' ? 'local' : 'ai',
      profile: {
        console: validateComponentSpec(p.console, 'Consola'),
        captureCard: validateComponentSpec(p.captureCard, 'Capturadora'),
        monitor: validateComponentSpec(p.monitor, 'Monitor'),
        bottleneck: asReason(p.bottleneck),
        captureResolution: isNonEmptyString(p.captureResolution) && parseResolution(p.captureResolution).success
          ? p.captureResolution.trim()
          : '1920x1080',
        captureFps: Math.round(clampNumber(p.captureFps, 1, 240, 60)),
        consoleSettings: Array.isArray(p.consoleSettings)
          // La IA a veces numera los pasos ("1. ..."); se quita porque la UI ya los numera.
          ? p.consoleSettings.filter(isNonEmptyString).map((s) => s.trim().replace(/^\d+[.)]\s*/, '').slice(0, 200)).slice(0, 8)
          : [],
        sources: Array.isArray(p.sources)
          ? p.sources.filter(isNonEmptyString).map((s) => s.trim()).slice(0, 6)
          : undefined,
      },
      recommendations: rec.value.recommendations,
      reasoning: isNonEmptyString(value.reasoning) ? value.reasoning.trim() : 'Sin explicacion.',
    },
  };
}
