/**
 * MINOR_CARE=on: a member caller (not a verified owner) who says "I'm 15." Every third turn
 * process-turn.ts calls triggerAutoSave, which saves what was extracted from their words (their
 * name, places, pets) to their profile and the people they mentioned (with 200 characters of
 * context each) to their social graph, inside the call. Both savers hold; the same turn still
 * saves for a verified owner and with the flag off. Only the profile store and the graph's
 * Firestore write are faked; the graph itself is the real in-memory one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const saved = vi.hoisted(() => [] as string[]);
vi.mock('../../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({
    getProfile: async (userId: string) => {
      saved.push('profile read');
      return { userId, extractedDetails: [] };
    },
    updateProfile: async () => void saved.push('profile details'),
    saveProfile: async () => void saved.push('profile details'),
    setProfile: async () => void saved.push('profile details'),
  }),
}));
vi.mock('../../social-graph/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  persistGraphToFirestore: async () => {
    saved.push('social graph');
    return true;
  },
}));

import { persistExtractedDetails, persistSocialGraph } from '../realtime-persistence.js';
import { recordMention } from '../../social-graph/index.js';
import {
  bindSessionUser,
  heldAfter,
  memoryHeld,
  resetMinorCare,
  setVerifiedOwnerCheck,
} from '../../../utils/minor-care.js';

type Case = 'held' | 'owner' | 'off';
let n = 0;

/** A member caller whose call has said "I'm 15." (transcript-handler runs heldAfter on it). */
function memberSaidFifteen(c: Case): string {
  n++;
  const sessionId = `session-AJ_autosave${n}-1792867440000`;
  const userId = `Hp4vNw8QzR2tLx6Kc9Jm1Bd${String(n).padStart(5, '0')}`; // a member uid
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  bindSessionUser(sessionId, userId);
  heldAfter(sessionId, "I'm 15 and my best friend Jess moved away.", { userId });
  expect(memoryHeld(sessionId)).toBe(c === 'held'); // the precondition each case rests on
  saved.length = 0;
  return userId;
}

afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('MINOR_CARE: the every-third-turn auto-save for a member who said "I\'m 15."', () => {
  it.each(['held', 'owner', 'off'] as Case[])(
    'saves none of their details to the profile when held (%s)',
    async (c) => {
      const userId = memberSaidFifteen(c);
      await persistExtractedDetails(userId, [{ type: 'pet', value: 'a dog called Biscuit' }]);
      if (c === 'held') expect(saved).toEqual([]);
      else expect(saved).toContain('profile read');
    }
  );

  it.each(['held', 'owner', 'off'] as Case[])(
    'saves none of the people they mentioned when held (%s)',
    async (c) => {
      const userId = memberSaidFifteen(c);
      recordMention(userId, 'Jess', 'my best friend Jess moved away', -0.4);
      await persistSocialGraph(userId);
      expect(saved).toEqual(c === 'held' ? [] : ['social graph']);
    }
  );
});
