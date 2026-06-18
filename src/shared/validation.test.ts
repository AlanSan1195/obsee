import { describe, expect, it } from 'vitest';
import {
  parseResolution,
  validateAIRecommendation,
  validateAIRecommendationExplanationRequest,
  validateOBSBackup,
  validateOBSAudioConfig,
  validateOBSConfig,
  validateOBSConnectionSettings,
} from './validation';

const validAudioConfig = {
  inputName: 'Mic/Aux',
  deviceId: ' usb-mic ',
  deviceName: ' USB Mic ',
  mono: true,
  filters: {
    gainDb: 10.26,
    compressorRatio: 4,
    compressorThresholdDb: -10,
    limiterThresholdDb: -1,
    noiseSuppression: true,
  },
  monitorType: 'OBS_MONITORING_TYPE_NONE',
  syncOffsetMs: -950,
  ducking: {
    enabled: true,
    desktopInputName: 'Desktop Audio',
  },
};

const validOBSConfig = {
  mode: 'stream_record',
  platform: 'twitch',
  resolution: '1920x1080',
  fps: 59.6,
  encoder: ' NVENC H264 ',
  bitrate: 5999.6,
  audioBitrate: 320,
  recordingFormat: ' MKV ',
  recordingQuality: ' HIGH ',
  streamKey: ' live-key ',
  audio: validAudioConfig,
};

const validRecommendation = {
  recommendations: {
    resolution: '1920x1080',
    fps: 60,
    encoder: 'NVENC',
    bitrate: 6000,
    audio_bitrate: 320,
    recording_format: 'MKV',
    recording_quality: 'High',
  },
  reasoning: 'Buena configuracion para este equipo.',
};

const validBackup = {
  createdAt: '2026-06-10T12:00:00.000Z',
  appliedByObsrec: true,
  snapshot: {
    streamServer: 'rtmp://live.twitch.tv/app',
    baseResolution: '1920x1080',
    outputResolution: '1920x1080',
    fps: 60,
    encoder: 'nvenc',
    bitrate: 6000,
    audioBitrate: 320,
    recordingFormat: 'mkv',
    recordingQuality: 'HQ',
  },
};

const validSystemInfo = {
  cpu: {
    model: 'Apple M3',
    cores: 8,
    speed: 3.5,
  },
  gpu: {
    model: 'Apple M3 GPU',
    vram: 8192,
    vendor: 'Apple',
    hasNvenc: false,
  },
  ram: {
    total: 16,
  },
  os: {
    platform: 'darwin',
    distro: 'macOS',
    release: '15.5',
  },
};

describe('parseResolution', () => {
  it('acepta resoluciones con formato ancho x alto', () => {
    expect(parseResolution('1920x1080')).toEqual({
      success: true,
      value: { width: 1920, height: 1080 },
    });
  });

  it('rechaza formatos invalidos', () => {
    expect(parseResolution('1920×1080').success).toBe(false);
    expect(parseResolution('abc').success).toBe(false);
    expect(parseResolution('19201x1080').success).toBe(false);
  });

  it('rechaza dimensiones fuera de rango', () => {
    expect(parseResolution('4097x2160')).toEqual({
      success: false,
      message: 'Resolution must be between 1 and 4096 pixels per side.',
    });
  });
});

describe('validateOBSConnectionSettings', () => {
  it('acepta y normaliza ajustes de conexion validos', () => {
    expect(validateOBSConnectionSettings({ host: ' localhost ', port: 4455, password: ' secret ' })).toEqual({
      success: true,
      value: { host: 'localhost', port: 4455, password: 'secret' },
    });
  });

  it('acepta password vacio cuando OBS no usa autenticacion', () => {
    expect(validateOBSConnectionSettings({ host: 'localhost', port: 4455, password: '' })).toEqual({
      success: true,
      value: { host: 'localhost', port: 4455, password: '' },
    });
  });

  it('rechaza el puerto del servidor de desarrollo', () => {
    expect(validateOBSConnectionSettings({ host: 'localhost', port: 5173, password: '' })).toEqual({
      success: false,
      message: 'Port 5173 belongs to the app dev server. Use the OBS WebSocket port, usually 4455.',
    });
  });

  it('rechaza puertos y host invalidos', () => {
    expect(validateOBSConnectionSettings({ host: '', port: 4455, password: '' }).success).toBe(false);
    expect(validateOBSConnectionSettings({ host: 'localhost', port: 0, password: '' }).success).toBe(false);
    expect(validateOBSConnectionSettings({ host: 'localhost', port: 70000, password: '' }).success).toBe(false);
  });
});

describe('validateOBSConfig', () => {
  it('acepta y normaliza una configuracion completa', () => {
    expect(validateOBSConfig(validOBSConfig)).toEqual({
      success: true,
      value: {
        mode: 'stream_record',
        platform: 'twitch',
        resolution: '1920x1080',
        fps: 60,
        encoder: 'nvenc h264',
        bitrate: 6000,
        audioBitrate: 320,
        recordingFormat: 'mkv',
        recordingQuality: 'high',
        streamKey: 'live-key',
        audio: {
          inputName: 'Mic/Aux',
          deviceId: 'usb-mic',
          deviceName: 'USB Mic',
          mono: true,
          filters: {
            gainDb: 10.3,
            compressorRatio: 4,
            compressorThresholdDb: -10,
            limiterThresholdDb: -1,
            noiseSuppression: true,
          },
          monitorType: 'OBS_MONITORING_TYPE_NONE',
          syncOffsetMs: -950,
          ducking: {
            enabled: true,
            desktopInputName: 'Desktop Audio',
          },
        },
      },
    });
  });

  it('rechaza campos de video fuera de contrato', () => {
    expect(validateOBSConfig({ ...validOBSConfig, mode: 'invalid' }).success).toBe(false);
    expect(validateOBSConfig({ ...validOBSConfig, fps: 0 }).success).toBe(false);
    expect(validateOBSConfig({ ...validOBSConfig, fps: 241 }).success).toBe(false);
    expect(validateOBSConfig({ ...validOBSConfig, bitrate: 100001 }).success).toBe(false);
    expect(validateOBSConfig({ ...validOBSConfig, audioBitrate: 1025 }).success).toBe(false);
  });

  it('propaga errores de configuracion de audio', () => {
    expect(validateOBSConfig({ ...validOBSConfig, audio: { ...validAudioConfig, inputName: '' } })).toEqual({
      success: false,
      message: 'Audio input name is required.',
    });
  });
});

describe('validateOBSAudioConfig', () => {
  it('acepta y redondea filtros de audio', () => {
    const result = validateOBSAudioConfig(validAudioConfig);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.filters.gainDb).toBe(10.3);
    }
  });

  it('rechaza filtros fuera de rango', () => {
    expect(validateOBSAudioConfig({ ...validAudioConfig, filters: { ...validAudioConfig.filters, gainDb: 31 } }).success).toBe(false);
    expect(validateOBSAudioConfig({ ...validAudioConfig, filters: { ...validAudioConfig.filters, gainDb: -31 } }).success).toBe(false);
    expect(validateOBSAudioConfig({ ...validAudioConfig, filters: { ...validAudioConfig.filters, compressorRatio: 0.5 } }).success).toBe(false);
    expect(validateOBSAudioConfig({ ...validAudioConfig, filters: { ...validAudioConfig.filters, compressorRatio: 33 } }).success).toBe(false);
    expect(validateOBSAudioConfig({ ...validAudioConfig, filters: { ...validAudioConfig.filters, compressorThresholdDb: -61 } }).success).toBe(false);
    expect(validateOBSAudioConfig({ ...validAudioConfig, filters: { ...validAudioConfig.filters, limiterThresholdDb: 1 } }).success).toBe(false);
  });

  it('valida controles avanzados de audio', () => {
    expect(validateOBSAudioConfig({ ...validAudioConfig, syncOffsetMs: 951 }).success).toBe(false);
    expect(validateOBSAudioConfig({ ...validAudioConfig, syncOffsetMs: -950 }).success).toBe(true);
    expect(validateOBSAudioConfig({ ...validAudioConfig, monitorType: 'invalid' }).success).toBe(false);
    expect(validateOBSAudioConfig({ ...validAudioConfig, ducking: { enabled: true, desktopInputName: '' } }).success).toBe(false);
  });
});

describe('validateAIRecommendation', () => {
  it('acepta y normaliza recomendaciones validas', () => {
    expect(validateAIRecommendation(validRecommendation)).toEqual({
      success: true,
      value: {
        recommendations: {
          resolution: '1920x1080',
          fps: 60,
          encoder: 'nvenc',
          bitrate: 6000,
          audio_bitrate: 320,
          recording_format: 'mkv',
          recording_quality: 'high',
        },
        reasoning: 'Buena configuracion para este equipo.',
      },
    });
  });

  it('rechaza recomendaciones sin resolucion', () => {
    expect(validateAIRecommendation({ recommendations: { ...validRecommendation.recommendations, resolution: '' } })).toEqual({
      success: false,
      message: 'AI recommendation is missing resolution.',
    });
  });

  it('usa un razonamiento por defecto cuando falta', () => {
    expect(validateAIRecommendation({ recommendations: validRecommendation.recommendations })).toEqual({
      success: true,
      value: {
        recommendations: {
          resolution: '1920x1080',
          fps: 60,
          encoder: 'nvenc',
          bitrate: 6000,
          audio_bitrate: 320,
          recording_format: 'mkv',
          recording_quality: 'high',
        },
        reasoning: 'No reasoning was provided.',
      },
    });
  });
});

describe('validateAIRecommendationExplanationRequest', () => {
  it('acepta y normaliza una solicitud de explicacion por cambios', () => {
    expect(validateAIRecommendationExplanationRequest({
      systemInfo: validSystemInfo,
      mode: 'stream_record',
      platform: 'youtube',
      originalRecommendations: validRecommendation.recommendations,
      currentRecommendations: {
        ...validRecommendation.recommendations,
        resolution: '2560x1440',
        bitrate: 12000.4,
      },
      changedFields: ['resolution', 'bitrate', 'bitrate'],
    })).toEqual({
      success: true,
      value: {
        systemInfo: validSystemInfo,
        mode: 'stream_record',
        platform: 'youtube',
        originalRecommendations: {
          resolution: '1920x1080',
          fps: 60,
          encoder: 'nvenc',
          bitrate: 6000,
          audio_bitrate: 320,
          recording_format: 'mkv',
          recording_quality: 'high',
        },
        currentRecommendations: {
          resolution: '2560x1440',
          fps: 60,
          encoder: 'nvenc',
          bitrate: 12000,
          audio_bitrate: 320,
          recording_format: 'mkv',
          recording_quality: 'high',
        },
        changedFields: ['resolution', 'bitrate'],
      },
    });
  });

  it('rechaza solicitudes sin campos modificados', () => {
    expect(validateAIRecommendationExplanationRequest({
      systemInfo: validSystemInfo,
      mode: 'stream_record',
      platform: 'youtube',
      originalRecommendations: validRecommendation.recommendations,
      currentRecommendations: validRecommendation.recommendations,
      changedFields: [],
    })).toEqual({
      success: false,
      message: 'Changed recommendation fields are required.',
    });
  });
});

describe('validateOBSBackup', () => {
  it('acepta respaldos validos', () => {
    expect(validateOBSBackup(validBackup)).toEqual({
      success: true,
      value: validBackup,
    });
  });

  it('rechaza respaldos sin fecha', () => {
    expect(validateOBSBackup({ ...validBackup, createdAt: '' })).toEqual({
      success: false,
      message: 'OBS backup is incomplete.',
    });
  });

  it('rechaza snapshots incompletos', () => {
    expect(validateOBSBackup({ ...validBackup, snapshot: { ...validBackup.snapshot, encoder: '' } })).toEqual({
      success: false,
      message: 'OBS backup snapshot is incomplete.',
    });
  });

  it('rechaza tipos incorrectos', () => {
    expect(validateOBSBackup({ ...validBackup, snapshot: { ...validBackup.snapshot, fps: '60' } })).toEqual({
      success: false,
      message: 'OBS backup snapshot is incomplete.',
    });
  });
});
