/**
 * Run the Musical You and Social routes as several "API instances": each
 * instance is a fresh load of the route and service modules (vi.resetModules),
 * so nothing is shared between them except what the test mocks to be shared
 * (e.g. one fake Firestore). Mirrors Cloud Run running several API processes.
 */
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { vi } from 'vitest';

export type Json = Record<string, unknown>;

export type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  query: URLSearchParams
) => Promise<boolean>;

export interface ApiInstance {
  musical: Handler;
  social: Handler;
}

/** A fresh API process. */
export async function startInstance(): Promise<ApiInstance> {
  vi.resetModules();
  const { handleMusicalYouRoutes } = await import('../../api/routes/musical-you-routes.js');
  const { handleSocialRoutes } = await import('../../api/routes/social-routes.js');
  return { musical: handleMusicalYouRoutes, social: handleSocialRoutes };
}

/**
 * Call a route as `caller` ("Bearer <uid>", for an auth mock that trusts it;
 * also bound as x-firebase-uid, as bindVerifiedIdentity would). Null = anonymous.
 */
export async function call(
  handler: Handler,
  method: 'GET' | 'POST',
  path: string,
  caller: string | null,
  body: Json = {},
  query: Record<string, string> = {}
): Promise<{ status: number; raw: string; body: Json }> {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = method;
  req.url = path;
  req.headers = caller ? { authorization: `Bearer ${caller}`, 'x-firebase-uid': caller } : {};
  Object.defineProperty(req, 'socket', { value: { remoteAddress: '127.0.0.1' } });
  stream.end(method === 'POST' ? JSON.stringify(body) : undefined);
  const out = { status: 200, raw: '', body: {} as Json };
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      out.status = s;
    }),
    end: vi.fn((data?: string) => {
      out.raw = data ?? '';
      out.body = JSON.parse(out.raw || '{}') as Json;
    }),
  } as unknown as ServerResponse;
  await handler(req, res, path, new URLSearchParams(query));
  return out;
}
