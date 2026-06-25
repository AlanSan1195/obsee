export interface AIServiceMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIService {
  name: string;
  chat(messages: AIServiceMessage[]): Promise<AsyncGenerator<string>>;
}

export type OBSMode = 'stream_record' | 'stream_only' | 'record_only';
export type OBSPlatform = 'twitch' | 'youtube';

export interface OBSConnectionSettings {
  host: string;
  port: number;
  password: string;
}

export interface OBSAudioFilterConfig {
  gainDb: number;
  compressorRatio: number;
  compressorThresholdDb: number;
  limiterThresholdDb: number;
  noiseSuppression: boolean;
}

export type OBSAudioMonitorType =
  | 'OBS_MONITORING_TYPE_NONE'
  | 'OBS_MONITORING_TYPE_MONITOR_ONLY'
  | 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT';

export interface OBSAudioConfig {
  inputName: string;
  deviceId?: string;
  deviceName?: string;
  mono: boolean;
  filters: OBSAudioFilterConfig;
  monitorType?: OBSAudioMonitorType;
  syncOffsetMs?: number;
  ducking?: {
    enabled: boolean;
    desktopInputName: string;
  };
}

export interface OBSConfig {
  mode: OBSMode;
  platform: OBSPlatform;
  resolution: string;
  fps: number;
  encoder: string;
  bitrate: number;
  audioBitrate: number;
  recordingFormat: string;
  recordingQuality?: string;
  streamKey?: string;
  audio?: OBSAudioConfig;
}

export interface OBSAudioDevice {
  id: string;
  name: string;
  isDefault: boolean;
  isRecommended: boolean;
  score: number;
  reason: string;
}

export interface OBSAudioFilterSnapshot {
  name: string;
  kind: string;
  enabled: boolean;
  settings: Record<string, unknown>;
}

export interface OBSAudioSettingsSnapshot {
  inputName: string;
  inputKind: string;
  inputUuid?: string;
  selectedDeviceId?: string;
  selectedDeviceName?: string;
  devices: OBSAudioDevice[];
  recommendedDevice?: OBSAudioDevice;
  muted: boolean;
  volumeDb: number;
  monitorType: string;
  syncOffsetMs: number;
  desktopAudio?: {
    inputName: string;
    duckingConfigured: boolean;
  };
  duckingTargets: {
    inputName: string;
    inputKind: string;
    duckingConfigured: boolean;
  }[];
  filters: OBSAudioFilterSnapshot[];
  obsrecFiltersConfigured: boolean;
  monoConfigured: boolean;
  monoSupported: boolean;
  warnings: string[];
}

export interface OBSSettingsSnapshot {
  streamServer: string;
  baseResolution: string;
  outputResolution: string;
  fps: number;
  encoder: string;
  bitrate: number;
  audioBitrate: number;
  recordingFormat: string;
  recordingQuality: string;
  audio?: OBSAudioSettingsSnapshot;
}

export interface OBSBackup {
  createdAt: string;
  appliedByObsrec: true;
  snapshot: OBSSettingsSnapshot;
}

export interface SystemInfo {
  cpu: {
    model: string;
    cores: number;
    speed: number;
  };
  gpu: {
    model: string;
    vram: number;
    vendor: string;
    hasNvenc: boolean;
  };
  ram: {
    total: number;
  };
  os: {
    platform: string;
    distro: string;
    release: string;
  };
}

// Configuracion que OBS ya tiene (refleja lo que el usuario eligio en el asistente
// inicial de OBS al instalarlo). Sirve como base para afinar las recomendaciones.
export interface ObsBaselineSettings {
  resolution: string;
  fps: number;
  encoder: string;
  bitrate: number;
  recordingQuality: string;
  hasStreamService: boolean;
}

export interface AIRecommendationRequest {
  systemInfo: SystemInfo;
  mode: OBSMode;
  platform: OBSPlatform;
  // Opcional para mantener compatibilidad con backends anteriores.
  currentSettings?: ObsBaselineSettings;
}

export type AIRecommendationSettings = {
  resolution: string;
  fps: number;
  encoder: string;
  bitrate: number;
  audio_bitrate: number;
  recording_format: string;
  recording_quality: string;
};

export type AIRecommendationField = keyof AIRecommendationSettings;

export interface AIRecommendationExplanationRequest extends AIRecommendationRequest {
  originalRecommendations: AIRecommendationSettings;
  currentRecommendations: AIRecommendationSettings;
  changedFields: AIRecommendationField[];
}

export interface AIRecommendationExplanation {
  source: 'ai' | 'local';
  reasoning: string;
}

export interface AIRecommendation {
  source: 'ai' | 'local';
  recommendations: AIRecommendationSettings;
  originalRecommendations?: AIRecommendationSettings;
  originalReasoning?: string;
  reasoning: string;
}

// --- Escenas y fuentes guiadas ---

// Categorias amigables que se muestran al usuario en el asistente.
// 'game_console' usa el mismo inputKind que 'camera' (captura de video), pero
// se diferencia en la interfaz con copy e icono propios.
export type SourceKindFriendly = 'camera' | 'display' | 'window' | 'game_console' | 'image';

export interface Scene {
  sceneName: string;
  sceneUuid?: string;
  sceneIndex: number;
  isCurrentProgramScene: boolean;
}

export interface SceneItemSummary {
  sceneItemId: number;
  sourceName: string;
  inputKind?: string;
  friendlyKind?: SourceKindFriendly;
  enabled: boolean;
}

// Una opcion enumerada desde OBS (camara, monitor o ventana).
export interface DeviceOption {
  id: string;
  name: string;
  isDefault: boolean;
}

// Resultado de resolver que inputKind real usar para una opcion amigable.
export interface ResolvedSourceKind {
  friendly: SourceKindFriendly;
  inputKind: string;
  devicePropertyName?: string;
  supportsDeviceEnum: boolean;
  available: boolean;
}

export interface CreateGuidedSourceConfig {
  sceneName: string;
  friendly: SourceKindFriendly;
  sourceName: string;
  deviceId?: string;
  imagePath?: string;
  fitToCanvas: boolean;
}

export interface ScenesSnapshot {
  scenes: Scene[];
  currentProgramSceneName?: string;
  warnings: string[];
}

export interface SceneSourcesSnapshot {
  sceneName: string;
  items: SceneItemSummary[];
  warnings: string[];
}

// Payload validado para iniciar el asistente de una fuente.
export interface BeginGuidedSourceInput {
  sceneName: string;
  friendly: SourceKindFriendly;
}

// Resultado de iniciar el asistente: la fuente ya existe en OBS y se enumeran dispositivos.
export interface BeginGuidedSourceResult {
  success: boolean;
  message: string;
  inputName?: string;
  sceneItemId?: number;
  devices?: DeviceOption[];
  propertyName?: string;
  supportsDeviceEnum?: boolean;
  warnings: string[];
}

// Payload validado para aplicar el dispositivo elegido a una fuente recien creada.
export interface ApplyGuidedSourceDeviceInput {
  inputName: string;
  sceneName: string;
  sceneItemId: number;
  propertyName: string;
  deviceId: string;
}

// Como se coloca la camara en la escena:
// - 'facecam': cuadrado 1:1 en una esquina (ideal para stream).
// - 'fullscreen': abarca todo el lienzo.
export type CameraLayout = 'facecam' | 'fullscreen';

export interface SetCameraLayoutInput {
  sceneName: string;
  sceneItemId: number;
  layout: CameraLayout;
}
