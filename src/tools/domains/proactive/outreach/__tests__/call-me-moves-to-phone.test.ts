/**
 * CALL_ME_MOVES_TO_PHONE through the registered callUser tool (telephony
 * domain): owner test 2026-10-23, asked in the app to "give me a call", the
 * phone rang with Ferni live and the app call stayed open, so there were two
 * Ferni conversations at once; and a dial that failed at once had already been
 * announced as "calling you now".
 *
 * On: nothing is said until LiveKit has taken the dial; answered ends the app
 * call (its ender) after the app call's last turns went to the phone agent;
 * unanswered or failed keeps it open and says so. Off: unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { definitions } from '../../../telephony/index.js';
import type { ToolContext } from '../../../../registry/types.js';
import { registerVoiceCallbackHandler } from '../../../simple-utilities/voice-callbacks.js';
import type { VoiceCallback } from '../../../simple-utilities/voice-callbacks.js';
import {
  DIAL_ACCEPT_MS,
  DIAL_FAILED,
  HANDOVER_TURNS,
  MOVED_GOODBYE,
  RINGING_HAND_OVER,
  setPhoneMoveEnd,
} from '../call-me-moves-to-phone.js';
import { CALLING_LIVE } from '../call-placed-reply.js';
import {
  setCallUserPort,
  type CallUserRequest,
  type CallUserResult,
  type DialOutcome,
} from '../call-user-port.js';

type Executable = { execute: (args: Record<string, unknown>, o: unknown) => Promise<string> };

const USER = 'owner-uid';
const PHONE = '+15555550123';

/** The app call's history, as AgentSession.history holds it (oldest first). */
function appSession(lines: number) {
  const items: Array<{ type: string; role: string; textContent?: string }> = [
    { type: 'message', role: 'system', textContent: 'You are Ferni.' },
  ];
  for (let i = 0; i < lines; i++) {
    items.push({
      type: 'message',
      role: i % 2 === 0 ? 'user' : 'assistant',
      textContent: i % 2 === 0 ? `user line ${i}` : `<expr/>ferni line ${i}`,
    });
  }
  items.push({ type: 'function_call', role: 'assistant' });
  return { history: { items } };
}

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

const ask = (session: object) =>
  callUser().execute(
    { reason: 'can you give me a call', message: 'Calling like you asked.' },
    { toolCallId: 't', ctx: { session, userData: { userId: USER } } }
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
function appCall(lines = 10) {
  const session = appSession(lines);
  const end = vi.fn(async (_line: string) => true);
  setPhoneMoveEnd(session, end);
  unregister = registerVoiceCallbackHandler(USER, async (cb) => void spoken.push(cb), session);
  return { session, end };
}

describe('CALL_ME_MOVES_TO_PHONE=on', () => {
  it('answered: says "pick up" only once the dial is taken, hands over the last turns, then ends the app call', async () => {
    const { session, end } = appCall();
    const { dial, settle } = pendingDial();
    portReturning({ success: true, status: 'initiated', live: true, dial });

    let reply: string | undefined;
    void ask(session).then((r) => (reply = r));
    await vi.advanceTimersByTimeAsync(DIAL_ACCEPT_MS - 1);
    expect(reply).toBeUndefined(); // not a word about the call before LiveKit took the dial
    await vi.advanceTimersByTimeAsync(1);
    expect(reply).toBe(RINGING_HAND_OVER);

    const turns = requests[0].handover?.turns ?? [];
    expect(turns).toHaveLength(HANDOVER_TURNS);
    expect(turns.at(-1)).toEqual({ role: 'assistant', content: 'ferni line 9' });
    expect(turns[0]).toEqual({ role: 'user', content: 'user line 4' });
    expect(turns.map((t) => t.role)).not.toContain('system');

    expect(end).not.toHaveBeenCalled(); // still ringing: the app call stays
    settle('answered');
    await vi.waitFor(() => expect(end).toHaveBeenCalledWith(MOVED_GOODBYE));
    expect(end).toHaveBeenCalledTimes(1);
    expect(spoken).toEqual([]);
  });

  it('not answered: the app call stays open and Ferni says they did not pick up', async () => {
    const { session, end } = appCall();
    const { dial, settle } = pendingDial();
    portReturning({ success: true, status: 'initiated', live: true, dial });

    const reply = ask(session);
    await vi.advanceTimersByTimeAsync(DIAL_ACCEPT_MS);
    expect(await reply).toBe(RINGING_HAND_OVER);
    settle('no_answer');
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0]).toMatchObject({ type: 'call_outcome', userId: USER, session });
    expect(spoken[0].message).toMatch(/didn't pick up/);
    expect(end).not.toHaveBeenCalled();
  });

  it('a dial that fails at once (no SIP trunk) is never announced: the honest line, nothing ends', async () => {
    const { session, end } = appCall();
    portReturning({
      success: true,
      status: 'initiated',
      live: true,
      dial: Promise.resolve('failed'),
    });

    const reply = await ask(session);
    expect(reply).toBe(DIAL_FAILED);
    expect(reply).toMatch(/couldn't get through/);
    expect(reply).not.toMatch(/ringing now/);
    await vi.advanceTimersByTimeAsync(DIAL_ACCEPT_MS);
    expect(end).not.toHaveBeenCalled();
    expect(spoken).toEqual([]);
  });

  it('a dial that fails after ringing is said at the next pause, and nothing ends', async () => {
    const { session, end } = appCall();
    const { dial, settle } = pendingDial();
    portReturning({ success: true, status: 'initiated', live: true, dial });
    const reply = ask(session);
    await vi.advanceTimersByTimeAsync(DIAL_ACCEPT_MS);
    await reply;
    settle('failed');
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0].message).toMatch(/couldn't get through/);
    expect(end).not.toHaveBeenCalled();
  });

  it('a call with no ender (a phone caller): the honest live line, no turns, nothing ends', async () => {
    const session = appSession(4);
    const { dial, settle } = pendingDial();
    portReturning({ success: true, status: 'initiated', live: true, dial });
    const reply = ask(session);
    await vi.advanceTimersByTimeAsync(DIAL_ACCEPT_MS);
    expect(await reply).toBe(CALLING_LIVE);
    expect(requests[0].handover).toEqual({ turns: [] });
    settle('answered');
    await vi.advanceTimersByTimeAsync(0);
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
    await vi.advanceTimersByTimeAsync(DIAL_ACCEPT_MS);
    expect(end).not.toHaveBeenCalled();
    expect(spoken).toEqual([]);
  });
});
