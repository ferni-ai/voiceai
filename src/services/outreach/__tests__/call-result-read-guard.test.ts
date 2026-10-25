/**
 * PRIVACY: the call-result readers never read a non-member's bucket, even when
 * Firestore holds one (prod has bogle_users/unknown/on_behalf_calls and
 * follow_up_actions). A member still reads their own.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const docs = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const touched = vi.hoisted(() => [] as string[]);

/** A Firestore that serves `docs` by path and records every user doc it is asked for. */
const db = vi.hoisted(() => {
  const query = (prefix: string) => ({
    orderBy: () => query(prefix),
    limit: () => query(prefix),
    get: async () => ({
      docs: [...docs.entries()]
        .filter(([path]) => path.startsWith(`${prefix}/`))
        .map(([, data]) => ({ data: () => data })),
    }),
  });
  const sub = (userPath: string) => (name: string) => ({
    ...query(`${userPath}/${name}`),
    doc: (id: string) => ({
      get: async () => {
        const data = docs.get(`${userPath}/${name}/${id}`);
        return { exists: data !== undefined, data: () => data };
      },
    }),
  });
  return {
    collection: (root: string) => ({
      doc: (userId: string) => {
        touched.push(userId);
        return { collection: sub(`${root}/${userId}`), get: async () => ({ exists: false }) };
      },
    }),
  };
});
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => db }));

const { getCallResult, getRecentCallResults, getPendingFollowUps } =
  await import('../call-result-capture.js');

beforeEach(() => {
  docs.clear();
  touched.length = 0;
  for (const owner of ['unknown', 'anon', 'uid-member']) {
    docs.set(`bogle_users/${owner}/on_behalf_calls/c1`, { callId: 'c1', userId: owner });
    docs.set(`bogle_users/${owner}/follow_up_actions/a1`, { id: 'a1', userId: owner });
  }
});

describe('call-result readers', () => {
  it.each(['unknown', ' Unknown ', 'anon', 'anonymous', '', 'anon:call-1', 'onbehalf:c1'])(
    'never read the bucket of %j',
    async (id) => {
      expect(await getCallResult('c1', id)).toBeNull();
      expect(await getRecentCallResults(id)).toEqual([]);
      expect(await getPendingFollowUps(id)).toEqual([]);
      expect(touched).toEqual([]);
    }
  );

  it('read a member their own results', async () => {
    expect(await getCallResult('c1', 'uid-member')).toMatchObject({ userId: 'uid-member' });
    expect(await getRecentCallResults('uid-member')).toEqual([
      { callId: 'c1', userId: 'uid-member' },
    ]);
    expect(await getPendingFollowUps('uid-member')).toEqual([{ id: 'a1', userId: 'uid-member' }]);
  });
});
