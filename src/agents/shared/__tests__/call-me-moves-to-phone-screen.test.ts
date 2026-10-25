/**
 * CALL_ME_MOVES_TO_PHONE, the phone agent's side of the pickup: a SIP
 * "answered" is a voicemail greeting too, and the app call must end only for a
 * person (it would otherwise hand the conversation to an answering machine).
 * A moved call is screened whatever VOICEMAIL_DETECT says; the verdict goes on
 * the agent's participant (ANSWERED_BY) for the app side (self-call.ts), and a
 * machine gets no message. Other proactive calls are untouched.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proactivePickedUp } from '../line-screen.js';
import { ANSWERED_BY } from '../../../services/outreach/proactive-channels/self-call.js';
import {
  clearProactiveSessionContext,
  setProactiveSessionContext,
} from '../../../intelligence/context-builders/external/proactive-session-context.js';

const ids: string[] = [];
let n = 0;
function phoneCall(moved: boolean): string {
  const id = `screen-${++n}`;
  ids.push(id);
  setProactiveSessionContext(id, {
    triggerType: 'silence',
    triggerReason: 'They asked you to call them.',
    openerStyle: 'warm',
    initiatingPersona: 'ferni',
    ...(moved && { movedFrom: { userId: 'user-1', conversationId: 'conv_app' } }),
  });
  return id;
}

function line() {
  const attributes: Array<Record<string, string>> = [];
  const room = Object.assign(new EventEmitter(), {
    localParticipant: {
      setAttributes: vi.fn(async (a: Record<string, string>) => void attributes.push(a)),
    },
  });
  // The phone participant has picked up (sip.callStatus active)
  const phone = { identity: 'phone_1', attributes: { 'sip.callStatus': 'active' } };
  const session = Object.assign(new EventEmitter(), {
    say: vi.fn(() => ({ waitForPlayout: async () => undefined })),
  });
  const hear = (transcript: string) => {
    session.emit('user_state_changed', { newState: 'speaking' });
    session.emit('user_input_transcribed', { transcript, isFinal: true });
    session.emit('user_state_changed', { newState: 'listening' });
  };
  return { room, phone, session, hear, attributes };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  ids.splice(0).forEach(clearProactiveSessionContext);
  delete process.env.VOICEMAIL_DETECT;
  delete process.env.PROACTIVE_REASON_OPENER;
});

describe('a moved "call me" is screened before the app call ends', () => {
  it('a person says hello: picked up, and the verdict is set for the app side', async () => {
    const id = phoneCall(true);
    const l = line();
    const picked = proactivePickedUp(l.room as never, l.phone, { session: l.session }, id);
    await vi.advanceTimersByTimeAsync(10);
    l.hear('Hello?');
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await picked).toBe(true);
    expect(l.attributes).toEqual([{ [ANSWERED_BY]: 'human' }]);
  });

  it('a voicemail greeting: not picked up, the verdict says so, and no message is left', async () => {
    const id = phoneCall(true);
    const l = line();
    const picked = proactivePickedUp(l.room as never, l.phone, { session: l.session }, id);
    await vi.advanceTimersByTimeAsync(10);
    l.hear("Hi, you've reached Sam, please leave a message after the tone");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await picked).toBe(false);
    expect(l.attributes).toEqual([{ [ANSWERED_BY]: 'voicemail' }]);
    expect(l.session.say).not.toHaveBeenCalled(); // the app side hangs up: no message
  });

  it('screened even with VOICEMAIL_DETECT off', async () => {
    process.env.VOICEMAIL_DETECT = 'off';
    const id = phoneCall(true);
    const l = line();
    const picked = proactivePickedUp(l.room as never, l.phone, { session: l.session }, id);
    await vi.advanceTimersByTimeAsync(10);
    l.hear('voicemail');
    await vi.advanceTimersByTimeAsync(100);
    expect(await picked).toBe(false);
  });
});

describe('other proactive calls are unchanged', () => {
  it('not moved, PROACTIVE_REASON_OPENER off: no wait, no screen, no verdict', async () => {
    const id = phoneCall(false);
    const l = line();
    expect(await proactivePickedUp(l.room as never, l.phone, { session: l.session }, id)).toBe(
      undefined
    );
    expect(l.attributes).toEqual([]);
  });

  it('not moved, PROACTIVE_REASON_OPENER on: waits for the pickup, no screen', async () => {
    process.env.PROACTIVE_REASON_OPENER = 'on';
    const id = phoneCall(false);
    const l = line();
    const picked = proactivePickedUp(l.room as never, l.phone, { session: l.session }, id);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await picked).toBe(true);
    expect(l.attributes).toEqual([]);
  });
});
