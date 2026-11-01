/**
 * /api/account/call-capture-consent: the "Help shape Ferni" switch; see
 * services/call-capture-consent.ts. 404 while CALL_CAPTURE_CONSENT is off.
 *
 * - GET    → 200 { consent: null | record, available }. `available` is false while the
 *            person is under a minor-care hold (captureBlockedForMinor: in-process or
 *            shared, fail closed): the switch is then not shown.
 * - POST   { version, agreedAt (ISO), source?: 'ios' | 'web' } → 200 { consent }; 403 while
 *            not available. Replaces the record and clears a withdrawal.
 * - DELETE → 200 { consent } with withdrawnAt set, or { consent: null } when there was none.
 * The record is always the verified uid's, whatever a body says. A service API key gets 403.
 *
 * @module api/call-capture-consent-routes
 */
import type { IncomingMessage, ServerResponse } from 'http';
import {
  captureBlockedForMinor,
  captureConsentOn,
  getCaptureConsent,
  recordCaptureConsent,
  withdrawCaptureConsent,
} from '../services/call-capture-consent.js';
import { parseAgreement } from '../services/processing-consent.js';
import type { AuthContext } from './auth-middleware.js';
import { parseBody, sendError, sendJSON } from './helpers.js';

export async function handleCallCaptureConsent(
  req: IncomingMessage,
  res: ServerResponse,
  auth: Pick<AuthContext, 'firebaseUid'>
): Promise<boolean> {
  if (!captureConsentOn()) {
    sendError(res, 'Account endpoint not found', 404);
    return true;
  }
  const uid = auth.firebaseUid;
  if (!uid) {
    sendError(res, 'Consent belongs to a signed-in user', 403);
    return true;
  }
  switch (req.method) {
    case 'GET': {
      const [consent, held] = await Promise.all([
        getCaptureConsent(uid),
        captureBlockedForMinor(uid),
      ]);
      sendJSON(res, { consent, available: !held });
      return true;
    }
    case 'POST': {
      // The body says what was agreed, never whose consent it is.
      const parsed = parseAgreement(await parseBody<unknown>(req));
      if (!parsed.ok) {
        sendError(res, parsed.error, 400);
        return true;
      }
      if (await captureBlockedForMinor(uid)) {
        sendError(res, 'Not available for this account', 403);
        return true;
      }
      sendJSON(res, { consent: await recordCaptureConsent(uid, parsed.agreement) });
      return true;
    }
    case 'DELETE':
      sendJSON(res, { consent: await withdrawCaptureConsent(uid) });
      return true;
    default:
      sendError(res, 'Method not allowed', 405);
      return true;
  }
}
