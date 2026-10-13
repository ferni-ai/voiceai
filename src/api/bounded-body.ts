/**
 * Read a JSON request body with a byte cap that holds while the body streams.
 *
 * parseBody (helpers.ts) buffers the whole body before looking at it, and a
 * Content-Length check misses chunked requests, which carry no length. So one
 * caller could stream an unbounded body into memory. This reader counts bytes
 * per chunk and stops reading the moment the total passes the cap.
 *
 * @module api/bounded-body
 */

import type { IncomingMessage } from 'http';

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
