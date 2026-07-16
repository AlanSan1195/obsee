import Groq from 'groq-sdk';
import type { AIServiceMessage } from '../../src/shared/types';

export type AIProvider = 'groq' | 'ollama';

export type ChatOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number | null;
};

let client: Groq | null = null;
let clientKey = '';

export function getAIProvider(): AIProvider {
  return process.env.AI_PROVIDER?.trim().toLowerCase() === 'ollama' ? 'ollama' : 'groq';
}

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY || '';
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured on the backend.');
  }

  if (!client || clientKey !== apiKey) {
    client = new Groq({
      apiKey,
      timeout: 60_000,
    });
    clientKey = apiKey;
  }

  return client;
}

function getOllamaTimeoutMs(): number {
  const value = Number(process.env.OLLAMA_TIMEOUT_MS || 120_000);
  return Number.isFinite(value) && value > 0 ? value : 120_000;
}

async function chatWithOllama(
  messages: AIServiceMessage[],
  options: ChatOptions,
): Promise<string> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const apiUrl = baseUrl.endsWith('/v1')
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/v1/chat/completions`;
  const maxTokens = options.maxTokens === undefined ? 4000 : options.maxTokens;
  const timeoutMs = getOllamaTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        model: process.env.OLLAMA_MODEL || 'gpt-oss:20b',
        temperature: options.temperature ?? 0.7,
        ...(maxTokens === null ? {} : { max_tokens: maxTokens }),
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Ollama returned ${response.status}${detail ? `: ${detail}` : ''}`);
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    return payload.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timeout);
  }
}

export async function chatWithAI(
  messages: AIServiceMessage[],
  options: ChatOptions = {},
): Promise<string> {
  const provider = getAIProvider();
  if (provider === 'ollama') {
    return chatWithOllama(messages, options);
  }

  const maxTokens = options.maxTokens === undefined ? 4000 : options.maxTokens;
  const model = options.model || process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

  const completion = await getGroqClient().chat.completions.create({
    messages,
    model,
    temperature: options.temperature ?? 0.7,
    ...(maxTokens === null ? {} : { max_tokens: maxTokens }),
  });

  return completion.choices[0]?.message?.content ?? '';
}
