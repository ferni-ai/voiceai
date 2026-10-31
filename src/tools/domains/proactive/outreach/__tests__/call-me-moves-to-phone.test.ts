/**
 * CALL_ME_MOVES_TO_PHONE through the registered callUser tool (telephony
 * domain): owner test 2026-10-23, asked in the app to "give me a call", the
 * phone rang with Ferni live and the app call stayed open, so there were two
 * Ferni conversations at once; and a dial that failed at once had already been
 * announced as "calling you now".
 *
 * On: the reply comes at once (no dead air waiting on the dial) and only says
 * Ferni is trying their phone, never that it connected; answered ends the app
 * call (its ender), and the phone agent gets a reference to the app call's
 * conversation (an id; never its text, which would sit in LiveKit's dispatch
 * metadata); unanswered or failed, early or late, keeps it open and Ferni
 * corrects itself at the next pause. Off: unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { definitions } from '../../../telephony/index.js';
import type { ToolContext } from '../../../../registry/types.js';
import { registerVoiceCallbackHandler } from '../../../simple-utilities/voice-callbacks.js';
import type { VoiceCallback } from '../../../simple-utilities/voice-callbacks.js';
import {
  ALREADY_RINGING,
  RINGING_HAND_OVER,
  setPhoneMoveEnd,
  TRYING_PHONE,
} from '../call-me-moves-to-phone.js';
import { CALLING_LATER, CALLING_VOICE_MESSAGE } from '../call-placed-reply.js';
import {
  setCallUserPort,
  type CallUserRequest,
  type CallUserResult,
  type DialOutcome,
} from '../call-user-port.js';

type Executable = { execute: (args: Record<string, unknown>, o: unknown) => Promise<string> };

const USER = 'owner-uid';
const PHONE = '+15555550123';

const CONVERSATION = 'conv_1761234567890_abc123';
const SAID = 'my sister is moving to Denver next month';

/** The app call's AgentSession: its history holds what was said. */
function appSession() {
  return { history: { items: [{ type: 'message', role: 'user', textContent: SAID }] } };
}

/** The call's userData: session-manager's services, with the conversation it persists to. */
const userDataFor = (conversationId = CONVERSATION) => ({
  userId: USER,
  verifiedCaller: true, // an app caller the server verified (verified-owner-only.ts)
  services: { realtimeConversationId: conversationId },
});

/** A dial the test settles by hand. */
function pendingDial() {
  let settle!: (o: DialOutcome) => void;
  const dial = new Promise<DialOutcome>((resolve) => {
    settle = resolve;
  });
  return { dial, settle };
}

const requests: CallUserRequest[] = [];
function portReturning(result: CallUserResult) {
  setCallUserPort({
    verifiedPhone: async () => PHONE,
    call: async (request) => {
      requests.push(request);
      return result;
    },
  });
}

function callUser(): Executable {
  const def = definitions.find((d) => d.id === 'callUser')!;
  const ctx: ToolContext = { agentId: 'ferni', agentDisplayName: 'Ferni', userId: USER };
  return def.create(ctx) as Executable;
}

const ask = (session: object, userData: object = userDataFor()) =>
  callUser().execute(
    { reason: 'can you give me a call', message: 'Calling like you asked.' },
    { toolCallId: 't', ctx: { session, userData } }
  );

const spoken: VoiceCallback[] = [];
let unregister: () => void = () => undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('TOOLS_REAL_CALL_USER', 'on');
  vi.stubEnv('CALL_ME_MOVES_TO_PHONE', 'on');
  requests.length = 0;
  spoken.length = 0;
});
afterEach(() => {
  unregister();
  setCallUserPort(undefined);
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

/** An app call with its ender and its voice-callback speaker registered, as a live call has. */
function appCall() {
  const session = appSession();
  const end = vi.fn(async () => true);
  setPhoneMoveEnd(session, end);
  unregister = registerVoiceCallbackHandler(USER, async (cb) => void spoken.push(cb), session);
  return { session, end };
}

/** The reply as it stands once pending promises settle, with no time passing. */
async function replyAtOnce(reply: Promise<string>): Promise<string | undefined> {
  let said: string | undefined;
  void reply.then((r) => (said = r));
  await vi.advanceTimersByTimeAsync(0);
  return said;
}

/** What the reply lets Ferni claim: trying their phone, never that it connected or rings. */
function honestInProgress(reply: string | undefined): void {
  expect(reply).toMatch(/trying their phone/);
  expect(reply).toMatch(/never say it connected or that it's ringing/);
  expect(reply).not.toMatch(/phone is ringing|calling you now|it connected\./i);
}

describe('CALL_ME_MOVES_TO_PHONE=on', () => {
  it('replies at once while the dial is still pending: no dead air waiting on the phone', async () => {
    const { session } = appCall();
    portReturning({ success: true, status: 'initiated', live: true, dial: pendingDial().dial });
    const reply = await replyAtOnce(ask(session)); // the dial never settles here
    expect(reply).toBe(RINGING_HAND_OVER);
    honestInProgress(reply);
  });

  it('answered: hands over a reference, then ends the app call', async () => {
    const { session, end } = appCall();
    const { dial, settle } = pendingDial();
    portReturning({ success: true, status: 'initiated', live: true, dial });

    expect(await replyAtOnce(ask(session))).toBe(RINGING_HAND_OVER);
    expect(requests[0].handover).toEqual({ conversationId: CONVERSATION });
    // The reference only: nothing the caller said leaves this call
    expect(JSON.stringify(requests[0])).not.toContain(SAID);

    expect(end).not.toHaveBeenCalled(); // still ringing: the app call stays
    settle('answered');
    await vi.waitFor(() => expect(end).toHaveBeenCalled());
    expect(end).toHaveBeenCalledTimes(1);
    expect(spoken).toEqual([]);
  });

  it('not answered: the app call stays open and Ferni says they did not pick up', async () => {
    const { session, end } = appCall();
    const { dial, settle } = pendingDial();
    portReturning({ success: true, status: 'initiated', live: true, dial });

    expect(await replyAtOnce(ask(session))).toBe(RINGING_HAND_OVER);
    settle('no_answer');
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0]).toMatchObject({ type: 'call_outcome', userId: USER, session });
    expect(spoken[0].message).toMatch(/didn't pick up/);
    expect(end).not.toHaveBeenCalled();
  });

  it('a dial that fails at once (no SIP trunk): the in-progress line, then the correction at the next pause', async () => {
    const { session, end } = appCall();
    portReturning({
      success: true,
      status: 'initiated',
      live: true,
      dial: Promise.resolve('failed'),
    });

    const reply = await replyAtOnce(ask(session));
    honestInProgress(reply);
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0]).toMatchObject({ type: 'call_outcome', session });
    expect(spoken[0].message).toMatch(/couldn't get through/);
    expect(end).not.toHaveBeenCalled();
  });

  it('a dial that fails after ringing is said at the next pause, and nothing ends', async () => {
    const { session, end } = appCall();
    const { dial, settle } = pendingDial();
    portReturning({ success: true, status: 'initiated', live: true, dial });
    await replyAtOnce(ask(session));
    await vi.advanceTimersByTimeAsync(20_000);
    settle('failed');
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0].message).toMatch(/couldn't get through/);
    expect(end).not.toHaveBeenCalled();
  });

  it('memory held for this call (no conversation persisted): the call still moves, with no reference', async () => {
    const { session } = appCall();
    portReturning({ success: true, status: 'initiated', live: true, dial: pendingDial().dial });
    const reply = await replyAtOnce(
      ask(session, { userId: USER, verifiedCaller: true, services: {} })
    );
    expect(reply).toBe(RINGING_HAND_OVER);
    expect(requests[0].handover).toEqual({ conversationId: undefined });
  });

  it('a call with no ender (a phone caller): the honest in-progress line, no reference, nothing ends', async () => {
    const session = appSession();
    const { dial, settle } = pendingDial();
    portReturning({ success: true, status: 'initiated', live: true, dial });
    const reply = await replyAtOnce(ask(session));
    expect(reply).toBe(TRYING_PHONE);
    honestInProgress(reply);
    expect(requests[0].handover).toEqual({ conversationId: undefined });
    settle('answered');
    await vi.advanceTimersByTimeAsync(0);
  });
});

describe('one "call me" in flight per call (CALL_ME_MOVES_TO_PHONE=on)', () => {
  it('two at once in one call: one dial; the second is told it is already ringing, never "Calling you now."', async () => {
    const { session } = appCall();
    const { dial, settle } = pendingDial();
    portReturning({ success: true, status: 'initiated', live: true, dial });

    const replies = await Promise.all([ask(session), ask(session)]);
    expect(requests).toHaveLength(1); // no second dial
    expect(replies).toEqual([RINGING_HAND_OVER, ALREADY_RINGING]);

    settle('no_answer'); // that dial ended: the line is free again
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    portReturning({ success: true, status: 'initiated', live: true, dial: pendingDial().dial });
    expect(await replyAtOnce(ask(session))).toBe(RINGING_HAND_OVER);
    expect(requests).toHaveLength(2);
  });

  it('keyed by the call, not the AgentSession: a persona swapped in mid-ring cannot place a second dial', async () => {
    const { dial } = pendingDial();
    portReturning({ success: true, status: 'initiated', live: true, dial });
    const services = { sessionId: 'call-1', realtimeConversationId: CONVERSATION };
    const first = ask(appSession(), { userId: USER, verifiedCaller: true, services });
    const second = ask(appSession(), { userId: USER, verifiedCaller: true, services });
    expect(await Promise.all([first, second])).toEqual([TRYING_PHONE, ALREADY_RINGING]);
    expect(requests).toHaveLength(1);
  });

  it('no live dial (a recorded message, or held for calling hours): the honest line, and the line is free', async () => {
    const { session } = appCall();
    portReturning({ success: true, status: 'initiated' });
    expect(await ask(session)).toBe(CALLING_VOICE_MESSAGE);
    portReturning({ success: true, status: 'scheduled' });
    expect(await ask(session)).toBe(CALLING_LATER);
    expect(requests).toHaveLength(2);
  });
});

describe('CALL_ME_MOVES_TO_PHONE off (the default)', () => {
  it('asks for no hand-over, says "Calling you now." at once, and ends nothing when the phone is answered', async () => {
    vi.stubEnv('CALL_ME_MOVES_TO_PHONE', undefined as unknown as string);
    const { session, end } = appCall();
    const { dial, settle } = pendingDial();
    portReturning({ success: true, status: 'initiated', live: true, dial });

    const reply = await ask(session); // no wait on the dial
    expect(reply).toBe('Calling you now.');
    expect(requests).toEqual([
      { userId: USER, phoneNumber: PHONE, message: 'Calling like you asked.', personaId: 'ferni' },
    ]);
    settle('answered');
    await vi.advanceTimersByTimeAsync(0);
    expect(end).not.toHaveBeenCalled();
    expect(spoken).toEqual([]);
  });
});
