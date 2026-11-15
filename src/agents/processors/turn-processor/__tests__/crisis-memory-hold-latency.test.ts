/**
 * The capture's wait for the call's crisis reads (crisis-memory-hold.ts) is off the reply path:
 * process-turn.ts fires the capture and its recordTurn in a detached task. With a classifier read
 * that never settles, the real processTurn finishes while the capture is still waiting on that
 * read, well inside the wait. Were the capture awaited inline, the turn would stall for the wait.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ may: vi.fn() }));
vi.mock('../../../../utils/minor-care.js', async (orig) => {
  const real = await orig<typeof import('../../../../utils/minor-care.js')>();
  h.may.mockImplementation(real.mayCapture);
  return { ...real, mayCapture: h.may };
});

import { processTurn } from '../process-turn.js';
import { CRISIS_READ_WAIT, crisisReadsSettled } from '../../../../utils/crisis-memory-hold.js';
import {
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../../../services/safety/crisis-call-risk.js';

const SAID = 'My friend Sam Rivera and I fixed up the garden shed today, it looks great.';
const WAIT = { ...CRISIS_READ_WAIT };

afterEach(() => {
  Object.assign(CRISIS_READ_WAIT, WAIT);
  resetCrisisCallRisk();
});

describe('the capture waits for crisis reads off the reply path', () => {
  it('a classifier read still running: processTurn finishes, the capture still waits', async () => {
    Object.assign(CRISIS_READ_WAIT, { settleMs: 3000 });
    const sessionId = 'crisis-latency-1';
    const userId = 'user-crisis-latency-1';
    trackCrisisRead(sessionId, SAID, new Promise<{ risk: string }>(() => undefined));
    const ctx = {
      userText: SAID,
      userData: { userId, turnCount: 3, recentTranscripts: [SAID] },
      services: { sessionId, userId },
      persona: { id: 'ferni', name: 'Ferni' },
      turnCtx: { addMessage: () => undefined, items: [] },
      logger: { info: () => undefined, warn: () => undefined, debug: () => undefined },
    };
    const started = Date.now();
    await processTurn(ctx as never).catch(() => undefined); // the tail needs a live session
    const took = Date.now() - started;
    await vi.waitFor(() => expect(h.may).toHaveBeenCalledWith(sessionId, userId));
    expect(crisisReadsSettled(sessionId)).not.toBeNull(); // the read the capture waits on
    expect(took).toBeLessThan(CRISIS_READ_WAIT.settleMs);
  }, 20_000);
});
