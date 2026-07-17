import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ApiResponse } from './_lib/http';

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('./_lib/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

import handler from './web-search';

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
  return { response, getStatus: () => statusCode, getBody: () => body };
}

describe('web search endpoint source policy', () => {
  beforeEach(() => {
    vi.stubEnv('TAVILY_API_KEY', 'test-key');
    mocks.checkRateLimit.mockReset();
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 19 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test('returns only bounded evidence from reviewed HTTPS hosts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      results: [
        { content: 'Resultado no verificado', url: 'https://elgato.com.example.test/spec', score: 0.99 },
        { content: 'Resultado oficial', url: 'https://help.elgato.com/spec', score: 0.2 },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
    const result = createResponse();

    await handler({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { query: 'capturadora especificaciones' },
    }, result.response);

    expect(result.getStatus()).toBe(200);
    expect(result.getBody()).toEqual({
      results: ['Resultado oficial'],
      sources: ['https://help.elgato.com/spec'],
    });
  });
});
