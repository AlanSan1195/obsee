import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import audioProfileHandler from '../api/audio-profile';
import consoleProfileHandler from '../api/console-profile';
import explanationHandler from '../api/explanation';
import healthHandler from '../api/health';
import recommendationHandler from '../api/recommendation';
import webSearchHandler from '../api/web-search';
import type { ApiRequest, ApiResponse } from '../api/_lib/http';

type ApiHandler = (request: ApiRequest, response: ApiResponse) => unknown;

const routes = new Map<string, ApiHandler>([
  ['/api/audio-profile', audioProfileHandler],
  ['/api/console-profile', consoleProfileHandler],
  ['/api/explanation', explanationHandler],
  ['/api/health', healthHandler],
  ['/api/recommendation', recommendationHandler],
  ['/api/web-search', webSearchHandler],
]);

async function readRequestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return undefined;

  const body = Buffer.concat(chunks).toString('utf8');
  const contentType = request.headers['content-type'] ?? '';
  return contentType.includes('application/json') ? JSON.parse(body) : body;
}

function createApiResponse(response: ServerResponse): ApiResponse {
  const apiResponse: ApiResponse = {
    status(code) {
      response.statusCode = code;
      return apiResponse;
    },
    json(body) {
      if (!response.hasHeader('Content-Type')) {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      response.end(JSON.stringify(body));
    },
    setHeader(name, value) {
      response.setHeader(name, value);
    },
  };

  return apiResponse;
}

export function localApiPlugin(): Plugin {
  return {
    name: 'obsrec-local-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        const handler = routes.get(pathname);
        if (!handler) {
          next();
          return;
        }

        try {
          const body = await readRequestBody(request);
          await handler({
            method: request.method,
            headers: request.headers,
            body,
            socket: { remoteAddress: request.socket.remoteAddress },
          }, createApiResponse(response));
        } catch (error) {
          console.error('[local-api] Request failed:', error);
          if (!response.headersSent) {
            response.statusCode = 500;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
          }
          if (!response.writableEnded) {
            response.end(JSON.stringify({ message: 'La API local no pudo procesar la solicitud.' }));
          }
        }
      });
    },
  };
}
