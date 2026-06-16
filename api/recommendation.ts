import { getRecommendationFromGroq } from './_lib/groq';
import type { ApiRequest, ApiResponse } from './_lib/http';
import { readBody, sendJson } from './_lib/http';
import { checkRateLimit } from './_lib/rate-limit';
import { validateAIRecommendation, validateAIRecommendationRequest } from '../src/shared/validation';

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
    const validation = validateAIRecommendationRequest(readBody(request));
    if (!validation.success) {
      return sendJson(response, 400, { message: validation.message });
    }

    const aiPayload = await getRecommendationFromGroq(validation.value);
    const recommendation = validateAIRecommendation(aiPayload);
    if (!recommendation.success) {
      return sendJson(response, 502, { message: recommendation.message });
    }

    response.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
    return sendJson(response, 200, {
      ...recommendation.value,
      source: 'ai',
    });
  } catch (error) {
    console.error('Recommendation endpoint failed:', error);
    return sendJson(response, 500, {
      message: 'La IA integrada no pudo generar una recomendacion.',
    });
  }
}
