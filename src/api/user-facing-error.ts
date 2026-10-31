/**
 * Send a fixed, user-facing error message that must reach the person even in production.
 *
 * sendError (helpers.ts) swaps every 5xx message for "Internal server error" in production
 * so an exception's text never leaks. That also hides copy the person needs to act on, such
 * as "your sign-in is still open, try again". Pass only fixed strings written for the person
 * here, never error.message or anything built from internal state.
 */
import type { ServerResponse } from 'http';
import { getAPISecurityHeaders } from './security-headers.js';

export function sendUserFacingError(res: ServerResponse, message: string, status = 500): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...getAPISecurityHeaders(),
  });
  res.end(JSON.stringify({ error: message }));
}
