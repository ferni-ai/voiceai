/**
 * Session start binds a try-first (demo) visitor's session to their id BEFORE session services
 * make their first write: every hold that writers ask by session (minor-care.ts memoryHeld)
 * reads that binding, so it must already hold when createSessionServices starts. The REAL
 * initializeSession runs; createSessionServices is replaced by a probe that reads the hold at
 * the moment it is called, then stops session start there. A member is the control. All ids
 * are fictional.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({ held: [] as boolean[] }));
vi.mock('../../../services/index.js', async (orig) => {
  const { memoryHeld } = await import('../../../utils/minor-care.js');
  return {
    ...(await orig<Record<string, unknown>>()),
    createSessionServices: async ({ sessionId }: { sessionId: string }) => {
      seen.held.push(memoryHeld(sessionId));
      throw new Error('session start stops here');
    },
  };
});

import { initializeSession } from '../session-init-handler.js';
import { resetMinorCare } from '../../../utils/minor-care.js';

let n = 0;
async function start(userId: string): Promise<boolean[]> {
  seen.held.length = 0;
  await initializeSession({
    sessionId: `try-first-start-${++n}`,
    userId,
    userName: 'Sam',
    userAccent: 'us',
    sessionPersona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' } as never,
  }).catch(() => undefined);
  return [...seen.held];
}

afterEach(() => resetMinorCare());

describe('session start, before session services', { timeout: 60_000 }, () => {
  it("a try-first visitor's session is already held when session services start", async () => {
    expect(await start('device:demo_1793560000000_k3x9q2')).toEqual([true]);
  });

  it('control: a member session is not held there', async () => {
    expect(await start('member-uid-4b7e')).toEqual([false]);
  });
});
