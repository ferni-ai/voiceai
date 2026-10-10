/**
 * /api/linkedin/* while LinkedIn is switched off (see config/linkedin-flag.ts).
 *
 * Nothing here reaches LinkedIn or the LinkedIn service. Routes that need auth
 * still need it; the answers say plainly that LinkedIn isn't available:
 *   GET  /status     → { connected:false, available:false, profile:null, upcomingMilestones:[] }
 *   GET  /connect    → 302 /settings?linkedin=unavailable (never to LinkedIn)
 *   GET  /callback   → 302 /settings?linkedin=unavailable (no code exchange)
 *   POST /sync, /disconnect → 503 { error:'unavailable', available:false }
 *
 * @module api/linkedin-unavailable
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { requireAuth } from './auth-middleware.js';
import { sendError, sendJSON } from './helpers.js';

/** Where the web shows "LinkedIn isn't available" (handleLinkedInCallback). */
export const LINKEDIN_UNAVAILABLE_REDIRECT = '/settings?linkedin=unavailable';

function redirectUnavailable(res: ServerResponse): true {
  res.writeHead(302, { Location: LINKEDIN_UNAVAILABLE_REDIRECT });
  res.end();
  return true;
}

/** Answer an /api/linkedin/* request while LinkedIn is off. Always handles it. */
export async function handleLinkedInUnavailable(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string
): Promise<true> {
  if (pathname === '/api/linkedin/callback' && method === 'GET') {
    return redirectUnavailable(res);
  }

  if (pathname === '/api/linkedin/connect' && method === 'GET') {
    if (!(await requireAuth(req, res))) return true;
    return redirectUnavailable(res);
  }

  if (pathname === '/api/linkedin/status' && method === 'GET') {
    if (!(await requireAuth(req, res))) return true;
    sendJSON(res, { connected: false, available: false, profile: null, upcomingMilestones: [] });
    return true;
  }

  if (
    (pathname === '/api/linkedin/sync' || pathname === '/api/linkedin/disconnect') &&
    method === 'POST'
  ) {
    if (!(await requireAuth(req, res))) return true;
    sendJSON(res, { error: 'unavailable', available: false }, 503);
    return true;
  }

  sendError(res, 'Not found', 404);
  return true;
}
