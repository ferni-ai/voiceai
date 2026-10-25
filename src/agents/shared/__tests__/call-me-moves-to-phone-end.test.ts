/**
 * CALL_ME_MOVES_TO_PHONE, the app call's side: every app call gets an ender
 * (attachCallWrapUp), and once the phone it rang is answered the app call
 * stops speaking at once (nothing plays over the phone at their ear) and ends
 * on the goodbye path within 300 ms: conversation_end with a reason
 * the app treats as a planned goodbye (planned-goodbye.ts), then the room.
 * Crisis risk on the call holds it open; a phone caller gets no ender.
 */
import { ParticipantKind } from '@livekit/rtc-node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachCallWrapUp, MOVED_END_MS } from '../call-wrap-up.js';
import { clearFarewell } from '../call-farewell.js';
import { clearSessionClosing, isSessionClosing } from '../session-closing-tracker.js';
import {
  initFrontendSignal,
  resetFrontendSignal,
} from '../../../services/communication/frontend-signal.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  callMovingToPhone,
  RINGING_HAND_OVER,
  TRYING_PHONE,
} from '../../../tools/domains/proactive/outreach/call-me-moves-to-phone.js';
import type { CallUserPort } from '../../../tools/domains/proactive/outreach/call-user-port.js';

const used: string[] = [];
afterEach(() => {
  used.splice(0).forEach((id) => {
    clearSessionClosing(id);
    clearFarewell(id);
  });
  resetFrontendSignal();
  resetCrisisCallRisk();
});

let n = 0;
async function call(opts: { inRoom?: boolean; phone?: boolean } = {}) {
  const id = `move-${++n}`;
  used.push(id);
  const events: string[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  initFrontendSignal(id, async (type, data) => {
    events.push(`${type} ${String(data?.reason)} closing=${isSessionClosing(id)}`);
  });
  const session = {
    on: () => undefined,
    off: () => undefined,
    say: vi.fn((text: string) => {
      events.push(`said ${text}`);
      return { waitForPlayout: async () => void events.push('played') };
    }),
    interrupt: vi.fn(() => void events.push('interrupted')),
  };
  await attachCallWrapUp(
    {},
    {
      sessionId: id,
      room: { name: `room-${id}`, remoteParticipants: { size: opts.inRoom === false ? 0 : 1 } },
      participant: { kind: opts.phone ? ParticipantKind.SIP : ParticipantKind.STANDARD },
      onBehalf: false,
      env: { GOODBYE_ENDS_CALL: 'off' },
      session,
      hangUp: async (room) => void events.push(`deleted ${room}`),
      setTimer: (fn, ms) => void timers.push({ fn, ms }),
    }
  );
  const runTimers = async () => {
    timers.splice(0).forEach((t) => t.fn());
    await new Promise((r) => {
      setTimeout(r, 0);
    });
  };
  return { id, session, events, timers, runTimers };
}

/** The phone picks up: the dial settles 'answered'. */
const answeredPort: CallUserPort = {
  verifiedPhone: async () => '+15555550123',
  call: async () => ({
    success: true,
    status: 'initiated',
    live: true,
    dial: Promise.resolve('answered'),
  }),
};
const request = { userId: 'u1', phoneNumber: '+15555550123', message: 'hi', personaId: 'ferni' };

describe('an answered "call me" ends the app call', () => {
  it('goes silent at once (the phone is at their ear), sends conversation_end as a planned goodbye, and closes the room within 300 ms', async () => {
    const c = await call();
    expect(await callMovingToPhone(answeredPort, request, { session: c.session })).toBe(
      RINGING_HAND_OVER
    );
    await vi.waitFor(() =>
      expect(c.events).toContain('conversation_end goodbye_complete closing=true')
    );
    expect(c.events.slice(0, 2)).toEqual([
      'interrupted',
      'conversation_end goodbye_complete closing=true',
    ]);
    expect(c.session.say).not.toHaveBeenCalled(); // no goodbye over the phone call
    expect(c.timers.map((t) => t.ms)).toEqual([MOVED_END_MS]);
    expect(MOVED_END_MS).toBeLessThanOrEqual(300);
    await c.runTimers();
    expect(c.events.at(-1)).toBe(`deleted room-${c.id}`);
  });

  it('ends it when the caller already left the app, too', async () => {
    const c = await call({ inRoom: false });
    await callMovingToPhone(answeredPort, request, { session: c.session });
    await vi.waitFor(() =>
      expect(c.events).toContain('conversation_end goodbye_complete closing=true')
    );
    expect(c.session.say).not.toHaveBeenCalled();
  });

  it('a call with crisis risk is not ended: the caller ends that one', async () => {
    const c = await call();
    noteCrisisRisk(c.id);
    await callMovingToPhone(answeredPort, request, { session: c.session });
    await new Promise((r) => {
      setTimeout(r, 10);
    });
    expect(c.events).toEqual([]); // not even interrupted: the call carries on
    expect(c.session.interrupt).not.toHaveBeenCalled();
    expect(isSessionClosing(c.id)).toBe(false);
  });

  it('a phone caller gets no ender: the trying-your-phone line, and nothing ends', async () => {
    const c = await call({ phone: true });
    expect(await callMovingToPhone(answeredPort, request, { session: c.session })).toBe(
      TRYING_PHONE
    );
    await new Promise((r) => {
      setTimeout(r, 10);
    });
    expect(c.events).toEqual([]);
  });
});
