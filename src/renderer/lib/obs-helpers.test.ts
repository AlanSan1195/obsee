import { describe, expect, it } from 'vitest';
import {
  areObsrecFiltersConfigured,
  collectDuckingInputCandidates,
  getSimpleEncoderId,
  getSimpleRecordingQuality,
  getStreamServer,
  getFilterSettings,
  obsrecFilterNames,
  scoreAudioDevice,
} from './obs-helpers';
import type { OBSAudioConfig, OBSAudioFilterSnapshot } from '../shared/types';

function defaultObsrecFilters(): OBSAudioFilterSnapshot[] {
  return [
    {
      name: obsrecFilterNames.noise,
      kind: 'noise_suppress_filter',
      enabled: true,
      settings: { method: 'rnnoise' },
    },
    {
      name: obsrecFilterNames.gain,
      kind: 'gain_filter',
      enabled: true,
      settings: { db: 10 },
    },
    {
      name: obsrecFilterNames.compressor,
      kind: 'compressor_filter',
      enabled: true,
      settings: {
        ratio: 4,
        threshold: -10,
        attack_time: 6,
        release_time: 60,
        output_gain: 0,
        sidechain_source: 'none',
      },
    },
    {
      name: obsrecFilterNames.limiter,
      kind: 'limiter_filter',
      enabled: true,
      settings: {
        threshold: -1,
        release_time: 60,
      },
    },
  ];
}

describe('getSimpleEncoderId', () => {
  it('mapea nombres conocidos a ids de OBS Simple Output', () => {
    expect(getSimpleEncoderId('nvenc h264')).toBe('nvenc');
    expect(getSimpleEncoderId('obs_x264')).toBe('x264');
    expect(getSimpleEncoderId('apple vt h264')).toBe('apple_h264');
    expect(getSimpleEncoderId('videotoolbox')).toBe('apple_h264');
    expect(getSimpleEncoderId('desconocido')).toBeNull();
  });
});

describe('getSimpleRecordingQuality', () => {
  it('mapea calidades de la UI a calidades de OBS', () => {
    expect(getSimpleRecordingQuality('lossless')).toBe('Lossless');
    expect(getSimpleRecordingQuality('stream')).toBe('Stream');
    expect(getSimpleRecordingQuality('medium')).toBe('Small');
    expect(getSimpleRecordingQuality('high')).toBe('HQ');
    expect(getSimpleRecordingQuality()).toBe('HQ');
  });
});

describe('getStreamServer', () => {
  it('devuelve los servidores RTMP por plataforma', () => {
    expect(getStreamServer('twitch')).toBe('rtmp://live.twitch.tv/app');
    expect(getStreamServer('youtube')).toBe('rtmps://live-upload.youtube.com/live2');
  });
});

describe('scoreAudioDevice', () => {
  it('prefiere dispositivos USB frente al predeterminado del sistema', () => {
    const usb = scoreAudioDevice('USB Microphone', 'usb-device', false);
    const systemDefault = scoreAudioDevice('Default', 'default', false);

    expect(usb.score).toBeGreaterThan(systemDefault.score);
  });

  it('penaliza microfonos de camara', () => {
    expect(scoreAudioDevice('FaceTime Camera', 'camera', false).score).toBeLessThan(0);
  });
});

describe('areObsrecFiltersConfigured', () => {
  it('acepta los cuatro filtros OBSREC habilitados con valores por defecto', () => {
    expect(areObsrecFiltersConfigured(defaultObsrecFilters())).toBe(true);
  });

  it('rechaza filtros deshabilitados, modificados o ausentes', () => {
    const disabledLimiter = defaultObsrecFilters().map((filter) => (
      filter.name === obsrecFilterNames.limiter ? { ...filter, enabled: false } : filter
    ));
    const changedGain = defaultObsrecFilters().map((filter) => (
      filter.name === obsrecFilterNames.gain ? { ...filter, settings: { db: 5 } } : filter
    ));

    expect(areObsrecFiltersConfigured(disabledLimiter)).toBe(false);
    expect(areObsrecFiltersConfigured(changedGain)).toBe(false);
    expect(areObsrecFiltersConfigured([])).toBe(false);
  });
});

describe('getFilterSettings', () => {
  const baseConfig: OBSAudioConfig = {
    inputName: 'Mic/Aux',
    mono: true,
    filters: {
      gainDb: 10,
      compressorRatio: 4,
      compressorThresholdDb: -10,
      limiterThresholdDb: -1,
      noiseSuppression: true,
    },
  };

  it('incluye supresion de ruido cuando esta activada', () => {
    expect(getFilterSettings(baseConfig)[obsrecFilterNames.noise]).toEqual({
      kind: 'noise_suppress_filter',
      settings: { method: 'rnnoise' },
    });
  });

  it('omite supresion de ruido cuando esta desactivada', () => {
    const filters = getFilterSettings({
      ...baseConfig,
      filters: { ...baseConfig.filters, noiseSuppression: false },
    });

    expect(filters[obsrecFilterNames.noise]).toBeUndefined();
  });

  it('respeta el metodo de supresion de ruido indicado', () => {
    const filters = getFilterSettings({
      ...baseConfig,
      filters: { ...baseConfig.filters, noiseSuppressionMethod: 'speex' },
    });

    expect(filters[obsrecFilterNames.noise]).toEqual({
      kind: 'noise_suppress_filter',
      settings: { method: 'speex' },
    });
  });

  it('incluye la compuerta de ruido cuando esta activada', () => {
    const filters = getFilterSettings({
      ...baseConfig,
      filters: {
        ...baseConfig.filters,
        noiseGate: { enabled: true, openThresholdDb: -35, closeThresholdDb: -45 },
      },
    });

    const gate = filters[obsrecFilterNames.noiseGate];
    expect(gate?.kind).toBe('noise_gate_filter');
    expect(gate?.settings.open_threshold).toBe(-35);
    expect(gate?.settings.close_threshold).toBe(-45);
  });

  it('omite gain, compresor y limitador cuando se marcan como deshabilitados', () => {
    const filters = getFilterSettings({
      ...baseConfig,
      filters: {
        ...baseConfig.filters,
        gainEnabled: false,
        compressorEnabled: false,
        limiterEnabled: false,
      },
    });

    expect(filters[obsrecFilterNames.gain]).toBeUndefined();
    expect(filters[obsrecFilterNames.compressor]).toBeUndefined();
    expect(filters[obsrecFilterNames.limiter]).toBeUndefined();
  });
});

describe('collectDuckingInputCandidates', () => {
  it('prioriza desktop1 sobre fuentes multimedia', () => {
    const candidates = collectDuckingInputCandidates(
      { desktop1: 'Desktop Audio' },
      [
        { inputName: 'Musica MP3', inputKind: 'ffmpeg_source' },
      ],
    );

    expect(candidates).toEqual([
      { inputName: 'Desktop Audio', inputKind: 'special_desktop_audio' },
      { inputName: 'Musica MP3', inputKind: 'ffmpeg_source' },
    ]);
  });

  it('incluye una fuente multimedia mp3 como candidata', () => {
    expect(collectDuckingInputCandidates(undefined, [
      { inputName: 'Musica MP3', inputKind: 'ffmpeg_source' },
    ])).toEqual([
      { inputName: 'Musica MP3', inputKind: 'ffmpeg_source' },
    ]);
  });

  it('descarta fuentes no relacionadas', () => {
    expect(collectDuckingInputCandidates(undefined, [
      { inputName: 'Camara', inputKind: 'dshow_input' },
    ])).toEqual([]);
  });
});
