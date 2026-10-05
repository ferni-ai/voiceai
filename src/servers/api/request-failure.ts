/**
 * Async request work that nobody awaits.
 *
 * Node's http server and a request's 'end' event ignore what their callbacks
 * return, so an async callback that rejects leaves the client waiting for a
 * response that never comes and the rejection unhandled. These helpers keep the
 * work async but give its failure somewhere to go: a log line and a 500.
 *
 * @module servers/api/request-failure
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'RequestFailure' });

/**
 * If `work` rejects: log it, answer 500 when nothing has been sent yet (or end a
 * half-sent response), then call `settle(true)` so a caller waiting on the
 * request can finish.
 */
export function respondOnRejection(
  res: ServerResponse,
  work: Promise<unknown>,
  settle?: (handled: boolean) => void
): void {
  work.catch((err: unknown) => {
    log.error({ error: String(err) }, 'Request handler failed');
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    } else if (!res.writableEnded) {
      res.end();
    }
    settle?.(true);
  });
}

/** `req.on('end', handler)` for an async handler, with respondOnRejection's guarantees. */
export function onBodyEnd(
  req: IncomingMessage,
  res: ServerResponse,
  settle: (handled: boolean) => void,
  handler: () => Promise<void>
): void {
  req.on('end', () => respondOnRejection(res, handler(), settle));
}
