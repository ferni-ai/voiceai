/**
 * The goodbye wrap-up (wrapUpCall) never ends the call of a care-held minor: no
 * `conversation_end`, no room delete. The caller can still end it themselves. The hold is
 * read while the goodbye plays, so an adult's call ends no later than before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWrapUpTool, wrapUpCall, type WrapUpCall } from '../call-wrap-up.js';
import { MINOR_CARE_HOLD } from '../minor-care-end-hold.js';
import { clearFarewell, farewellSaid } from '../call-farewell.js';
import { clearSessionClosing, isSessionClosing } from '../session-closing-tracker.js';
import {
  firestoreHoldStore,
  setHoldStore,
} from '../../../services/outreach/minor-care-shared-hold.js';
import {
  bindSessionUser,
  holdSession,
  resetMinorCare,
  userHeld,
} from '../../../utils/minor-care.js';
import { holdForSexualTopic, resetSexualTopicHold } from '../../../utils/sexual-topic-hold.js';

/** An anonymous try-first visitor (isAnonymousDemoUser). */
const TRY_FIRST = 'device:demo_1700000000000_eval1';

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
  resetSexualTopicHold();
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

describe('wrapUpCall: holds that are not about age end the call as before', () => {
  it('an anonymous try-first caller', async () => {
    const c = appCall(TRY_FIRST);
    expect(userHeld(TRY_FIRST)).toBe(true); // held for keeping data, not for ending
    expect(await wrapUpCall(c.call, 'goodbye_complete')).toBe(true);
    await settle();
    expect(c.events).toEqual(['conversation_end', 'deleted']);
  });

  it('an adult whose memory is held for a sexual topic', async () => {
    vi.stubEnv('SEXUAL_TOPIC_BOUNDARY', 'on');
    const c = appCall('eval-sexual-topic-adult');
    holdForSexualTopic(`${c.sessionId}-earlier`, 'eval-sexual-topic-adult');
    expect(userHeld('eval-sexual-topic-adult')).toBe(true); // held for keeping data, not for ending
    expect(await wrapUpCall(c.call, 'goodbye_complete')).toBe(true);
    await settle();
    expect(c.events).toEqual(['conversation_end', 'deleted']);
  });
});

describe('wrapUpCall: held for a care-held minor', () => {
  it('a try-first caller who sounds under 18 on this call', async () => {
    const c = appCall(TRY_FIRST);
    holdSession(c.sessionId);
    expect(await wrapUpCall(c.call, 'goodbye_complete')).toBe(false);
    await settle();
    expect(c.events).toEqual([]);
  });

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

  it('the hold lands while the goodbye plays', async () => {
    const c = appCall('eval-late-hold');
    expect(await wrapUpCall(c.call, 'goodbye_complete', async () => holdSession(c.sessionId))).toBe(
      false
    );
    await settle();
    expect(c.events).toEqual([]);
  });

  it('a held goodbye releases the call: a later goodbye, no longer held, ends it', async () => {
    const c = appCall('eval-store-recovers');
    setHoldStore({
      heldUntil: async () => {
        throw new Error('store down');
      },
      write: async () => {},
    });
    expect(await wrapUpCall(c.call, 'goodbye_complete')).toBe(false);
    setHoldStore({ heldUntil: async () => undefined, write: async () => {} });
    expect(await wrapUpCall(c.call, 'goodbye_complete')).toBe(true);
    await settle();
    expect(c.events).toEqual(['conversation_end', 'deleted']);
  });
});

describe("the app's endCall tool for a care-held minor", () => {
  const endCall = (call: WrapUpCall) =>
    createWrapUpTool(call).execute({}, {
      ctx: { waitForPlayout: async () => undefined },
    } as never) as Promise<unknown>;

  it('tells Ferni to stay and ends nothing', async () => {
    const c = appCall('eval-tool-held');
    holdSession(c.sessionId);
    expect(await endCall(c.call)).toBe(MINOR_CARE_HOLD);
    await settle();
    expect(c.events).toEqual([]);
  });

  it('asks for no reply when it ends the call', async () => {
    const c = appCall('eval-tool-plain');
    expect(await endCall(c.call)).toBeUndefined();
    await settle();
    expect(c.events).toEqual(['conversation_end', 'deleted']);
  });
});
