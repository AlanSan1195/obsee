import type { AIRecommendation, AIRecommendationExplanation, AIRecommendationExplanationRequest, AIRecommendationField, AIRecommendationRequest, AIRecommendationSettings, ApplyGuidedSourceDeviceInput, BeginGuidedSourceInput, CameraLayout, CreateGuidedSourceConfig, OBSBackup, OBSAudioConfig, OBSConfig, OBSConnectionSettings, OBSMode, OBSPlatform, OBSSettingsSnapshot, SetCameraLayoutInput, SourceKindFriendly, SystemInfo } from './types';

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
        compressorRatio: Number(filters.compressorRatio.toFixed(1)),
        compressorThresholdDb: Number(filters.compressorThresholdDb.toFixed(1)),
        limiterThresholdDb: Number(filters.limiterThresholdDb.toFixed(1)),
        noiseSuppression: filters.noiseSuppression,
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
