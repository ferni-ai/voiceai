/**
 * A call Ferni placed whose voice agent can't be dispatched must not leave the
 * person who answered in silence: the live call is switched to a short apology
 * and a hang-up. Twilio then reports it "completed", which must not be recorded
 * as a successful call: it is a failed call, our fault (PROMISE_OUTCOME
 * on-behalf-call failed/provider-error).
 *
 * Real path: endCallAfterFailedDispatch -> handleTwilioCallStatus ->
 * captureCallResult -> logCallResultOutcome.
 */
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../../outreach/delivery/push-notifications.js', () => ({
  isPushNotificationsAvailable: () => false,
  sendPushNotification: vi.fn(),
}));
vi.mock('../../outreach/guarded-text.js', () => ({
  sendGuardedText: vi.fn(async () => ({ sent: true })),
}));
vi.mock('../../outreach/user-contact.js', () => ({ getUserContactInfo: async () => undefined }));
const logCallResultOutcome = vi.hoisted(() => vi.fn());
vi.mock('../../follow-through/promise-outcomes.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../follow-through/promise-outcomes.js')>()),
  logCallResultOutcome,
}));

const { DISPATCH_FAILED_TWIML, endCallAfterFailedDispatch } =
  await import('../dispatch-failed-call.js');
const { handleTwilioCallStatus, trackOutboundCall } =
  await import('../../../servers/api/routes/twilio-call-status.js');
const { callResultOutcome } = await import('../../follow-through/promise-outcomes.js');

const env = { TWILIO_ACCOUNT_SID: 'AC-test', TWILIO_AUTH_TOKEN: 'test-token' };
const okFetch = () => vi.fn(async () => new Response('{}', { status: 200 }));

let n = 0;
function track(): { sid: string; callId: string; userId: string } {
  const ids = { sid: `CA-df-${++n}`, callId: `call-df-${n}`, userId: `u-df-${n}` };
  trackOutboundCall(ids.sid, { callId: ids.callId, userId: ids.userId, contactName: 'Aunt Rosa', purpose: 'check in', objective: 'check_in', callType: 'personal', originalSessionId: '', startedAt: new Date().toISOString() }); // prettier-ignore
  return ids;
}

/** Twilio's signed status callback after the hang-up (signature checks are skipped under test). */
async function twilioReportsCompleted(sid: string): Promise<void> {
  const req = new IncomingMessage(new Socket());
  req.method = 'POST';
  req.url = '/api/webhooks/call-status';
  req.push(new URLSearchParams({ CallSid: sid, AccountSid: 'AC-test', From: '+15555550111', To: '+15555550100', CallStatus: 'completed', CallDuration: '6', Direction: 'outbound-api', AnsweredBy: 'human' }).toString()); // prettier-ignore
  req.push(null);
  await handleTwilioCallStatus(req, new ServerResponse(req));
}

beforeEach(() => {
  process.env.SKIP_TWILIO_VALIDATION = 'true';
  logCallResultOutcome.mockClear();
});
afterEach(() => {
  delete process.env.SKIP_TWILIO_VALIDATION;
});

describe('agent dispatch failed on a call Ferni placed', () => {
  it('the TwiML apologises, then hangs up', () => {
    expect(DISPATCH_FAILED_TWIML).toMatch(
      /<Response><Say>[^<]*Ferni[^<]*<\/Say><Hangup\/><\/Response>$/
    );
  });

  it('switches the live call to that TwiML', async () => {
    const { sid } = track();
    const fetch = okFetch();
    expect(await endCallAfterFailedDispatch(sid, { fetch, env })).toBe(true);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/AC-test/Calls/${sid}.json`);
    expect(init.method).toBe('POST');
    expect(new URLSearchParams(String(init.body)).get('Twiml')).toBe(DISPATCH_FAILED_TWIML);
  });

  it('records the call as failed (our fault), not completed', async () => {
    const { sid, callId, userId } = track();
    await endCallAfterFailedDispatch(sid, { fetch: okFetch(), env });
    await twilioReportsCompleted(sid);
    expect(logCallResultOutcome).toHaveBeenCalledWith(callId, 'failed', userId);
    expect(callResultOutcome('failed')).toEqual({ outcome: 'failed', reason: 'provider-error' });
  });

  it('a call whose agent joined still records completed', async () => {
    const { sid, callId, userId } = track();
    await twilioReportsCompleted(sid);
    expect(logCallResultOutcome).toHaveBeenCalledWith(callId, 'completed', userId);
  });

  it('Twilio refusing the update is reported, not swallowed as success', async () => {
    const { sid } = track();
    const fetch = vi.fn(async () => new Response('', { status: 404 }));
    expect(await endCallAfterFailedDispatch(sid, { fetch, env })).toBe(false);
    expect(await endCallAfterFailedDispatch(sid, { fetch: okFetch(), env: {} })).toBe(false);
  });
});
