import OBSWebSocket from 'obs-websocket-js';
import type { OBSConfig, OBSConnectionSettings, OBSPlatform } from '../shared/types';
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
