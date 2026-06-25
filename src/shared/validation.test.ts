import { describe, expect, it } from 'vitest';
import {
  parseResolution,
  validateAIRecommendation,
  validateAIRecommendationExplanationRequest,
  validateAIRecommendationRequest,
  validateApplyGuidedSourceDevice,
  validateBeginGuidedSource,
  validateConsoleProfileRequest,
  validateConsoleProfileResponse,
  validateCreateGuidedSourceConfig,
  validateMicProfileRequest,
  validateMicProfileResponse,
  validateOBSBackup,
  validateOBSAudioConfig,
  validateOBSConfig,
  validateOBSConnectionSettings,
  validateSceneName,
  validateSetCameraLayout,
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
            gainEnabled: true,
            compressorRatio: 4,
            compressorThresholdDb: -10,
            compressorEnabled: true,
            limiterThresholdDb: -1,
            limiterEnabled: true,
            noiseSuppression: true,
            noiseSuppressionMethod: 'rnnoise',
            noiseGate: undefined,
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

describe('validateSceneName', () => {
  it('acepta un nombre valido y lo recorta', () => {
    expect(validateSceneName('  Mi escena  ')).toEqual({ success: true, value: 'Mi escena' });
  });

  it('rechaza nombres vacios', () => {
    expect(validateSceneName('   ').success).toBe(false);
  });

  it('rechaza nombres con caracteres de control', () => {
    expect(validateSceneName('mala\x00escena').success).toBe(false);
  });
});

describe('validateBeginGuidedSource', () => {
  it('acepta una escena y categoria validas', () => {
    expect(validateBeginGuidedSource({ sceneName: 'Escena 1', friendly: 'camera' })).toEqual({
      success: true,
      value: { sceneName: 'Escena 1', friendly: 'camera' },
    });
  });

  it('rechaza categorias no soportadas', () => {
    expect(validateBeginGuidedSource({ sceneName: 'Escena 1', friendly: 'webcam' }).success).toBe(false);
  });
});

describe('validateApplyGuidedSourceDevice', () => {
  const base = {
    inputName: 'Camara web',
    sceneName: 'Escena 1',
    sceneItemId: 3,
    propertyName: 'video_device_id',
    deviceId: 'cam-123',
  };

  it('acepta una solicitud completa', () => {
    expect(validateApplyGuidedSourceDevice(base)).toEqual({ success: true, value: base });
  });

  it('rechaza sceneItemId negativo o no entero', () => {
    expect(validateApplyGuidedSourceDevice({ ...base, sceneItemId: -1 }).success).toBe(false);
    expect(validateApplyGuidedSourceDevice({ ...base, sceneItemId: 1.5 }).success).toBe(false);
  });

  it('rechaza deviceId vacio', () => {
    expect(validateApplyGuidedSourceDevice({ ...base, deviceId: '' }).success).toBe(false);
  });
});

describe('validateAIRecommendationRequest currentSettings', () => {
  const baseRequest = {
    mode: 'stream_record',
    platform: 'twitch',
    systemInfo: {
      cpu: { model: 'CPU', cores: 8, speed: 3.5 },
      gpu: { model: 'GPU', vram: 8192, vendor: 'NVIDIA', hasNvenc: true },
      ram: { total: 16 },
      os: { platform: 'darwin', distro: 'macOS', release: '15' },
    },
  };

  it('acepta currentSettings valido', () => {
    const result = validateAIRecommendationRequest({
      ...baseRequest,
      currentSettings: { resolution: '1920x1080', fps: 60, encoder: 'NVENC', bitrate: 6000, recordingQuality: 'High', hasStreamService: true },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.currentSettings).toEqual({
        resolution: '1920x1080', fps: 60, encoder: 'nvenc', bitrate: 6000, recordingQuality: 'high', hasStreamService: true,
      });
    }
  });

  it('ignora currentSettings malformado sin invalidar la solicitud', () => {
    const result = validateAIRecommendationRequest({ ...baseRequest, currentSettings: { resolution: 'mala' } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.currentSettings).toBeUndefined();
    }
  });

  it('funciona sin currentSettings (compatibilidad)', () => {
    const result = validateAIRecommendationRequest(baseRequest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.currentSettings).toBeUndefined();
    }
  });
});

describe('validateSetCameraLayout', () => {
  it('acepta facecam y fullscreen', () => {
    expect(validateSetCameraLayout({ sceneName: 'Escena 1', sceneItemId: 2, layout: 'facecam' }).success).toBe(true);
    expect(validateSetCameraLayout({ sceneName: 'Escena 1', sceneItemId: 0, layout: 'fullscreen' }).success).toBe(true);
  });

  it('rechaza layout no soportado y sceneItemId invalido', () => {
    expect(validateSetCameraLayout({ sceneName: 'Escena 1', sceneItemId: 2, layout: 'rotated' }).success).toBe(false);
    expect(validateSetCameraLayout({ sceneName: 'Escena 1', sceneItemId: -1, layout: 'facecam' }).success).toBe(false);
  });
});

describe('validateCreateGuidedSourceConfig', () => {
  it('exige imagePath cuando la categoria es image', () => {
    expect(
      validateCreateGuidedSourceConfig({ sceneName: 'Escena 1', friendly: 'image', sourceName: 'Logo', fitToCanvas: true })
        .success,
    ).toBe(false);
  });

  it('acepta una imagen con ruta', () => {
    const result = validateCreateGuidedSourceConfig({
      sceneName: 'Escena 1',
      friendly: 'image',
      sourceName: 'Logo',
      imagePath: '/tmp/logo.png',
      fitToCanvas: true,
    });
    expect(result.success).toBe(true);
  });

  it('rechaza fitToCanvas no booleano', () => {
    expect(
      validateCreateGuidedSourceConfig({ sceneName: 'Escena 1', friendly: 'camera', sourceName: 'Cam', fitToCanvas: 'yes' })
        .success,
    ).toBe(false);
  });
});

describe('validateOBSAudioConfig campos de filtros nuevos', () => {
  it('aplica defaults a los flags de filtros y metodo de ruido', () => {
    const result = validateOBSAudioConfig(validAudioConfig);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.filters.gainEnabled).toBe(true);
    expect(result.value.filters.compressorEnabled).toBe(true);
    expect(result.value.filters.limiterEnabled).toBe(true);
    expect(result.value.filters.noiseSuppressionMethod).toBe('rnnoise');
    expect(result.value.filters.noiseGate).toBeUndefined();
  });

  it('acepta la compuerta de ruido y respeta los flags', () => {
    const result = validateOBSAudioConfig({
      ...validAudioConfig,
      filters: {
        ...validAudioConfig.filters,
        gainEnabled: false,
        noiseSuppressionMethod: 'speex',
        noiseGate: { enabled: true, closeThresholdDb: -45, openThresholdDb: -35 },
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.filters.gainEnabled).toBe(false);
    expect(result.value.filters.noiseSuppressionMethod).toBe('speex');
    expect(result.value.filters.noiseGate).toEqual({ enabled: true, closeThresholdDb: -45, openThresholdDb: -35 });
  });

  it('rechaza umbrales de compuerta fuera de rango', () => {
    const result = validateOBSAudioConfig({
      ...validAudioConfig,
      filters: { ...validAudioConfig.filters, noiseGate: { enabled: true, closeThresholdDb: -200, openThresholdDb: -35 } },
    });
    expect(result.success).toBe(false);
  });
});

describe('validateMicProfileRequest', () => {
  it('acepta una solicitud valida', () => {
    const result = validateMicProfileRequest({ deviceName: ' Blue Yeti ', mode: 'record_only', inputKind: 'coreaudio_input_capture' });
    expect(result).toEqual({ success: true, value: { deviceName: 'Blue Yeti', mode: 'record_only', inputKind: 'coreaudio_input_capture', os: undefined } });
  });

  it('rechaza nombre vacio o modo invalido', () => {
    expect(validateMicProfileRequest({ deviceName: '', mode: 'record_only' }).success).toBe(false);
    expect(validateMicProfileRequest({ deviceName: 'Mic', mode: 'invalid' }).success).toBe(false);
  });
});

describe('validateMicProfileResponse', () => {
  const validResponse = {
    source: 'ai',
    profile: { identified: true, model: 'Blue Yeti', type: 'condenser', connection: 'usb', hasBuiltinDsp: false, summary: 'Condensador USB', sources: ['https://www.bluemic.com/yeti'] },
    filters: {
      noiseSuppression: { enabled: true, method: 'rnnoise', reason: 'ruido' },
      noiseGate: { enabled: true, closeThresholdDb: -45, openThresholdDb: -35, reason: 'gate' },
      gain: { enabled: true, db: 6, reason: 'gain' },
      compressor: { enabled: true, ratio: 3, thresholdDb: -18, reason: 'comp' },
      limiter: { enabled: true, thresholdDb: -1.5, reason: 'lim' },
    },
    reasoning: 'resumen',
  };

  it('acepta una respuesta valida', () => {
    const result = validateMicProfileResponse(validResponse);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.profile.model).toBe('Blue Yeti');
    expect(result.value.filters.gain.db).toBe(6);
  });

  it('clampa numeros fuera de rango y cae a enums por defecto', () => {
    const result = validateMicProfileResponse({
      ...validResponse,
      profile: { ...validResponse.profile, type: 'laser', connection: 'bluetooth' },
      filters: {
        ...validResponse.filters,
        gain: { enabled: true, db: 999, reason: '' },
        compressor: { enabled: true, ratio: 0.1, thresholdDb: 50, reason: '' },
        noiseSuppression: { enabled: true, method: 'magic', reason: '' },
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.profile.type).toBe('unknown');
    expect(result.value.profile.connection).toBe('unknown');
    expect(result.value.filters.gain.db).toBe(30);
    expect(result.value.filters.compressor.ratio).toBe(1);
    expect(result.value.filters.compressor.thresholdDb).toBe(0);
    expect(result.value.filters.noiseSuppression.method).toBe('rnnoise');
  });

  it('rechaza una respuesta sin perfil o filtros', () => {
    expect(validateMicProfileResponse({ source: 'ai', reasoning: 'x' }).success).toBe(false);
  });
});

const validConsoleSystemInfo = {
  cpu: { model: 'AMD Ryzen 7', cores: 8, speed: 3.8 },
  gpu: { model: 'NVIDIA RTX 4070', vram: 12288, vendor: 'NVIDIA', hasNvenc: true },
  ram: { total: 32 },
  os: { platform: 'win32', distro: 'Windows', release: '11' },
};

describe('validateConsoleProfileRequest', () => {
  it('acepta una solicitud valida', () => {
    const result = validateConsoleProfileRequest({
      console: 'ps5', platform: 'twitch', mode: 'stream_record', systemInfo: validConsoleSystemInfo,
      captureCard: ' Elgato HD60 X ', monitor: ' LG 4K ', monitorRefreshRate: 120,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.console).toBe('ps5');
    expect(result.value.captureCard).toBe('Elgato HD60 X');
    expect(result.value.monitorRefreshRate).toBe(120);
  });

  it('rechaza consola invalida o systemInfo incompleto', () => {
    expect(validateConsoleProfileRequest({ console: 'ps6', platform: 'twitch', mode: 'stream_record', systemInfo: validConsoleSystemInfo }).success).toBe(false);
    expect(validateConsoleProfileRequest({ console: 'ps5', platform: 'twitch', mode: 'stream_record', systemInfo: {} }).success).toBe(false);
  });
});

describe('validateConsoleProfileResponse', () => {
  const validResponse = {
    source: 'ai',
    profile: {
      console: { name: 'PS5', identified: true, summary: '', maxResolution: '3840x2160', maxFps: 120, hdr: true, vrr: true },
      captureCard: { name: 'UGREEN', identified: true, summary: '', maxResolution: '1920x1080', maxFps: 30 },
      monitor: { name: 'LG 4K', identified: true, summary: '', maxResolution: '3840x2160', maxFps: 60 },
      bottleneck: 'La capturadora limita',
      captureResolution: '1920x1080',
      captureFps: 30,
      consoleSettings: ['paso 1', 'paso 2'],
      sources: ['https://www.playstation.com'],
    },
    recommendations: {
      resolution: '1920x1080', fps: 30, encoder: 'nvenc', bitrate: 6000, audio_bitrate: 320, recording_format: 'mkv', recording_quality: 'high',
    },
    reasoning: 'resumen',
  };

  it('acepta una respuesta valida y reusa la validacion de recommendations', () => {
    const result = validateConsoleProfileResponse(validResponse);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.profile.captureResolution).toBe('1920x1080');
    expect(result.value.recommendations.fps).toBe(30);
  });

  it('clampa specs fuera de rango y aplica defaults', () => {
    const result = validateConsoleProfileResponse({
      ...validResponse,
      profile: { ...validResponse.profile, captureFps: 9999, captureResolution: 'no-valida', consoleSettings: 'x' },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.profile.captureFps).toBe(240);
    expect(result.value.profile.captureResolution).toBe('1920x1080');
    expect(result.value.profile.consoleSettings).toEqual([]);
  });

  it('rechaza si recommendations es invalido', () => {
    const result = validateConsoleProfileResponse({ ...validResponse, recommendations: { ...validResponse.recommendations, resolution: 'mala' } });
    expect(result.success).toBe(false);
  });
});
