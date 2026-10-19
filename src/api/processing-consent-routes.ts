/**
 * /api/account/processing-consent: the person's third-party processing
 * consent (App Store 5.1.2(i)); see services/processing-consent.ts.
 *
 * Contract for the apps (iOS ConsentStore.upload is the seam):
 * - GET    → 200 { consent: null | { version, agreedAt, recordedAt, source, withdrawnAt? } }.
 *            Show the consent screen when consent is null, withdrawn, or for an
 *            older version than the one the app ships.
 * - POST   { version, agreedAt (ISO), source?: 'ios' | 'web' (default 'ios') }
 *            → 200 { consent }. Send it when the person taps agree, before the
 *            first call; safe to repeat (it replaces the record and clears a
 *            withdrawal).
 * - DELETE → 200 { consent } with withdrawnAt set, or { consent: null } when
 *            there was none. Withdrawing is how the person takes it back.
 * Every call needs a Firebase ID token (anonymous users included); the record
 * is the verified uid's, whatever a body says. A service API key gets 403.
 *
 * @module api/processing-consent-routes
 */
import type { IncomingMessage, ServerResponse } from 'http';
import {
  getConsent,
  parseAgreement,
  recordConsent,
  withdrawConsent,
} from '../services/processing-consent.js';
import type { AuthContext } from './auth-middleware.js';
import { parseBody, sendError, sendJSON } from './helpers.js';

export async function handleProcessingConsent(
  req: IncomingMessage,
  res: ServerResponse,
  auth: Pick<AuthContext, 'firebaseUid'>
): Promise<boolean> {
  const uid = auth.firebaseUid;
  if (!uid) {
    sendError(res, 'Consent belongs to a signed-in user', 403);
    return true;
  }
  switch (req.method) {
    case 'GET':
      sendJSON(res, { consent: await getConsent(uid) });
      return true;
    case 'POST': {
      // The body says what was agreed, never whose consent it is.
      const body = await parseBody<unknown>(req);
      const parsed = parseAgreement(body);
      if (!parsed.ok) {
        sendError(res, parsed.error, 400);
        return true;
      }
      sendJSON(res, { consent: await recordConsent(uid, parsed.agreement) });
      return true;
    }
    case 'DELETE':
      sendJSON(res, { consent: await withdrawConsent(uid) });
      return true;
    default:
      sendError(res, 'Method not allowed', 405);
      return true;
  }
}
