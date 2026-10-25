/**
 * MINOR_CARE=on: an anonymous phone caller who said "I'm only 14." Dev call 2026-10-24 18:44Z
 * (after #2738): every memory writer held, but the cross-channel thread still kept five of
 * Ferni's replies after detection, and they echoed the caller ("Fourteen, huh? Ninth grade at
 * Lincoln…", "Oh man, fighting"). The caller's own lines were held only at their call site
 * (transcript-handler passes memoryUserId); Ferni's side (turn-observers) passes the raw userId.
 * So the recorder holds at write time, for both sides and the emotional context.
 *
 * The real recorder runs with only the thread store faked; the same writes still happen for a
 * verified owner and with the flag off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const writes = vi.hoisted(() => [] as string[]);
vi.mock('../thread-manager.js', () => ({
  getOrCreateThread: async () => ({ id: 'thread-1', messageCount: 0 }),
  getThread: async () => null,
  getActiveThread: async () => null,
  addMessage: async (_id: string, m: { role: string }) => void writes.push(`message:${m.role}`),
  updateThreadTopics: async () => void writes.push('topics'),
  updateEmotionalContext: async () => void writes.push('emotion'),
}));

import {
  initializeThreadRecording,
  recordAgentMessage,
  recordEmotionalContext,
  recordUserMessage,
} from '../thread-recorder.js';
import {
  bindSessionUser,
  heldAfter,
  memoryHeld,
  resetMinorCare,
  setVerifiedOwnerCheck,
} from '../../../utils/minor-care.js';

type Case = 'held' | 'owner' | 'off';
let n = 0;

/** A phone call that has said "I'm only 14." (transcript-handler runs heldAfter on it). */
async function phoneCall(c: Case): Promise<{ sessionId: string; userId: string }> {
  n++;
  const sessionId = `session-AJ_thread${n}-1792867440000`;
  const userId = `anon:5b7f3e10-0c4d-4f8e-9a61-${String(n).padStart(12, '0')}`;
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  bindSessionUser(sessionId, userId);
  await initializeThreadRecording(userId, sessionId, 'ferni');
  heldAfter(sessionId, "I'm only 14.", { userId });
  expect(memoryHeld(sessionId)).toBe(c === 'held'); // the precondition each case rests on
  writes.length = 0;
  return { sessionId, userId };
}

beforeEach(() => {
  writes.length = 0;
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('MINOR_CARE: the conversation thread for a caller who said "I\'m only 14."', () => {
  it.each(['held', 'owner', 'off'] as Case[])(
    "keeps none of Ferni's replies when held (%s)",
    async (c) => {
      const { sessionId, userId } = await phoneCall(c);
      await recordAgentMessage({
        userId,
        sessionId,
        personaId: 'ferni',
        content: 'Fourteen, huh? Ninth grade sounds like a big jump.',
      });
      expect(writes).toEqual(c === 'held' ? [] : ['message:agent']);
    }
  );

  it.each(['held', 'owner', 'off'] as Case[])(
    'keeps none of their words when held (%s)',
    async (c) => {
      const { sessionId, userId } = await phoneCall(c);
      await recordUserMessage({
        userId,
        sessionId,
        personaId: 'ferni',
        content: 'My best friend and I had a fight today.',
        topics: ['friendship'],
      });
      expect(writes).toEqual(c === 'held' ? [] : ['message:user', 'topics']);
    }
  );

  it.each(['held', 'owner', 'off'] as Case[])(
    'keeps no emotional context when held (%s)',
    async (c) => {
      const { sessionId } = await phoneCall(c);
      await recordEmotionalContext(sessionId, 'sad', 'declining');
      expect(writes).toEqual(c === 'held' ? [] : ['emotion']);
    }
  );
});
