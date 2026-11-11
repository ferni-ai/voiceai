/**
 * The gateway's step-away exit (triggerGracefulExit, after three LLM failures) tells the app to
 * hang up. It must never do that to a caller at risk: crisis risk on the call, a read in flight,
 * a minor-care hold on the session or the account, or a hold record that can't be read. The real
 * exit runs here with no session object, so its reconnect attempt fails as it would in prod; only
 * the speech calls are recorded, and the app signal goes through the real per-call binding.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spoken = vi.hoisted(() => ({ lines: [] as string[], onSay: (_line: string) => {} }));

vi.mock('../../../../speech/coordination/index.js', () => ({
  coordinatedSay: vi.fn(async (_sessionId: string, line: string) => {
    spoken.lines.push(line);
    spoken.onSay(line);
  }),
}));
vi.mock('../../../../speech/direction/index.js', () => ({ sayInOwnWords: vi.fn() }));
vi.mock('../../../../config/timeouts.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../config/timeouts.js')>()),
  GRACEFUL_EXIT_TTS_WAIT_MS: 0,
}));

import { triggerGracefulExit, unregisterSessionForReconnection } from '../reconnection.js';
import { STILL_HERE_LINE } from '../step-away-crisis-hold.js';
import {
  noteCrisisRisk,
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../../../services/safety/crisis-call-risk.js';
import {
  initFrontendSignal,
  resetFrontendSignal,
} from '../../../../services/communication/frontend-signal.js';
import {
  setHoldStore,
  firestoreHoldStore,
} from '../../../../services/outreach/minor-care-shared-hold.js';
import { bindSessionUser, holdSession, resetMinorCare } from '../../../../utils/minor-care.js';

let n = 0;
const STEP_AWAY = /step away|quick break|reconnect|be right back/i;

/** A live call whose app signals are recorded. */
function liveCall() {
  const sessionId = `step-away-${++n}`;
  const signals: string[] = [];
  initFrontendSignal(sessionId, async (type) => void signals.push(type));
  return { sessionId, signals, ended: () => signals.filter((t) => t === 'conversation_end') };
}

beforeEach(() => {
  spoken.lines.length = 0;
  spoken.onSay = () => {};
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
  setHoldStore({ heldUntil: async () => undefined, write: async () => {} });
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetCrisisCallRisk();
  resetMinorCare();
  resetFrontendSignal();
  setHoldStore(firestoreHoldStore);
});

describe('step-away exit: a plain caller (unchanged)', () => {
  it('speaks a step-away line and tells the app to hang up', async () => {
    const c = liveCall();
    bindSessionUser(c.sessionId, 'eval-plain-caller');
    await triggerGracefulExit(c.sessionId);
    expect(spoken.lines).toHaveLength(1);
    expect(spoken.lines[0]).toMatch(STEP_AWAY);
    expect(c.ended()).toHaveLength(1);
  });
});

describe('step-away exit: held for a caller at risk', () => {
  async function expectHeld(c: ReturnType<typeof liveCall>) {
    await triggerGracefulExit(c.sessionId);
    expect(c.ended()).toHaveLength(0);
    expect(spoken.lines).toEqual([STILL_HERE_LINE]);
  }

  it('crisis risk noted on this call', async () => {
    const c = liveCall();
    noteCrisisRisk(c.sessionId);
    await expectHeld(c);
  });

  it('a crisis read still in flight', async () => {
    const c = liveCall();
    void trackCrisisRead(c.sessionId, 'a turn being read', new Promise<never>(() => {}));
    await expectHeld(c);
  });

  it("this session's minor-care hold", async () => {
    const c = liveCall();
    holdSession(c.sessionId);
    await expectHeld(c);
  });

  it("the caller's account is held elsewhere (shared record)", async () => {
    const c = liveCall();
    bindSessionUser(c.sessionId, 'eval-held-teen');
    setHoldStore({ heldUntil: async () => Date.now() + 60_000, write: async () => {} });
    await expectHeld(c);
  });

  it('the hold record cannot be read: fails closed, held', async () => {
    const c = liveCall();
    bindSessionUser(c.sessionId, 'eval-unreadable');
    setHoldStore({
      heldUntil: async () => {
        throw new Error('store down');
      },
      write: async () => {},
    });
    await expectHeld(c);
  });

  it('risk noted while the step-away line plays: no hang-up', async () => {
    const c = liveCall();
    bindSessionUser(c.sessionId, 'eval-late-risk');
    spoken.onSay = (line) => {
      if (STEP_AWAY.test(line)) noteCrisisRisk(c.sessionId);
    };
    await triggerGracefulExit(c.sessionId);
    expect(c.ended()).toHaveLength(0);
    expect(spoken.lines).toEqual([expect.stringMatching(STEP_AWAY), STILL_HERE_LINE]);
  });

  it('says the still-here line once per call, however often the exit fires', async () => {
    const c = liveCall();
    noteCrisisRisk(c.sessionId);
    await triggerGracefulExit(c.sessionId);
    await triggerGracefulExit(c.sessionId);
    await triggerGracefulExit(c.sessionId);
    expect(spoken.lines).toEqual([STILL_HERE_LINE]);
    expect(c.ended()).toHaveLength(0);
    unregisterSessionForReconnection(c.sessionId);
  });
});
