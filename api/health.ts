import type { ApiRequest, ApiResponse } from './_lib/http';
import { sendJson } from './_lib/http';

export default function handler(_request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store');
  return sendJson(response, 200, {
    ok: true,
    service: 'obsrec-ai',
  });
}
