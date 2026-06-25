import { describe, expect, it } from 'vitest';
import { extractObsBaseline, inferMode, inferObsUsage, inferPlatform } from './obsUsage';
import type { OBSSettingsSnapshot } from './types';

function makeSnapshot(overrides: Partial<OBSSettingsSnapshot> = {}): OBSSettingsSnapshot {
  return {
    streamServer: '',
    baseResolution: '1920x1080',
    outputResolution: '1920x1080',
    fps: 60,
    encoder: 'x264',
    bitrate: 6000,
    audioBitrate: 160,
    recordingFormat: 'mkv',
    recordingQuality: 'high',
    ...overrides,
  };
}

describe('inferPlatform', () => {
  it('detecta twitch y youtube desde el servidor de stream', () => {
    expect(inferPlatform('rtmp://live.twitch.tv/app')).toBe('twitch');
    expect(inferPlatform('rtmps://live-upload.youtube.com/live2')).toBe('youtube');
  });

  it('devuelve null si no hay servidor o no se reconoce', () => {
    expect(inferPlatform('')).toBeNull();
    expect(inferPlatform(undefined)).toBeNull();
    expect(inferPlatform('rtmp://otro.servidor/app')).toBeNull();
  });
});

describe('inferMode', () => {
  it('usa stream_record cuando hay servicio de stream y record_only cuando no', () => {
    expect(inferMode('rtmp://live.twitch.tv/app')).toBe('stream_record');
    expect(inferMode('')).toBe('record_only');
  });
});

describe('inferObsUsage', () => {
  it('combina modo y plataforma desde el snapshot', () => {
    expect(inferObsUsage(makeSnapshot({ streamServer: 'rtmp://live.twitch.tv/app' }))).toEqual({
      mode: 'stream_record',
      platform: 'twitch',
    });
    expect(inferObsUsage(makeSnapshot({ streamServer: '' }))).toEqual({
      mode: 'record_only',
      platform: null,
    });
  });
});

describe('extractObsBaseline', () => {
  it('extrae la config base desde el snapshot', () => {
    const baseline = extractObsBaseline(makeSnapshot({ streamServer: 'rtmp://live.twitch.tv/app', outputResolution: '1280x720', fps: 30 }));
    expect(baseline).toEqual({
      resolution: '1280x720',
      fps: 30,
      encoder: 'x264',
      bitrate: 6000,
      recordingQuality: 'high',
      hasStreamService: true,
    });
  });
});
