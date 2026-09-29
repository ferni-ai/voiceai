/**
 * Minimal IncomingMessage / ServerResponse fakes for raw-HTTP route tests.
 */

import { createHmac } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';

export interface FakeResponse {
  res: ServerResponse;
  status: () => number | undefined;
  body: () => string;
  json: () => unknown;
}

export function fakeRequest(opts: {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  remoteAddress?: string;
}): IncomingMessage {
  const stream = Readable.from(opts.body ? [Buffer.from(opts.body)] : []);
  return Object.assign(stream, {
    method: opts.method ?? 'POST',
    url: opts.url,
    headers: { host: 'api.test', ...(opts.headers ?? {}) },
    complete: false,
    socket: { remoteAddress: opts.remoteAddress ?? '203.0.113.9' },
  }) as unknown as IncomingMessage;
}

export function fakeResponse(): FakeResponse {
  let status: number | undefined;
  let body = '';
  const res = {
    headersSent: false,
    statusCode: 200,
    setHeader: () => undefined,
    getHeader: () => undefined,
    writeHead(code: number) {
      status = code;
      this.statusCode = code;
      this.headersSent = true;
      return this;
    },
    write(chunk: string) {
      body += chunk;
      return true;
    },
    end(chunk?: string) {
      if (status === undefined) status = this.statusCode;
      if (chunk) body += chunk;
      return this;
    },
  };
  return {
    res: res as unknown as ServerResponse,
    status: () => status,
    body: () => body,
    json: () => (body ? JSON.parse(body) : undefined),
  };
}

/** Compute a Twilio X-Twilio-Signature for a URL + form params. */
export function twilioSignature(
  token: string,
  url: string,
  params: Record<string, string>
): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac('sha1', token).update(data).digest('base64');
}
