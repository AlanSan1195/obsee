import { describe, expect, it } from 'vitest';
import { buildComparisonRows, isSameValue } from './OBSComparison';
import type { AIRecommendation, OBSSettingsSnapshot } from '../../shared/types';

const snapshot: OBSSettingsSnapshot = {
  streamServer: 'rtmp://live.twitch.tv/app',
  baseResolution: '1920x1080',
  outputResolution: '1920x1080',
  fps: 60,
  encoder: 'NVIDIA NVENC H.264',
  bitrate: 6000,
  audioBitrate: 320,
  recordingFormat: 'mkv',
  recordingQuality: 'HQ',
};

const recommendations: AIRecommendation['recommendations'] = {
  canvas_resolution: '3840x2160',
  resolution: '1920x1080',
  recording_resolution: '3840x2160',
  fps: 60,
  encoder: 'nvenc',
  bitrate: 6000,
  audio_bitrate: 320,
  recording_format: 'mkv',
  recording_quality: 'high',
};

describe('isSameValue', () => {
  it('normaliza encoders equivalentes', () => {
    expect(isSameValue({
      label: 'Encoder',
      current: 'NVIDIA NVENC H.264',
      recommended: 'nvenc',
      type: 'encoder',
    })).toBe(true);
  });

  it('normaliza calidades de grabacion equivalentes', () => {
    expect(isSameValue({
      label: 'Calidad de grabacion',
      current: 'HQ',
      recommended: 'high',
      type: 'recordingQuality',
    })).toBe(true);
  });
});

describe('buildComparisonRows', () => {
  it('construye filas comparables desde snapshot y recomendacion', () => {
    const rows = buildComparisonRows(snapshot, recommendations);

    expect(rows).toHaveLength(9);
    expect(rows.find((row) => row.label === 'Lienzo base')?.recommended).toBe('3840x2160');
    expect(rows.find((row) => row.label === 'Salida del stream')?.recommended).toBe('1920x1080');
    expect(rows.find((row) => row.label === 'Salida maestra / grabacion')?.recommended).toBe('3840x2160');
  });
});
