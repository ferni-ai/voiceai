/**
 * MINOR_CARE=on: a member caller (not a verified owner) who says "I'm 15." Every system behind
 * processSemanticIntelligence writes to Firestore inside the turn (threads keep 200 characters of
 * the caller's words, open loops keep their intentions and speak them back later), so the one
 * entry point holds. Two real fan-out targets are watched; the same turn still reaches them for a
 * verified owner and with the flag off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fed = vi.hoisted(() => [] as string[]);
vi.mock('../cross-session-threading.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  recordMoment: async () => void fed.push('thread moment'),
}));
vi.mock('../open-loops.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processUserTextForLoops: async () => void fed.push('open loops'),
}));

import { processSemanticIntelligence } from '../integration.js';
import {
  bindSessionUser,
  heldAfter,
  memoryHeld,
  resetMinorCare,
  setVerifiedOwnerCheck,
} from '../../../../utils/minor-care.js';

type Case = 'held' | 'owner' | 'off';
let n = 0;

async function turnAfterAge(c: Case): Promise<void> {
  n++;
  const sessionId = `session-AJ_semantic${n}-1792867440000`;
  const userId = `Qm7tXr2LpV9sKd4Wn8cYb3Ef${String(n).padStart(4, '0')}`; // a member uid
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  bindSessionUser(sessionId, userId);
  heldAfter(sessionId, "I'm 15 and my parents are getting divorced.", { userId });
  expect(memoryHeld(sessionId)).toBe(c === 'held'); // the precondition each case rests on
  await processSemanticIntelligence({
    userId,
    sessionId,
    personaId: 'ferni',
    turnNumber: 4,
    userText: "I'm going to tell my mom I want to live with my dad, I've decided.",
    topic: 'family',
    textEmotion: 'sad',
    textEmotionIntensity: 0.9,
  } as Parameters<typeof processSemanticIntelligence>[0]);
}

beforeEach(() => {
  fed.length = 0;
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('MINOR_CARE: semantic intelligence for a member caller who said "I\'m 15."', () => {
  it.each(['held', 'owner', 'off'] as Case[])('feeds no system when held (%s)', async (c) => {
    await turnAfterAge(c);
    if (c === 'held') expect(fed).toEqual([]);
    else expect(fed).toEqual(expect.arrayContaining(['thread moment', 'open loops']));
  });
});
