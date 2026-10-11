/**
 * Phone verification: text a code, confirm it, and put the confirmed number
 * on the user's Firebase account.
 *
 * POST /api/outreach/verify-phone          { phone }       → texts a code
 * POST /api/outreach/verify-phone/confirm  { phone, code } → checks it
 *
 * Codes are keyed by the signed-in user (they used to be keyed by the phone
 * when the client named nobody, so the code wasn't tied to anyone). Once the
 * code checks out, the number it was sent to (never the one in the confirm
 * body) goes on that user's own Firebase account: that's a verified number,
 * what caller recognition reads back. Not for an admin acting for someone
 * else, not for dev-mode or API-key callers, and never taken from another
 * account: if one already holds the number, the confirm is refused (409).
 * Logs show the last two digits only.
 *
 * @module api/verify-phone-routes
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { attachVerifiedPhone } from '../services/identity/firebase-auth.js';
import {
  createVerificationCode,
  verifyCode,
} from '../services/trust-and-identity/verification-store.js';
import { getLogger } from '../utils/safe-logger.js';
import { claimedUserFor } from './acting-user.js';
import type { AuthContext } from './auth-middleware.js';
import { parseRequestBody, sendJsonResponse } from './helpers.js';

const log = getLogger().child({ module: 'verify-phone' });

const CODE_ERRORS: Record<string, string> = {
  expired: 'Code expired. Please request a new one.',
  invalid: 'Invalid code. Please check and try again.',
  max_attempts: 'Too many attempts. Please request a new code.',
  not_found: 'No verification pending for this number.',
};

const tail = (phone: string): string => phone.slice(-2);

export async function handleVerifyPhone(
  req: IncomingMessage,
  res: ServerResponse,
  route: '/verify-phone' | '/verify-phone/confirm' | string,
  auth: AuthContext
): Promise<void> {
  const body = (await parseRequestBody(req)) as { phone?: string; code?: string; userId?: unknown };
  const phone = body.phone ?? '';
  if (!phone || (route === '/verify-phone/confirm' && !body.code)) {
    const required =
      route === '/verify-phone' ? 'phone is required' : 'phone and code are required';
    sendJsonResponse(res, 400, { success: false, error: required });
    return;
  }
  // The signed-in user, or the user an admin names; 401/403 already sent otherwise.
  const userId = claimedUserFor(auth, body.userId, res);
  if (!userId) return;

  if (route === '/verify-phone') {
    try {
      const { code, expiresAt } = await createVerificationCode(userId, phone);
      const { textUser } = await import('../tools/domains/proactive/outreach/index.js');
      await textUser(
        phone,
        `Your Ferni code is ${code}. Just making sure it's really you! 💚`,
        'ferni'
      );
      log.info({ phone: tail(phone), expiresAt }, 'Sent verification code');
      sendJsonResponse(res, 200, { success: true, message: 'Verification code sent' });
    } catch (error) {
      log.error({ error, phone: tail(phone) }, 'Failed to send verification code');
      sendJsonResponse(res, 500, { success: false, error: 'Failed to send code' });
    }
    return;
  }

  try {
    const result = await verifyCode(userId, body.code ?? '');
    if (!result.valid) {
      const error = CODE_ERRORS[result.reason] ?? 'Verification failed';
      sendJsonResponse(res, 400, { success: false, error });
      return;
    }
    log.info({ phone: tail(phone) }, 'Phone verified');
    // Only the signed-in user's own account, with the number the code went to.
    const own = auth.authMethod === 'firebase' && userId === auth.userId && !!result.phone;
    const linked = own ? await attachVerifiedPhone(userId, result.phone ?? '') : null;
    if (linked && !linked.ok && linked.reason === 'in-use') {
      sendJsonResponse(res, 409, {
        success: false,
        error: 'That number is already on another Ferni account.',
      });
      return;
    }
    sendJsonResponse(res, 200, {
      success: true,
      message: 'Phone verified',
      phoneLinked: linked?.ok === true,
    });
  } catch (error) {
    log.error({ error, phone: tail(phone) }, 'Verification error');
    sendJsonResponse(res, 500, { success: false, error: 'Verification failed' });
  }
}
