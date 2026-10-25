/**
 * PROACTIVE_COOLDOWN: at most one check-in per commitment every 3 days, kept
 * across calls and process restarts.
 *
 * Before: the session-start prompt told Ferni to check in on every overdue
 * commitment on every call, and nothing recorded that it had.
 *
 * Drives the production cooldown module and the live builder that offers the
 * check-in (superhuman-session-priming). Mocked: Firestore (an in-memory fake
 * of the paths used) and the commitment list.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const docs = new Map<string, Record<string, unknown>>();

/** A tolerant Firestore fake: doc paths read and write `docs`; queries return nothing. */
function ref(path: string[]): unknown {
  const snap = () => {
    const data = docs.get(path.join('/'));
    return { exists: data !== undefined, data: () => data, docs: [], empty: true, size: 0 };
  };
  return new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then') return undefined;
        if (prop === 'collection' || prop === 'doc')
          return (id: string) => ref([...path, String(id)]);
        if (prop === 'get') return async () => snap();
        if (prop === 'set')
          return async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
            const key = path.join('/');
            docs.set(key, opts?.merge ? { ...docs.get(key), ...data } : data);
          };
        return () => ref(path);
      },
    }
  );
}

vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFirestoreDb: () => ref([]),
}));
vi.mock('../firestore-utils.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFirestoreDb: () => ref([]),
}));

const commitments = vi.hoisted(() => ({ list: [] as Array<Record<string, unknown>> }));
vi.mock('../commitment-keeper.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadUserCommitments: async () => commitments.list,
}));

import {
  CHECK_IN_COOLDOWN_MS,
  checkInKey,
  checkInsDue,
  followUpsDue,
  forgetCheckInMemo,
} from '../commitment-checkin-cooldown.js';
import {
  buildSuperhumanSessionPriming,
  clearAllSuperhumanPrimingSessions,
} from '../../../intelligence/context-builders/superhuman/superhuman-session-priming.js';
import type { Commitment, CommitmentFollowUp } from '../commitment-keeper.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 18, 12);
const text = (s: string) => s;
const due = (items: string[], now: number, record = true) =>
  checkInsDue('user-1', items, text, { record }, now);

beforeEach(() => {
  docs.clear();
  forgetCheckInMemo();
  vi.stubEnv('PROACTIVE_COOLDOWN', 'on');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('commitment check-in cooldown', () => {
  it('the same commitment twice within 3 days is offered once, then again after 3 days', async () => {
    expect(await due(['Finish the AI project'], T0)).toEqual(['Finish the AI project']);
    // Same words, different case and punctuation: the same commitment.
    expect(await due(['finish the AI project!'], T0 + 2 * DAY)).toEqual([]);
    expect(await due(['Finish the AI project'], T0 + CHECK_IN_COOLDOWN_MS)).toEqual([
      'Finish the AI project',
    ]);
  });

  it('different commitments are independent, and duplicates in one list are offered once', async () => {
    await due(['Finish the AI project'], T0);

    const out = await due(['Finish the AI project', 'Call my sister', 'call my sister.'], T0 + DAY);

    expect(out).toEqual(['Call my sister']);
  });

  it('survives a restart: the check-in is read back from the store', async () => {
    await due(['Finish the AI project'], T0);
    forgetCheckInMemo();

    expect(await due(['Finish the AI project'], T0 + DAY)).toEqual([]);
    const stored = docs.get(
      `bogle_users/user-1/commitment_checkins/${checkInKey('user-1', 'Finish the AI project')}`
    );
    expect(stored).toMatchObject({ lastAskedAt: T0, expireAt: new Date(T0 + 14 * DAY) });
  });

  it('another user asking about the same words does not hold back this user', async () => {
    await checkInsDue('user-2', ['Finish the AI project'], text, { record: true }, T0);

    expect(await due(['Finish the AI project'], T0 + DAY)).toEqual(['Finish the AI project']);
  });

  it('without record nothing is used up (the discarded warm-up path)', async () => {
    const followUp = { commitmentId: 'c1', message: 'How is it going?' } as CommitmentFollowUp;
    const list = [{ id: 'c1', summary: 'Finish the AI project' }] as Commitment[];

    expect(await followUpsDue('user-1', [followUp], list)).toEqual([followUp]);
    expect(await followUpsDue('user-1', [followUp], list)).toEqual([followUp]);
    expect(docs.size).toBe(0);
    // Once offered for real, the warm-up path holds it back too.
    await due(['Finish the AI project'], Date.now());
    expect(await followUpsDue('user-1', [followUp], list)).toEqual([]);
  });

  it('flag off: everything is offered and nothing is read or written', async () => {
    vi.stubEnv('PROACTIVE_COOLDOWN', 'off');

    expect(await due(['Finish the AI project'], T0)).toEqual(['Finish the AI project']);
    expect(await due(['Finish the AI project'], T0 + DAY)).toEqual(['Finish the AI project']);
    expect(docs.size).toBe(0);
  });
});

describe('session priming offers an overdue check-in at most once per 3 days', () => {
  const prime = (sessionId: string) =>
    buildSuperhumanSessionPriming({
      services: { userId: 'user-1', sessionId },
      userData: { turnCount: 1 },
      persona: { id: 'ferni' },
    } as never);
  const checkInText = (injections: Array<{ content: string }>) =>
    injections.map((i) => i.content).join('\n');

  beforeEach(() => {
    vi.useFakeTimers({ now: T0, toFake: ['Date'] });
    clearAllSuperhumanPrimingSessions();
    commitments.list = [
      {
        id: 'c1',
        status: 'active',
        type: 'intention',
        summary: 'Finish the AI project',
        targetDate: T0 - 2 * DAY,
      },
    ];
  });

  it('flag on: the second call within 3 days carries no check-in, after a restart too', async () => {
    const first = checkInText(await prime('s1'));
    forgetCheckInMemo();
    vi.setSystemTime(T0 + DAY);
    const second = checkInText(await prime('s2'));
    vi.setSystemTime(T0 + 3 * DAY);
    const third = checkInText(await prime('s3'));

    expect(first).toContain('OVERDUE COMMITMENTS');
    expect(first).toContain('Finish the AI project');
    expect(second).not.toContain('OVERDUE COMMITMENTS');
    expect(third).toContain('OVERDUE COMMITMENTS');
  });

  it('flag off: every call carries the check-in, as before', async () => {
    vi.stubEnv('PROACTIVE_COOLDOWN', 'off');
    const first = checkInText(await prime('s1'));
    vi.setSystemTime(T0 + DAY);
    const second = checkInText(await prime('s2'));

    expect(first).toContain('OVERDUE COMMITMENTS');
    expect(second).toContain('OVERDUE COMMITMENTS');
  });
});
