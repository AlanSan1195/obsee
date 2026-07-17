import { describe, expect, it } from 'vitest';
import { getLocalRecommendation, getLocalRecommendationExplanation } from './localRecommendation';
import type { AIRecommendationExplanationRequest, AIRecommendationRequest, SystemInfo } from './types';

type SystemInfoOverrides = {
  cpu?: Partial<SystemInfo['cpu']>;
  gpu?: Partial<SystemInfo['gpu']>;
  ram?: Partial<SystemInfo['ram']>;
  os?: Partial<SystemInfo['os']>;
};

type RequestOverrides = Partial<Omit<AIRecommendationRequest, 'systemInfo'>> & {
  systemInfo?: SystemInfoOverrides;
};

function makeRequest(overrides: RequestOverrides = {}): AIRecommendationRequest {
  const base: AIRecommendationRequest = {
    mode: 'stream_record',
    platform: 'twitch',
    systemInfo: {
      cpu: {
        model: 'AMD Ryzen 7',
        cores: 8,
        speed: 3.8,
      },
      gpu: {
        model: 'NVIDIA RTX',
        vram: 8192,
        vendor: 'NVIDIA',
        hasNvenc: true,
      },
      ram: {
        total: 16,
      },
      os: {
        platform: 'darwin',
        distro: 'macOS',
        release: '15',
      },
    },
  };

  return {
    ...base,
    ...overrides,
    systemInfo: {
      ...base.systemInfo,
      ...overrides.systemInfo,
      cpu: { ...base.systemInfo.cpu, ...overrides.systemInfo?.cpu },
      gpu: { ...base.systemInfo.gpu, ...overrides.systemInfo?.gpu },
      ram: { ...base.systemInfo.ram, ...overrides.systemInfo?.ram },
      os: { ...base.systemInfo.os, ...overrides.systemInfo?.os },
    },
  };
}

describe('getLocalRecommendation', () => {
  it('recomienda 1080p60 para hardware potente en Twitch', () => {
    const result = getLocalRecommendation(makeRequest()).recommendations;

    expect(result.resolution).toBe('1920x1080');
    expect(result.fps).toBe(60);
    expect(result.bitrate).toBe(6000);
    expect(result.encoder).toBe('nvenc');
  });

  it('marca la recomendacion como respaldo local', () => {
    const result = getLocalRecommendation(makeRequest());

    expect(result.source).toBe('local');
    expect(result.reasoning).toBe('Recomendacion local generada a partir de los nucleos de CPU, la RAM, el proveedor de GPU, la plataforma y el modo seleccionados (la IA no estuvo disponible).');
  });

  it('sube bitrate en YouTube cuando tambien se graba', () => {
    const result = getLocalRecommendation(makeRequest({ platform: 'youtube' })).recommendations;

    expect(result.bitrate).toBe(9000);
  });

  it('baja a 720p30 en CPU o RAM limitada', () => {
    const cpuLimited = getLocalRecommendation(makeRequest({
      systemInfo: {
        cpu: { cores: 4 },
        gpu: { model: 'Unknown', vendor: 'Unknown', hasNvenc: false },
      },
    })).recommendations;
    const ramLimited = getLocalRecommendation(makeRequest({ systemInfo: { ram: { total: 8 } } })).recommendations;
    const youtubeLimited = getLocalRecommendation(makeRequest({
      platform: 'youtube',
      systemInfo: {
        cpu: { cores: 4 },
        gpu: { model: 'Unknown', vendor: 'Unknown', hasNvenc: false },
      },
    })).recommendations;

    expect(cpuLimited).toMatchObject({ resolution: '1280x720', fps: 30, bitrate: 3500 });
    expect(ramLimited).toMatchObject({ resolution: '1280x720', fps: 30, bitrate: 3500 });
    expect(youtubeLimited).toMatchObject({ resolution: '1280x720', fps: 30, bitrate: 4500 });
  });

  it.each([
    ['Apple', 'Apple M4', false, 'apple vt h264'],
    ['NVIDIA', 'NVIDIA RTX', true, 'nvenc'],
    ['Intel', 'Intel Arc', false, 'qsv'],
    ['AMD', 'AMD Radeon', false, 'amd'],
  ])('mantiene 1080p60 con encoder de hardware %s aunque el CPU tenga 6 nucleos', (vendor, model, hasNvenc, encoder) => {
    const result = getLocalRecommendation(makeRequest({
      systemInfo: {
        cpu: { cores: 6 },
        gpu: { vendor, model, hasNvenc },
      },
    })).recommendations;

    expect(result).toMatchObject({ resolution: '1920x1080', fps: 60, encoder });
  });

  it('mantiene el umbral de CPU para x264 y el de RAM para cualquier encoder', () => {
    const x264Limited = getLocalRecommendation(makeRequest({
      systemInfo: {
        cpu: { cores: 6 },
        gpu: { model: 'Unknown', vendor: 'Unknown', hasNvenc: false },
      },
    })).recommendations;
    const x264Capable = getLocalRecommendation(makeRequest({
      systemInfo: {
        cpu: { cores: 8 },
        gpu: { model: 'Unknown', vendor: 'Unknown', hasNvenc: false },
      },
    })).recommendations;
    const appleRamLimited = getLocalRecommendation(makeRequest({
      systemInfo: {
        cpu: { cores: 10 },
        gpu: { model: 'Apple M4', vendor: 'Apple', hasNvenc: false },
        ram: { total: 8 },
      },
    })).recommendations;

    expect(x264Limited).toMatchObject({ resolution: '1280x720', fps: 30, encoder: 'x264' });
    expect(x264Capable).toMatchObject({ resolution: '1920x1080', fps: 60, encoder: 'x264' });
    expect(appleRamLimited).toMatchObject({ resolution: '1280x720', fps: 30, encoder: 'apple vt h264' });
  });

  it('elige encoder por proveedor de GPU', () => {
    expect(getLocalRecommendation(makeRequest({
      systemInfo: { gpu: { vendor: 'Apple', model: 'Apple M3', hasNvenc: false } },
    })).recommendations.encoder).toBe('apple vt h264');
    expect(getLocalRecommendation(makeRequest({
      systemInfo: { gpu: { vendor: 'Intel', hasNvenc: false } },
    })).recommendations.encoder).toBe('qsv');
    expect(getLocalRecommendation(makeRequest({
      systemInfo: { gpu: { vendor: 'AMD', hasNvenc: false } },
    })).recommendations.encoder).toBe('amd');
    expect(getLocalRecommendation(makeRequest({
      systemInfo: { gpu: { vendor: 'Unknown', hasNvenc: false } },
    })).recommendations.encoder).toBe('x264');
  });

  it('respeta la config base de OBS cuando el hardware la soporta', () => {
    const result = getLocalRecommendation(makeRequest({
      currentSettings: { resolution: '2560x1440', fps: 30, encoder: 'x264', bitrate: 12000, recordingQuality: 'high', hasStreamService: true },
    }));

    // 1440p30 cabe dentro del techo 1080p60, asi que se respeta la config del usuario.
    expect(result.recommendations.resolution).toBe('2560x1440');
    expect(result.recommendations.fps).toBe(30);
    expect(result.recommendations.bitrate).toBe(12000);
    // El encoder se ajusta al optimo del hardware (NVENC), no al x264 que tenia OBS.
    expect(result.recommendations.encoder).toBe('nvenc');
    expect(result.reasoning).toContain('configuracion que OBS ya tenia');
  });

  it('ignora la config base si supera lo que el hardware sostiene', () => {
    const result = getLocalRecommendation(makeRequest({
      currentSettings: { resolution: '3840x2160', fps: 60, encoder: 'x264', bitrate: 40000, recordingQuality: 'high', hasStreamService: true },
    })).recommendations;

    // 4K60 excede el techo, cae al perfil seguro por hardware.
    expect(result.resolution).toBe('1920x1080');
    expect(result.fps).toBe(60);
  });

  it('usa calidad alta cuando el modo incluye grabacion', () => {
    expect(getLocalRecommendation(makeRequest({ mode: 'record_only' })).recommendations.recording_quality).toBe('high');
    expect(getLocalRecommendation(makeRequest({ mode: 'stream_record' })).recommendations.recording_quality).toBe('high');
    expect(getLocalRecommendation(makeRequest({ mode: 'stream_only' })).recommendations.recording_quality).toBe('stream');
  });

  it('separa encoder y bitrate de grabacion en Apple Silicon', () => {
    const recording = getLocalRecommendation(makeRequest({
      systemInfo: { gpu: { vendor: 'Apple', model: 'Apple M4', hasNvenc: false } },
    })).recommendations;
    const streamOnly = getLocalRecommendation(makeRequest({
      mode: 'stream_only',
      systemInfo: { gpu: { vendor: 'Apple', model: 'Apple M4', hasNvenc: false } },
    })).recommendations;

    expect(recording).toMatchObject({
      encoder: 'apple vt h264',
      bitrate: 6000,
      recording_encoder: 'apple vt hevc',
      recording_bitrate: 12000,
    });
    expect(streamOnly.recording_encoder).toBe(streamOnly.encoder);
    expect(streamOnly.recording_bitrate).toBe(streamOnly.bitrate);
  });
});

describe('getLocalRecommendationExplanation', () => {
  it('explica cambios manuales contra la recomendacion original', () => {
    const request = makeRequest({ platform: 'youtube' });
    const originalRecommendations = getLocalRecommendation(request).recommendations;
    const explanationRequest: AIRecommendationExplanationRequest = {
      ...request,
      originalRecommendations,
      currentRecommendations: {
        ...originalRecommendations,
        resolution: '2560x1440',
        bitrate: 8000,
      },
      changedFields: ['resolution', 'bitrate'],
    };

    const explanation = getLocalRecommendationExplanation(explanationRequest);

    expect(explanation.source).toBe('local');
    expect(explanation.reasoning).toContain('resolucion del stream: 1920X1080 -> 2560X1440');
    expect(explanation.reasoning).toContain('bitrate del stream: 9000 -> 8000');
    expect(explanation.reasoning).toContain('carga de video sube');
  });
});
