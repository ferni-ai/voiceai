/**
 * MINOR_CARE=on: a caller who said "I'm only 14." Every trust profile (boundaries, inside jokes,
 * small wins, life events…) is written through writeTrustDoc to
 * bogle_users/{uid}/trust_profiles/{system}, by the session-end save and by the trust worker's
 * periodic sync. It had no hold check, so any of those saves that ran for a held caller wrote
 * their words. Now it writes nothing while the caller is held.
 *
 * The real save (saveTrustProfiles) runs with only Firestore faked; a verified owner and the flag
 * off write as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const writes = vi.hoisted(() => [] as string[]);
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'now' },
}));
vi.mock('../../../utils/firebase-admin-app.js', () => {
  const ref = (path: string): Record<string, unknown> => ({
    collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
    get: async () => ({ exists: false, data: () => undefined }),
    set: async () => void writes.push(path),
  });
  return {
    getAdminFirestore: () => ({
      collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    }),
  };
});

import { saveTrustProfiles } from '../persistence.js';
import { writeTrustDoc } from '../trust-doc.js';
import { importBoundaries } from '../boundary-memory.js';
import {
  bindSessionUser,
  heldAfter,
  memoryHeld,
  resetMinorCare,
  setVerifiedOwnerCheck,
} from '../../../utils/minor-care.js';

type Case = 'held' | 'owner' | 'off';
const CASES: Case[] = ['held', 'owner', 'off'];
let n = 0;

/** A call whose caller has said "I'm only 14." (the turn handler runs heldAfter on it). */
function call(c: Case): string {
  n++;
  const sessionId = `session-trust-doc-${n}`;
  const userId = `user-trust-doc-${n}`;
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  bindSessionUser(sessionId, userId);
  heldAfter(sessionId, "I'm only 14.", { userId });
  expect(memoryHeld(sessionId)).toBe(c === 'held'); // the precondition each case rests on
  return userId;
}

beforeEach(() => {
  writes.length = 0;
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('MINOR_CARE: trust profiles for a caller who said "I\'m only 14."', () => {
  it.each(CASES)('writeTrustDoc writes nothing when held (%s)', async (c) => {
    const userId = call(c);
    const ok = await writeTrustDoc(userId, 'boundaries', { topics: ['my parents'] });
    expect([ok, writes.length]).toEqual(c === 'held' ? [false, 0] : [true, 1]);
  });

  it.each(CASES)(
    'the session-end save writes none of their boundaries when held (%s)',
    async (c) => {
      const userId = call(c);
      importBoundaries({ userId, boundaries: [{ topic: 'my parents' }] } as never);
      await saveTrustProfiles(userId);
      const boundaries = `bogle_users/${userId}/trust_profiles/boundaries`;
      expect(writes.includes(boundaries)).toBe(c !== 'held');
    }
  );
});
