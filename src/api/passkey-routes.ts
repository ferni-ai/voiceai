/**
 * Passkeys for approvals.
 *
 * - GET  /api/passkeys                  the caller's passkeys (no key material)
 * - POST /api/passkeys/register/options WebAuthn creation options (first passkey only)
 * - POST /api/passkeys/register/verify  { response } from navigator.credentials.create
 *
 * SECURITY: a person's own Firebase sign-in only (API keys and dev headers get
 * 404); registering needs a sign-in from the last 5 minutes and a CSRF-safe
 * request (approval-guards.ts). Everything is 404 unless APPROVALS_PAGE=on and
 * APPROVALS_PASSKEYS=on.
 * @module PasskeyRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import {
  finishRegistration,
  isPasskeysEnabled,
  listPasskeys,
  startRegistration,
} from '../services/approvals/passkeys.js';
import { parseJsonBodySafe } from '../utils/ddos-protection.js';
import { createLogger } from '../utils/safe-logger.js';
import { isCsrfSafe, signedInRecently } from './approval-guards.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { sendApiError, sendJSON } from './helpers.js';
import { authCheckUnavailable } from './verify-token-once.js';

const log = createLogger({ module: 'PasskeyRoutes' });

const NOT_FOUND = { status: 404, message: "Couldn't find that." };
const ROUTES = new Set([
  'GET /api/passkeys',
  'POST /api/passkeys/register/options',
  'POST /api/passkeys/register/verify',
]);

export async function handlePasskeyRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (pathname !== '/api/passkeys' && !pathname.startsWith('/api/passkeys/')) return false;
  const route = `${req.method} ${pathname}`;
  if (!isPasskeysEnabled() || !ROUTES.has(route)) {
    sendApiError(res, NOT_FOUND);
    return true;
  }
  if (rateLimit(req, res, { maxRequests: 20, windowMs: 60_000, keyPrefix: 'passkeys' }))
    return true;
  const auth = await requireAuth(req, res, { strict: true }); // step-up
  if (!auth) return true;
  if (auth.authMethod !== 'firebase') {
    sendApiError(res, NOT_FOUND);
    return true;
  }

  try {
    if (route === 'GET /api/passkeys') {
      const passkeys = await listPasskeys(auth.userId);
      sendJSON(res, {
        passkeys: passkeys.map(({ id, deviceType, backedUp, createdAt, lastUsedAt }) => ({
          id,
          deviceType,
          backedUp,
          createdAt,
          lastUsedAt,
        })),
      });
      return true;
    }
    if (!isCsrfSafe(req)) {
      sendApiError(res, { status: 403, message: "Couldn't do that from here.", code: 'CSRF' });
      return true;
    }
    if (!(await signedInRecently(req, auth.userId))) {
      if (authCheckUnavailable(req, res)) return true; // couldn't check the account: try again
      sendApiError(res, { status: 401, message: 'Sign in again first.', code: 'REAUTH_REQUIRED' });
      return true;
    }
    if (route === 'POST /api/passkeys/register/options') {
      const options = await startRegistration(auth.userId, auth.email ?? 'Ferni account');
      if (options === 'has_passkey') {
        sendApiError(res, {
          status: 409,
          message: 'You already have a passkey.',
          code: 'HAS_PASSKEY',
        });
      } else {
        sendJSON(res, { options });
      }
      return true;
    }
    const body = await parseJsonBodySafe<{ response?: RegistrationResponseJSON }>(req, res, {
      maxSize: 16 * 1024,
    });
    if (!body) return true;
    if (!body.response || typeof body.response !== 'object') {
      sendApiError(res, { status: 400, message: "Couldn't read that.", code: 'BAD_REQUEST' });
      return true;
    }
    if (await finishRegistration(auth.userId, body.response)) {
      sendJSON(res, { registered: true });
    } else {
      sendApiError(res, {
        status: 400,
        message: "That passkey didn't check out. Try again?",
        code: 'NOT_VERIFIED',
      });
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Passkey request failed');
    sendApiError(res, { status: 500, message: 'Internal error' });
  }
  return true;
}
