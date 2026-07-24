import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OBSConfig, OBSSettingsSnapshot } from '../../shared/types';
import { OBSManager } from './obs-manager';

const obsMock = vi.hoisted(() => ({
  call: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn(),
}));

const backupMocks = vi.hoisted(() => ({
  saveBackup: vi.fn(),
}));

vi.mock('obs-websocket-js', () => ({
  default: class {
    call = obsMock.call;
    connect = obsMock.connect;
    disconnect = obsMock.disconnect;
    on = obsMock.on;
  },
}));

vi.mock('./backup-store', () => ({
  saveBackup: backupMocks.saveBackup,
}));

const advancedSnapshot: OBSSettingsSnapshot = {
  streamServer: 'rtmps://live-upload.youtube.com/live2',
  baseResolution: '1920x1080',
  outputResolution: '1920x1080',
  streamResolution: '1920x1080',
  recordingResolution: '1920x1080',
  outputMode: 'Advanced',
  advancedOutput: {
    streamEncoder: 'com.apple.videotoolbox.videoencoder.ave.avc',
    recordingEncoder: 'com.apple.videotoolbox.videoencoder.ave.hevc',
    streamRescaleResolution: '1920x1080',
    recordingRescaleResolution: '1920x1080',
    streamRescaleFilter: '0',
    recordingRescaleFilter: '0',
    recordingFormat: 'mkv',
  },
  fps: 60,
  encoder: 'com.apple.videotoolbox.videoencoder.ave.avc',
  bitrate: 0,
  audioBitrate: 320,
  recordingFormat: 'mkv',
  recordingQuality: 'advanced',
};

const advancedControlResponse = {
  success: true,
  available: true,
  pluginVersion: '0.1.0',
  outputMode: 'Advanced',
  stream: {
    available: true,
    encoderId: 'com.apple.videotoolbox.videoencoder.ave.avc',
    active: false,
    rate_control: 'CBR',
    bitrate: 8000,
    quality: 60,
    limit_bitrate: false,
    max_bitrate: 6000,
    max_bitrate_window: 1.5,
    keyint_sec: 2,
    profile: 'high',
    bframes: true,
    spatial_aq_mode: 1,
  },
  recording: {
    available: true,
    encoderId: 'com.apple.videotoolbox.videoencoder.ave.hevc',
    active: false,
    rate_control: 'CBR',
    bitrate: 40000,
    quality: 76,
    limit_bitrate: false,
    max_bitrate: 6000,
    max_bitrate_window: 1.5,
    keyint_sec: 2,
    profile: 'main10',
    bframes: true,
    spatial_aq_mode: 1,
  },
};

describe('OBSManager con salida avanzada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obsMock.connect.mockResolvedValue({});
    obsMock.disconnect.mockResolvedValue(undefined);
    backupMocks.saveBackup.mockResolvedValue(undefined);
  });

  it('lee encoder y audio avanzados sin reutilizar el bitrate obsoleto de salida simple', async () => {
    const profileValues: Record<string, string> = {
      'Output.Mode': 'Advanced',
      'SimpleOutput.StreamEncoder': 'x264',
      'SimpleOutput.VBitrate': '6000',
      'SimpleOutput.ABitrate': '160',
      'AdvOut.Encoder': 'com.apple.videotoolbox.videoencoder.ave.avc',
      'AdvOut.RecEncoder': 'com.apple.videotoolbox.videoencoder.ave.hevc',
      'AdvOut.RescaleRes': '1920x1080',
      'AdvOut.RecRescaleRes': '1920x1080',
      'AdvOut.RescaleFilter': '0',
      'AdvOut.RecRescaleFilter': '0',
      'AdvOut.RecFormat2': 'mkv',
      'AdvOut.Track1Bitrate': '320',
    };

    obsMock.call.mockImplementation(async (request: string, data?: Record<string, string>) => {
      if (request === 'GetVideoSettings') {
        return {
          baseWidth: 1920,
          baseHeight: 1080,
          outputWidth: 1920,
          outputHeight: 1080,
          fpsNumerator: 60,
          fpsDenominator: 1,
        };
      }
      if (request === 'GetStreamServiceSettings') {
        return { streamServiceSettings: { server: 'rtmps://live-upload.youtube.com/live2' } };
      }
      if (request === 'GetProfileParameter' && data) {
        return {
          parameterValue: profileValues[`${data.parameterCategory}.${data.parameterName}`] ?? '',
          defaultParameterValue: '',
        };
      }
      throw new Error(`Solicitud inesperada: ${request}`);
    });

    const manager = new OBSManager();
    await manager.connect();
    vi.spyOn(manager, 'getAudioSnapshot').mockResolvedValue({
      success: false,
      message: 'Audio omitido en esta prueba',
    });

    const result = await manager.getSettingsSnapshot();

    expect(result.success).toBe(true);
    expect(result.snapshot).toMatchObject({
      outputMode: 'Advanced',
      encoder: 'com.apple.videotoolbox.videoencoder.ave.avc',
      bitrate: 0,
      audioBitrate: 320,
      recordingFormat: 'mkv',
    });
    expect(result.snapshot?.advancedOutput?.recordingEncoder).toBe(
      'com.apple.videotoolbox.videoencoder.ave.hevc',
    );
  });

  it('aplica encoders y audio compatibles, pero declara manuales los bitrates avanzados', async () => {
    obsMock.call.mockImplementation(async (request: string) => {
      if (request === 'GetStreamServiceSettings') {
        return { streamServiceSettings: { server: 'rtmps://live-upload.youtube.com/live2', key: 'preservada' } };
      }
      return {};
    });

    const manager = new OBSManager();
    await manager.connect();
    vi.spyOn(manager, 'getSettingsSnapshot').mockResolvedValue({
      success: true,
      message: 'Configuracion cargada',
      snapshot: advancedSnapshot,
    });

    const config: OBSConfig = {
      mode: 'stream_record',
      platform: 'youtube',
      resolution: '1920x1080',
      canvasResolution: '1920x1080',
      streamResolution: '1920x1080',
      recordingResolution: '1920x1080',
      fps: 60,
      encoder: 'apple vt h264',
      bitrate: 9000,
      recordingEncoder: 'apple vt hevc',
      recordingBitrate: 12000,
      audioBitrate: 320,
      recordingFormat: 'mkv',
      recordingQuality: 'high',
    };

    const result = await manager.configure(config);
    const profileWrites = obsMock.call.mock.calls
      .filter(([request]) => request === 'SetProfileParameter')
      .map(([, data]) => data);

    expect(profileWrites).toContainEqual({
      parameterCategory: 'AdvOut',
      parameterName: 'Encoder',
      parameterValue: 'com.apple.videotoolbox.videoencoder.ave.avc',
    });
    expect(profileWrites).toContainEqual({
      parameterCategory: 'AdvOut',
      parameterName: 'RecEncoder',
      parameterValue: 'com.apple.videotoolbox.videoencoder.ave.hevc',
    });
    expect(profileWrites).toContainEqual({
      parameterCategory: 'AdvOut',
      parameterName: 'Track1Bitrate',
      parameterValue: '320',
    });
    expect(profileWrites).not.toContainEqual(expect.objectContaining({
      parameterCategory: 'SimpleOutput',
      parameterName: 'VBitrate',
    }));
    expect(result).toMatchObject({
      success: true,
      requiresManualConfirmation: true,
    });
    expect(result.message).toContain('Falta confirmar manualmente el bitrate y la calidad avanzada');
  });

  it('detecta los bitrates y parámetros efectivos mediante el complemento nativo', async () => {
    const profileValues: Record<string, string> = {
      'Output.Mode': 'Advanced',
      'AdvOut.Encoder': 'com.apple.videotoolbox.videoencoder.ave.avc',
      'AdvOut.RecEncoder': 'com.apple.videotoolbox.videoencoder.ave.hevc',
      'AdvOut.RescaleRes': '1920x1080',
      'AdvOut.RecRescaleRes': '1920x1080',
      'AdvOut.RescaleFilter': '0',
      'AdvOut.RecRescaleFilter': '0',
      'AdvOut.RecFormat2': 'mkv',
      'AdvOut.Track1Bitrate': '320',
    };

    obsMock.call.mockImplementation(async (request: string, data?: Record<string, string>) => {
      if (request === 'GetVideoSettings') {
        return {
          baseWidth: 1920,
          baseHeight: 1080,
          outputWidth: 1920,
          outputHeight: 1080,
          fpsNumerator: 60,
          fpsDenominator: 1,
        };
      }
      if (request === 'GetStreamServiceSettings') {
        return { streamServiceSettings: { server: 'rtmps://live-upload.youtube.com/live2' } };
      }
      if (request === 'GetProfileParameter' && data) {
        return {
          parameterValue: profileValues[`${data.parameterCategory}.${data.parameterName}`] ?? '',
          defaultParameterValue: '',
        };
      }
      if (request === 'CallVendorRequest') {
        return { responseData: advancedControlResponse };
      }
      throw new Error(`Solicitud inesperada: ${request}`);
    });

    const manager = new OBSManager();
    await manager.connect();
    vi.spyOn(manager, 'getAudioSnapshot').mockResolvedValue({
      success: false,
      message: 'Audio omitido en esta prueba',
    });

    const result = await manager.getSettingsSnapshot();

    expect(result.snapshot).toMatchObject({
      bitrate: 8000,
      recordingBitrate: 40000,
      recordingQuality: 'high',
      advancedControl: {
        available: true,
        stream: {
          rateControl: 'CBR',
          keyframeInterval: 2,
          profile: 'high',
          bFrames: true,
        },
        recording: {
          profile: 'main10',
          quality: 76,
        },
      },
    });
  });

  it('aplica automáticamente stream y grabación avanzada cuando el complemento responde', async () => {
    obsMock.call.mockImplementation(async (request: string) => {
      if (request === 'GetStreamServiceSettings') {
        return { streamServiceSettings: { server: 'rtmps://live-upload.youtube.com/live2', key: 'preservada' } };
      }
      if (request === 'CallVendorRequest') {
        return { responseData: advancedControlResponse };
      }
      return {};
    });

    const manager = new OBSManager();
    await manager.connect();
    vi.spyOn(manager, 'getSettingsSnapshot').mockResolvedValue({
      success: true,
      message: 'Configuracion cargada',
      snapshot: advancedSnapshot,
    });

    const result = await manager.configure({
      mode: 'stream_record',
      platform: 'youtube',
      resolution: '1920x1080',
      canvasResolution: '1920x1080',
      streamResolution: '1920x1080',
      recordingResolution: '1920x1080',
      fps: 60,
      encoder: 'apple vt h264',
      bitrate: 9000,
      recordingEncoder: 'apple vt hevc',
      recordingBitrate: 12000,
      audioBitrate: 320,
      recordingFormat: 'mkv',
      recordingQuality: 'high',
    });

    const vendorApply = obsMock.call.mock.calls.find(([
      request,
      data,
    ]) => request === 'CallVendorRequest' && data?.requestType === 'ApplyAdvancedOutputConfig');

    expect(vendorApply?.[1]).toMatchObject({
      vendorName: 'obsee',
      requestData: {
        stream: {
          rate_control: 'CBR',
          bitrate: 9000,
          keyint_sec: 2,
          profile: 'high',
          bframes: true,
          spatial_aq_mode: 1,
        },
        recording: {
          rate_control: 'CBR',
          bitrate: 12000,
          quality: 76,
          keyint_sec: 2,
          bframes: true,
          spatial_aq_mode: 1,
        },
      },
    });
    expect(result).toMatchObject({
      success: true,
      requiresManualConfirmation: false,
    });
    expect(result.message).toBe('Configuracion aplicada en OBS');
  });
});
