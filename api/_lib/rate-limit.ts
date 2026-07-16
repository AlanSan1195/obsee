import type { ApiRequest } from './http';
import { getAIProvider } from './ai-provider';
import { getClientIp, getHeader } from './http';

const dailyLimit = Number(process.env.OBSREC_AI_DAILY_LIMIT ?? 20);
const memoryHits = new Map<string, { count: number; resetAt: number }>();

type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; message: string; retryAfterSeconds: number };

function getDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function secondsUntilTomorrow(date = new Date()): number {
  const tomorrow = new Date(date);
  tomorrow.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((tomorrow.getTime() - date.getTime()) / 1000));
}

async function incrementWithUpstash(key: string, ttlSeconds: number): Promise<number | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const response = await fetch(`${url.replace(/\/+$/, '')}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, ttlSeconds],
    ]),
  });

  if (!response.ok) {
    throw new Error('Rate limit storage is unavailable.');
  }

  const payload = await response.json() as [{ result?: number }, { result?: number }];
  const count = Number(payload[0]?.result ?? 0);

  return count;
}

async function incrementMemory(key: string, ttlSeconds: number): Promise<number> {
  const now = Date.now();
  const current = memoryHits.get(key);
  if (!current || current.resetAt <= now) {
    memoryHits.set(key, { count: 1, resetAt: now + ttlSeconds * 1000 });
    return 1;
  }

  current.count += 1;
  return current.count;
}

async function increment(key: string, ttlSeconds: number): Promise<number> {
  const upstashCount = await incrementWithUpstash(key, ttlSeconds);
  if (upstashCount !== null) return upstashCount;
  return incrementMemory(key, ttlSeconds);
}

export async function checkRateLimit(request: ApiRequest): Promise<RateLimitResult> {
  if (getAIProvider() === 'ollama') {
    return { allowed: true, remaining: Number.MAX_SAFE_INTEGER };
  }

  const installId = getHeader(request, 'x-obsrec-install-id').trim() || 'missing-install-id';
  const ip = getClientIp(request);
  const ttlSeconds = secondsUntilTomorrow();
  const dayKey = getDayKey();
  const keys = [
    `obsrec-ai:${dayKey}:install:${installId}`,
    `obsrec-ai:${dayKey}:ip:${ip}`,
  ];

  try {
    const counts = await Promise.all(keys.map((key) => increment(key, ttlSeconds)));
    const maxCount = Math.max(...counts);

    if (maxCount > dailyLimit) {
      return {
        allowed: false,
        message: `Limite diario de IA integrada alcanzado (${dailyLimit} solicitudes). obsee usara la recomendacion local hasta manana.`,
        retryAfterSeconds: ttlSeconds,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, dailyLimit - maxCount),
    };
  } catch {
    return {
      allowed: false,
      message: 'La IA integrada no pudo verificar el limite de uso. obsee usara la recomendacion local para proteger costos.',
      retryAfterSeconds: ttlSeconds,
    };
  }
}
