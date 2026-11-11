/**
 * A call Ferni places to the owner's number (a proactive self-call) carries a
 * signed dispatch that names the account, so its session is verifiedCaller;
 * but anyone can answer that phone. voice-agent-entry marks such a session
 * placedCall (verified-caller.ts), and ownerMessagePolicy never treats it as
 * the verified owner: with UNVERIFIED_OWNER_MESSAGE_FILTER on it gets the
 * unverified treatment (filter, footer, cap), and with the flag off nothing
 * changes. An owner verified in the app is unchanged either way.
 * All data is fictional.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { callerVerification } from '../../../../../services/identity/verified-caller.js';
import {
  UNVERIFIED_CAP_REFUSAL,
  UNVERIFIED_CONTENT_REFUSAL,
  UNVERIFIED_FOOTER,
  ownerMessagePolicy,
  type OwnerMessage,
} from '../owner-message-policy.js';

const OWNER = 'owner-uid';
const PHISH = 'your bank needs you to call 212 555 0198 today';
let calls = 0;

/** A live call's options, its userData built the way voice-agent-entry builds it. */
function session(callType: string | undefined, verified = true) {
  const userData = {
    userId: OWNER,
    ...callerVerification(verified, callType),
    services: { sessionId: `session-PC_${++calls}` },
  };
  return { toolCallId: 't', ctx: { userData } };
}
const message = (opts: unknown, text: string): OwnerMessage => ({
  tool: 'sendMessageNow',
  ownerId: OWNER,
  opts,
  texts: [text],
  spoken: false,
});

beforeEach(() => vi.stubEnv('UNVERIFIED_OWNER_MESSAGE_FILTER', 'on'));
afterEach(() => vi.unstubAllEnvs());

describe('a self-call (proactive_outreach), verifiedCaller from the dispatch', () => {
  it('with the flag on, phishing content is refused', () => {
    expect(ownerMessagePolicy(message(session('proactive_outreach'), PHISH))).toEqual({
      outcome: 'refused',
      reason: 'digits',
      line: UNVERIFIED_CONTENT_REFUSAL,
    });
  });

  it('with the flag on, an ordinary message is allowed with the footer, and capped', () => {
    const call = session('proactive_outreach');
    const allowed = { outcome: 'unverified_allowed', footer: UNVERIFIED_FOOTER };
    expect(ownerMessagePolicy(message(call, 'water the plants'))).toEqual(allowed);
    expect(ownerMessagePolicy(message(call, 'call the vet'))).toEqual(allowed);
    expect(ownerMessagePolicy(message(call, 'buy stamps'))).toMatchObject({ line: UNVERIFIED_CAP_REFUSAL }); // prettier-ignore
  });

  it('with the flag off, it is unchanged', () => {
    vi.stubEnv('UNVERIFIED_OWNER_MESSAGE_FILTER', 'off');
    expect(ownerMessagePolicy(message(session('proactive_outreach'), PHISH))).toEqual({ outcome: 'unchanged' }); // prettier-ignore
  });
});

describe('an owner verified in the app (signed in, no call type)', () => {
  it.each(['on', 'off'])('is unchanged with the flag %s', (flag) => {
    vi.stubEnv('UNVERIFIED_OWNER_MESSAGE_FILTER', flag);
    expect(ownerMessagePolicy(message(session(undefined), PHISH))).toEqual({ outcome: 'unchanged' }); // prettier-ignore
  });
});
