/**
 * CALL_PATHS_PLACE_OR_HOLD (gated-call-paths.ts): the backgroundCall tool and the
 * referral calls go through placeOrHold and the on-behalf orchestrator, like
 * callOnBehalf. Before, both dialled on their own engine with no call-hours,
 * do-not-call or compliance check, and recorded the call as done at dial time.
 *
 * These run the real tools, executor, placeOrHold and orchestrator against a fake
 * LiveKit and an in-memory Firestore. The recipient is in Los Angeles (213), the
 * requester in New York.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

vi.hoisted(() => {
  // voice-call.ts reads these at load: Twilio is configured, as in prod (fictional values)
  process.env.TWILIO_ACCOUNT_SID = 'AC_test';
  process.env.TWILIO_AUTH_TOKEN = 'token';
  process.env.TWILIO_PHONE_NUMBER = '+12025550100';
});

let rows: Row[] = [];
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeFirestore(rows),
}));
vi.mock('../user-contact.js', () => ({
  getUserContactInfo: vi.fn(async () => ({ timezone: 'America/New_York' })),
}));

const createSipParticipant = vi.hoisted(() => vi.fn(async () => ({ participantId: 'PA_1' })));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    createRoom = vi.fn(async () => ({}));
    listParticipants = vi.fn(async () => [{ kind: 4 }]); // the agent is in
  },
  AgentDispatchClient: class {
    createDispatch = vi.fn(async () => ({}));
  },
  SipClient: class {
    createSipParticipant = createSipParticipant;
  },
}));
vi.mock('@livekit/agents', async (original) => {
  const real = await original<{ llm: Record<string, unknown> }>();
  const tool = (config: Record<string, unknown>) => config; // the tools' execute, called directly
  return { ...real, llm: { ...real.llm, tool } };
});
vi.mock('../../global-services.js', () => ({ getGlobalServicesSync: () => null }));

// The two old engines, so flag off can show they still run and flag on that they don't.
const oldBackgroundDial = vi.hoisted(() => vi.fn(async () => ({ success: true, callSid: 'CA_1' })));
const calling = vi.hoisted(() => ({ configured: true }));
vi.mock('../../voice/conversational-call-service.js', () => ({
  makeConversationalCall: oldBackgroundDial,
  isConversationalCallingConfigured: () => ({ ...calling, missing: [] }),
}));
// The executor as is, with gatedCallReply watched, so the tool's order can be pinned.
const gatedCallReply = vi.hoisted(() => vi.fn());
vi.mock('../../background-agents/executors/call-executor.js', async (original) => {
  const real =
    await original<typeof import('../../background-agents/executors/call-executor.js')>();
  gatedCallReply.mockImplementation(real.gatedCallReply);
  return { ...real, gatedCallReply };
});
// The old engines' own pre-dial checks, real unless a test says otherwise.
const realChecks = vi.hoisted(() => ({}) as Record<string, (...a: never[]) => unknown>);
const ownerRefusal = vi.hoisted(() => vi.fn());
vi.mock('../../messaging/consent-reach.js', async (original) => {
  const mod = await original<typeof import('../../messaging/consent-reach.js')>();
  realChecks.ownerRefusal = mod.ownerRefusal;
  return { ...mod, ownerRefusal };
});
const heldSender = vi.hoisted(() => vi.fn());
vi.mock('../checkin-replies.js', async (original) => {
  const mod = await original<typeof import('../checkin-replies.js')>();
  realChecks.heldSender = mod.heldSender;
  return { ...mod, heldSender };
});
const outreachPausedFor = vi.hoisted(() => vi.fn());
vi.mock('../outreach-pause.js', async (original) => {
  const mod = await original<typeof import('../outreach-pause.js')>();
  realChecks.outreachPausedFor = mod.outreachPausedFor;
  return { ...mod, outreachPausedFor };
});
const oldReferralDial = vi.hoisted(() =>
  vi.fn(async () => ({ success: true, message: 'ok', callSid: 'CA_2' }))
);
vi.mock('../../voice/voice-call.js', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  callWithPersonaVoice: oldReferralDial,
}));
const captureBackgroundResult = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('../../background-agents/unified-result-capture.js', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  captureBackgroundResult,
}));

process.env.LIVEKIT_URL = 'wss://example.livekit.cloud';
process.env.LIVEKIT_API_KEY = 'k';
process.env.LIVEKIT_API_SECRET = 's';
process.env.SIP_TRUNK_ID = 'ST_test';
process.env.OUTBOUND_CONFIRM = 'off'; // past the caller's yes: these test what happens next

const { definitions } = await import('../../../tools/domains/proactive/index.js');
const { installGatedCallPort } = await import('../gated-call-paths.js');
const { setGatedCallPort } = await import('../../../tools/domains/telephony/index.js');
const { createVoiceReferralTools, getReferralAnalytics } =
  await import('../../../tools/domains/referral/voice-referral.js');

type Execute = { execute: (p: Record<string, unknown>) => Promise<string> };
const background = definitions
  .find((d) => d.id === 'backgroundCall')!
  .create({ userId: 'owner-1', sessionId: 's1' } as never) as unknown as Execute;
const referral = createVoiceReferralTools('owner-1', 'Sam')
  .inviteFriendByCall as unknown as Execute;

const ANA = '+12135550100'; // Los Angeles area code
const callAna = () =>
  background.execute({ contactName: 'Ana', contactPhone: ANA, objective: 'confirm Saturday' });
const referAna = () => referral.execute({ friendName: 'Ana', friendPhone: ANA });

const ELEVEN_PM_LA = new Date('2026-10-14T06:00:00Z'); // Tue 23:00 in Los Angeles
const TEN_AM_LA = new Date('2026-10-13T17:00:00Z'); // Tue 10:00 in Los Angeles
const of = (collection: string) => rows.filter((r) => r.collection === collection);

beforeEach(() => {
  rows = [];
  vi.clearAllMocks();
  calling.configured = true;
  for (const [spy, name] of [
    [ownerRefusal, 'ownerRefusal'],
    [heldSender, 'heldSender'],
    [outreachPausedFor, 'outreachPausedFor'],
  ] as const)
    spy.mockReset().mockImplementation(realChecks[name]);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TEN_AM_LA);
  process.env.CALL_PATHS_PLACE_OR_HOLD = 'on';
  process.env.CALL_HOURS_GUARD = 'on';
  process.env.ON_BEHALF_DNC_CHECK = 'on';
  installGatedCallPort(); // as live-call-behaviors.ts does on every call
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.CALL_PATHS_PLACE_OR_HOLD;
  delete process.env.CALL_HOURS_GUARD;
  delete process.env.ON_BEHALF_DNC_CHECK;
});

describe('backgroundCall through placeOrHold', () => {
  it('quiet hours: held for their 9:00, nothing dialled', async () => {
    vi.setSystemTime(ELEVEN_PM_LA);
    const reply = await callAna();

    expect(reply).toBe(
      "Nothing was dialed yet: it's not a good hour to call Ana, so I'll call tomorrow at 9:00 AM Ana's time, later today at 12:00 PM yours, to confirm Saturday. Both times are already worked out: say them as written."
    );
    expect(of('deferred_calls')).toHaveLength(1);
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(oldBackgroundDial).not.toHaveBeenCalled();
    expect(captureBackgroundResult).not.toHaveBeenCalled();
  });

  it('a number on the do-not-call list: refused, nothing dialled or held', async () => {
    rows.push({ id: ANA, userId: '', collection: 'call_opt_outs', data: {} });
    const reply = await callAna();

    expect(reply).toBe(
      "I can't call Ana: The recipient asked not to be called. No call was made. Want help with talking points so you can call yourself?"
    );
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(oldBackgroundDial).not.toHaveBeenCalled();
    expect(of('deferred_calls')).toHaveLength(0);
    expect(captureBackgroundResult).not.toHaveBeenCalled();
  });

  it('a number compliance refuses, at a quiet hour: refused now, never held to ring later', async () => {
    vi.setSystemTime(ELEVEN_PM_LA);
    const PREMIUM = '+19005550100';
    const reply = await background.execute({
      contactName: 'Ana',
      contactPhone: PREMIUM,
      objective: 'x',
    });

    expect(reply).toBe(
      `I can't call Ana: "${PREMIUM}" is a premium-rate number, which I won't dial. No call was made. Want help with talking points so you can call yourself?`
    );
    expect(of('deferred_calls')).toHaveLength(0);
    expect(createSipParticipant).not.toHaveBeenCalled();
  });

  it('a good hour: placed by the orchestrator and recorded as started, never completed', async () => {
    const reply = await callAna();

    expect(reply).toBe(
      "I'm calling Ana now to confirm Saturday. I'll tell you how it went once the call ends."
    );
    expect(createSipParticipant).toHaveBeenCalledOnce();
    expect(createSipParticipant.mock.calls[0]).toContain(ANA);
    expect(oldBackgroundDial).not.toHaveBeenCalled();
    expect(captureBackgroundResult).toHaveBeenCalledOnce();
    const [record] = captureBackgroundResult.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(record).toMatchObject({
      userId: 'owner-1',
      type: 'on_behalf_call',
      status: 'pending',
      summary: 'Started a call to Ana',
      specificData: { callStatus: 'started' },
      skipPush: true,
    });
  });

  it('no placer installed: refused, nothing rings unchecked', async () => {
    setGatedCallPort(undefined);
    const reply = await callAna();

    expect(reply).toBe(
      "I can't call Ana: calls can't be placed from here yet. No call was made. Want help with talking points so you can call yourself?"
    );
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(oldBackgroundDial).not.toHaveBeenCalled();
  });

  it('a call the old blocker refuses is still refused with its reply, before the gate', async () => {
    calling.configured = false; // no calling service: main says so, and nothing dials
    const reply = await callAna();

    expect(reply).toBe(
      "I can't call Ana: calls can't be placed from here yet. No call was made. Want help with talking points so you can call yourself?"
    );
    expect(gatedCallReply).not.toHaveBeenCalled(); // the blocker runs first in the tool
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(oldBackgroundDial).not.toHaveBeenCalled();
    expect(captureBackgroundResult).not.toHaveBeenCalled();
  });

  it('gatedCallReply runs the old blocker itself, whoever calls it', async () => {
    calling.configured = false;
    const { gatedCallReply: direct } =
      await import('../../background-agents/executors/call-executor.js');
    const reply = await direct({
      userId: 'owner-1',
      contactName: 'Ana',
      contactPhone: ANA,
      objective: 'x',
    });

    expect(reply).toBe(
      "I can't call Ana: calls can't be placed from here yet. No call was made. Want help with talking points so you can call yourself?"
    );
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(of('deferred_calls')).toHaveLength(0);
  });

  it('no call grant from this owner: refused in words, nothing dialled or held', async () => {
    ownerRefusal.mockResolvedValueOnce('needs-consent');
    vi.setSystemTime(ELEVEN_PM_LA); // refused now, never held to ring later
    const reply = await callAna();

    expect(reply).toBe(
      "I can't call Ana: they haven't said yes to calls from me yet. No call was made. Want help with talking points so you can call yourself?"
    );
    expect(ownerRefusal).toHaveBeenCalledWith('owner-1', ANA, 'call');
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(of('deferred_calls')).toHaveLength(0);
  });

  it('a minor-care hold: refused with no detail, nothing dialled or held', async () => {
    heldSender.mockResolvedValue(true);
    vi.setSystemTime(ELEVEN_PM_LA); // refused now, never held to ring later
    const reply = await callAna();

    expect(reply).toBe(
      "I can't call Ana: the call could not be placed. No call was made. Want help with talking points so you can call yourself?"
    );
    expect(heldSender).toHaveBeenCalledWith('owner-1', ANA);
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(of('deferred_calls')).toHaveLength(0);
  });

  it('outreach paused: a call the user asked for still goes, as on the old engine', async () => {
    outreachPausedFor.mockResolvedValue(true);
    const reply = await callAna();

    expect(outreachPausedFor).not.toHaveBeenCalled(); // the user asked for it, as on the old engine
    expect(reply).toBe(
      "I'm calling Ana now to confirm Saturday. I'll tell you how it went once the call ends."
    );
    expect(createSipParticipant).toHaveBeenCalledOnce();
  });

  it('flag off: the old engine, as before', async () => {
    delete process.env.CALL_PATHS_PLACE_OR_HOLD;
    vi.setSystemTime(ELEVEN_PM_LA); // the old path never looked at the hour
    const reply = await callAna();

    expect(reply).toMatch(/^\*\*Call Scheduled\*\* 📞\n\nI'll call Ana on your behalf\./);
    await vi.waitFor(() => expect(oldBackgroundDial).toHaveBeenCalledOnce());
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(of('deferred_calls')).toHaveLength(0);
  });
});

describe('referral calls through placeOrHold', () => {
  it('quiet hours: held, said plainly, nothing dialled or tracked', async () => {
    vi.setSystemTime(ELEVEN_PM_LA);
    const reply = await referAna();

    expect(reply).toBe(
      "Nothing was dialed yet: it's not a good hour to call Ana, so I'll call tomorrow at 9:00 AM Ana's time, later today at 12:00 PM yours, to let Ana know you're thinking of them. Both times are already worked out: say them as written."
    );
    expect(of('deferred_calls')).toHaveLength(1);
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(oldReferralDial).not.toHaveBeenCalled();
    expect(of('voice_referrals')).toHaveLength(0);
  });

  it('a number on the do-not-call list: refused, nothing dialled or tracked', async () => {
    rows.push({ id: ANA, userId: '', collection: 'call_opt_outs', data: {} });
    const reply = await referAna();

    expect(reply).toBe(
      "I didn't call Ana: The recipient asked not to be called. No call was made."
    );
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(oldReferralDial).not.toHaveBeenCalled();
    expect(of('voice_referrals')).toHaveLength(0);
  });

  it("a call main refuses (a minor-care hold) gets main's reply, before the gate", async () => {
    heldSender.mockResolvedValue(true);
    const reply = await referAna();

    expect(reply).toBe(
      'I tried to call Ana, but something went wrong: Not calling: held. Could you double-check the phone number?'
    );
    expect(heldSender).toHaveBeenCalledWith('owner-1', ANA);
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(oldReferralDial).not.toHaveBeenCalled();
    expect(of('deferred_calls')).toHaveLength(0);
    expect(of('voice_referrals')).toHaveLength(0);
  });

  it("outreach paused: refused with main's reply, nothing dialled or tracked", async () => {
    outreachPausedFor.mockResolvedValueOnce(true);
    const reply = await referAna();

    expect(reply).toBe(
      'I tried to call Ana, but something went wrong: Not calling: outreach paused. Could you double-check the phone number?'
    );
    expect(outreachPausedFor).toHaveBeenCalledWith('owner-1', ANA);
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(of('voice_referrals')).toHaveLength(0);
  });

  it("no call grant from the referrer: refused with main's reply, nothing dialled", async () => {
    ownerRefusal.mockResolvedValueOnce('opted-out');
    const reply = await referAna();

    expect(reply).toBe(
      'I tried to call Ana, but something went wrong: Not calling: opted-out. Could you double-check the phone number?'
    );
    expect(oldReferralDial).not.toHaveBeenCalled();
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(of('voice_referrals')).toHaveLength(0);
  });

  it('a good hour: placed and tracked as started, never as called', async () => {
    const reply = await referAna();

    // A live call: no promise of a recorded hello.
    expect(reply).toBe("I'm calling Ana now to let them know you're thinking of them.");
    expect(createSipParticipant).toHaveBeenCalledOnce();
    expect(oldReferralDial).not.toHaveBeenCalled();
    const [tracked] = of('voice_referrals');
    expect(tracked.data).toMatchObject({ recipientName: 'Ana', status: 'started' });
    expect(tracked.data.callSid).toMatch(/^onbehalf_/);
  });

  it("analytics count a placed call ('started') and a one-way call ('called') as called", async () => {
    const before = await getReferralAnalytics('owner-1');
    await referAna(); // placed through placeOrHold: 'started'
    delete process.env.CALL_PATHS_PLACE_OR_HOLD;
    await referAna(); // the one-way call: 'called'

    const after = await getReferralAnalytics('owner-1');
    expect(after.totalReferrals - before.totalReferrals).toBe(2);
    expect(after.called - before.called).toBe(2);
  });

  it('flag off: the one-way call, tracked as called, as before', async () => {
    delete process.env.CALL_PATHS_PLACE_OR_HOLD;
    const reply = await referAna();

    expect(reply).toMatch(/^The call to Ana has gone out\./);
    expect(oldReferralDial).toHaveBeenCalledOnce();
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(of('voice_referrals')[0].data).toMatchObject({ status: 'called', callSid: 'CA_2' });
  });
});
