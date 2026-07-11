/**
 * CEO Routes Index
 * Aggregates all CEO feature routes
 */

import type { IncomingMessage, ServerResponse } from 'http';

import type { Request, Response, Router } from 'express';

import { goalsRoutes } from './goals-routes.js';
import { winsRoutes } from './wins-routes.js';
import { journalRoutes } from './journal-routes.js';
import { energyRoutes } from './energy-routes.js';
import { gratitudeRoutes } from './gratitude-routes.js';
import { focusRoutes } from './focus-routes.js';
import { briefingRoutes } from './briefing-routes.js';
import { ideasRoutes } from './ideas-routes.js';
import { blockersRoutes } from './blockers-routes.js';
import { decisionsRoutes } from './decisions-routes.js';
import { prioritiesRoutes } from './priorities-routes.js';
import { meetingsRoutes } from './meetings-routes.js';
import { parseRawBody } from '../helpers.js';
import { optionalAuthAsync } from '../auth-middleware.js';
import { createLogger } from '../../utils/safe-logger.js';
import './types.js';

const log = createLogger({ module: 'ceo-routes' });

/** Node request augmented for Express-style CEO routers */
interface CEORequest extends IncomingMessage {
  user?: { uid: string };
  body?: unknown;
  query?: Record<string, string>;
}

/**
 * Handle CEO feature routes
 */
export async function handleCEORoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Route mapping
  const routes: Record<string, Router> = {
    '/api/ceo/goals': goalsRoutes,
    '/api/ceo/wins': winsRoutes,
    '/api/ceo/journal': journalRoutes,
    '/api/ceo/energy': energyRoutes,
    '/api/ceo/gratitude': gratitudeRoutes,
    '/api/ceo/focus': focusRoutes,
    '/api/ceo/briefing': briefingRoutes,
    '/api/ceo/ideas': ideasRoutes,
    '/api/ceo/blockers': blockersRoutes,
    '/api/ceo/decisions': decisionsRoutes,
    '/api/ceo/priorities': prioritiesRoutes,
    '/api/ceo/meetings': meetingsRoutes,
  };

  // Find matching route
  const routeEntry = Object.entries(routes).find(([path]) => pathname.startsWith(path));

  if (routeEntry) {
    const [basePath, router] = routeEntry;
    const ceoReq = req as CEORequest;

    try {
      // Get authenticated user
      const auth = await optionalAuthAsync(req);
      if (!auth) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return true;
      }

      // Attach user to request
      ceoReq.user = { uid: auth.userId };

      // Parse body for POST/PUT requests
      let body: unknown = undefined;
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
        const rawBody = await parseRawBody(req, { timeoutMs: 30000, maxBytes: 1024 * 1024 });
        try {
          body = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          body = {};
        }
        ceoReq.body = body;
      }

      // Parse query params
      ceoReq.query = Object.fromEntries(parsedUrl.searchParams);

      // Strip base path and route
      const routePath = pathname.replace(basePath, '');
      const handled = await routeRequest(ceoReq, res, router, routePath);
      return handled;
    } catch (error) {
      log.error({ error: String(error), pathname }, 'CEO route error');
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
      return true;
    }
  }

  return false;
}

/**
 * Route requests to the Express router
 */
async function routeRequest(
  req: CEORequest,
  res: ServerResponse,
  router: Router,
  path: string
): Promise<boolean> {
  const express = await import('express');
  const mockApp = express.default();

  // Mount router at root (path already stripped)
  mockApp.use('/', router);

  // Create mock request with the stripped path
  const mockReq = Object.assign(req, { url: path || '/' }) as Request;

  // Forward to Express router
  await new Promise<void>((resolve, reject) => {
    mockApp(mockReq, res as Response, (err?: unknown) => {
      if (err) reject(err instanceof Error ? err : new Error(String(err)));
      else resolve();
    });
  });

  return res.writableEnded;
}
