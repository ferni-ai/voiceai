/**
 * makePhoneCall's Twilio call: it plays one message to the number it rings.
 *
 * @module tools/domains/communication/phone-call
 */
import { notCalling, ownerRefusal } from '../../../utils/consent-port.js';
import { directSendHeld } from '../../../services/communication-service.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { messageCallGreeting } from '../../../utils/ferni-intro.js';
import { normalizePhone, sanitizePhoneForLog, validatePhone } from '../../validation.js';
import { getCallUserPort } from '../proactive/outreach/call-user-port.js';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';

/** Ringing the owner's own phone keeps the words it always had. */
const SELF_CALL_GREETING = 'Hi! This is a call from Alex, your communication assistant.';

/** True only for the owner's own verified number (call-user port); no port or a failed read is someone else. */
async function isOwnersPhone(ownerUid: string | undefined, phone: string): Promise<boolean> {
  if (!ownerUid) return false;
  try {
    const own = await getCallUserPort()?.verifiedPhone(ownerUid);
    return own !== undefined && normalizePhone(own) === phone;
  } catch (error) {
    getLogger().warn(
      { error: String(error) },
      'Own-number check failed; opening with who is calling'
    );
    return false;
  }
}

/**
 * Outbound Twilio call that plays one message. Both ids are the session's,
 * never a model arg: consent, then the hold. Anyone but the owner first hears
 * who is calling and for whom (utils/ferni-intro.ts).
 */
export async function makePhoneCall(
  to: string,
  purpose: string,
  ownerUid: string | undefined,
  holdUid?: string,
  ownerName?: string
): Promise<string> {
  const validation = validatePhone(to);
  if (!validation.valid) {
    return `I need a valid phone number to make a call. Can you double-check "${to}"?`;
  }

  const validPhone = validation.sanitized as string;
  // MESSAGING_PIPELINE: the owner's own number, or someone who gave this owner a call grant.
  const refused = await ownerRefusal(ownerUid, validPhone, 'call');
  if (refused) return notCalling(refused);
  if (await directSendHeld(validPhone, 'call', { userId: holdUid })) return 'Not calling: held.';

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    getLogger().warn('Twilio not configured for calls');
    return `I'd love to make that call, but my phone service isn't fully set up yet. Let me send a text instead?`;
  }

  try {
    const greeting = (await isOwnersPhone(ownerUid, validPhone))
      ? SELF_CALL_GREETING
      : messageCallGreeting(ownerName);
    const defaultTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${greeting} ${purpose}. Have a great day!</Say>
</Response>`;

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: validPhone,
          From: TWILIO_PHONE_NUMBER,
          Twiml: defaultTwiml,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (response.ok) {
      const data = (await response.json()) as { sid?: string };
      getLogger().info(
        { to: sanitizePhoneForLog(validPhone), callSid: data.sid },
        '📞 Call initiated'
      );
      return `Done! Calling ${sanitizePhoneForLog(validPhone)} now. They'll get a brief voice message about: "${purpose}"`;
    } else {
      const errorBody = await response.text();
      getLogger().error({ status: response.status, body: errorBody }, 'Twilio call error');
      return `I had trouble starting that call. Let me send a text instead?`;
    }
  } catch (error) {
    getLogger().error({ error }, 'Phone call error');
    return `Something went wrong with the call. Would a text work instead?`;
  }
}
