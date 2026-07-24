import { describe, expect, it } from 'vitest';
import { getLocalConsoleProfile, normalizeConsoleProfileForRequest, resolveConsoleProfileResponse } from './localConsoleProfile';
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
    expect(result.recommendations.canvas_resolution).toBe('3840x2160');
    expect(result.recommendations.resolution).toBe('1920x1080');
    expect(result.recommendations.recording_resolution).toBe('3840x2160');
  });

  it('prioriza capacidades verificadas y encoder Apple sobre una respuesta incorrecta de IA', () => {
    const appleSystem: SystemInfo = {
      cpu: { model: 'Apple M4', cores: 10 },
      gpu: { model: 'Apple M4', vendor: 'Apple', hasNvenc: false },
      ram: { total: 16 },
      os: { platform: 'darwin', distro: 'macOS', release: '15' },
    };
    const request = makeRequest({
      console: 'ps5_pro',
      systemInfo: appleSystem,
      captureMaxResolution: '3840x2160',
      captureMaxFps: 60,
    });
    const aiResponse = getLocalConsoleProfile(request);
    aiResponse.source = 'ai';
    aiResponse.profile.captureResolution = '1920x1080';
    aiResponse.recommendations = {
      ...aiResponse.recommendations,
      canvas_resolution: '1920x1080',
      recording_resolution: '1920x1080',
      encoder: 'nvenc',
      bitrate: 60000,
    };
    aiResponse.reasoning = 'Usa NVENC y considera el monitor como limite de captura.';

    const result = normalizeConsoleProfileForRequest(request, aiResponse);

    expect(result.profile.captureResolution).toBe('3840x2160');
    expect(result.recommendations).toMatchObject({
      canvas_resolution: '3840x2160',
      resolution: '1920x1080',
      recording_resolution: '3840x2160',
      fps: 60,
      encoder: 'apple vt h264',
      recording_encoder: 'apple vt hevc',
      recording_bitrate: 40000,
    });
    expect(result.reasoning).toContain('**stream 1920x1080 a 6000 kbps**');
    expect(result.reasoning).not.toContain('60000 kbps');
    expect(result.reasoning).toContain('**grabacion 3840x2160 con APPLE VT HEVC a 40000 kbps**');
    expect(result.reasoning).toContain('**encoder APPLE VT H264**');
    expect(result.reasoning).not.toContain('NVENC');
    expect(result.profile.bottleneck).toContain('capturadora fija el techo');
  });

  it('completa recomendaciones omitidas por un modelo local sin descartar su perfil', () => {
    const request = makeRequest({
      console: 'ps5_pro',
      captureMaxResolution: '3840x2160',
      captureMaxFps: 60,
    });
    const payload = {
      profile: {
        console: { name: 'PlayStation 5 Pro', identified: true, summary: 'Analizada por IA.' },
        captureCard: { name: 'Elgato 4K X', identified: true, summary: 'Analizada por IA.' },
        monitor: { name: 'Monitor', identified: false, summary: '' },
        bottleneck: 'Sin cuello de botella a 4K60.',
        captureResolution: '3840x2160',
        captureFps: 60,
        consoleSettings: ['Usar 4K60.'],
        sources: [],
      },
    };

    const result = resolveConsoleProfileResponse(request, payload);

    expect(result.source).toBe('ai');
    expect(result.profile.bottleneck).toContain('OBS verifico');
    expect(result.reasoning).toContain('hacen match');
    expect(result.reasoning).toContain('**stream 1920x1080');
    expect(result.reasoning).not.toContain('IA no estuvo disponible');
    expect(result.recommendations).toMatchObject({
      canvas_resolution: '3840x2160',
      resolution: '1920x1080',
      recording_resolution: '3840x2160',
      encoder: 'nvenc',
      recording_encoder: 'nvenc',
      recording_bitrate: 60000,
    });
  });

  it('usa respaldo local completo cuando la IA no devuelve ningun perfil', () => {
    const result = resolveConsoleProfileResponse(makeRequest(), { reasoning: 'sin perfil' });

    expect(result.source).toBe('local');
    expect(result.recommendations.resolution).toBe('1920x1080');
  });
});
