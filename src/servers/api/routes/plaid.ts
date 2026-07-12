/**
 * Plaid Routes
 *
 * Handles Plaid Link integration for banking.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import * as plaidService from '../services/plaid.js';
import { rateLimit, requireAuth } from '../../../api/auth-middleware.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'PlaidRoutes' });

/**
 * Handle Plaid routes
 */
export async function handlePlaidRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  // Exchange Plaid public token for access token
  if (pathname === '/plaid/exchange' && req.method === 'POST') {
    // Rate limit: 5 exchanges per minute per IP (financial operation)
    if (rateLimit(req, res, { maxRequests: 5, windowMs: 60000 })) {
      return true; // Rate limited
    }

    // SECURITY: Require auth; user_id in body must match authenticated user
    const auth = await requireAuth(req, res);
    if (!auth) return true;

    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));

    // FIX BUG: The previous implementation never called reject() and didn't handle 'error' events.
    // If the request errored out (client disconnect, etc.), the promise would hang forever.
    return new Promise((resolve) => {
      // Handle request errors to prevent hanging promises
      req.on('error', (err) => {
        log.error({ error: err.message }, 'Request error in Plaid exchange');
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Request error' }));
        }
        resolve(true);
      });

      req.on('end', async () => {
        try {
          const { public_token, user_id, institution, accounts } = JSON.parse(body) as {
            public_token: string;
            user_id: string;
            institution?: { name?: string; institution_id?: string };
            accounts?: unknown[];
          };

          if (!public_token || !user_id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing public_token or user_id' }));
            resolve(true);
            return;
          }

          if (user_id !== auth.userId && !auth.isAdmin) {
            log.warn(
              { authUserId: auth.userId, requestedUserId: user_id },
              'SECURITY: Blocked Plaid exchange for mismatched user_id'
            );
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'user_id does not match authenticated user' }));
            resolve(true);
            return;
          }

          if (!plaidService.isConfigured()) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Plaid not configured' }));
            resolve(true);
            return;
          }

          // Exchange public token for access token
          const result = await plaidService.exchangePublicToken(public_token);

          if (!result) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Token exchange failed' }));
            resolve(true);
            return;
          }

          // Store under authenticated user (never trust body user_id alone)
          const boundUserId = auth.userId;
          await plaidService.storeToken(
            boundUserId,
            result.accessToken,
            result.itemId,
            institution
          );

          log.info(
            {
              userId: boundUserId,
              institution: institution?.name || 'Unknown',
              accounts: accounts?.length || 0,
            },
            'Plaid account linked'
          );

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              institution: institution?.name,
              accounts_linked: accounts?.length || 0,
            })
          );
        } catch (err) {
          log.error({ error: (err as Error).message }, 'Plaid exchange error');
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        }
        resolve(true);
      });
    });
  }

  // Check if user has Plaid linked
  if (pathname === '/plaid/status') {
    const auth = await requireAuth(req, res);
    if (!auth) return true;

    const params = new URL(req.url || '', 'http://localhost').searchParams;
    const user_id = params.get('user_id') || auth.userId;

    if (user_id !== auth.userId && !auth.isAdmin) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return true;
    }

    const tokenData = await plaidService.getToken(auth.userId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        linked: !!tokenData,
        institution: tokenData?.institution?.name,
        linked_at: tokenData?.linked_at,
      })
    );
    return true;
  }

  return false;
}
