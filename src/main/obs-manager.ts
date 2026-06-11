import OBSWebSocket from 'obs-websocket-js';
import type {
  OBSAudioConfig,
  OBSAudioDevice,
  OBSAudioFilterSnapshot,
  OBSAudioSettingsSnapshot,
  OBSConfig,
  OBSConnectionSettings,
  OBSPlatform,
  OBSSettingsSnapshot,
} from '../shared/types';
import { parseResolution } from '../shared/validation';

const defaultConnectionSettings: OBSConnectionSettings = {
  host: 'localhost',
  port: 4455,
  password: '',
};

const defaultAudioConfig = {
  gainDb: 10,
  compressorRatio: 4,
  compressorThresholdDb: -10,
  limiterThresholdDb: -1,
};

const obsrecFilterNames = {
  gain: 'OBSREC - Gain',
  compressor: 'OBSREC - Compressor',
  limiter: 'OBSREC - Limiter',
};

type OBSJsonSettings = Record<string, string | number | boolean>;
type OBSAudioFilterDefinition = {
  kind: string;
  settings: OBSJsonSettings;
};
type AudioInputCandidate = {
  name: string;
  kind: string;
  uuid?: string;
  score: number;
};

function getStreamServer(platform: OBSPlatform): string {
  return platform === 'twitch'
    ? 'rtmp://live.twitch.tv/app'
    : 'rtmps://live-upload.youtube.com/live2';
}

function getSimpleEncoderId(encoder: string): string | null {
  const normalized = encoder.toLowerCase();

  if (normalized.includes('nvenc')) return 'nvenc';
  if (normalized.includes('x264')) return 'x264';
  if (normalized.includes('qsv')) return 'qsv';
  if (normalized.includes('amf') || normalized.includes('amd')) return 'amd';
  if (normalized.includes('apple') || normalized.includes('videotoolbox')) return 'apple_h264';

  return null;
}

function getSimpleRecordingQuality(quality?: string): string {
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

function getStringSetting(settings: Record<string, unknown>, key: string): string {
  const value = settings[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : 'Unknown';
}

function getNumberSetting(settings: Record<string, unknown>, key: string): number {
  const value = settings[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function getStringValue(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = getOptionalString(record[key]);
    if (value) return value;
  }
  return '';
}

function getBooleanValue(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false;
}

function scoreAudioDevice(name: string, id: string, isCurrent: boolean): { score: number; reason: string } {
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

function isAudioInputKind(kind: string): boolean {
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

function scoreAudioInput(name: string, kind: string, isSpecialInput: boolean): number {
  const normalized = `${name} ${kind}`.toLowerCase();
  let score = isSpecialInput ? 40 : 0;

  if (isAudioInputKind(kind)) score += 35;
  if (normalized.includes('mic') || normalized.includes('microphone')) score += 25;
  if (normalized.includes('aux')) score += 10;
  if (normalized.includes('desktop') || normalized.includes('output')) score -= 40;
  if (normalized.includes('monitor')) score -= 20;

  return score;
}

function isSameFilterValue(current: unknown, expected: number | string | boolean): boolean {
  if (typeof expected === 'number') {
    const value = typeof current === 'number' ? current : Number(current);
    return Number.isFinite(value) && Math.abs(value - expected) < 0.05;
  }

  if (typeof expected === 'boolean') {
    return current === expected;
  }

  return current === expected;
}

function getFilterSettings(config: OBSAudioConfig): Record<string, OBSAudioFilterDefinition> {
  return {
    [obsrecFilterNames.gain]: {
      kind: 'gain_filter',
      settings: { db: config.filters.gainDb },
    },
    [obsrecFilterNames.compressor]: {
      kind: 'compressor_filter',
      settings: {
        ratio: config.filters.compressorRatio,
        threshold: config.filters.compressorThresholdDb,
        attack_time: 6,
        release_time: 60,
        output_gain: 0,
        sidechain_source: 'none',
      },
    },
    [obsrecFilterNames.limiter]: {
      kind: 'limiter_filter',
      settings: {
        threshold: config.filters.limiterThresholdDb,
        release_time: 60,
      },
    },
  };
}

function areObsrecFiltersConfigured(filters: OBSAudioFilterSnapshot[]): boolean {
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

export class OBSManager {
  private obs: OBSWebSocket;
  private connected: boolean = false;

  constructor() {
    this.obs = new OBSWebSocket();
  }

  async initialize() {
    this.obs.on('ConnectionError', (err: Error) => {
      console.error('OBS WebSocket error:', err);
      this.connected = false;
    });

    this.obs.on('ConnectionClosed', () => {
      console.log('OBS connection closed');
      this.connected = false;
    });
  }

  async connect(settings: Partial<OBSConnectionSettings> = {}): Promise<{ success: boolean; message: string }> {
    if (this.connected) {
      return { success: true, message: 'Already connected' };
    }

    const connectionSettings = { ...defaultConnectionSettings, ...settings };
    const address = `ws://${connectionSettings.host}:${connectionSettings.port}`;

    try {
      await this.obs.connect(address, connectionSettings.password);
      this.connected = true;
      return { success: true, message: 'Conectado a OBS' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const helpMessage = errorMessage.toLowerCase().includes('authentication failed')
        ? 'El password llego a OBS, pero OBS lo rechazo. Copialo otra vez desde los ajustes de OBS WebSocket o genera uno nuevo y luego pulsa Aplicar/Aceptar en OBS.'
        : 'Revisa que OBS este abierto, que el servidor WebSocket este habilitado, que el puerto normalmente sea 4455 y que el password coincida con OBS.';

      return {
        success: false,
        message: `No se pudo conectar con OBS WebSocket en ${address}: ${errorMessage}. ${helpMessage}`,
      };
    }
  }

  async disconnect(): Promise<{ success: boolean; message: string }> {
    if (!this.connected) {
      return { success: true, message: 'Not connected' };
    }

    try {
      await this.obs.disconnect();
      this.connected = false;
      return { success: true, message: 'Desconectado de OBS' };
    } catch {
      return { success: false, message: 'Error al desconectar' };
    }
  }

  async getStatus(): Promise<{ connected: boolean; message: string }> {
    return {
      connected: this.connected,
      message: this.connected ? 'Conectado a OBS' : 'Desconectado',
    };
  }

  async getSettingsSnapshot(): Promise<{ success: boolean; message: string; snapshot?: OBSSettingsSnapshot }> {
    if (!this.connected) {
      return { success: false, message: 'Not connected to OBS. Please connect first.' };
    }

    try {
      const [videoSettings, streamSettings] = await Promise.all([
        this.obs.call('GetVideoSettings'),
        this.obs.call('GetStreamServiceSettings'),
      ]);

      const streamServiceSettings = streamSettings.streamServiceSettings as Record<string, unknown>;
      const profileSettings: Record<string, string> = {};
      const profileRequests = [
        { key: 'encoder', category: 'SimpleOutput', name: 'StreamEncoder' },
        { key: 'bitrate', category: 'SimpleOutput', name: 'VBitrate' },
        { key: 'audioBitrate', category: 'SimpleOutput', name: 'ABitrate' },
        { key: 'recordingFormat', category: 'SimpleOutput', name: 'RecFormat' },
        { key: 'recordingQuality', category: 'SimpleOutput', name: 'RecQuality' },
      ];

      await Promise.all(profileRequests.map(async (request) => {
        try {
          const response = await this.obs.call('GetProfileParameter', {
            parameterCategory: request.category,
            parameterName: request.name,
          });
          profileSettings[request.key] = response.parameterValue || response.defaultParameterValue || '';
        } catch {
          profileSettings[request.key] = '';
        }
      }));

      const fpsDenominator = videoSettings.fpsDenominator || 1;
      const fps = Math.round(videoSettings.fpsNumerator / fpsDenominator);

      const audioResult = await this.getAudioSnapshot();

      return {
        success: true,
        message: 'Configuracion de OBS cargada',
        snapshot: {
          streamServer: getStringSetting(streamServiceSettings, 'server'),
          baseResolution: `${videoSettings.baseWidth}x${videoSettings.baseHeight}`,
          outputResolution: `${videoSettings.outputWidth}x${videoSettings.outputHeight}`,
          fps,
          encoder: profileSettings.encoder || 'Unknown',
          bitrate: getNumberSetting(profileSettings, 'bitrate'),
          audioBitrate: getNumberSetting(profileSettings, 'audioBitrate'),
          recordingFormat: profileSettings.recordingFormat || 'Unknown',
          recordingQuality: profileSettings.recordingQuality || 'Unknown',
          audio: audioResult.success ? audioResult.snapshot : undefined,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `No se pudo leer la configuracion de OBS: ${errorMessage}` };
    }
  }

  async getAudioSnapshot(): Promise<{ success: boolean; message: string; snapshot?: OBSAudioSettingsSnapshot }> {
    if (!this.connected) {
      return { success: false, message: 'Not connected to OBS. Please connect first.' };
    }

    try {
      const candidate = await this.getPrimaryAudioInput();

      if (!candidate) {
        return { success: false, message: 'OBSREC no encontro una entrada de microfono en OBS. Agrega un dispositivo Mic/Aux o una fuente Audio Input Capture y luego actualiza el audio.' };
      }

      const inputSettings = await this.obs.call('GetInputSettings', { inputName: candidate.name });
      const settings = inputSettings.inputSettings as Record<string, unknown>;
      const inputKind = inputSettings.inputKind;
      const selectedDeviceId = getOptionalString(settings.device_id) ?? getOptionalString(settings.device);
      let devices: OBSAudioDevice[] = [];
      const warnings: string[] = [];

      try {
        devices = await this.getAudioDevices(candidate.name, selectedDeviceId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        warnings.push(`OBS no expuso dispositivos de microfono seleccionables: ${errorMessage}`);
      }

      const recommendedDevice = devices[0];
      devices = devices.map((device) => ({
        ...device,
        isRecommended: recommendedDevice ? device.id === recommendedDevice.id : false,
      }));

      if (selectedDeviceId && selectedDeviceId.toLowerCase().includes('default')) {
        warnings.push('OBS esta usando el microfono predeterminado del sistema, que puede cambiar cuando conectas hardware.');
      }

      const [mute, volume, monitorType, syncOffset, filters] = await Promise.all([
        this.obs.call('GetInputMute', { inputName: candidate.name }).catch(() => undefined),
        this.obs.call('GetInputVolume', { inputName: candidate.name }).catch(() => undefined),
        this.obs.call('GetInputAudioMonitorType', { inputName: candidate.name }).catch(() => undefined),
        this.obs.call('GetInputAudioSyncOffset', { inputName: candidate.name }).catch(() => undefined),
        this.getAudioFilters(candidate.name),
      ]);

      if (mute?.inputMuted) {
        warnings.push('El microfono esta silenciado en OBS.');
      }

      const selectedDevice = devices.find((device) => device.id === selectedDeviceId);
      const monoSupported = 'mono' in settings || 'force_mono' in settings;
      const monoConfigured = getBooleanValue(settings.mono) || getBooleanValue(settings.force_mono);

      if (!monoSupported) {
        warnings.push('OBS WebSocket no expone la casilla Mono de Propiedades avanzadas de audio para esta entrada. OBSREC puede aplicar filtros automaticamente, pero Mono debe activarse manualmente en OBS.');
      }

      return {
        success: true,
        message: 'Configuracion de audio de OBS cargada',
        snapshot: {
          inputName: candidate.name,
          inputKind,
          inputUuid: candidate.uuid,
          selectedDeviceId,
          selectedDeviceName: selectedDevice?.name,
          devices,
          recommendedDevice,
          muted: Boolean(mute?.inputMuted),
          volumeDb: typeof volume?.inputVolumeDb === 'number' ? volume.inputVolumeDb : 0,
          monitorType: monitorType?.monitorType ?? 'OBS_MONITORING_TYPE_NONE',
          syncOffsetMs: typeof syncOffset?.inputAudioSyncOffset === 'number' ? syncOffset.inputAudioSyncOffset : 0,
          filters,
          obsrecFiltersConfigured: areObsrecFiltersConfigured(filters),
          monoConfigured,
          monoSupported,
          warnings,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `No se pudo leer la configuracion de audio de OBS: ${errorMessage}` };
    }
  }

  async configureAudio(config: OBSAudioConfig): Promise<{ success: boolean; message: string; snapshot?: OBSAudioSettingsSnapshot }> {
    if (!this.connected) {
      return { success: false, message: 'Not connected to OBS. Please connect first.' };
    }

    const warnings: string[] = [];

    try {
      const currentInput = await this.obs.call('GetInputSettings', { inputName: config.inputName });
      const currentSettings = currentInput.inputSettings as Record<string, unknown>;

      if (config.deviceId) {
        try {
          await this.obs.call('SetInputSettings', {
            inputName: config.inputName,
            inputSettings: { device_id: config.deviceId },
            overlay: true,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          warnings.push(`Dispositivo de microfono: ${errorMessage}`);
        }
      }

      const monoSettings: OBSJsonSettings = {};
      if ('mono' in currentSettings) monoSettings.mono = config.mono;
      if ('force_mono' in currentSettings) monoSettings.force_mono = config.mono;

      if (Object.keys(monoSettings).length > 0) {
        await this.obs.call('SetInputSettings', {
          inputName: config.inputName,
          inputSettings: monoSettings,
          overlay: true,
        });
      } else if (config.mono) {
        warnings.push('OBS WebSocket no expuso Mono de Propiedades avanzadas de audio para esta entrada de microfono.');
      }

      await this.ensureAudioFilters(config, warnings);
      const snapshot = await this.getAudioSnapshot();
      const message = warnings.length > 0
        ? `Configuracion de audio aplicada con advertencias: ${warnings.join('; ')}`
        : 'Configuracion de audio aplicada en OBS';

      return {
        success: true,
        message,
        snapshot: snapshot.snapshot,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `Audio configuration failed: ${errorMessage}` };
    }
  }

  async configure(config: OBSConfig): Promise<{ success: boolean; message: string }> {
    if (!this.connected) {
      return { success: false, message: 'Not connected to OBS. Please connect first.' };
    }

    try {
      const warnings: string[] = [];

      if (config.mode === 'stream_only' || config.mode === 'stream_record') {
        const currentStreamSettings = await this.obs.call('GetStreamServiceSettings');
        const currentSettings = currentStreamSettings.streamServiceSettings as Record<string, unknown>;
        const streamKey = config.streamKey ?? (typeof currentSettings.key === 'string' ? currentSettings.key : '');

        await this.obs.call('SetStreamServiceSettings', {
          streamServiceType: 'rtmp_custom',
          streamServiceSettings: {
            ...currentSettings,
            server: getStreamServer(config.platform),
            key: streamKey,
          },
        });
      }

      const resolution = parseResolution(config.resolution);
      if (!resolution.success) {
        return { success: false, message: resolution.message };
      }

      const { width, height } = resolution.value;
      await this.obs.call('SetVideoSettings', {
        baseWidth: width,
        baseHeight: height,
        outputWidth: width,
        outputHeight: height,
        fpsNumerator: config.fps,
        fpsDenominator: 1,
      });

      const encoderId = getSimpleEncoderId(config.encoder);
      const profileUpdates = [
        { category: 'Output', name: 'Mode', value: 'Simple' },
        { category: 'SimpleOutput', name: 'VBitrate', value: String(config.bitrate) },
        { category: 'SimpleOutput', name: 'ABitrate', value: String(config.audioBitrate) },
        { category: 'SimpleOutput', name: 'RecFormat', value: config.recordingFormat },
        { category: 'SimpleOutput', name: 'RecQuality', value: getSimpleRecordingQuality(config.recordingQuality) },
      ];

      if (encoderId) {
        profileUpdates.push({ category: 'SimpleOutput', name: 'StreamEncoder', value: encoderId });
      } else {
        warnings.push(`Encoder "${config.encoder}" was not mapped to an OBS Simple Output encoder.`);
      }

      for (const update of profileUpdates) {
        try {
          await this.obs.call('SetProfileParameter', {
            parameterCategory: update.category,
            parameterName: update.name,
            parameterValue: update.value,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          warnings.push(`${update.category}.${update.name}: ${errorMessage}`);
        }
      }

      if (config.audio) {
        const audioResult = await this.configureAudio(config.audio);
        if (!audioResult.success) {
          warnings.push(audioResult.message);
        } else if (audioResult.message.includes('warnings')) {
          warnings.push(audioResult.message);
        }
      }

      if (warnings.length > 0) {
        return {
          success: true,
          message: `Configuration applied to OBS with warnings: ${warnings.join('; ')}`,
        };
      }

      return { success: true, message: 'Configuration applied to OBS' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `Configuration failed: ${errorMessage}` };
    }
  }

  private async getAudioFilters(inputName: string): Promise<OBSAudioFilterSnapshot[]> {
    try {
      const response = await this.obs.call('GetSourceFilterList', { sourceName: inputName });
      return response.filters
        .filter(isRecord)
        .map((filter) => ({
          name: getStringValue(filter, ['filterName', 'name']),
          kind: getStringValue(filter, ['filterKind', 'kind']),
          enabled: filter.filterEnabled !== false,
          settings: isRecord(filter.filterSettings) ? filter.filterSettings : {},
        }));
    } catch {
      return [];
    }
  }

  private async getPrimaryAudioInput(): Promise<AudioInputCandidate | null> {
    const [specialInputs, inputList] = await Promise.all([
      this.obs.call('GetSpecialInputs').catch(() => undefined),
      this.obs.call('GetInputList').catch(() => undefined),
    ]);

    const specialNames = new Set(
      [
        specialInputs?.mic1,
        specialInputs?.mic2,
        specialInputs?.mic3,
        specialInputs?.mic4,
      ].filter((name): name is string => typeof name === 'string' && name.trim().length > 0),
    );

    const candidates: AudioInputCandidate[] = [];
    if (inputList?.inputs) {
      for (const input of inputList.inputs) {
        if (!isRecord(input)) continue;
        const name = getStringValue(input, ['inputName', 'name']);
        const kind = getStringValue(input, ['inputKind', 'kind']);
        const uuid = getOptionalString(input.inputUuid);
        const isSpecialInput = specialNames.has(name);

        if (!name || (!isSpecialInput && !isAudioInputKind(kind) && scoreAudioInput(name, kind, false) < 20)) {
          continue;
        }

        candidates.push({
          name,
          kind,
          uuid,
          score: scoreAudioInput(name, kind, isSpecialInput),
        });
      }
    }

    for (const specialName of specialNames) {
      if (!candidates.some((candidate) => candidate.name === specialName)) {
        candidates.push({
          name: specialName,
          kind: 'special_mic_aux',
          score: scoreAudioInput(specialName, 'special_mic_aux', true),
        });
      }
    }

    return candidates.sort((a, b) => b.score - a.score)[0] ?? null;
  }

  private async getAudioDevices(inputName: string, selectedDeviceId?: string): Promise<OBSAudioDevice[]> {
    const propertyNames = ['device_id', 'device'];

    for (const propertyName of propertyNames) {
      try {
        const deviceItems = await this.obs.call('GetInputPropertiesListPropertyItems', {
          inputName,
          propertyName,
        });
        const devices = deviceItems.propertyItems
          .filter(isRecord)
          .map((item) => {
            const id = getStringValue(item, ['itemValue', 'value', 'id']);
            const name = getStringValue(item, ['itemName', 'name', 'description', 'label']) || id || 'Dispositivo desconocido';
            const isDefault = `${name} ${id}`.toLowerCase().includes('default');
            const score = scoreAudioDevice(name, id, selectedDeviceId === id);

            return {
              id,
              name,
              isDefault,
              isRecommended: false,
              score: score.score,
              reason: score.reason,
            };
          })
          .filter((device) => device.id.length > 0 || device.name !== 'Dispositivo desconocido')
          .sort((a, b) => b.score - a.score);

        if (devices.length > 0) return devices;
      } catch {
        // Try the next property name; OBS uses different property ids per platform/source kind.
      }
    }

    return [];
  }

  private async ensureAudioFilters(config: OBSAudioConfig, warnings: string[]): Promise<void> {
    const existingFilters = await this.getAudioFilters(config.inputName);
    const expectedFilters = getFilterSettings(config);

    for (const [filterName, filterConfig] of Object.entries(expectedFilters)) {
      const existingFilter = existingFilters.find((filter) => filter.name === filterName);

      try {
        if (!existingFilter) {
          await this.obs.call('CreateSourceFilter', {
            sourceName: config.inputName,
            filterName,
            filterKind: filterConfig.kind,
            filterSettings: filterConfig.settings,
          });
        } else {
          await this.obs.call('SetSourceFilterSettings', {
            sourceName: config.inputName,
            filterName,
            filterSettings: filterConfig.settings,
            overlay: true,
          });
          await this.obs.call('SetSourceFilterEnabled', {
            sourceName: config.inputName,
            filterName,
            filterEnabled: true,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        warnings.push(`${filterName}: ${errorMessage}`);
      }
    }
  }
}

export const obsManager = new OBSManager();
