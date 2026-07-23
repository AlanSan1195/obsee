import { describe, expect, it } from 'vitest';
import { parseGoal } from './goalParser';

describe('parseGoal', () => {
  it('interpreta una peticion completa de consola, stream y grabacion', () => {
    const result = parseGoal(
      'Quiero streamear en YouTube a 1080p y grabar mi PS5 Pro en 4K a 60fps. '
      + 'Mi equipo es una Mac mini M4 con 10 nucleos y 16 GB de RAM, '
      + 'capturadora Elgato 4K X y monitor LG C2.',
    );

    expect(result).toMatchObject({
      mode: 'stream_record',
      platform: 'youtube',
      consoleModel: 'ps5_pro',
      hardware: {
        cpuModel: 'Apple M4',
        cpuCores: 10,
        ramGb: 16,
      },
      preferences: {
        streamResolution: '1920x1080',
        recordingResolution: '3840x2160',
        fps: 60,
        source: 'console',
      },
    });
    expect(result.captureCard).toContain('Elgato 4K X');
    expect(result.monitor).toContain('LG C2');
  });

  it('distingue grabacion local sin plataforma', () => {
    const result = parseGoal('Solo quiero grabar gameplays a 1440p 60fps con mi Ryzen 7 7800X.');

    expect(result.mode).toBe('record_only');
    expect(result.platform).toBeNull();
    expect(result.preferences.recordingResolution).toBe('2560x1440');
    expect(result.hardware.cpuModel).toBe('Ryzen 7 7800X');
  });

  it('no inventa modo ni plataforma cuando la frase es ambigua', () => {
    const result = parseGoal('Quiero que OBS se vea mejor con mi computadora.');

    expect(result.mode).toBeNull();
    expect(result.platform).toBeNull();
  });

  it('entiende notacion compacta como 1080p60 y 4K60', () => {
    const result = parseGoal('Transmitir en Twitch a 1080p60 y grabar a 4K60.');

    expect(result.preferences).toMatchObject({
      streamResolution: '1920x1080',
      recordingResolution: '3840x2160',
      fps: 60,
    });
  });
});
