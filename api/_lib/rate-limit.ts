import { isIP } from 'node:net';
import type { ApiRequest } from './http';
import { getAIProvider } from './ai-provider';
import { getClientIp, getHeader } from './http';

const DEFAULT_DAILY_LIMIT = 20;
const MAX_DAILY_LIMIT = 1000;
const MISSING_INSTALL_ID = 'missing-install-id';
const UNKNOWN_IP = 'unknown';
const RANDOM_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

export function parseDailyLimit(value: string | undefined): number {
  if (!value?.trim()) return DEFAULT_DAILY_LIMIT;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_DAILY_LIMIT) {
    return DEFAULT_DAILY_LIMIT;
  }

  return parsed;
}

function normalizeInstallId(value: string): string {
  const normalized = value.trim().toLowerCase();
  return RANDOM_UUID_PATTERN.test(normalized) ? normalized : MISSING_INSTALL_ID;
}

function normalizeClientIp(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 64 || isIP(normalized) === 0) return UNKNOWN_IP;
  return normalized;
}

function getUpstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url?.trim() || !token?.trim()) return null;
  return { url: url.trim(), token: token.trim() };
}

function canUseMemoryRateLimit(): boolean {
  const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  return !isProduction && process.env.OBSREC_ALLOW_MEMORY_RATE_LIMIT?.trim().toLowerCase() === 'true';
}

async function incrementWithUpstash(
  key: string,
  ttlSeconds: number,
  config: { url: string; token: string },
): Promise<number> {
  const response = await fetch(`${config.url.replace(/\/+$/, '')}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
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

  const payload = await response.json() as unknown;
  if (!Array.isArray(payload)) {
    throw new Error('Rate limit storage returned an invalid response.');
  }

  const count = Number((payload[0] as { result?: unknown } | undefined)?.result);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Rate limit storage returned an invalid count.');
  }

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
  const upstash = getUpstashConfig();
  if (upstash) return incrementWithUpstash(key, ttlSeconds, upstash);
  if (canUseMemoryRateLimit()) return incrementMemory(key, ttlSeconds);
  throw new Error('Distributed rate limit storage is required.');
}

export async function checkRateLimit(request: ApiRequest): Promise<RateLimitResult> {
  if (getAIProvider() === 'ollama') {
    return { allowed: true, remaining: Number.MAX_SAFE_INTEGER };
  }

  const dailyLimit = parseDailyLimit(process.env.OBSREC_AI_DAILY_LIMIT);
  const installId = normalizeInstallId(getHeader(request, 'x-obsrec-install-id'));
  const ip = normalizeClientIp(getClientIp(request));
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
