export type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  socket?: {
    remoteAddress?: string;
  };
};

export type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

type RequestBoundaryResult =
  | { allowed: true }
  | { allowed: false; status: 403 | 405 | 415; message: string };

const DEFAULT_ALLOWED_ORIGINS = [
  'https://obsee.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export function sendJson(response: ApiResponse, status: number, body: unknown) {
  response.status(status).json(body);
}

export function getHeader(request: ApiRequest, name: string): string {
  const value = request.headers[name.toLowerCase()] ?? request.headers[name];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins(): Set<string> {
  const configured = (process.env.OBSREC_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(normalizeOrigin)
    .filter((origin): origin is string => origin !== null);

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

export function requireJsonPost(request: ApiRequest): RequestBoundaryResult {
  if (request.method?.toUpperCase() !== 'POST') {
    return { allowed: false, status: 405, message: 'Method not allowed.' };
  }

  const mediaType = getHeader(request, 'content-type').split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return {
      allowed: false,
      status: 415,
      message: 'Content-Type must be application/json.',
    };
  }

  const originHeader = getHeader(request, 'origin').trim();
  if (!originHeader) return { allowed: true };

  const origin = normalizeOrigin(originHeader);
  if (!origin || !getAllowedOrigins().has(origin)) {
    return { allowed: false, status: 403, message: 'Origin not allowed.' };
  }

  return { allowed: true };
}

export function getClientIp(request: ApiRequest): string {
  const forwardedFor = getHeader(request, 'x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();

  const realIp = getHeader(request, 'x-real-ip');
  if (realIp) return realIp.trim();

  return request.socket?.remoteAddress ?? 'unknown';
}

export function readBody<T>(request: ApiRequest): T {
  if (typeof request.body === 'string') {
    return JSON.parse(request.body) as T;
  }

  return request.body as T;
}
