/**
 * With CALL_FOLLOWTHROUGH=on, the report after an on-behalf call says whether
 * it reached voicemail or the person hung up early, and a missed call
 * (no answer or voicemail) is retried once the next day. With the flag off,
 * reporting is unchanged.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../../services/scheduling/__tests__/fake-firestore.js';

let rows: Row[] = [];
vi.mock('../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeFirestore(rows),
}));
vi.mock('../../../services/data-layer/hooks/misc-hooks.js', () => ({
  onCallResultChange: vi.fn(),
  onFollowUpActionChange: vi.fn(),
}));
vi.mock('../../../services/background-agents/unified-result-capture.js', () => ({
  captureBackgroundResult: vi.fn(async () => ({})),
}));
vi.mock('../../../services/outreach/delivery/push-notifications.js', () => ({
  isPushNotificationsAvailable: () => false,
  sendPushNotification: vi.fn(),
}));

const { beginOnBehalfCall, classifyAnsweredCall, completeOnBehalfCall } =
  await import('../on-behalf-call-lifecycle.js');
import type { CallLifecyclePorts } from '../on-behalf-call-lifecycle.js';
import type { CallTranscriptTurn } from '../../../services/outreach/call-transcript-intelligence.js';
import {
  buildOnBehalfDispatch,
  parseOnBehalfDispatch,
} from '../../../services/outreach/on-behalf-dispatch.js';

let n = 0;
const makeCall = (extra: Record<string, unknown> = {}) =>
  parseOnBehalfDispatch({
    ...buildOnBehalfDispatch({
      callId: `call-${++n}`,
      requester: {
        userId: 'user-1',
        name: 'Seth',
        timezone: 'America/New_York',
        originalSessionId: 's0',
      },
      contact: { name: 'Mom', phone: '+15555550100', relationship: 'mother' },
      purpose: 'check in',
      objective: 'check_in',
      callType: 'personal',
    }),
    ...extra,
  })!;
const said = (...lines: string[]): CallTranscriptTurn[] =>
  lines.flatMap((content) => [
    { role: 'agent' as const, content: 'Hi, it is Ferni.' },
    { role: 'recipient' as const, content },
  ]);
const voicemail = said("Hi, you've reached Mom. Leave a message after the tone.");

function ports(turns: CallTranscriptTurn[], retryAt: Date | null = null) {
  return {
    readTranscript: vi.fn<CallLifecyclePorts['readTranscript']>(() => turns),
    analyze: vi.fn<CallLifecyclePorts['analyze']>(async () => null),
    report: vi.fn<CallLifecyclePorts['report']>(async () => undefined),
    scheduleRetry: vi.fn(async () => retryAt),
  } satisfies CallLifecyclePorts;
}

afterEach(() => {
  delete process.env.CALL_FOLLOWTHROUGH;
});

describe('classifyAnsweredCall', () => {
  it.each([
    [
      'a voicemail greeting',
      ["You've reached Mom, leave a message after the beep"],
      30,
      'voicemail',
    ],
    ['one reply then gone', ['Who is this?'], 71, 'hung_up_early'],
    ['a very short exchange', ['Hey', 'Gotta run'], 12, 'hung_up_early'],
    ['a conversation', ['Oh hi!', 'Doing great', 'Tell him to call me'], 95, 'answered'],
    [
      'a person who says they are not available',
      ['Hi', "I'm not available right now for Sunday", 'next week works', 'Bye'],
      90,
      'answered',
    ],
  ])('%s -> %s', (_label, heard, seconds, expected) => {
    expect(classifyAnsweredCall(heard, seconds)).toBe(expected);
  });
});

describe('completeOnBehalfCall with CALL_FOLLOWTHROUGH', () => {
  it('reports voicemail as voicemail, and retries it the next day', async () => {
    process.env.CALL_FOLLOWTHROUGH = 'on';
    const p = ports(voicemail, new Date('2026-10-11T14:30:00.000Z'));
    const call = makeCall();

    const outcome = await completeOnBehalfCall('s1', call, 25, true, p);

    expect(outcome).toMatchObject({
      status: 'voicemail',
      objectiveAchieved: false,
      outcome: "I got Mom's voicemail, so I'll try again tomorrow.",
      callbackRequired: false,
    });
    expect(p.analyze).not.toHaveBeenCalled();
    expect(p.scheduleRetry).toHaveBeenCalledWith(
      call.callId,
      expect.objectContaining({
        userId: 'user-1',
        resolvedContact: expect.objectContaining({ phone: '+15555550100' }),
      })
    );
    expect(p.report).toHaveBeenCalledWith(call.callId, outcome, expect.anything());
  });

  it('retries an unanswered call, and keeps the old wording when no retry was scheduled', async () => {
    process.env.CALL_FOLLOWTHROUGH = 'on';
    const retried = await completeOnBehalfCall('s2', makeCall(), 40, true, ports([], new Date()));
    expect(retried).toMatchObject({
      status: 'no_answer',
      outcome: "I couldn't reach Mom, so I'll try again tomorrow.",
      callbackRequired: false,
    });

    const notRetried = await completeOnBehalfCall('s3', makeCall(), 40, true, ports([], null));
    expect(notRetried).toMatchObject({ status: 'no_answer', callbackRequired: true });
    expect(notRetried?.outcome).toContain('Want me to try again later?');
  });

  it('says the person hung up early instead of summarizing one line', async () => {
    process.env.CALL_FOLLOWTHROUGH = 'on';
    const p = ports(said('Who is this?'));

    const outcome = await completeOnBehalfCall('s4', makeCall(), 71, true, p);

    expect(outcome).toMatchObject({
      status: 'completed',
      objectiveAchieved: false,
      outcome:
        'I reached Mom, but they had to go before we really got to talk. They said: "Who is this?"',
    });
    expect(p.analyze).not.toHaveBeenCalled();
    expect(p.scheduleRetry).not.toHaveBeenCalled();
  });

  it('still summarizes a real conversation and never retries it', async () => {
    process.env.CALL_FOLLOWTHROUGH = 'on';
    const p = ports(said('Oh hi!', 'Doing great', 'Tell him to call me'));
    await completeOnBehalfCall('s5', makeCall(), 95, true, p);
    expect(p.analyze).toHaveBeenCalled();
    expect(p.scheduleRetry).not.toHaveBeenCalled();
  });

  it('carries retryOf from the dispatch to the request the retry is scheduled with', async () => {
    process.env.CALL_FOLLOWTHROUGH = 'on';
    const p = ports([]);
    const call = makeCall({ retryOf: 'call-0' });
    expect(call.retryOf).toBe('call-0');
    await completeOnBehalfCall('s6', call, 40, true, p);
    expect(p.scheduleRetry).toHaveBeenCalledWith(
      call.callId,
      expect.objectContaining({ retryOf: 'call-0' })
    );
  });

  it('on the live path, stores the result and the one retry for the requester', async () => {
    process.env.CALL_FOLLOWTHROUGH = 'on';
    rows = [];
    const call = makeCall();
    await beginOnBehalfCall('s9', call);

    const outcome = await completeOnBehalfCall('s9', call, 40, true);

    expect(outcome).toMatchObject({ status: 'no_answer', callbackRequired: false });
    expect(rows.find((r) => r.collection === 'on_behalf_calls')).toMatchObject({
      id: call.callId,
      userId: 'user-1',
    });
    expect(rows.find((r) => r.collection === 'scheduled_outreach')).toMatchObject({
      id: `retry_${call.callId}`,
      userId: 'user-1',
    });
  });

  it('changes nothing with the flag off', async () => {
    const vm = ports(voicemail, new Date());
    const vmOutcome = await completeOnBehalfCall('s7', makeCall(), 25, true, vm);
    expect(vmOutcome?.status).toBe('completed');
    expect(vm.analyze).toHaveBeenCalled();

    const missed = ports([], new Date());
    const missedOutcome = await completeOnBehalfCall('s8', makeCall(), 40, true, missed);
    expect(missedOutcome).toMatchObject({ status: 'no_answer', callbackRequired: true });
    expect(missed.scheduleRetry).not.toHaveBeenCalled();
  });
});
