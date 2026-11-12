/**
 * The goodbye wrap-up (wrapUpCall) never ends the call of a care-held minor: no
 * `conversation_end`, no room delete. The caller can still end it themselves. The hold is
 * read while the goodbye plays, so an adult's call ends no later than before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapUpCall, type WrapUpCall } from '../call-wrap-up.js';
import { clearFarewell, farewellSaid } from '../call-farewell.js';
import { clearSessionClosing, isSessionClosing } from '../session-closing-tracker.js';
import {
  firestoreHoldStore,
  setHoldStore,
} from '../../../services/outreach/minor-care-shared-hold.js';
import { bindSessionUser, holdSession, resetMinorCare } from '../../../utils/minor-care.js';

const used: string[] = [];
let n = 0;

/** An app call whose signals and room deletes are recorded; timers fire at once. */
function appCall(user: string) {
  const sessionId = `wrap-minor-${++n}`;
  used.push(sessionId);
  bindSessionUser(sessionId, user);
  const events: string[] = [];
  const call: WrapUpCall = {
    sessionId,
    roomName: `room-${n}`,
    callerInRoom: () => true,
    signal: async (type) => {
      events.push(type);
      return true;
    },
    hangUp: async () => void events.push('deleted'),
    setTimer: (fn) => void fn(),
  };
  return { sessionId, call, events };
}

const settle = () =>
  new Promise((r) => {
    setTimeout(r, 0);
  });

beforeEach(() => {
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
  setHoldStore({ heldUntil: async () => undefined, write: async () => {} });
});

afterEach(() => {
  used.splice(0).forEach((id) => {
    clearSessionClosing(id);
    clearFarewell(id);
  });
  vi.unstubAllEnvs();
  resetMinorCare();
  setHoldStore(firestoreHoldStore);
});

describe('wrapUpCall: a caller with no hold (unchanged)', () => {
  it('sends conversation_end and deletes the room', async () => {
    const c = appCall('eval-plain-caller');
    expect(await wrapUpCall(c.call, 'goodbye_complete')).toBe(true);
    await settle();
    expect(c.events).toEqual(['conversation_end', 'deleted']);
  });
});

describe('wrapUpCall: held for a care-held minor', () => {
  async function expectHeld(c: ReturnType<typeof appCall>) {
    expect(await wrapUpCall(c.call, 'goodbye_complete')).toBe(false);
    await settle();
    expect(c.events).toEqual([]);
    expect(isSessionClosing(c.sessionId)).toBe(false);
    expect(farewellSaid(c.sessionId)).toBe(false);
  }

  it("this session's minor-care hold", async () => {
    const c = appCall('eval-session-held');
    holdSession(c.sessionId);
    await expectHeld(c);
  });

  it("the caller's account is held elsewhere (shared record)", async () => {
    const c = appCall('eval-held-teen');
    setHoldStore({ heldUntil: async () => Date.now() + 60_000, write: async () => {} });
    await expectHeld(c);
  });

  it('the hold record cannot be read: fails closed, held', async () => {
    const c = appCall('eval-unreadable');
    setHoldStore({
      heldUntil: async () => {
        throw new Error('store down');
      },
      write: async () => {},
    });
    await expectHeld(c);
  });

  it('reads the hold while the goodbye plays, not after it', async () => {
    const c = appCall('eval-read-timing');
    const order: string[] = [];
    setHoldStore({
      heldUntil: async () => {
        order.push('hold read');
        return undefined;
      },
      write: async () => {},
    });
    await wrapUpCall(c.call, 'goodbye_complete', async () => {
      await settle();
      order.push('goodbye played');
    });
    expect(order).toEqual(['hold read', 'goodbye played']);
  });
});
