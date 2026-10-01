/**
 * Shared types and helpers for UI server route dispatch.
 *
 * The UI server matches routes with an ordered chain of pathname guards.
 * The chain is split into route groups; each group returns `true` when the
 * request is finished (handled, or an error response was sent) and `false`
 * when matching should continue with the next group.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'APIServer' });

/** Per-request values every route group needs. */
export interface RouteContext {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  /** Request pathname, after subdomain rewriting. */
  readonly pathname: string;
  readonly parsedUrl: URL;
}

/** A contiguous slice of the dispatch chain. Returns true when the request is finished. */
export type RouteGroup = (ctx: RouteContext) => Promise<boolean>;

/** Shape of the 500 response a route error boundary sends. */
export type ErrorResponseKind = 'json' | 'text';

/**
 * Run part of the dispatch chain inside its own error boundary.
 *
 * On error: logs `errorMessage`, sends a 500 (JSON or plain text) if the
 * response is still open, and stops dispatch.
 */
export async function withRouteErrorBoundary(
  res: ServerResponse,
  errorMessage: string,
  kind: ErrorResponseKind,
  run: () => Promise<boolean>
): Promise<boolean> {
  try {
    return await run();
  } catch (err) {
    log.error({ error: String(err) }, errorMessage);
    if (!res.writableEnded) {
      if (kind === 'json') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      } else {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    }
    return true;
  }
}
