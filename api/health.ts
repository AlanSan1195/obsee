import type { ApiRequest, ApiResponse } from './_lib/http';
import { getAIProvider } from './_lib/ai-provider';
import { sendJson } from './_lib/http';

export default function handler(_request: ApiRequest, response: ApiResponse) {
  const provider = getAIProvider();
  response.setHeader('Cache-Control', 'no-store');
  return sendJson(response, 200, {
    ok: true,
    service: 'obsrec-ai',
    provider,
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    ollamaConfigured: provider === 'ollama',
    rateLimitConfigured: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
  });
}
