/**
 * When the voice agent can't be dispatched to a call Ferni placed, the person
 * who answered must not sit in silence. The live call is redirected to a short
 * apology and a hang-up, and a tracked on-behalf call is flagged so its Twilio
 * status callback records it as failed (our fault), not as a completed call.
 *
 * The words promise nothing: no retry is scheduled for the contact here, so it
 * never says "I'll call you back".
 *
 * @module services/voice/dispatch-failed-call
 */
import { createLogger } from '../../utils/safe-logger.js';
import { markDispatchFailed } from '../outreach/outbound-call-tracker.js';

const log = createLogger({ module: 'dispatch-failed-call' });

export const DISPATCH_FAILED_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?><Response>' +
  "<Say>Hi, it's Ferni. Sorry, something went wrong on my end and I can't talk right now. Goodbye for now.</Say>" +
  '<Hangup/></Response>';

interface Deps {
  fetch?: typeof fetch;
  env?: Readonly<Record<string, string | undefined>>;
}

/**
 * Say sorry and hang up on the live call, and flag a tracked on-behalf call as
 * failed. Returns true when Twilio accepted the new TwiML.
 */
export async function endCallAfterFailedDispatch(
  callSid: string,
  deps: Deps = {}
): Promise<boolean> {
  const env = deps.env ?? process.env;
  if (!markDispatchFailed(callSid)) {
    log.warn({ callSid }, 'Agent dispatch failed on an untracked call; no call result recorded');
  }

  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    log.error({ callSid }, 'Agent dispatch failed and Twilio is not configured; call left open');
    return false;
  }
  try {
    const response = await (deps.fetch ?? fetch)(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ Twiml: DISPATCH_FAILED_TWIML }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!response.ok) {
      log.error(
        { callSid, status: response.status },
        'Could not end the call after failed dispatch'
      );
      return false;
    }
    log.info({ callSid }, 'Said sorry and hung up after failed agent dispatch');
    return true;
  } catch (error) {
    log.error({ callSid, error: String(error) }, 'Could not end the call after failed dispatch');
    return false;
  }
}
