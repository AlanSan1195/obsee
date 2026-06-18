import OBSWebSocket from 'obs-websocket-js';
import type {
  OBSAudioConfig,
  OBSAudioDevice,
  OBSAudioFilterSnapshot,
  OBSAudioSettingsSnapshot,
  OBSConfig,
  OBSConnectionSettings,
  OBSSettingsSnapshot,
} from '../shared/types';
import { parseResolution } from '../shared/validation';
import {
  areObsrecFiltersConfigured,
  collectDuckingInputCandidates,
  getBooleanValue,
  getDuckingFilter,
  getFilterSettings,
  getNumberSetting,
  getOptionalString,
  getSimpleEncoderId,
  getSimpleRecordingQuality,
  getStreamServer,
  getStringSetting,
  getStringValue,
  isAudioInputKind,
  isRecord,
  obsrecFilterNames,
  scoreAudioDevice,
  scoreAudioInput,
  type OBSJsonSettings,
} from './obs-helpers';
import { saveBackup } from './backup-store';

const defaultConnectionSettings: OBSConnectionSettings = {
  host: 'localhost',
  port: 4455,
  password: '',
};

type AudioInputCandidate = {
  name: string;
  kind: string;
  uuid?: string;
  score: number;
};

type OBSConnectionStatus = {
  connected: boolean;
  message: string;
};

export class OBSManager {
  private obs: OBSWebSocket;
  private connected: boolean = false;
  private statusListener: ((status: OBSConnectionStatus) => void) | null = null;

  constructor() {
    this.obs = new OBSWebSocket();
  }

  onStatusChange(listener: (status: OBSConnectionStatus) => void) {
    this.statusListener = listener;
  }

  private emitStatus(message: string) {
    this.statusListener?.({ connected: this.connected, message });
  }

  async initialize() {
    this.obs.on('ConnectionError', (err: Error) => {
      console.error('OBS WebSocket error:', err);
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) {
        this.emitStatus('Se perdió la conexión con OBS');
      }
    });

    this.obs.on('ConnectionClosed', () => {
      console.log('OBS connection closed');
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) {
        this.emitStatus('OBS cerró la conexión');
      }
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
      this.emitStatus('Conectado a OBS');
      return { success: true, message: 'Conectado a OBS' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const lowerErrorMessage = errorMessage.toLowerCase();
      let helpMessage = 'Revisa que OBS este abierto, que el servidor WebSocket este habilitado, que el puerto coincida con OBS y que el password solo se use si OBS tiene autenticacion activada.';

      if (lowerErrorMessage.includes('authentication failed') || lowerErrorMessage.includes('authentication')) {
        helpMessage = 'OBS requiere password o rechazo el password enviado. Si desactivaste la autenticacion, pulsa Aplicar/Aceptar en OBS y reinicia OBS; si sigue activada, copia el password actual.';
      } else if (lowerErrorMessage.includes('econnrefused') || lowerErrorMessage.includes('connection refused')) {
        helpMessage = `OBS no acepto la conexion. Revisa que OBS este abierto, que el servidor WebSocket este activado y que el puerto sea ${connectionSettings.port}.`;
      } else if (lowerErrorMessage.includes('closed') || lowerErrorMessage.includes('close') || lowerErrorMessage.includes('socket hang up')) {
        helpMessage = 'OBS cerro el intento de conexion. Revisa que el puerto sea correcto y que el servidor WebSocket este habilitado.';
      }

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
      this.emitStatus('Desconectado de OBS');
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
      const duckingTargets = await this.getDuckingTargets();
      const primaryDuckingTarget = duckingTargets[0];

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
          desktopAudio: primaryDuckingTarget
            ? {
              inputName: primaryDuckingTarget.inputName,
              duckingConfigured: primaryDuckingTarget.duckingConfigured,
            }
            : undefined,
          duckingTargets,
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

  async configureAudio(config: OBSAudioConfig): Promise<{ success: boolean; message: string; snapshot?: OBSAudioSettingsSnapshot; warnings: string[] }> {
    if (!this.connected) {
      return { success: false, message: 'Not connected to OBS. Please connect first.', warnings: [] };
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

      if (config.monitorType) {
        try {
          await this.obs.call('SetInputAudioMonitorType', {
            inputName: config.inputName,
            monitorType: config.monitorType,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          warnings.push(`Monitoreo de audio: ${errorMessage}`);
        }
      }

      if (typeof config.syncOffsetMs === 'number') {
        try {
          await this.obs.call('SetInputAudioSyncOffset', {
            inputName: config.inputName,
            inputAudioSyncOffset: config.syncOffsetMs,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          warnings.push(`Sincronizacion de audio: ${errorMessage}`);
        }
      }

      await this.ensureAudioFilters(config.inputName, getFilterSettings(config), warnings);
      await this.configureDucking(config, warnings);
      const snapshot = await this.getAudioSnapshot();
      const message = warnings.length > 0
        ? `Configuracion de audio aplicada con advertencias: ${warnings.join('; ')}`
        : 'Configuracion de audio aplicada en OBS';

      return {
        success: true,
        message,
        snapshot: snapshot.snapshot,
        warnings,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `Audio configuration failed: ${errorMessage}`, warnings };
    }
  }

  async configure(config: OBSConfig): Promise<{ success: boolean; message: string }> {
    if (!this.connected) {
      return { success: false, message: 'Not connected to OBS. Please connect first.' };
    }

    try {
      const warnings: string[] = [];
      const backupSnapshot = await this.getSettingsSnapshot();
      if (backupSnapshot.success && backupSnapshot.snapshot) {
        try {
          await saveBackup(backupSnapshot.snapshot);
        } catch {
          warnings.push('No se pudo guardar el respaldo previo; los cambios se aplicaran sin respaldo.');
        }
      } else {
        warnings.push('No se pudo leer la configuracion actual para respaldo; los cambios se aplicaran sin respaldo.');
      }

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
        } else if (audioResult.warnings.length > 0) {
          warnings.push(...audioResult.warnings);
        }
      }

      if (warnings.length > 0) {
        return {
          success: true,
          message: `Configuracion aplicada en OBS con advertencias: ${warnings.join('; ')}`,
        };
      }

      return { success: true, message: 'Configuracion aplicada en OBS' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `No se pudo aplicar la configuracion: ${errorMessage}` };
    }
  }

  async restoreSnapshot(snapshot: OBSSettingsSnapshot): Promise<{ success: boolean; message: string; warnings: string[] }> {
    if (!this.connected) {
      return { success: false, message: 'Not connected to OBS. Please connect first.', warnings: [] };
    }

    const warnings: string[] = [];

    try {
      const baseResolution = parseResolution(snapshot.baseResolution);
      if (!baseResolution.success) {
        return { success: false, message: baseResolution.message, warnings };
      }

      const outputResolution = parseResolution(snapshot.outputResolution);
      if (!outputResolution.success) {
        return { success: false, message: outputResolution.message, warnings };
      }

      await this.obs.call('SetVideoSettings', {
        baseWidth: baseResolution.value.width,
        baseHeight: baseResolution.value.height,
        outputWidth: outputResolution.value.width,
        outputHeight: outputResolution.value.height,
        fpsNumerator: snapshot.fps,
        fpsDenominator: 1,
      });

      if (snapshot.streamServer !== 'Unknown') {
        try {
          const currentStreamSettings = await this.obs.call('GetStreamServiceSettings');
          const currentSettings = currentStreamSettings.streamServiceSettings as Record<string, unknown>;
          await this.obs.call('SetStreamServiceSettings', {
            streamServiceType: 'rtmp_custom',
            streamServiceSettings: {
              ...currentSettings,
              server: snapshot.streamServer,
            },
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          warnings.push(`Servidor de stream: ${errorMessage}`);
        }
      }

      const profileUpdates = [
        { category: 'Output', name: 'Mode', value: 'Simple' },
        { category: 'SimpleOutput', name: 'VBitrate', value: snapshot.bitrate > 0 ? String(snapshot.bitrate) : '' },
        { category: 'SimpleOutput', name: 'ABitrate', value: snapshot.audioBitrate > 0 ? String(snapshot.audioBitrate) : '' },
        { category: 'SimpleOutput', name: 'RecFormat', value: snapshot.recordingFormat },
        { category: 'SimpleOutput', name: 'RecQuality', value: snapshot.recordingQuality },
        { category: 'SimpleOutput', name: 'StreamEncoder', value: snapshot.encoder },
      ].filter((update) => update.value && update.value !== 'Unknown');

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

      return {
        success: true,
        message: warnings.length > 0
          ? `Configuracion anterior restaurada con advertencias: ${warnings.join('; ')}`
          : 'Configuracion anterior restaurada',
        warnings,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `No se pudo restaurar la configuracion: ${errorMessage}`, warnings };
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

  private async getDuckingTargets(): Promise<NonNullable<OBSAudioSettingsSnapshot['duckingTargets']>> {
    const [specialInputs, inputList] = await Promise.all([
      this.obs.call('GetSpecialInputs').catch(() => undefined),
      this.obs.call('GetInputList').catch(() => undefined),
    ]);
    const candidates = collectDuckingInputCandidates(
      isRecord(specialInputs) ? specialInputs : undefined,
      inputList?.inputs ?? [],
    );

    return Promise.all(candidates.map(async (candidate) => {
      const filters = await this.getAudioFilters(candidate.inputName);
      return {
        ...candidate,
        duckingConfigured: filters.some((filter) => filter.name === obsrecFilterNames.ducking && filter.enabled),
      };
    }));
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

  private async configureDucking(config: OBSAudioConfig, warnings: string[]): Promise<void> {
    const desktopInputName = config.ducking?.desktopInputName;
    if (!desktopInputName) {
      if (config.ducking?.enabled) {
        warnings.push('No se encontro una fuente de musica o audio de escritorio para el ducking.');
      }
      return;
    }

    if (config.ducking?.enabled) {
      await this.ensureAudioFilters(desktopInputName, getDuckingFilter(config.inputName), warnings);
      return;
    }

    if (config.ducking?.enabled === false) {
      const existingFilters = await this.getAudioFilters(desktopInputName);
      const existingFilter = existingFilters.find((filter) => filter.name === obsrecFilterNames.ducking);
      if (!existingFilter) return;

      try {
        await this.obs.call('SetSourceFilterEnabled', {
          sourceName: desktopInputName,
          filterName: obsrecFilterNames.ducking,
          filterEnabled: false,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        warnings.push(`${obsrecFilterNames.ducking}: ${errorMessage}`);
      }
    }
  }

  private async ensureAudioFilters(
    sourceName: string,
    expectedFilters: Record<string, { kind: string; settings: OBSJsonSettings }>,
    warnings: string[],
  ): Promise<void> {
    const existingFilters = await this.getAudioFilters(sourceName);

    for (const [filterName, filterConfig] of Object.entries(expectedFilters)) {
      const existingFilter = existingFilters.find((filter) => filter.name === filterName);

      try {
        if (!existingFilter) {
          await this.obs.call('CreateSourceFilter', {
            sourceName,
            filterName,
            filterKind: filterConfig.kind,
            filterSettings: filterConfig.settings,
          });
        } else {
          await this.obs.call('SetSourceFilterSettings', {
            sourceName,
            filterName,
            filterSettings: filterConfig.settings,
            overlay: true,
          });
          await this.obs.call('SetSourceFilterEnabled', {
            sourceName,
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
