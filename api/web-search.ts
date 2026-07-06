import type { ApiRequest, ApiResponse } from './_lib/http';
import { readBody, sendJson } from './_lib/http';
import { checkRateLimit } from './_lib/rate-limit';

// Dominios confiables: oficiales, manuales, retailers conocidos
const trustedDomains = [
  // Oficiales y manuales
  'support.', 'manual.', 'manuals.', 'specs.', 'specifications.',
  'ugreen.', 'elgato.', 'avermedia.', 'razer.', 'cam-link.',
  // Retailers grandes
  'amazon.', 'mercadolibre.', 'aliexpress.', 'newegg.', 'bhphotovideo.',
  'adorama.', 'b&h.', 'sweetwater.', 'bestbuy.', 'walmart.',
  // Profesionales de specs/reviews
  'rtings.', 'techpowerup.', 'anandtech.', 'overclock.net',
];

function isUrlTrusted(url: string): boolean {
  const domain = new URL(url).hostname.toLowerCase();
  return trustedDomains.some((trusted) => domain.includes(trusted));
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    return sendJson(response, 405, { message: 'Method not allowed.' });
  }

  const rateLimit = await checkRateLimit(request);
  if (!rateLimit.allowed) {
    response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
    return sendJson(response, 429, { message: rateLimit.message });
  }

  const body = readBody(request);
  const query = typeof body === 'object' && body !== null ? (body as { query?: unknown }).query : undefined;
  if (typeof query !== 'string' || query.trim().length === 0 || query.length > 300) {
    return sendJson(response, 400, { message: 'Falta la consulta de busqueda.' });
  }

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return sendJson(response, 200, { results: [], sources: [] });
  }

  try {
    const tavilyResponse = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: 8, // Buscar más para filtrar después
        include_answer: false,
      }),
    });

    if (!tavilyResponse.ok) {
      console.warn(`[web-search] Tavily API error: ${tavilyResponse.status}`);
      return sendJson(response, 200, { results: [], sources: [] });
    }

    const data = (await tavilyResponse.json()) as { results?: Array<{ content: string; url: string }> };
    const trusted = (data.results ?? []).filter((r) => isUrlTrusted(r.url));

    response.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
    return sendJson(response, 200, {
      results: trusted.map((r) => r.content),
      sources: trusted.map((r) => r.url),
    });
  } catch (error) {
    console.warn('[web-search] Failed:', error instanceof Error ? error.message : error);
    return sendJson(response, 200, { results: [], sources: [] });
  }
}
