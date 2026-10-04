/**
 * Serves /api/group/* through the group-conversation Express router, for the
 * raw-http API server (src/servers/api/index.ts).
 *
 * The router answers some /api/group paths; the rest fall through to the next
 * raw handler. Body parsing belongs to the router (see OWN_BODY_PATHS there):
 * before it had any, every POST that read a body answered 500.
 *
 * @module api/group-conversation-handler
 */
import type { IncomingMessage, ServerResponse } from 'http';
import express, { type Express, type Request, type Response } from 'express';
import { groupConversationRoutes } from './group-conversation-routes.js';

let app: Express | null = null;

function mountedApp(): Express {
  if (!app) {
    app = express();
    app.disable('x-powered-by');
    app.use('/api/group', groupConversationRoutes);
  }
  return app;
}

/** An error the request itself caused (e.g. a malformed JSON body), with its 4xx status. */
function clientErrorStatus(err: unknown): number | null {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : null;
}

/**
 * Resolves true once the router has answered, false when no route matched and
 * the request should go to the next handler. Rejects on a server-side error.
 */
export function handleGroupConversationRoutes(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const answered = (): void => resolve(true);
    res.once('finish', answered);
    res.once('close', answered);
    mountedApp()(req as Request, res as Response, (err?: unknown) => {
      res.off('finish', answered);
      res.off('close', answered);
      const status = err ? clientErrorStatus(err) : null;
      if (status && !res.headersSent) {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: "Couldn't read that request" }));
        resolve(true);
      } else if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      } else {
        resolve(res.writableEnded);
      }
    });
  });
}
