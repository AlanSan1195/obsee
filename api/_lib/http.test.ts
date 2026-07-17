import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ApiRequest, ApiResponse } from './http';
import { requireJsonPost } from './http';

const endpointMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getRecommendationFromGroq: vi.fn(),
}));

vi.mock('./rate-limit', () => ({
  checkRateLimit: endpointMocks.checkRateLimit,
}));

vi.mock('./groq', () => ({
  getRecommendationFromGroq: endpointMocks.getRecommendationFromGroq,
}));

import recommendationHandler from '../recommendation';

function request(headers: ApiRequest['headers'] = {}): ApiRequest {
  return { method: 'POST', headers };
}

function createResponse() {
  let statusCode = 200;
  let body: unknown;
  const response: ApiResponse = {
    status: vi.fn((code: number) => {
      statusCode = code;
      return response;
    }),
    json: vi.fn((value: unknown) => {
      body = value;
    }),
    setHeader: vi.fn(),
  };

  return {
    response,
    getStatus: () => statusCode,
    getBody: () => body,
  };
}

describe('JSON request boundary', () => {
  beforeEach(() => {
    endpointMocks.checkRateLimit.mockReset();
    endpointMocks.getRecommendationFromGroq.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('allows canonical same-origin JSON POST requests', () => {
    expect(requireJsonPost(request({
      'content-type': 'application/json',
      origin: 'https://obsee.vercel.app',
    }))).toEqual({ allowed: true });
  });

  test('allows JSON parameters and exact configured origins', () => {
    vi.stubEnv('OBSREC_ALLOWED_ORIGINS', 'https://preview.example.com,not a URL,https://ignored.example/path');

    expect(requireJsonPost(request({
      'content-type': 'Application/JSON; Charset=UTF-8',
      origin: 'https://preview.example.com',
    }))).toEqual({ allowed: true });
  });

  test.each([
    undefined,
    'text/plain',
    'application/x-www-form-urlencoded',
    'multipart/form-data; boundary=example',
  ])('rejects unsupported content type %s', (contentType) => {
    const headers = contentType ? { 'content-type': contentType } : {};
    expect(requireJsonPost(request(headers))).toMatchObject({ allowed: false, status: 415 });
  });

  test.each([
    'https://obsee.vercel.app.evil.test',
    'https://evil-obsee.vercel.app',
    'https://obsee.vercel.app/path',
    'not an origin',
    'null',
  ])('rejects hostile or malformed origin %s', (origin) => {
    expect(requireJsonPost(request({
      'content-type': 'application/json',
      origin,
    }))).toMatchObject({ allowed: false, status: 403 });
  });

  test('allows no-Origin JSON clients such as the CLI smoke test', () => {
    expect(requireJsonPost(request({ 'content-type': 'application/json' }))).toEqual({ allowed: true });
  });

  test('rejects non-POST methods before other checks', () => {
    expect(requireJsonPost({ method: 'GET', headers: {} })).toMatchObject({ allowed: false, status: 405 });
  });

  test('rejects a request before rate limiting or provider work', async () => {
    const result = createResponse();

    await recommendationHandler({
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    }, result.response);

    expect(result.getStatus()).toBe(415);
    expect(result.getBody()).toEqual({ message: 'Content-Type must be application/json.' });
    expect(endpointMocks.checkRateLimit).not.toHaveBeenCalled();
    expect(endpointMocks.getRecommendationFromGroq).not.toHaveBeenCalled();
  });

  test('returns the safe 502 path for unsupported AI-controlled OBS values', async () => {
    endpointMocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 19 });
    endpointMocks.getRecommendationFromGroq.mockResolvedValue({
      recommendations: {
        resolution: '1920x1080',
        fps: 60,
        encoder: 'custom encoder',
        bitrate: 6000,
        audio_bitrate: 320,
        recording_format: 'mkv',
        recording_quality: 'high',
      },
      reasoning: 'Resultado de prueba.',
    });
    const result = createResponse();

    await recommendationHandler({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: {
        systemInfo: {
          cpu: { model: 'Apple M3', cores: 8, speed: 3.5 },
          gpu: { model: 'Apple M3 GPU', vram: 8192, vendor: 'Apple', hasNvenc: false },
          ram: { total: 16 },
          os: { platform: 'darwin', distro: 'macOS', release: '15.5' },
        },
        mode: 'stream_record',
        platform: 'twitch',
      },
    }, result.response);

    expect(result.getStatus()).toBe(502);
    expect(result.getBody()).toEqual({ message: 'AI recommendation has unsupported encoder.' });
  });
});
