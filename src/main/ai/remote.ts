import type { AIRecommendation, AIRecommendationExplanation, AIRecommendationExplanationRequest, AIRecommendationRequest } from '../../shared/types';
import { validateAIRecommendation, validateAIRecommendationExplanation } from '../../shared/validation';
import { getInstallId } from '../install-id';

const defaultApiUrl = 'https://obsrec.vercel.app';

export class RemoteAIError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'RemoteAIError';
  }
}

function getApiBaseUrl(): string {
  return (process.env.OBSREC_AI_API_URL || defaultApiUrl).replace(/\/+$/, '');
}

async function postToRemoteAI(pathname: string, body: unknown): Promise<unknown> {
  const installId = await getInstallId();
  const response = await fetch(`${getApiBaseUrl()}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-OBSREC-Install-Id': installId,
    },
    body: JSON.stringify(body),
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = typeof payload === 'object'
      && payload !== null
      && 'message' in payload
      && typeof payload.message === 'string'
      ? payload.message
      : 'La IA integrada no esta disponible en este momento.';
    throw new RemoteAIError(message, response.status);
  }

  return payload;
}

export async function getRemoteRecommendation(request: AIRecommendationRequest): Promise<AIRecommendation> {
  const payload = await postToRemoteAI('/api/recommendation', request);
  const validation = validateAIRecommendation(payload);

  if (!validation.success) {
    throw new RemoteAIError(validation.message);
  }

  return {
    ...validation.value,
    source: 'ai',
  };
}

export async function getRemoteRecommendationExplanation(
  request: AIRecommendationExplanationRequest,
): Promise<AIRecommendationExplanation> {
  const payload = await postToRemoteAI('/api/explanation', request);
  const validation = validateAIRecommendationExplanation(payload);

  if (!validation.success) {
    throw new RemoteAIError(validation.message);
  }

  return validation.value;
}

export function getRemoteAIUserMessage(error: unknown): string {
  if (error instanceof RemoteAIError) return error.message;
  return 'La IA integrada no esta disponible en este momento.';
}
