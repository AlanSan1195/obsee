import { describe, expect, it } from 'vitest';
import {
  encoderPatchFromSnapshot,
  parseAdvancedOutputControl,
  recordingQualityFromEncoder,
  recordingQualityValue,
} from './obs-advanced-control';

describe('parseAdvancedOutputControl', () => {
  it('normaliza la respuesta del complemento nativo', () => {
    const result = parseAdvancedOutputControl({
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
    });

    expect(result).toMatchObject({
      available: true,
      pluginVersion: '0.1.0',
      stream: {
        bitrate: 8000,
        rateControl: 'CBR',
        profile: 'high',
        bFrames: true,
      },
      recording: {
        bitrate: 40000,
        quality: 76,
        profile: 'main10',
      },
    });
  });

  it('rechaza una respuesta fallida o deformada', () => {
    expect(parseAdvancedOutputControl({ success: false })).toBeUndefined();
    expect(parseAdvancedOutputControl(null)).toBeUndefined();
  });
});

describe('calidad avanzada', () => {
  it('traduce la calidad numerica sin inventar un bitrate', () => {
    expect(recordingQualityFromEncoder(76)).toBe('high');
    expect(recordingQualityValue('high')).toBe(76);
    expect(recordingQualityValue('desconocida')).toBeUndefined();
  });

  it('convierte un snapshot en un parche restaurable', () => {
    expect(encoderPatchFromSnapshot({
      available: true,
      encoderId: 'apple',
      active: false,
      rateControl: 'CBR',
      bitrate: 8000,
      quality: 60,
      limitBitrate: false,
      maxBitrate: 9000,
      maxBitrateWindow: 1.5,
      keyframeInterval: 2,
      profile: 'high',
      bFrames: true,
      spatialAQMode: 1,
    })).toEqual({
      rate_control: 'CBR',
      bitrate: 8000,
      quality: 60,
      limit_bitrate: false,
      max_bitrate: 9000,
      max_bitrate_window: 1.5,
      keyint_sec: 2,
      profile: 'high',
      bframes: true,
      spatial_aq_mode: 1,
    });
  });
});

