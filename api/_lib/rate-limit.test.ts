import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ApiRequest } from './http';

const VALID_INSTALL_ID = '123e4567-e89b-42d3-a456-426614174000';

function request(installId = VALID_INSTALL_ID, ip = '203.0.113.10'): ApiRequest {
  return {
    method: 'POST',
    headers: {
      'x-obsrec-install-id': installId,
      'x-forwarded-for': ip,
    },
  };
}

function configureRemoteProvider() {
  vi.stubEnv('AI_PROVIDER', 'groq');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('OBSREC_AI_DAILY_LIMIT', '20');
  vi.stubEnv('OBSREC_ALLOW_MEMORY_RATE_LIMIT', 'false');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
}

function configureUpstash() {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://upstash.example');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'upstash-secret');
}

function successfulPipelineResponse(count = 1) {
  return new Response(JSON.stringify([{ result: count }, { result: 1 }]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('distributed rate limit', () => {
  beforeEach(() => {
    vi.resetModules();
    configureRemoteProvider();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test('Ollama bypasses remote storage', async () => {
    vi.stubEnv('AI_PROVIDER', 'ollama');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { checkRateLimit } = await import('./rate-limit');

    await expect(checkRateLimit(request())).resolves.toEqual({
      allowed: true,
      remaining: Number.MAX_SAFE_INTEGER,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    ['', ''],
    ['https://upstash.example', ''],
    ['', 'upstash-secret'],
  ])('fails closed in production with incomplete Upstash configuration', async (url, token) => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', url);
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', token);
    const { checkRateLimit } = await import('./rate-limit');

    const result = await checkRateLimit(request());
    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('Expected a fail-closed result.');
    expect(result.message).toContain('no pudo verificar el limite');
  });

  test('explicit local memory fallback enforces the configured limit', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('OBSREC_ALLOW_MEMORY_RATE_LIMIT', 'true');
    vi.stubEnv('OBSREC_AI_DAILY_LIMIT', '1');
    const { checkRateLimit } = await import('./rate-limit');

    await expect(checkRateLimit(request())).resolves.toMatchObject({ allowed: true, remaining: 0 });
    await expect(checkRateLimit(request())).resolves.toMatchObject({ allowed: false });
  });

  test('Vercel ignores the local memory opt-in', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('OBSREC_ALLOW_MEMORY_RATE_LIMIT', 'true');
    const { checkRateLimit } = await import('./rate-limit');

    await expect(checkRateLimit(request())).resolves.toMatchObject({ allowed: false });
  });

  test('invalid daily limits use the safe default', async () => {
    const { parseDailyLimit } = await import('./rate-limit');

    expect(parseDailyLimit(undefined)).toBe(20);
    expect(parseDailyLimit('')).toBe(20);
    expect(parseDailyLimit('0')).toBe(20);
    expect(parseDailyLimit('-1')).toBe(20);
    expect(parseDailyLimit('1.5')).toBe(20);
    expect(parseDailyLimit('1001')).toBe(20);
    expect(parseDailyLimit('not-a-number')).toBe(20);
    expect(parseDailyLimit('1000')).toBe(1000);
  });

  test('fetch failures and malformed Upstash responses fail closed', async () => {
    configureUpstash();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValue(new Response(JSON.stringify([{ result: 0 }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const { checkRateLimit } = await import('./rate-limit');

    await expect(checkRateLimit(request())).resolves.toMatchObject({ allowed: false });

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ result: 0 }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    await expect(checkRateLimit(request())).resolves.toMatchObject({ allowed: false });
  });

  test('normalizes bounded identifiers before creating Upstash keys', async () => {
    configureUpstash();
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => (
      successfulPipelineResponse()
    ));
    vi.stubGlobal('fetch', fetchMock);
    const { checkRateLimit } = await import('./rate-limit');

    await checkRateLimit(request(VALID_INSTALL_ID.toUpperCase(), '203.0.113.10'));
    await checkRateLimit(request('x'.repeat(500), 'not-an-ip'));

    const keys = fetchMock.mock.calls.map(([, init]) => {
      const pipeline = JSON.parse(String(init?.body)) as Array<[string, string]>;
      return pipeline[0][1];
    });

    expect(keys.some((key) => key.endsWith(`:install:${VALID_INSTALL_ID}`))).toBe(true);
    expect(keys.some((key) => key.endsWith(':install:missing-install-id'))).toBe(true);
    expect(keys.some((key) => key.endsWith(':ip:203.0.113.10'))).toBe(true);
    expect(keys.some((key) => key.endsWith(':ip:unknown'))).toBe(true);
    expect(keys.join('\n')).not.toContain('x'.repeat(100));
    expect(keys.join('\n')).not.toContain('not-an-ip');
  });

  test('does not expose storage tokens or identifiers in fail-closed messages', async () => {
    configureUpstash();
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token-must-stay-private');
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error(`token-must-stay-private ${VALID_INSTALL_ID}`);
    }));
    const { checkRateLimit } = await import('./rate-limit');

    const result = await checkRateLimit(request());
    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('Expected a fail-closed result.');
    expect(result.message).not.toContain('token-must-stay-private');
    expect(result.message).not.toContain(VALID_INSTALL_ID);
  });
});
