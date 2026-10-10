import { describe, expect, it, vi } from 'vitest';
import {
  askableOnCall,
  callCheckIns,
  coachFollowThroughMode,
  dueForPush,
  formatCheckIn,
  loadCallCheckIns,
  pickForCall,
  toOpenCommitment,
  type CommitmentStore,
  type OpenCommitment,
} from '../commitment-follow-up.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-10T18:00:00Z');

function commitment(over: Partial<OpenCommitment> = {}): OpenCommitment {
  return {
    id: 'c1',
    statement: "I'm going to send my resume to Dana by Thursday.",
    createdAt: NOW - 3 * DAY,
    followUpAfter: NOW - DAY,
    followUpCount: 0,
    ...over,
  };
}

describe('coachFollowThroughMode', () => {
  it('is off by default and on only with COACH_FOLLOW_THROUGH=on', () => {
    expect(coachFollowThroughMode({})).toBe(false);
    expect(coachFollowThroughMode({ COACH_FOLLOW_THROUGH: 'off' })).toBe(false);
    expect(coachFollowThroughMode({ COACH_FOLLOW_THROUGH: 'on' })).toBe(true);
  });
});

describe('toOpenCommitment', () => {
  const doc = {
    status: 'active',
    statement: "I'll start running three mornings a week.",
    createdAt: NOW - DAY,
    followUpAfter: NOW + 2 * DAY,
    followUpCount: 1,
  };

  it('reads the fields commitment-keeper writes', () => {
    expect(toOpenCommitment('c9', doc)).toEqual({
      id: 'c9',
      statement: "I'll start running three mornings a week.",
      createdAt: NOW - DAY,
      followUpAfter: NOW + 2 * DAY,
      followUpCount: 1,
    });
  });

  it('skips sign-offs and filler the capture regex lets through', () => {
    for (const statement of [
      'I need to go.',
      "I'll let you go.",
      "I'll talk to you later.",
      "I'll try.",
    ]) {
      expect(toOpenCommitment('c', { ...doc, statement })).toBeNull();
    }
  });

  it('skips completed commitments and ones without a creation time', () => {
    expect(toOpenCommitment('c', { ...doc, status: 'completed' })).toBeNull();
    expect(toOpenCommitment('c', { ...doc, createdAt: undefined })).toBeNull();
  });
});

describe('askableOnCall and dueForPush', () => {
  it('asks again only after two days, at most three times, and not after a month', () => {
    expect(askableOnCall(commitment(), NOW)).toBe(true);
    expect(askableOnCall(commitment({ lastFollowUp: NOW - DAY }), NOW)).toBe(false);
    expect(askableOnCall(commitment({ lastFollowUp: NOW - 2 * DAY }), NOW)).toBe(true);
    expect(askableOnCall(commitment({ followUpCount: 3 }), NOW)).toBe(false);
    expect(askableOnCall(commitment({ createdAt: NOW - 31 * DAY }), NOW)).toBe(false);
  });

  it('pushes only once the follow-up date has come', () => {
    expect(dueForPush(commitment(), NOW)).toBe(true);
    expect(dueForPush(commitment({ followUpAfter: NOW + DAY }), NOW)).toBe(false);
  });
});

describe('pickForCall', () => {
  it('puts a passed date first, then a date ahead, then the newest, two at most', () => {
    const picked = pickForCall(
      [
        commitment({ id: 'newest-undated', createdAt: NOW - DAY }),
        commitment({ id: 'ahead', targetDate: NOW + DAY }),
        commitment({ id: 'passed', targetDate: NOW - DAY }),
      ],
      NOW
    );
    expect(picked.map((c) => c.id)).toEqual(['passed', 'ahead']);
  });
});

describe('formatCheckIn', () => {
  it('quotes their words and when they said them', () => {
    const note = formatCheckIn([commitment()], NOW);
    expect(note).toContain(
      '"I\'m going to send my resume to Dana by Thursday." (they said this 3 days ago)'
    );
    expect(note).toContain('ask how one of them went, by name, once');
  });

  it('is null with nothing open', () => {
    expect(formatCheckIn([], NOW)).toBeNull();
  });
});

function fakeStore(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  const marked: string[] = [];
  const store: CommitmentStore = {
    active: vi.fn(async () => docs),
    markFollowedUp: vi.fn(async (_u, c) => {
      marked.push(c.id);
    }),
  };
  return { store, marked };
}

describe('loadCallCheckIns', () => {
  it('records what it picked as followed up, so it is not asked again straight away', async () => {
    const { store, marked } = fakeStore([
      {
        id: 'c1',
        data: {
          status: 'active',
          statement: "I'll call the landlord about the leak.",
          createdAt: NOW - DAY,
          followUpCount: 0,
        },
      },
      { id: 'c2', data: { status: 'active', statement: 'I need to go.', createdAt: NOW - DAY } },
    ]);
    const open = await loadCallCheckIns('u1', store, NOW);
    expect(open.map((c) => c.id)).toEqual(['c1']);
    expect(marked).toEqual(['c1']);
  });

  it('returns nothing instead of throwing when the store fails', async () => {
    const store: CommitmentStore = {
      active: async () => {
        throw new Error('unavailable');
      },
      markFollowedUp: async () => undefined,
    };
    await expect(loadCallCheckIns('u1', store, NOW)).resolves.toEqual([]);
  });
});

describe('callCheckIns', () => {
  it('shares one load between the greeting and the first recall note', async () => {
    const { store } = fakeStore([]);
    await Promise.all([callCheckIns('shared-u', store, NOW), callCheckIns('shared-u', store, NOW)]);
    expect(store.active).toHaveBeenCalledTimes(1);
  });

  it('loads afresh for a later call', async () => {
    const { store } = fakeStore([]);
    await callCheckIns('later-u', store, NOW);
    await callCheckIns('later-u', store, NOW + 120_000);
    expect(store.active).toHaveBeenCalledTimes(2);
  });
});
