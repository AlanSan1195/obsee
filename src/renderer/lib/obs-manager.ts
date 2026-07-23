import OBSWebSocket from 'obs-websocket-js';
import type {
  ApplyGuidedSourceDeviceInput,
  BeginGuidedSourceResult,
  CaptureCapabilities,
  CreateGuidedSourceConfig,
  DeviceOption,
  OBSAudioConfig,
  OBSAudioDevice,
  OBSAudioFilterSnapshot,
  OBSAudioSettingsSnapshot,
  OBSConfig,
  OBSConnectionSettings,
  OBSSettingsSnapshot,
  Scene,
  SceneItemSummary,
  SceneSourcesSnapshot,
  ScenesSnapshot,
  SourceKindFriendly,
} from '../../shared/types';
import { parseResolution } from '../../shared/validation';
import {
  areObsrecFiltersConfigured,
  collectDuckingInputCandidates,
  getBooleanValue,
  getDuckingFilter,
  MANAGED_MIC_FILTER_NAMES,
  getFilterSettings,
  getAdvancedEncoderId,
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
import {
  DEVICE_PROPERTY_CANDIDATES,
  ENUM_UNSAFE_KINDS,
  FRIENDLY_LABELS,
  buildUniqueInputName,
  friendlyKindFromInputKind,
  resolveAllSourceKinds,
  resolveSourceKind,
} from './scene-helpers';
import { saveBackup } from './backup-store';

const defaultConnectionSettings: OBSConnectionSettings = {
  host: 'localhost',
  port: 4455,
  password: '',
};

// Parsea items de resolucion que OBS devuelve para una capturadora ("1920x1080",
// "1920x1080 @ 60fps", etc.). Devuelve resolucion normalizada + fps si viene.
function parseCaptureResString(value: string): { res: string; pixels: number; fps?: number } | null {
  const match = /(\d{3,4})\s*[x×]\s*(\d{3,4})/.exec(value);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const fpsMatch = /@?\s*(\d+(?:\.\d+)?)\s*(?:fps|hz)/i.exec(value);
  return {
    res: `${width}x${height}`,
    pixels: width * height,
    fps: fpsMatch ? Math.round(Number(fpsMatch[1])) : undefined,
  };
}

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
      const rawMessage = error instanceof Error ? error.message : '';
      const errorCode = typeof (error as { code?: unknown })?.code === 'number' ? (error as { code: number }).code : undefined;
      const lowerErrorMessage = rawMessage.toLowerCase();
      let helpMessage = 'Revisa que OBS este abierto, que el servidor WebSocket este habilitado, que el puerto coincida con OBS y que el password solo se use si OBS tiene autenticacion activada.';
      // Cierre abnormal (codigo 1006) o error sin mensaje: casi siempre OBS no esta
      // abierto o el servidor WebSocket esta apagado / no responde en ese puerto.
      let reason = rawMessage.trim().length > 0 ? rawMessage : 'OBS no respondio';

      if (lowerErrorMessage.includes('authentication failed') || lowerErrorMessage.includes('authentication')) {
        helpMessage = 'OBS requiere password o rechazo el password enviado. Si desactivaste la autenticacion, pulsa Aplicar/Aceptar en OBS y reinicia OBS; si sigue activada, copia el password actual.';
      } else if (errorCode === 1006 || rawMessage.trim().length === 0) {
        reason = 'OBS no esta abierto o el servidor WebSocket esta apagado';
        helpMessage = `Abre OBS y activa Herramientas -> Configuracion de WebSocket -> "Habilitar servidor WebSocket" (puerto ${connectionSettings.port}). Si tiene password, escribelo aqui; si no, deja el campo vacio.`;
      } else if (lowerErrorMessage.includes('econnrefused') || lowerErrorMessage.includes('connection refused')) {
        helpMessage = `OBS no acepto la conexion. Revisa que OBS este abierto, que el servidor WebSocket este activado y que el puerto sea ${connectionSettings.port}.`;
      } else if (lowerErrorMessage.includes('closed') || lowerErrorMessage.includes('close') || lowerErrorMessage.includes('socket hang up')) {
        helpMessage = 'OBS cerro el intento de conexion. Revisa que el puerto sea correcto y que el servidor WebSocket este habilitado.';
      }

      return {
        success: false,
        message: `No se pudo conectar con OBS WebSocket en ${address}: ${reason}. ${helpMessage}`,
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
        { key: 'outputMode', category: 'Output', name: 'Mode' },
        { key: 'encoder', category: 'SimpleOutput', name: 'StreamEncoder' },
        { key: 'bitrate', category: 'SimpleOutput', name: 'VBitrate' },
        { key: 'audioBitrate', category: 'SimpleOutput', name: 'ABitrate' },
        { key: 'recordingFormat', category: 'SimpleOutput', name: 'RecFormat' },
        { key: 'recordingFormat2', category: 'SimpleOutput', name: 'RecFormat2' },
        { key: 'recordingQuality', category: 'SimpleOutput', name: 'RecQuality' },
        { key: 'advancedStreamEncoder', category: 'AdvOut', name: 'Encoder' },
        { key: 'advancedRecordingEncoder', category: 'AdvOut', name: 'RecEncoder' },
        { key: 'advancedStreamResolution', category: 'AdvOut', name: 'RescaleRes' },
        { key: 'advancedRecordingResolution', category: 'AdvOut', name: 'RecRescaleRes' },
        { key: 'advancedStreamFilter', category: 'AdvOut', name: 'RescaleFilter' },
        { key: 'advancedRecordingFilter', category: 'AdvOut', name: 'RecRescaleFilter' },
        { key: 'advancedRecordingFormat', category: 'AdvOut', name: 'RecFormat2' },
        { key: 'advancedAudioBitrate', category: 'AdvOut', name: 'Track1Bitrate' },
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
      const outputMode = profileSettings.outputMode === 'Advanced' ? 'Advanced' : 'Simple';
      const outputResolution = `${videoSettings.outputWidth}x${videoSettings.outputHeight}`;
      const streamRescaleEnabled = outputMode === 'Advanced' && Number(profileSettings.advancedStreamFilter) > 0;
      const recordingRescaleEnabled = outputMode === 'Advanced' && Number(profileSettings.advancedRecordingFilter) > 0;
      const streamResolution = streamRescaleEnabled && profileSettings.advancedStreamResolution
        ? profileSettings.advancedStreamResolution
        : outputResolution;
      const recordingResolution = recordingRescaleEnabled && profileSettings.advancedRecordingResolution
        ? profileSettings.advancedRecordingResolution
        : outputResolution;

      const audioResult = await this.getAudioSnapshot();

      return {
        success: true,
        message: 'Configuracion de OBS cargada',
        snapshot: {
          streamServer: getStringSetting(streamServiceSettings, 'server'),
          baseResolution: `${videoSettings.baseWidth}x${videoSettings.baseHeight}`,
          outputResolution,
          streamResolution,
          recordingResolution,
          outputMode,
          advancedOutput: outputMode === 'Advanced' ? {
            streamEncoder: profileSettings.advancedStreamEncoder || '',
            recordingEncoder: profileSettings.advancedRecordingEncoder || '',
            streamRescaleResolution: profileSettings.advancedStreamResolution || outputResolution,
            recordingRescaleResolution: profileSettings.advancedRecordingResolution || outputResolution,
            streamRescaleFilter: profileSettings.advancedStreamFilter || '0',
            recordingRescaleFilter: profileSettings.advancedRecordingFilter || '0',
            recordingFormat: profileSettings.advancedRecordingFormat || '',
          } : undefined,
          fps,
          encoder: outputMode === 'Advanced'
            ? profileSettings.advancedStreamEncoder || 'Unknown'
            : profileSettings.encoder || 'Unknown',
          // OBS guarda el bitrate de video avanzado dentro de streamEncoder.json,
          // que obs-websocket no expone. No mezclarlo con el VBitrate obsoleto
          // de SimpleOutput: cero representa "no disponible" en la comparacion.
          bitrate: outputMode === 'Advanced' ? 0 : getNumberSetting(profileSettings, 'bitrate'),
          audioBitrate: outputMode === 'Advanced'
            ? getNumberSetting(profileSettings, 'advancedAudioBitrate')
            : getNumberSetting(profileSettings, 'audioBitrate'),
          recordingFormat: outputMode === 'Advanced'
            ? profileSettings.advancedRecordingFormat || 'Unknown'
            : profileSettings.recordingFormat2 || profileSettings.recordingFormat || 'Unknown',
          recordingQuality: outputMode === 'Advanced' ? 'advanced' : profileSettings.recordingQuality || 'Unknown',
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
        return { success: false, message: 'obsee no encontro una entrada de microfono en OBS. Agrega un dispositivo Mic/Aux o una fuente Audio Input Capture y luego actualiza el audio.' };
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
        warnings.push('OBS WebSocket no expone la casilla Mono de Propiedades avanzadas de audio para esta entrada. obsee puede aplicar filtros automaticamente, pero Mono debe activarse manualmente en OBS.');
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

      await this.ensureAudioFilters(config.inputName, getFilterSettings(config), warnings, MANAGED_MIC_FILTER_NAMES);
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

  async configure(config: OBSConfig): Promise<{
    success: boolean;
    message: string;
    warnings?: string[];
    requiresManualConfirmation?: boolean;
  }> {
    if (!this.connected) {
      return { success: false, message: 'Not connected to OBS. Please connect first.' };
    }

    try {
      const warnings: string[] = [];
      let requiresManualConfirmation = false;
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

      const canvasResolution = parseResolution(config.canvasResolution ?? config.resolution);
      if (!canvasResolution.success) return { success: false, message: canvasResolution.message };
      const streamResolution = parseResolution(config.streamResolution ?? config.resolution);
      if (!streamResolution.success) return { success: false, message: streamResolution.message };
      const recordingResolution = parseResolution(config.recordingResolution ?? config.resolution);
      if (!recordingResolution.success) return { success: false, message: recordingResolution.message };

      const normalizedStreamResolution = `${streamResolution.value.width}x${streamResolution.value.height}`;
      const normalizedRecordingResolution = `${recordingResolution.value.width}x${recordingResolution.value.height}`;
      const recordingEncoder = config.recordingEncoder ?? config.encoder;
      const recordingBitrate = config.recordingBitrate ?? config.bitrate;

      const outputResolution = config.mode === 'stream_only'
        ? streamResolution.value
        : recordingResolution.value;
      await this.obs.call('SetVideoSettings', {
        baseWidth: canvasResolution.value.width,
        baseHeight: canvasResolution.value.height,
        outputWidth: outputResolution.width,
        outputHeight: outputResolution.height,
        fpsNumerator: config.fps,
        fpsDenominator: 1,
      });

      // El modo avanzado es necesario siempre que existe una grabacion: solo ahi
      // OBS permite elegir un encoder local distinto al encoder del stream.
      const needsAdvancedOutput = config.mode !== 'stream_only';
      const profileUpdates: Array<{ category: string; name: string; value: string }> = [];

      if (needsAdvancedOutput) {
        requiresManualConfirmation = true;
        const streamEncoderId = getAdvancedEncoderId(config.encoder);
        const recordingEncoderId = getAdvancedEncoderId(recordingEncoder);
        const streamNeedsRescale = normalizedStreamResolution !== normalizedRecordingResolution;
        profileUpdates.push(
          { category: 'Output', name: 'Mode', value: 'Advanced' },
          { category: 'AdvOut', name: 'RescaleRes', value: normalizedStreamResolution },
          // OBS_SCALE_LANCZOS = 4. Cero conserva la salida maestra sin reescalar.
          { category: 'AdvOut', name: 'RescaleFilter', value: streamNeedsRescale ? '4' : '0' },
          { category: 'AdvOut', name: 'TrackIndex', value: '1' },
          { category: 'AdvOut', name: 'RecType', value: 'Standard' },
          { category: 'AdvOut', name: 'RecFormat2', value: config.recordingFormat },
          { category: 'AdvOut', name: 'RecRescaleRes', value: normalizedRecordingResolution },
          { category: 'AdvOut', name: 'RecRescaleFilter', value: '0' },
          { category: 'AdvOut', name: 'RecTracks', value: '1' },
          { category: 'AdvOut', name: 'Track1Bitrate', value: String(config.audioBitrate) },
        );

        if (config.mode === 'stream_record') {
          profileUpdates.push({ category: 'AdvOut', name: 'ApplyServiceSettings', value: 'true' });
        }

        if (streamEncoderId && config.mode === 'stream_record') {
          profileUpdates.push({ category: 'AdvOut', name: 'Encoder', value: streamEncoderId });
        } else if (!streamEncoderId && config.mode === 'stream_record') {
          warnings.push(`Encoder "${config.encoder}" was not mapped to an OBS Advanced Output encoder.`);
        }

        if (recordingEncoderId) {
          profileUpdates.push({ category: 'AdvOut', name: 'RecEncoder', value: recordingEncoderId });
        } else {
          warnings.push(`Encoder de grabacion "${recordingEncoder}" no se pudo asignar a OBS Advanced Output.`);
        }

        const bitrateSummary = config.mode === 'stream_record'
          ? `stream ${config.bitrate} kbps y grabacion ${recordingBitrate} kbps`
          : `grabacion ${recordingBitrate} kbps`;
        warnings.push(`OBS WebSocket no permite escribir los bitrates ni la calidad interna del modo avanzado (${bitrateSummary}, calidad ${config.recordingQuality ?? 'sin especificar'}). Confirma esos valores manualmente en Ajustes > Salida.`);
      } else {
        const encoderId = getSimpleEncoderId(config.encoder);
        profileUpdates.push(
          { category: 'Output', name: 'Mode', value: 'Simple' },
          { category: 'SimpleOutput', name: 'VBitrate', value: String(config.bitrate) },
          { category: 'SimpleOutput', name: 'ABitrate', value: String(config.audioBitrate) },
          { category: 'SimpleOutput', name: 'RecFormat2', value: config.recordingFormat },
          { category: 'SimpleOutput', name: 'RecQuality', value: getSimpleRecordingQuality(config.recordingQuality) },
        );

        if (encoderId) {
          profileUpdates.push({ category: 'SimpleOutput', name: 'StreamEncoder', value: encoderId });
        } else {
          warnings.push(`Encoder "${config.encoder}" was not mapped to an OBS Simple Output encoder.`);
        }
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
          message: requiresManualConfirmation
            ? `Cambios compatibles aplicados en OBS. Falta confirmar manualmente el bitrate y la calidad avanzada: ${warnings.join('; ')}`
            : `Configuracion aplicada en OBS con advertencias: ${warnings.join('; ')}`,
          warnings,
          requiresManualConfirmation,
        };
      }

      return {
        success: true,
        message: 'Configuracion aplicada en OBS',
        warnings,
        requiresManualConfirmation,
      };
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

      const profileUpdates = snapshot.outputMode === 'Advanced' && snapshot.advancedOutput
        ? [
          { category: 'Output', name: 'Mode', value: 'Advanced' },
          { category: 'AdvOut', name: 'Encoder', value: snapshot.advancedOutput.streamEncoder },
          { category: 'AdvOut', name: 'RecEncoder', value: snapshot.advancedOutput.recordingEncoder },
          { category: 'AdvOut', name: 'RescaleRes', value: snapshot.advancedOutput.streamRescaleResolution },
          { category: 'AdvOut', name: 'RecRescaleRes', value: snapshot.advancedOutput.recordingRescaleResolution },
          { category: 'AdvOut', name: 'RescaleFilter', value: snapshot.advancedOutput.streamRescaleFilter },
          { category: 'AdvOut', name: 'RecRescaleFilter', value: snapshot.advancedOutput.recordingRescaleFilter },
          { category: 'AdvOut', name: 'RecFormat2', value: snapshot.advancedOutput.recordingFormat },
          { category: 'AdvOut', name: 'Track1Bitrate', value: snapshot.audioBitrate > 0 ? String(snapshot.audioBitrate) : '' },
        ]
        : [
          { category: 'Output', name: 'Mode', value: 'Simple' },
          { category: 'SimpleOutput', name: 'VBitrate', value: snapshot.bitrate > 0 ? String(snapshot.bitrate) : '' },
          { category: 'SimpleOutput', name: 'ABitrate', value: snapshot.audioBitrate > 0 ? String(snapshot.audioBitrate) : '' },
          { category: 'SimpleOutput', name: 'RecFormat2', value: snapshot.recordingFormat },
          { category: 'SimpleOutput', name: 'RecQuality', value: snapshot.recordingQuality },
          { category: 'SimpleOutput', name: 'StreamEncoder', value: snapshot.encoder },
        ];

      const restorableProfileUpdates = profileUpdates.filter((update) => update.value && update.value !== 'Unknown');

      for (const update of restorableProfileUpdates) {
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
    // Nombres de filtros gestionados por obsee que deben eliminarse si ya no
    // estan en el set esperado (honra "omitir"). Acotado para no tocar filtros
    // del usuario ni el ducking.
    removableManagedNames: string[] = [],
  ): Promise<void> {
    const existingFilters = await this.getAudioFilters(sourceName);

    for (const managedName of removableManagedNames) {
      if (expectedFilters[managedName]) continue;
      const stale = existingFilters.find((filter) => filter.name === managedName);
      if (!stale) continue;
      try {
        await this.obs.call('RemoveSourceFilter', { sourceName, filterName: managedName });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        warnings.push(`${managedName} (omitir): ${errorMessage}`);
      }
    }

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

  // --- Escenas y fuentes guiadas ---

  private notConnected(): { success: false; message: string } {
    return { success: false, message: 'Conectate a OBS primero para administrar escenas y fuentes.' };
  }

  private static describeError(error: unknown): string {
    return error instanceof Error ? error.message : 'Error desconocido';
  }

  async getScenesSnapshot(): Promise<{ success: boolean; message: string; snapshot?: ScenesSnapshot }> {
    if (!this.connected) return this.notConnected();

    try {
      const response = await this.obs.call('GetSceneList');
      const currentProgramSceneName = getOptionalString(response.currentProgramSceneName);
      const scenes: Scene[] = response.scenes
        .filter(isRecord)
        .map((scene) => {
          const sceneName = getStringValue(scene, ['sceneName', 'name']);
          return {
            sceneName,
            sceneUuid: getOptionalString(scene.sceneUuid),
            sceneIndex: typeof scene.sceneIndex === 'number' ? scene.sceneIndex : 0,
            isCurrentProgramScene: sceneName === currentProgramSceneName,
          };
        })
        .filter((scene) => scene.sceneName.length > 0)
        .sort((a, b) => a.sceneIndex - b.sceneIndex);

      return {
        success: true,
        message: 'Escenas cargadas',
        snapshot: { scenes, currentProgramSceneName, warnings: [] },
      };
    } catch (error) {
      return { success: false, message: `No se pudieron leer las escenas: ${OBSManager.describeError(error)}` };
    }
  }

  async createScene(sceneName: string): Promise<{ success: boolean; message: string; snapshot?: ScenesSnapshot }> {
    if (!this.connected) return this.notConnected();

    try {
      await this.obs.call('CreateScene', { sceneName });
      await this.obs.call('SetCurrentProgramScene', { sceneName }).catch(() => undefined);
      const snapshot = await this.getScenesSnapshot();
      return { success: true, message: `Escena "${sceneName}" creada`, snapshot: snapshot.snapshot };
    } catch (error) {
      return { success: false, message: `No se pudo crear la escena: ${OBSManager.describeError(error)}` };
    }
  }

  async setCurrentScene(sceneName: string): Promise<{ success: boolean; message: string }> {
    if (!this.connected) return this.notConnected();

    try {
      await this.obs.call('SetCurrentProgramScene', { sceneName });
      return { success: true, message: `Escena activa: "${sceneName}"` };
    } catch (error) {
      return { success: false, message: `No se pudo cambiar de escena: ${OBSManager.describeError(error)}` };
    }
  }

  async removeScene(sceneName: string): Promise<{ success: boolean; message: string; snapshot?: ScenesSnapshot }> {
    if (!this.connected) return this.notConnected();

    try {
      await this.obs.call('RemoveScene', { sceneName });
      const snapshot = await this.getScenesSnapshot();
      return { success: true, message: `Escena "${sceneName}" eliminada`, snapshot: snapshot.snapshot };
    } catch (error) {
      return { success: false, message: `No se pudo eliminar la escena: ${OBSManager.describeError(error)}` };
    }
  }

  async getAvailableSourceKinds(): Promise<{ success: boolean; message: string; resolved?: ReturnType<typeof resolveAllSourceKinds> }> {
    if (!this.connected) return this.notConnected();

    try {
      const response = await this.obs.call('GetInputKindList');
      const kinds = (response.inputKinds ?? []).filter((kind): kind is string => typeof kind === 'string');
      return { success: true, message: 'Tipos de fuente detectados', resolved: resolveAllSourceKinds(kinds) };
    } catch (error) {
      return { success: false, message: `No se pudieron leer los tipos de fuente: ${OBSManager.describeError(error)}` };
    }
  }

  async getSceneSources(sceneName: string): Promise<{ success: boolean; message: string; snapshot?: SceneSourcesSnapshot }> {
    if (!this.connected) return this.notConnected();

    try {
      const response = await this.obs.call('GetSceneItemList', { sceneName });
      const items: SceneItemSummary[] = response.sceneItems
        .filter(isRecord)
        .map((item) => {
          const inputKind = getOptionalString(item.inputKind) ?? getOptionalString(item.sourceKind);
          return {
            sceneItemId: typeof item.sceneItemId === 'number' ? item.sceneItemId : 0,
            sourceName: getStringValue(item, ['sourceName', 'name']),
            inputKind,
            friendlyKind: friendlyKindFromInputKind(inputKind),
            enabled: item.sceneItemEnabled !== false,
          };
        })
        .filter((item) => item.sourceName.length > 0);

      return { success: true, message: 'Fuentes cargadas', snapshot: { sceneName, items, warnings: [] } };
    } catch (error) {
      return { success: false, message: `No se pudieron leer las fuentes: ${OBSManager.describeError(error)}` };
    }
  }

  private async getExistingInputNames(): Promise<string[]> {
    try {
      const response = await this.obs.call('GetInputList');
      return (response.inputs ?? [])
        .filter(isRecord)
        .map((input) => getStringValue(input, ['inputName', 'name']))
        .filter((name) => name.length > 0);
    } catch {
      return [];
    }
  }

  // Algunas propiedades de OBS (p.ej. screen_capture en macOS) nunca responden y
  // cierran el WebSocket. Limitamos la espera para no colgar el asistente.
  private async callWithTimeout<T>(promise: Promise<T>, ms = 4000): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('La consulta a OBS tardo demasiado')), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  // Enumera dispositivos/monitores/ventanas de un input ya creado, probando varias
  // propiedades hasta que OBS devuelva items (replica getAudioDevices para video).
  private async getVideoDevicesForInput(
    inputName: string,
    propertyCandidates: string[],
  ): Promise<{ devices: DeviceOption[]; propertyName?: string }> {
    for (const propertyName of propertyCandidates) {
      try {
        const response = await this.callWithTimeout(
          this.obs.call('GetInputPropertiesListPropertyItems', { inputName, propertyName }),
        );
        const seen = new Set<string>();
        const devices = response.propertyItems
          .filter(isRecord)
          .map((item) => {
            const id = getStringValue(item, ['itemValue', 'value', 'id']);
            const name = getStringValue(item, ['itemName', 'name', 'description', 'label']) || id || 'Dispositivo';
            return { id, name, isDefault: `${name} ${id}`.toLowerCase().includes('default') };
          })
          // Descartar items sin valor seleccionable y duplicados (OBS a veces
          // devuelve un item vacio o entradas repetidas, p.ej. en ventanas).
          .filter((device) => {
            if (device.id.length === 0) return false;
            if (seen.has(device.id)) return false;
            seen.add(device.id);
            return true;
          });

        if (devices.length > 0) return { devices, propertyName };
      } catch {
        // Probar la siguiente propiedad; los nombres varian por plataforma/kind.
      }
    }

    return { devices: [] };
  }

  // Lee la lista de resoluciones que una capturadora realmente expone (no las
  // adivina por nombre). Prueba 'preset' (macOS) y 'resolution' (Windows/dshow).
  private async readResolutionItems(inputName: string): Promise<string[]> {
    for (const propertyName of ['preset', 'resolution']) {
      try {
        const response = await this.callWithTimeout(
          this.obs.call('GetInputPropertiesListPropertyItems', { inputName, propertyName }),
        );
        const items = response.propertyItems
          .filter(isRecord)
          .map((item) => getStringValue(item, ['itemName', 'name']))
          .filter((name) => name.length > 0);
        if (items.length > 0) return items;
      } catch {
        // Probar la siguiente propiedad; varia por plataforma/kind.
      }
    }
    return [];
  }

  // Lee las capacidades REALES de la capturadora desde OBS: crea un input temporal
  // de captura de video, selecciona el dispositivo que coincide con el nombre, lee
  // sus resoluciones soportadas y lo elimina. Asi el "match" de consola usa el
  // techo de captura verificado en vez de adivinar por el nombre del USB.
  async getCaptureCapabilities(deviceNameFilter?: string): Promise<{ success: boolean; message: string; capabilities?: CaptureCapabilities }> {
    if (!this.connected) return this.notConnected();

    let tempInputName: string | undefined;
    try {
      const kindsResponse = await this.obs.call('GetInputKindList');
      const kinds = (kindsResponse.inputKinds ?? []).filter((kind): kind is string => typeof kind === 'string');
      const resolved = resolveSourceKind('camera', kinds);
      if (!resolved.available) {
        return { success: false, message: 'OBS no expone captura de video en este sistema.' };
      }

      const sceneList = await this.obs.call('GetSceneList');
      const sceneName = getOptionalString(sceneList.currentProgramSceneName)
        ?? (sceneList.scenes ?? []).filter(isRecord).map((scene) => getStringValue(scene, ['sceneName', 'name'])).find((name) => name.length > 0);
      if (!sceneName) {
        return { success: false, message: 'Crea al menos una escena en OBS antes de leer la capturadora.' };
      }

      const existing = await this.getExistingInputNames();
      tempInputName = buildUniqueInputName('obsee captura temporal', existing);
      await this.obs.call('CreateInput', {
        sceneName,
        inputName: tempInputName,
        inputKind: resolved.inputKind,
        sceneItemEnabled: false,
      });

      const { devices, propertyName } = await this.getVideoDevicesForInput(tempInputName, DEVICE_PROPERTY_CANDIDATES.camera ?? []);
      const filter = (deviceNameFilter ?? '').toLowerCase().trim();
      const chosen = (filter
        ? devices.find((device) => device.name.toLowerCase().includes(filter) || filter.includes(device.name.toLowerCase()))
        : undefined)
        ?? devices.find((device) => /capture|hdmi|elgato|avermedia|ugreen|macro|cam link|live gamer|ripsaw/i.test(device.name))
        ?? devices[0];

      if (!chosen) {
        return { success: false, message: 'No se encontro una capturadora de video en OBS.' };
      }

      if (propertyName) {
        await this.obs.call('SetInputSettings', {
          inputName: tempInputName,
          // Cubrir macOS (device/uid) y Windows (video_device_id); OBS ignora las que no apliquen.
          inputSettings: { [propertyName]: chosen.id, uid: chosen.id, video_device_id: chosen.id, use_preset: true },
          overlay: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 900));
      }

      const parsed = this.dedupeCaptureResolutions(await this.readResolutionItems(tempInputName));
      const maxRes = parsed.reduce<{ res: string; pixels: number } | undefined>((best, item) => (
        !best || item.pixels > best.pixels ? item : best
      ), undefined);
      const fpsValues = parsed.map((item) => item.fps).filter((fps): fps is number => typeof fps === 'number');

      return {
        success: true,
        message: maxRes ? `Capturadora: hasta ${maxRes.res}` : 'No se pudo leer la resolucion de la capturadora',
        capabilities: {
          deviceName: chosen.name,
          maxResolution: maxRes?.res,
          maxFps: fpsValues.length > 0 ? Math.max(...fpsValues) : undefined,
          resolutions: parsed.map((item) => item.res),
        },
      };
    } catch (error) {
      return { success: false, message: `No se pudo leer la capturadora: ${OBSManager.describeError(error)}` };
    } finally {
      if (tempInputName) {
        try { await this.obs.call('RemoveInput', { inputName: tempInputName }); } catch { /* limpieza best-effort */ }
      }
    }
  }

  private dedupeCaptureResolutions(items: string[]): { res: string; pixels: number; fps?: number }[] {
    const seen = new Set<string>();
    const result: { res: string; pixels: number; fps?: number }[] = [];
    for (const item of items) {
      const parsed = parseCaptureResString(item);
      if (!parsed || seen.has(parsed.res)) continue;
      seen.add(parsed.res);
      result.push(parsed);
    }
    return result;
  }

  // Encaja un elemento al canvas completo (equivalente a "Ajustar a pantalla"),
  // sin que el usuario tenga que tocar transformaciones.
  private async fitSceneItemToCanvas(sceneName: string, sceneItemId: number, warnings: string[]): Promise<void> {
    try {
      const video = await this.obs.call('GetVideoSettings');
      const baseWidth = video.baseWidth || 1920;
      const baseHeight = video.baseHeight || 1080;
      await this.obs.call('SetSceneItemTransform', {
        sceneName,
        sceneItemId,
        sceneItemTransform: {
          positionX: 0,
          positionY: 0,
          boundsType: 'OBS_BOUNDS_SCALE_INNER',
          boundsWidth: baseWidth,
          boundsHeight: baseHeight,
          boundsAlignment: 0,
          alignment: 5,
        },
      });
    } catch (error) {
      warnings.push(`No se pudo ajustar la fuente al lienzo: ${OBSManager.describeError(error)}`);
    }
  }

  // Crea el input dentro de la escena y, si aplica, enumera los dispositivos para
  // que el usuario elija. OBS preselecciona uno por defecto, asi que la fuente ya
  // se ve de inmediato (permite preview real). Si el usuario cancela, se limpia
  // con cancelGuidedSource.
  async beginGuidedSource(sceneName: string, friendly: SourceKindFriendly): Promise<BeginGuidedSourceResult> {
    if (!this.connected) return { ...this.notConnected(), warnings: [] };

    const warnings: string[] = [];

    try {
      const kindsResponse = await this.obs.call('GetInputKindList');
      const kinds = (kindsResponse.inputKinds ?? []).filter((kind): kind is string => typeof kind === 'string');
      const resolved = resolveSourceKind(friendly, kinds);

      if (!resolved.available) {
        return {
          success: false,
          message: `Tu instalacion de OBS no incluye captura de "${FRIENDLY_LABELS[friendly]}" en este sistema.`,
          warnings,
        };
      }

      const existingNames = await this.getExistingInputNames();
      const inputName = buildUniqueInputName(FRIENDLY_LABELS[friendly], existingNames);

      const created = await this.obs.call('CreateInput', {
        sceneName,
        inputName,
        inputKind: resolved.inputKind,
      });
      const sceneItemId = created.sceneItemId;

      let devices: DeviceOption[] = [];
      let propertyName = resolved.devicePropertyName;
      if (resolved.supportsDeviceEnum && ENUM_UNSAFE_KINDS.has(resolved.inputKind)) {
        // Este tipo de captura cuelga OBS al listar sus opciones: lo omitimos y
        // dejamos el valor por defecto para no perder la conexion.
        warnings.push('OBS usara el monitor principal para esta captura; podras cambiarlo desde OBS si lo necesitas.');
      } else if (resolved.supportsDeviceEnum) {
        const candidates = DEVICE_PROPERTY_CANDIDATES[friendly] ?? [];
        const enumeration = await this.getVideoDevicesForInput(inputName, candidates);
        devices = enumeration.devices;
        propertyName = enumeration.propertyName ?? propertyName;
        if (devices.length === 0) {
          warnings.push('No se detectaron dispositivos. Verifica que esten conectados y que OBS tenga permisos.');
        }
      }

      await this.fitSceneItemToCanvas(sceneName, sceneItemId, warnings);

      return {
        success: true,
        message: `Fuente "${inputName}" agregada`,
        inputName,
        sceneItemId,
        devices,
        propertyName,
        supportsDeviceEnum: resolved.supportsDeviceEnum,
        warnings,
      };
    } catch (error) {
      return { success: false, message: `No se pudo agregar la fuente: ${OBSManager.describeError(error)}`, warnings };
    }
  }

  async applyGuidedSourceDevice(input: ApplyGuidedSourceDeviceInput): Promise<{ success: boolean; message: string; warnings: string[] }> {
    if (!this.connected) return { ...this.notConnected(), warnings: [] };

    const warnings: string[] = [];
    try {
      await this.obs.call('SetInputSettings', {
        inputName: input.inputName,
        inputSettings: { [input.propertyName]: input.deviceId },
        overlay: true,
      });
      // El tamano real puede cambiar al elegir dispositivo: re-encajar al lienzo.
      await this.fitSceneItemToCanvas(input.sceneName, input.sceneItemId, warnings);
      return { success: true, message: 'Dispositivo seleccionado', warnings };
    } catch (error) {
      return { success: false, message: `No se pudo aplicar el dispositivo: ${OBSManager.describeError(error)}`, warnings };
    }
  }

  async cancelGuidedSource(inputName: string): Promise<{ success: boolean; message: string }> {
    if (!this.connected) return this.notConnected();
    return this.removeInput(inputName);
  }

  async createGuidedSource(config: CreateGuidedSourceConfig): Promise<{ success: boolean; message: string; sceneItemId?: number; warnings: string[] }> {
    if (!this.connected) return { ...this.notConnected(), warnings: [] };

    const warnings: string[] = [];
    try {
      const kindsResponse = await this.obs.call('GetInputKindList');
      const kinds = (kindsResponse.inputKinds ?? []).filter((kind): kind is string => typeof kind === 'string');
      const resolved = resolveSourceKind(config.friendly, kinds);
      if (!resolved.available) {
        return {
          success: false,
          message: `Tu instalacion de OBS no incluye "${FRIENDLY_LABELS[config.friendly]}" en este sistema.`,
          warnings,
        };
      }

      const inputSettings: Record<string, string> = {};
      if (config.friendly === 'image' && config.imagePath) {
        inputSettings.file = config.imagePath;
      } else if (config.deviceId && resolved.devicePropertyName) {
        inputSettings[resolved.devicePropertyName] = config.deviceId;
      }

      const existingNames = await this.getExistingInputNames();
      const inputName = buildUniqueInputName(config.sourceName || FRIENDLY_LABELS[config.friendly], existingNames);

      const created = await this.obs.call('CreateInput', {
        sceneName: config.sceneName,
        inputName,
        inputKind: resolved.inputKind,
        inputSettings,
      });

      if (config.fitToCanvas) {
        await this.fitSceneItemToCanvas(config.sceneName, created.sceneItemId, warnings);
      }

      return { success: true, message: `Fuente "${inputName}" agregada`, sceneItemId: created.sceneItemId, warnings };
    } catch (error) {
      return { success: false, message: `No se pudo agregar la fuente: ${OBSManager.describeError(error)}`, warnings };
    }
  }

  async removeInput(inputName: string): Promise<{ success: boolean; message: string }> {
    if (!this.connected) return this.notConnected();

    try {
      await this.obs.call('RemoveInput', { inputName });
      return { success: true, message: `Fuente "${inputName}" eliminada` };
    } catch (error) {
      return { success: false, message: `No se pudo eliminar la fuente: ${OBSManager.describeError(error)}` };
    }
  }

  // Lee el tamano real de la fuente de un elemento. La camara puede tardar en
  // reportar dimensiones tras seleccionarla, asi que reintentamos unas veces.
  private async getSceneItemSourceSize(sceneName: string, sceneItemId: number): Promise<{ width: number; height: number }> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await this.obs.call('GetSceneItemTransform', { sceneName, sceneItemId });
        const transform = response.sceneItemTransform as Record<string, unknown>;
        const width = typeof transform.sourceWidth === 'number' ? transform.sourceWidth : 0;
        const height = typeof transform.sourceHeight === 'number' ? transform.sourceHeight : 0;
        if (width > 0 && height > 0) return { width, height };
      } catch {
        // Reintentar.
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    return { width: 0, height: 0 };
  }

  // Crea una escena nueva con la camara a pantalla completa, sin cambiar la escena
  // activa. Se usa en "Ambas": el facecam queda en la escena actual y la camara
  // completa se separa en su propia escena.
  async createCameraScene(
    desiredSceneName: string,
    inputBaseName: string,
    deviceId: string,
    propertyName: string,
  ): Promise<{ success: boolean; message: string; sceneName?: string; warnings: string[] }> {
    if (!this.connected) return { ...this.notConnected(), warnings: [] };

    const warnings: string[] = [];
    try {
      const kindsResponse = await this.obs.call('GetInputKindList');
      const kinds = (kindsResponse.inputKinds ?? []).filter((kind): kind is string => typeof kind === 'string');
      const resolved = resolveSourceKind('camera', kinds);
      if (!resolved.available) {
        return { success: false, message: 'Tu instalacion de OBS no incluye captura de camara en este sistema.', warnings };
      }

      // En OBS los nombres de escenas e inputs comparten espacio de nombres, asi
      // que el nombre de la escena debe ser unico contra ambos.
      const sceneList = await this.obs.call('GetSceneList');
      const existingInputs = await this.getExistingInputNames();
      const usedNames = [
        ...sceneList.scenes.filter(isRecord).map((scene) => getStringValue(scene, ['sceneName', 'name'])),
        ...existingInputs,
      ].filter((name) => name.length > 0);

      const sceneName = buildUniqueInputName(desiredSceneName, usedNames);
      // CreateScene no cambia la escena en vivo, asi el usuario sigue en la suya.
      await this.obs.call('CreateScene', { sceneName });

      const inputName = buildUniqueInputName(inputBaseName, [...usedNames, sceneName]);
      const created = await this.obs.call('CreateInput', { sceneName, inputName, inputKind: resolved.inputKind });

      const prop = propertyName || resolved.devicePropertyName;
      if (deviceId && prop) {
        await this.obs.call('SetInputSettings', { inputName, inputSettings: { [prop]: deviceId }, overlay: true });
      }
      await this.fitSceneItemToCanvas(sceneName, created.sceneItemId, warnings);

      return { success: true, message: `Escena "${sceneName}" creada con la camara completa`, sceneName, warnings };
    } catch (error) {
      return { success: false, message: `No se pudo crear la escena de camara: ${OBSManager.describeError(error)}`, warnings };
    }
  }

  // Envia un elemento al fondo de la escena (indice 0) para que no tape a los demas.
  async setSourceToBottom(sceneName: string, sceneItemId: number): Promise<{ success: boolean; message: string }> {
    if (!this.connected) return this.notConnected();

    try {
      await this.obs.call('SetSceneItemIndex', { sceneName, sceneItemId, sceneItemIndex: 0 });
      return { success: true, message: 'Fuente enviada al fondo' };
    } catch (error) {
      return { success: false, message: `No se pudo reordenar la fuente: ${OBSManager.describeError(error)}` };
    }
  }

  async setCameraLayout(sceneName: string, sceneItemId: number, layout: 'facecam' | 'fullscreen'): Promise<{ success: boolean; message: string; warnings: string[] }> {
    if (!this.connected) return { ...this.notConnected(), warnings: [] };

    const warnings: string[] = [];
    try {
      if (layout === 'fullscreen') {
        await this.fitSceneItemToCanvas(sceneName, sceneItemId, warnings);
        return { success: true, message: 'Camara a pantalla completa', warnings };
      }

      // Facecam 1:1 en la esquina inferior derecha. Recortamos la camara a un
      // cuadrado centrado (crop) y luego la escalamos con SCALE_INNER: asi queda
      // un 1:1 exacto sin que la imagen se desborde del recuadro (SCALE_OUTER no
      // recorta y la camara se salia por los lados).
      const video = await this.obs.call('GetVideoSettings');
      const baseWidth = video.baseWidth || 1920;
      const baseHeight = video.baseHeight || 1080;
      const { width: sourceWidth, height: sourceHeight } = await this.getSceneItemSourceSize(sceneName, sceneItemId);
      const cropX = sourceWidth > sourceHeight ? Math.round((sourceWidth - sourceHeight) / 2) : 0;
      const cropY = sourceHeight > sourceWidth ? Math.round((sourceHeight - sourceWidth) / 2) : 0;
      const side = Math.round(baseHeight * 0.3);
      const margin = Math.round(baseHeight * 0.04);
      await this.obs.call('SetSceneItemTransform', {
        sceneName,
        sceneItemId,
        sceneItemTransform: {
          positionX: baseWidth - side - margin,
          positionY: baseHeight - side - margin,
          cropLeft: cropX,
          cropRight: cropX,
          cropTop: cropY,
          cropBottom: cropY,
          boundsType: 'OBS_BOUNDS_SCALE_INNER',
          boundsWidth: side,
          boundsHeight: side,
          boundsAlignment: 0,
          alignment: 5,
        },
      });
      if (sourceWidth === 0 || sourceHeight === 0) {
        warnings.push('La camara aun no reportaba su tamano; si el recorte no quedo 1:1, vuelve a elegir el formato.');
      }
      return { success: true, message: 'Camara en formato facecam 1:1', warnings };
    } catch (error) {
      return { success: false, message: `No se pudo ajustar la camara: ${OBSManager.describeError(error)}`, warnings };
    }
  }

  async renameInput(inputName: string, newInputName: string): Promise<{ success: boolean; message: string }> {
    if (!this.connected) return this.notConnected();
    if (inputName === newInputName) return { success: true, message: 'Sin cambios' };

    try {
      await this.obs.call('SetInputName', { inputName, newInputName });
      return { success: true, message: `Fuente renombrada a "${newInputName}"` };
    } catch (error) {
      return { success: false, message: `No se pudo renombrar la fuente: ${OBSManager.describeError(error)}` };
    }
  }

  async setSceneItemEnabled(sceneName: string, sceneItemId: number, enabled: boolean): Promise<{ success: boolean; message: string }> {
    if (!this.connected) return this.notConnected();

    try {
      await this.obs.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: enabled });
      return { success: true, message: enabled ? 'Fuente visible' : 'Fuente oculta' };
    } catch (error) {
      return { success: false, message: `No se pudo cambiar la visibilidad: ${OBSManager.describeError(error)}` };
    }
  }

  async getSourceScreenshot(sourceName: string, maxWidth = 480): Promise<{ success: boolean; message: string; imageData?: string }> {
    if (!this.connected) return this.notConnected();

    try {
      const response = await this.obs.call('GetSourceScreenshot', {
        sourceName,
        imageFormat: 'jpg',
        imageWidth: maxWidth,
        imageCompressionQuality: 50,
      });
      return { success: true, message: 'Captura lista', imageData: response.imageData };
    } catch (error) {
      return { success: false, message: `No se pudo capturar la vista previa: ${OBSManager.describeError(error)}` };
    }
  }
}

export const obsManager = new OBSManager();
