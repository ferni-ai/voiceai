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
  youSaidYoud,
  type CommitmentStore,
  type OpenCommitment,
} from '../commitment-follow-up.js';
import { ferniCallNotes, type CallRecords } from '../../outreach/call-status.js';

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

/** Best of three runs, in ms: the work done, not a scheduler or GC pause. */
function fastest(run: () => unknown): number {
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const started = performance.now();
    run();
    best = Math.min(best, performance.now() - started);
  }
  return best;
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

  it('reads the fields commitment-keeper writes, the statement without its lead-in', () => {
    expect(toOpenCommitment('c9', doc)).toEqual({
      id: 'c9',
      statement: 'start running three mornings a week',
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

  it('cleans the stored line the same way for every reader', () => {
    const said = (statement: string) => toOpenCommitment('c', { ...doc, statement })?.statement;
    expect(said("Okay, I'm going to call my sister Sunday!")).toBe('call my sister Sunday');
    expect(said("I'll probably send Mindy the photos lol")).toBe('send Mindy the photos');
    expect(said("I'm going to the gym tonight.")).toBe('go to the gym tonight');
    expect(said('Finish the deck by Friday.')).toBe('Finish the deck by Friday');
  });

  it('leaves out a line shown on its own when "her" or "it" is all it says', () => {
    const her = { ...doc, statement: "I'll call her tomorrow." };
    expect(toOpenCommitment('c', her)).toBeNull();
    expect(toOpenCommitment('c', her, { withContext: true })?.statement).toBe('call her tomorrow');
    expect(toOpenCommitment('c', { ...doc, statement: "I'll pay it Thursday" })).toBeNull();
  });

  it('shows a run-on line whole, and quotes it back', () => {
    const c = toOpenCommitment('c', {
      ...doc,
      statement: "I owe Tom fifty bucks, I'll pay him back Friday.",
    });
    expect(c).toMatchObject({
      statement: "I owe Tom fifty bucks, I'll pay him back Friday",
      whole: true,
    });
    expect(c && youSaidYoud(c)).toBe('"I owe Tom fifty bucks, I\'ll pay him back Friday"');
  });

  it('says it back to them in the second person', () => {
    const c = toOpenCommitment('c', {
      ...doc,
      statement: "I'll call my mom and tell her I'm sorry",
    });
    expect(c && youSaidYoud(c)).toBe("you'd call your mom and tell her you're sorry");
  });

  it('reads a pathological stored line quickly (cut to MAX_CHARS first)', () => {
    toOpenCommitment('warm', doc);
    for (const statement of [`${' ,'.repeat(5000)}x`, `${'my me '.repeat(2000)}x`]) {
      expect(fastest(() => toOpenCommitment('c', { ...doc, statement }))).toBeLessThan(50);
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

  it('leaves out a goodbye stored before the writers checked, and brings up the rest', async () => {
    const stored = (id: string, statement: string, ageDays: number) => ({
      id,
      data: { status: 'active', statement, createdAt: NOW - ageDays * DAY, followUpCount: 0 },
    });
    const { store, marked } = fakeStore([
      stored('junk', "I'll catch you later.", 1),
      stored('be', "I'll be at Jake's recital Thursday.", 2),
      stored('ok', "I'll send Mindy the photos.", 3),
    ]);
    const open = await loadCallCheckIns('u1', store, NOW);
    expect(open.map((c) => [c.id, c.statement])).toEqual([
      ['be', "be at Jake's recital Thursday"],
      ['ok', 'send Mindy the photos'],
    ]);
    expect(marked).toEqual(['be', 'ok']);
  });

  it('brings "call her tomorrow" up on the call, where the model has the conversation', async () => {
    const { store } = fakeStore([
      {
        id: 'her',
        data: { status: 'active', statement: "I'll call her tomorrow.", createdAt: NOW - DAY },
      },
    ]);
    const open = await loadCallCheckIns('u1', store, NOW);
    expect(open.map((c) => c.statement)).toEqual(['call her tomorrow']);
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

describe('a call Ferni was asked to make (owner call 2026-10-18)', () => {
  const asked = {
    status: 'active',
    statement: 'Call my mom to check in on her',
    createdAt: NOW - DAY,
    followUpAfter: NOW - DAY,
    followUpCount: 0,
  };
  const store: CommitmentStore = {
    active: async () => [{ id: 'c-mom', data: asked }],
    markFollowedUp: async () => undefined,
  };
  const notesFrom = (records: CallRecords) => (u: string, s: readonly string[], n: number) =>
    ferniCallNotes(u, s, n, records);
  const heldCall: CallRecords = {
    load: async () => ({
      deferred: [
        {
          kind: 'on_behalf',
          status: 'pending',
          scheduledFor: new Date(NOW + 2 * 3_600_000).toISOString(),
          timezone: 'America/Denver',
          request: { contactQuery: 'my mom' },
        },
      ],
      results: [],
    }),
  };

  it('held: the check-in says it has not happened, never to ask how it went', async () => {
    const open = await loadCallCheckIns('u1', store, NOW, notesFrom(heldCall));
    expect(open[0].callNote).toMatch(/has not happened yet/);
    const note = formatCheckIn(open, NOW) ?? '';
    expect(note).toContain('"Call my mom to check in on her" (they said this yesterday)');
    expect(note).toMatch(
      /has not happened yet: it is set for later today at 2:00\sPM their time\. Do not ask how it went/
    );
  });

  it('completed, or never asked of Ferni: asked about as before', async () => {
    const none: CallRecords = { load: async () => ({ deferred: [], results: [] }) };
    const done: CallRecords = {
      load: async () => ({
        deferred: [],
        results: [{ request: { contactQuery: 'my mom' }, outcome: { status: 'completed' } }],
      }),
    };
    for (const calls of [none, done]) {
      const open = await loadCallCheckIns('u1', store, NOW, notesFrom(calls));
      expect(open[0].callNote).toBeUndefined();
      expect(formatCheckIn(open, NOW)).not.toMatch(/Do not ask how it went/);
    }
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
