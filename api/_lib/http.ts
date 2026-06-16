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

export function sendJson(response: ApiResponse, status: number, body: unknown) {
  response.status(status).json(body);
}

export function getHeader(request: ApiRequest, name: string): string {
  const value = request.headers[name.toLowerCase()] ?? request.headers[name];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
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
