import { getConsoleProfileFromGroq } from './_lib/groq';
import type { ApiRequest, ApiResponse } from './_lib/http';
import { readBody, requireJsonPost, sendJson } from './_lib/http';
import { checkRateLimit } from './_lib/rate-limit';
import { resolveConsoleProfileResponse } from '../src/shared/localConsoleProfile';
import { validateConsoleProfileRequest, validateConsoleProfileResponse } from '../src/shared/validation';

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
    const validation = validateConsoleProfileRequest(readBody(request));
    if (!validation.success) {
      return sendJson(response, 400, { message: validation.message });
    }

    const aiPayload = await getConsoleProfileFromGroq(validation.value);
    const rawProfile = validateConsoleProfileResponse(aiPayload);
    if (!rawProfile.success) {
      console.warn(`[console-profile] Respuesta parcial de IA; completando campos localmente: ${rawProfile.message}`);
    }
    const profile = resolveConsoleProfileResponse(validation.value, aiPayload);
    const sourceCount = profile.profile.sources?.length ?? 0;
    const research = {
      status: sourceCount > 0
        ? 'verified' as const
        : process.env.TAVILY_API_KEY
          ? 'no_results' as const
          : 'unavailable' as const,
      provider: sourceCount > 0 && !process.env.TAVILY_API_KEY
        ? 'ai_search' as const
        : process.env.TAVILY_API_KEY
          ? 'tavily' as const
          : undefined,
      sourceCount,
    };

    response.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
    return sendJson(response, 200, {
      ...profile,
      profile: {
        ...profile.profile,
        research,
      },
    });
  } catch (error) {
    console.error('Console profile endpoint failed:', error);
    return sendJson(response, 500, {
      message: 'La IA integrada no pudo analizar la consola.',
    });
  }
}
