/**
 * Read a JSON request body with a byte cap that holds while the body streams.
 *
 * A body read in full before anyone looks at it lets one request stream an
 * unbounded body into memory, and a Content-Length check misses chunked
 * requests, which carry no length. This reader counts bytes per chunk and stops
 * reading the moment the total passes the cap. readCappedJsonBody is what
 * parseBody (helpers.ts) uses, so every route that reads JSON through it has a
 * cap; over it, the request is answered 413 here, in one place.
 *
 * @module api/bounded-body
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'bounded-body' });

export class BodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body over ${maxBytes} bytes`);
    this.name = 'BodyTooLargeError';
  }
}

/**
 * The parsed JSON body ({} when empty). Rejects with BodyTooLargeError as soon
 * as more than `maxBytes` arrive, after pausing the request so no more is
 * read; the caller answers 413 and closes the connection.
 */
export async function readJsonBodyLimited<T>(req: IncomingMessage, maxBytes: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    const cleanup = (): void => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('close', onClose);
    };
    const onData = (chunk: Buffer | string): void => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      total += buf.byteLength;
      if (total > maxBytes) {
        cleanup();
        req.pause();
        chunks.length = 0;
        reject(new BodyTooLargeError(maxBytes));
        return;
      }
      chunks.push(buf);
    };
    const onEnd = (): void => {
      cleanup();
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(text ? (JSON.parse(text) as T) : ({} as T));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    // A stream destroyed without an error would otherwise leave the promise pending.
    const onClose = (): void => {
      cleanup();
      reject(new Error('Request closed before the body ended'));
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('close', onClose);
  });
}

/** Cap for a JSON body when neither the caller nor API_MAX_BODY_BYTES sets one. */
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

/** API_MAX_BODY_BYTES when it is a positive whole number of bytes, else the default. */
export function defaultMaxBodyBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.API_MAX_BODY_BYTES?.trim() ?? '';
  const bytes = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : DEFAULT_MAX_BODY_BYTES;
}

/** Cap for a JSON body that carries `rawBytes` of base64 data, plus room for its other fields. */
export function base64JsonBodyBytes(rawBytes: number): number {
  return Math.ceil(rawBytes / 3) * 4 + 64 * 1024;
}

const responses = new WeakMap<IncomingMessage, ServerResponse>();

/**
 * Lets readCappedJsonBody answer 413 for this request itself, whatever its
 * caller does with the error. The API server binds every request it serves.
 */
export function bindBodyLimitResponse(req: IncomingMessage, res: ServerResponse): IncomingMessage {
  responses.set(req, res);
  return req;
}

/**
 * After the 413, how long to read and discard what the client is still
 * sending. Closing at once makes a client mid-upload see a broken pipe instead
 * of the 413; discarding holds no memory, and the linger bounds the bandwidth.
 */
const REFUSED_LINGER_MS = 1000;

/** Answer 413 and close the connection, since the rest of the body is never parsed. */
function refuseOversizedBody(req: IncomingMessage, maxBytes: number): void {
  log.warn({ method: req.method, url: req.url, maxBytes }, 'Request body refused: over the cap');
  const res = responses.get(req);
  if (!res || res.headersSent) {
    req.destroy();
    return;
  }
  // Not `Connection: close`: Node would then shut the socket the moment the 413 is out.
  res.once('finish', () => {
    req.resume();
    setTimeout(() => req.destroy(), REFUSED_LINGER_MS).unref();
  });
  res.writeHead(413, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Payload Too Large', maxBytes }));
}

export interface BodyLimitOptions {
  /** Bytes allowed; defaults to defaultMaxBodyBytes(). */
  maxBytes?: number;
}

/**
 * readJsonBodyLimited with a default cap, refusing a declared Content-Length
 * over the cap before reading anything. Over the cap it rejects with
 * BodyTooLargeError after the request has been answered 413 (when the server
 * bound it) or destroyed (when not), so the socket never waits on the rest.
 */
export async function readCappedJsonBody<T>(
  req: IncomingMessage,
  options: BodyLimitOptions = {}
): Promise<T> {
  const maxBytes = options.maxBytes ?? defaultMaxBodyBytes();
  try {
    // Hand-built requests (tests, internal callers) can come without headers.
    const declared = Number(req.headers?.['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError(maxBytes);
    return await readJsonBodyLimited<T>(req, maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLargeError) refuseOversizedBody(req, maxBytes);
    throw error;
  }
}
