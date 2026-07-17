import { getRecommendationFromGroq } from './_lib/groq';
import type { ApiRequest, ApiResponse } from './_lib/http';
import { readBody, requireJsonPost, sendJson } from './_lib/http';
import { checkRateLimit } from './_lib/rate-limit';
import { validateAIRecommendation, validateAIRecommendationRequest } from '../src/shared/validation';
import { getPreferredEncoder, getPreferredRecordingEncoder, getRecordingBitrate } from '../src/shared/localRecommendation';

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store');

  const boundary = requireJsonPost(request);
  if (!boundary.allowed) {
    return sendJson(response, boundary.status, { message: boundary.message });
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

    const preferredStreamEncoder = getPreferredEncoder(validation.value.systemInfo);
    const wantsRecording = validation.value.mode !== 'stream_only';
    const preferredRecordingEncoder = wantsRecording
      ? getPreferredRecordingEncoder(validation.value.systemInfo)
      : preferredStreamEncoder;
    const normalizedRecommendations = {
      ...recommendation.value.recommendations,
      encoder: preferredStreamEncoder,
      recording_encoder: preferredRecordingEncoder,
      recording_bitrate: wantsRecording
        ? getRecordingBitrate(
          recommendation.value.recommendations.recording_resolution,
          recommendation.value.recommendations.fps,
          preferredRecordingEncoder,
        )
        : recommendation.value.recommendations.bitrate,
    };

    response.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
    return sendJson(response, 200, {
      ...recommendation.value,
      recommendations: normalizedRecommendations,
      source: 'ai',
    });
  } catch (error) {
    console.error('Recommendation endpoint failed:', error);
    return sendJson(response, 500, {
      message: 'La IA integrada no pudo generar una recomendacion.',
    });
  }
}
