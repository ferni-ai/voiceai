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
  getVerificationStatus,
  verifyCode,
} from '../services/trust-and-identity/verification-store.js';
import { redactNumbers } from '../services/outreach/guarded-text.js';
import {
  reserveConfirmTry,
  textVerificationCode,
  type CodeOutcome,
} from '../services/outreach/verification-text.js';
import { getClientIp } from '../utils/client-ip.js';
import { getLogger } from '../utils/safe-logger.js';
import { claimedUserFor } from './acting-user.js';
import type { AuthContext } from './auth-middleware.js';
import { parseRequestBody, sendJsonResponse } from './helpers.js';

const log = getLogger().child({ module: 'verify-phone' });

/**
 * Every failed confirm gets this one answer and status: wrong, expired, used up,
 * no code pending, or over the try limit look the same, so a confirm can't tell
 * anyone whether a number opted out or hit a limit.
 */
const CONFIRM_FAILED = { success: false, error: "That code didn't work. Ask for a new one?" };

const tail = (phone: string): string => phone.replace(/\D/g, '').slice(-4);

/**
 * Why a code didn't go, as the status and words the settings screen shows. A
 * refusal about someone else's number ('quiet': their STOP, the pair limit) gets
 * the same answer as a send, so the route can't tell anyone whether a number
 * opted out; the reason is in the server log only.
 */
const SENT = 'If this number can receive texts, a code is on its way.';
const SEND_ERRORS: Record<Exclude<CodeOutcome, { sent: true }>['reason'], [number, string]> = {
  'invalid-number': [400, 'Ferni can text US and Canadian mobile numbers. Mind checking it?'],
  quiet: [200, SENT],
  unavailable: [503, "Texting codes isn't working right now. Try again in a bit?"],
  'too-soon': [429, 'I just sent a code. Give it a minute before asking for another.'],
  'too-many': [429, "That's a lot of codes for one hour. Try again a little later."],
  'send-failed': [502, "Couldn't send the code. Try again?"],
};

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
      // Straight to the number being verified (it can't be a verified one yet); success only
      // when the provider took it. It used to go through textUser(phone), which looked the
      // phone up as a user id, sent nothing, and still answered "sent".
      const makeCode = async (e164: string) => (await createVerificationCode(userId, e164)).code;
      const outcome = await textVerificationCode(
        userId,
        phone,
        makeCode,
        undefined,
        getClientIp(req)
      );
      if (outcome.sent || outcome.reason === 'quiet') {
        sendJsonResponse(res, 200, { success: true, message: SENT });
      } else {
        const [status, error] = SEND_ERRORS[outcome.reason];
        sendJsonResponse(res, status, { success: false, error });
      }
    } catch (error) {
      const why = redactNumbers(String(error));
      log.error({ error: why, phone: tail(phone) }, 'Failed to send verification code');
      sendJsonResponse(res, 500, { success: false, error: "Couldn't send the code. Try again?" });
    }
    return;
  }

  try {
    // Tries are capped per (user, number): the number their pending code went to.
    const pendingFor = (await getVerificationStatus(userId))?.phone;
    if (pendingFor && (await reserveConfirmTry(userId, pendingFor)) !== 'ok') {
      log.warn({ phone: tail(pendingFor), reason: 'confirm-limit' }, 'Confirm refused');
      sendJsonResponse(res, 400, CONFIRM_FAILED);
      return;
    }
    const result = await verifyCode(userId, body.code ?? '');
    if (!result.valid) {
      log.info({ phone: tail(phone), reason: result.reason }, 'Confirm refused');
      sendJsonResponse(res, 400, CONFIRM_FAILED);
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
    log.error({ error: redactNumbers(String(error)), phone: tail(phone) }, 'Verification error');
    sendJsonResponse(res, 400, CONFIRM_FAILED);
  }
}
