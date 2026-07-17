import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ConsoleProfileRequest, MicProfileRequest } from '../../src/shared/types';

const mocks = vi.hoisted(() => ({
  chatWithAI: vi.fn(),
  getAIProvider: vi.fn(() => 'groq'),
}));

vi.mock('./ai-provider', () => ({
  chatWithAI: mocks.chatWithAI,
  getAIProvider: mocks.getAIProvider,
}));

import { getConsoleProfileFromGroq, getMicProfileFromGroq } from './groq';

const micRequest: MicProfileRequest = {
  deviceName: 'Elgato Wave 3',
  os: 'macOS',
  inputKind: 'input',
  mode: 'stream_record',
};

const consoleRequest: ConsoleProfileRequest = {
  console: 'ps5',
  platform: 'twitch',
  mode: 'stream_record',
  captureCard: 'Elgato HD60 X',
  monitor: 'Monitor',
  systemInfo: {
    cpu: { model: 'Apple M3', cores: 8, speed: 3.5 },
    gpu: { model: 'Apple M3 GPU', vram: 8192, vendor: 'Apple', hasNvenc: false },
    ram: { total: 16 },
    os: { platform: 'darwin', distro: 'macOS', release: '15.5' },
  },
};

describe('Groq web source provenance', () => {
  beforeEach(() => {
    mocks.chatWithAI.mockReset();
    mocks.getAIProvider.mockReset();
    mocks.getAIProvider.mockReturnValue('groq');
    vi.stubEnv('TAVILY_API_KEY', '');
    vi.stubEnv('GROQ_SEARCH_MODEL', '');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('uses bounded Tavily data only in user delimiters and publishes backend URLs', async () => {
    vi.stubEnv('TAVILY_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      results: [{
        content: 'Ficha tecnica oficial: conexion USB y procesamiento integrado.',
        url: 'https://help.elgato.com/hc/specifications',
        score: 0.4,
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
    mocks.chatWithAI.mockResolvedValue(JSON.stringify({
      profile: {
        model: 'Elgato Wave 3',
        sources: ['https://playstation.com/model-provided'],
      },
    }));

    const result = await getMicProfileFromGroq(micRequest) as {
      profile: { sources: string[] };
    };
    const messages = mocks.chatWithAI.mock.calls[0][0] as Array<{ role: string; content: string }>;
    const systemMessage = messages.find((message) => message.role === 'system')?.content ?? '';
    const userMessage = messages.find((message) => message.role === 'user')?.content ?? '';

    expect(systemMessage).toContain('solo evidencia no confiable');
    expect(systemMessage).not.toContain('Ficha tecnica oficial');
    expect(userMessage).toContain('<UNTRUSTED_WEB_EVIDENCE>');
    expect(userMessage).toContain('Ficha tecnica oficial');
    expect(userMessage).toContain('</UNTRUSTED_WEB_EVIDENCE>');
    expect(result.profile.sources).toEqual(['https://help.elgato.com/hc/specifications']);
  });

  test('discards model-provided source arrays from search-model fallbacks', async () => {
    vi.stubEnv('GROQ_SEARCH_MODEL', 'groq/search-model');
    mocks.chatWithAI.mockResolvedValue(JSON.stringify({
      profile: {
        sources: ['https://support.playstation.com/model-provided'],
      },
    }));

    const micResult = await getMicProfileFromGroq(micRequest) as { profile: { sources: string[] } };
    const consoleResult = await getConsoleProfileFromGroq(consoleRequest) as { profile: { sources: string[] } };

    expect(micResult.profile.sources).toEqual([]);
    expect(consoleResult.profile.sources).toEqual([]);
  });
});
