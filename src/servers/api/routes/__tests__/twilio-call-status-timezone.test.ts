/**
 * The Twilio fallback path reported every call result in America/Los_Angeles
 * (outreach audit 2026-10-29, A), so the call-result text's quiet hours were
 * read on the wrong clock: a Tokyo owner got texted at 03:00. It now uses the
 * owner's saved zone (call-hours-guard userTimezone), and with none holds the
 * text rather than guess (call-result-text: no-time-zone).
 *
 * Real path: handleTwilioCallStatus -> captureCallResult -> call-result-text.
 */
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
}));
vi.mock('../../../../services/outreach/delivery/push-notifications.js', () => ({
  isPushNotificationsAvailable: () => false,
  sendPushNotification: vi.fn(),
}));
const text = vi.hoisted(() => vi.fn(async () => ({ sent: true })));
vi.mock('../../../../services/outreach/guarded-text.js', () => ({ sendGuardedText: text }));
const savedZone = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('../../../../services/outreach/user-contact.js', () => ({
  getUserContactInfo: async () => (savedZone.value ? { timezone: savedZone.value } : undefined),
}));

const { handleTwilioCallStatus, trackOutboundCall } = await import('../twilio-call-status.js');

/** A real request carrying Twilio's form body (signature checks are skipped under test). */
function webhook(callSid: string): IncomingMessage {
  const req = new IncomingMessage(new Socket());
  req.method = 'POST';
  req.url = '/api/webhooks/call-status';
  const body = new URLSearchParams({ CallSid: callSid, AccountSid: 'AC0', From: '+15555550111', To: '+15555550100', CallStatus: 'completed', CallDuration: '40', Direction: 'outbound-api', AnsweredBy: 'human' }); // prettier-ignore
  req.push(body.toString());
  req.push(null);
  return req;
}
const res = (req: IncomingMessage): ServerResponse => new ServerResponse(req);

let n = 0;
async function finishCall(): Promise<void> {
  const sid = `CA-tz-${++n}`;
  trackOutboundCall(sid, { callId: `call-tz-${n}`, userId: `u-tz-${n}`, contactName: 'Aunt Rosa', purpose: 'check in', objective: 'check_in', callType: 'personal', originalSessionId: '', startedAt: new Date().toISOString() }); // prettier-ignore
  const req = webhook(sid);
  await handleTwilioCallStatus(req, res(req));
}

beforeEach(() => {
  process.env.SKIP_TWILIO_VALIDATION = 'true';
  process.env.CALL_RESULT_TEXT = 'on';
  vi.useFakeTimers({ toFake: ['Date'] });
  // 18:00 UTC: 11:00 in Los Angeles, 03:00 the next morning in Tokyo.
  vi.setSystemTime(new Date('2026-10-29T18:00:00Z'));
  text.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.SKIP_TWILIO_VALIDATION;
  delete process.env.CALL_RESULT_TEXT;
  savedZone.value = undefined;
});

describe('Twilio fallback: the owner’s own time zone', () => {
  it('reads quiet hours in the saved zone: no text at 03:00 in Tokyo', async () => {
    savedZone.value = 'Asia/Tokyo';
    await finishCall();
    expect(text).not.toHaveBeenCalled();
  });

  it('texts when it is daytime in the saved zone', async () => {
    savedZone.value = 'America/Los_Angeles';
    await finishCall();
    expect(text).toHaveBeenCalledTimes(1);
  });

  it('no saved zone: holds the text rather than guess a coast', async () => {
    await finishCall();
    expect(text).not.toHaveBeenCalled();
  });
});
