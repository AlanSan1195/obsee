import { describe, expect, it } from 'vitest';
import { getLocalConsoleProfile } from './localConsoleProfile';
import type { ConsoleProfileRequest, SystemInfo } from './types';

const systemInfo: SystemInfo = {
  cpu: { model: 'AMD Ryzen 7', cores: 8, speed: 3.8 },
  gpu: { model: 'NVIDIA RTX 4070', vram: 12288, vendor: 'NVIDIA', hasNvenc: true },
  ram: { total: 32 },
  os: { platform: 'win32', distro: 'Windows', release: '11' },
};

function makeRequest(overrides: Partial<ConsoleProfileRequest> = {}): ConsoleProfileRequest {
  return { console: 'ps5', platform: 'twitch', mode: 'stream_record', systemInfo, ...overrides };
}

describe('getLocalConsoleProfile', () => {
  it('marca la capturadora como cuello de botella cuando captura menos que la consola', () => {
    const result = getLocalConsoleProfile(makeRequest({ console: 'ps5', captureCard: 'UGREEN HDMI Capture' }));
    expect(result.source).toBe('local');
    // Capturadora generica → 1080p30 conservador, limita a la PS5 (4K).
    expect(result.profile.captureResolution).toBe('1920x1080');
    expect(result.profile.bottleneck.toLowerCase()).toContain('capturadora');
  });

  it('capa los ajustes de OBS al techo de captura', () => {
    const result = getLocalConsoleProfile(makeRequest({ console: 'ps5', captureCard: 'Generic HDMI Capture' }));
    // Aunque la PC potente daria 1080p60, la captura 1080p30 limita el fps.
    expect(result.recommendations.resolution).toBe('1920x1080');
    expect(result.recommendations.fps).toBeLessThanOrEqual(result.profile.captureFps);
  });

  it('sube fps con capturadoras de marca conocida', () => {
    const generic = getLocalConsoleProfile(makeRequest({ captureCard: 'HDMI Capture' }));
    const elgato = getLocalConsoleProfile(makeRequest({ captureCard: 'Elgato HD60 X' }));
    expect(elgato.profile.captureCard.maxFps).toBeGreaterThan(generic.profile.captureCard.maxFps ?? 0);
  });

  it('identifica la consola y sus capacidades', () => {
    const switch1 = getLocalConsoleProfile(makeRequest({ console: 'switch', captureCard: 'Elgato' }));
    expect(switch1.profile.console.maxResolution).toBe('1920x1080');
    expect(switch1.profile.console.identified).toBe(true);
  });

  it('usa las capacidades reales leidas de OBS por encima del nombre', () => {
    // El nombre sugiere "4K", pero OBS leyo que captura 1080p → manda lo real.
    const result = getLocalConsoleProfile(makeRequest({
      console: 'ps5',
      captureCard: 'Generic 4K HDMI Capture',
      captureMaxResolution: '1920x1080',
      captureMaxFps: 60,
    }));
    expect(result.profile.captureCard.maxResolution).toBe('1920x1080');
    expect(result.profile.captureResolution).toBe('1920x1080');
    expect(result.profile.captureCard.summary.toLowerCase()).toContain('real');
    expect(result.recommendations.resolution).toBe('1920x1080');
  });

  it('reconoce capturadoras 4K60 que no limitan una PS5', () => {
    const result = getLocalConsoleProfile(makeRequest({ console: 'ps5', captureCard: 'Elgato 4K60 capture' }));
    expect(result.profile.captureResolution).toBe('3840x2160');
    expect(result.profile.captureFps).toBe(60);
  });
});
