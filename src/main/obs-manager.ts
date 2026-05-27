import OBSWebSocket from 'obs-websocket-js';
import type { OBSConfig, OBSConnectionSettings, OBSPlatform, OBSSettingsSnapshot } from '../shared/types';
import { parseResolution } from '../shared/validation';

const defaultConnectionSettings: OBSConnectionSettings = {
  host: 'localhost',
  port: 4455,
  password: '',
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
      return { success: true, message: 'Connected to OBS' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const helpMessage = errorMessage.toLowerCase().includes('authentication failed')
        ? 'The password reached OBS, but OBS rejected it. Copy it again from OBS WebSocket settings or generate a new one, then click Apply/Accept in OBS.'
        : 'Check that OBS is open, WebSocket Server is enabled, the port is usually 4455, and the password matches OBS.';

      return {
        success: false,
        message: `Failed to connect to OBS WebSocket at ${address}: ${errorMessage}. ${helpMessage}`,
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
      return { success: true, message: 'Disconnected from OBS' };
    } catch {
      return { success: false, message: 'Error disconnecting' };
    }
  }

  async getStatus(): Promise<{ connected: boolean; message: string }> {
    return {
      connected: this.connected,
      message: this.connected ? 'Connected to OBS' : 'Disconnected',
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

      return {
        success: true,
        message: 'OBS settings loaded',
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
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `Failed to read OBS settings: ${errorMessage}` };
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
}

export const obsManager = new OBSManager();
