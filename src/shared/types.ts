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

export type MicType = 'condenser' | 'dynamic' | 'electret' | 'unknown';
export type MicConnection = 'usb' | 'xlr' | 'analog' | 'wireless' | 'unknown';
export type NoiseSuppressMethod = 'rnnoise' | 'speex' | 'nvafx';

export interface OBSAudioNoiseGate {
  enabled: boolean;
  closeThresholdDb: number;
  openThresholdDb: number;
}

export interface OBSAudioFilterConfig {
  gainDb: number;
  // Por defecto true: si se omite, se conserva el comportamiento fijo previo.
  gainEnabled?: boolean;
  compressorRatio: number;
  compressorThresholdDb: number;
  compressorEnabled?: boolean;
  limiterThresholdDb: number;
  limiterEnabled?: boolean;
  noiseSuppression: boolean;
  noiseSuppressionMethod?: NoiseSuppressMethod;
  noiseGate?: OBSAudioNoiseGate;
}

// --- Perfilado de microfono con IA ---

export interface MicProfileRequest {
  deviceName: string;
  inputKind?: string;
  mode: OBSMode;
  // Lo inyecta app-api (plataforma detectada del userAgent); opcional desde los componentes.
  os?: string;
}

export interface MicProfile {
  identified: boolean;
  model: string;
  type: MicType;
  connection: MicConnection;
  hasBuiltinDsp: boolean;
  summary: string;
  sources?: string[];
}

export interface MicFilterRecommendations {
  noiseSuppression: { enabled: boolean; method: NoiseSuppressMethod; reason: string };
  noiseGate: { enabled: boolean; closeThresholdDb: number; openThresholdDb: number; reason: string };
  gain: { enabled: boolean; db: number; reason: string };
  compressor: { enabled: boolean; ratio: number; thresholdDb: number; reason: string };
  limiter: { enabled: boolean; thresholdDb: number; reason: string };
}

export interface MicProfileResponse {
  source: 'ai' | 'local';
  profile: MicProfile;
  filters: MicFilterRecommendations;
  reasoning: string;
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
  // `resolution` se conserva como alias de la salida de stream para clientes
  // anteriores. Los tres campos explicitos permiten grabar y transmitir a
  // resoluciones distintas sin confundir el lienzo de OBS.
  resolution: string;
  canvasResolution?: string;
  streamResolution?: string;
  recordingResolution?: string;
  fps: number;
  // `encoder` y `bitrate` pertenecen al stream. La grabacion puede usar un
  // codec y una tasa mucho mayores en modo avanzado.
  encoder: string;
  bitrate: number;
  recordingEncoder?: string;
  recordingBitrate?: number;
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
  streamResolution?: string;
  recordingResolution?: string;
  outputMode?: 'Simple' | 'Advanced';
  advancedOutput?: {
    streamEncoder: string;
    recordingEncoder: string;
    streamRescaleResolution: string;
    recordingRescaleResolution: string;
    streamRescaleFilter: string;
    recordingRescaleFilter: string;
    recordingFormat: string;
  };
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
    speed?: number;
  };
  gpu: {
    model: string;
    vram?: number;
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
  goal?: OBSGoalPreferences;
  // Opcional para mantener compatibilidad con backends anteriores.
  currentSettings?: ObsBaselineSettings;
}

export interface OBSGoalPreferences {
  description: string;
  streamResolution?: string;
  recordingResolution?: string;
  fps?: number;
  source?: 'computer' | 'console';
  deviceNotes?: string;
}

export type AIRecommendationSettings = {
  canvas_resolution: string;
  // Resolucion que recibe la plataforma de streaming. `resolution` mantiene
  // compatibilidad con el contrato anterior de la API.
  resolution: string;
  recording_resolution: string;
  fps: number;
  // `encoder` y `bitrate` son exclusivos de la emision. La grabacion conserva
  // su propio perfil para no degradar el archivo local al limite del stream.
  encoder: string;
  bitrate: number;
  recording_encoder: string;
  recording_bitrate: number;
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

// --- Analisis de consola (PC + capturadora) ---

export type ConsoleModel = 'ps5' | 'ps5_pro' | 'xbox_series_x' | 'xbox_series_s' | 'switch' | 'switch2';

// Periféricos detectados en el navegador con mediaDevices (solo lectura).
export interface DetectedDisplay {
  model: string;
  main: boolean;
  width: number;
  height: number;
  refreshRate: number;
}

export interface DetectedCaptureDevice {
  name: string;
  vendor?: string;
}

export interface PeripheralsSnapshot {
  displays: DetectedDisplay[];
  captureDevices: DetectedCaptureDevice[];
}

// Capacidades reales de la capturadora leidas desde OBS (no adivinadas por nombre).
export interface CaptureCapabilities {
  deviceName: string;
  maxResolution?: string;
  maxFps?: number;
  resolutions: string[];
}

export interface ConsoleProfileRequest {
  console: ConsoleModel;
  captureCard?: string;
  monitor?: string;
  monitorRefreshRate?: number;
  // Capacidades reales leidas de OBS (techo de captura verificado).
  captureMaxResolution?: string;
  captureMaxFps?: number;
  platform: OBSPlatform;
  mode: OBSMode;
  goal?: OBSGoalPreferences;
  // Hardware de la PC que corre OBS (para elegir encoder/bitrate).
  systemInfo: SystemInfo;
  os?: string;
}

export interface ConsoleComponentSpec {
  name: string;
  identified: boolean;
  summary: string;
  maxResolution?: string;
  maxFps?: number;
  hdr?: boolean;
  vrr?: boolean;
  notes?: string;
}

export interface ConsoleProfile {
  console: ConsoleComponentSpec;
  captureCard: ConsoleComponentSpec;
  monitor: ConsoleComponentSpec;
  bottleneck: string;
  captureResolution: string;
  captureFps: number;
  consoleSettings: string[];
  sources?: string[];
  research?: {
    status: 'verified' | 'no_results' | 'unavailable';
    provider?: 'tavily' | 'ai_search';
    sourceCount: number;
  };
}

export interface ConsoleProfileResponse {
  source: 'ai' | 'local';
  profile: ConsoleProfile;
  // Reusa el shape de la recomendacion de OBS para integrarse con el flujo de aplicar.
  recommendations: AIRecommendationSettings;
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
