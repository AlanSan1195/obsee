import { getConsoleProfileFromGroq } from './_lib/groq';
import type { ApiRequest, ApiResponse } from './_lib/http';
import { readBody, sendJson } from './_lib/http';
import { checkRateLimit } from './_lib/rate-limit';
import { validateConsoleProfileRequest, validateConsoleProfileResponse } from '../src/shared/validation';

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

  try {
    const validation = validateConsoleProfileRequest(readBody(request));
    if (!validation.success) {
      return sendJson(response, 400, { message: validation.message });
    }

    const aiPayload = await getConsoleProfileFromGroq(validation.value);
    const profile = validateConsoleProfileResponse(aiPayload);
    if (!profile.success) {
      return sendJson(response, 502, { message: profile.message });
    }

    response.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
    return sendJson(response, 200, {
      ...profile.value,
      source: 'ai',
    });
  } catch (error) {
    console.error('Console profile endpoint failed:', error);
    return sendJson(response, 500, {
      message: 'La IA integrada no pudo analizar la consola.',
    });
  }
}
