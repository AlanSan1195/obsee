import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('AI provider', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('AI_PROVIDER', 'ollama');
    vi.stubEnv('OLLAMA_BASE_URL', 'http://127.0.0.1:11434');
    vi.stubEnv('OLLAMA_MODEL', 'gpt-oss:test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test('uses Ollama OpenAI compatibility without a Groq key', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'local-test',
      object: 'chat.completion',
      created: 0,
      model: 'gpt-oss:test',
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: '{"ok":true}' },
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { chatWithAI, getAIProvider } = await import('./ai-provider');
    const result = await chatWithAI([
      { role: 'user', content: 'Return JSON.' },
    ], { temperature: 0.2, maxTokens: 123 });

    expect(getAIProvider()).toBe('ollama');
    expect(result).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'gpt-oss:test',
      max_tokens: 123,
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });
  });

  test('keeps Groq as the safe default provider', async () => {
    vi.stubEnv('AI_PROVIDER', 'unexpected-value');
    const { getAIProvider } = await import('./ai-provider');
    expect(getAIProvider()).toBe('groq');
  });
});
