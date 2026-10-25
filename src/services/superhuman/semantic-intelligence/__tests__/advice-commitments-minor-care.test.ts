/**
 * MINOR_CARE=on: a member caller (not a verified owner) who says "I'm 15." Ferni's replies are
 * still read for advice (stored with the caller's last message as its context) and for promises
 * (stored as plans about the caller's life). Neither may be kept on a held call. Only the stores
 * are faked; the same reply still reaches them for a verified owner and with the flag off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => [] as string[]);
vi.mock('../counterfactual-memory.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  recordDecisionPoint: async () => void stored.push('advice'),
}));
vi.mock('../follow-through.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  trackResponsePromises: async () => void stored.push('promises'),
}));

import { trackAdviceInResponse } from '../advice-detector.js';
import { trackFerniCommitments } from '../integration.js';
import {
  bindSessionUser,
  heldAfter,
  memoryHeld,
  resetMinorCare,
  setVerifiedOwnerCheck,
} from '../../../../utils/minor-care.js';

type Case = 'held' | 'owner' | 'off';
let n = 0;

function callAfterAge(c: Case): { userId: string; sessionId: string } {
  n++;
  const sessionId = `session-AJ_advice${n}-1792867440000`;
  const userId = `Rk4pWz8NcT2vHs6Lq9dXa5Gm${String(n).padStart(4, '0')}`; // a member uid
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  bindSessionUser(sessionId, userId);
  heldAfter(sessionId, "I'm 15 and I can't sleep before exams.", { userId });
  expect(memoryHeld(sessionId)).toBe(c === 'held'); // the precondition each case rests on
  return { userId, sessionId };
}

beforeEach(() => {
  stored.length = 0;
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('MINOR_CARE: advice and promises in Ferni\'s reply to a caller who said "I\'m 15."', () => {
  it.each(['held', 'owner', 'off'] as Case[])('stores no advice when held (%s)', async (c) => {
    const { userId, sessionId } = callAfterAge(c);
    await trackAdviceInResponse("I'd suggest taking a break when you feel overwhelmed.", {
      userId,
      sessionId,
      personaId: 'ferni',
      topic: 'school',
      userSituation: "I can't sleep before exams and my chest gets tight.",
    });
    expect(stored).toEqual(c === 'held' ? [] : ['advice']);
  });

  it.each(['held', 'owner', 'off'] as Case[])('stores no promises when held (%s)', async (c) => {
    const { userId, sessionId } = callAfterAge(c);
    await trackFerniCommitments(userId, "I'll check in after your exam on Friday.", {
      sessionId,
    });
    expect(stored).toEqual(c === 'held' ? [] : ['promises']);
  });
});
