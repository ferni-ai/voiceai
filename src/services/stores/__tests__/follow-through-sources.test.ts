import type { Firestore } from '@google-cloud/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  commitments: [] as Array<{ id: string; data: Record<string, unknown> }>,
  summaries: [] as Array<{ id: string; data: Record<string, unknown> }>,
  forgotten: [] as string[] | null,
  failSummaries: false,
}));
vi.mock('../../superhuman/commitment-follow-up.js', async (orig) => ({
  ...(await orig<typeof import('../../superhuman/commitment-follow-up.js')>()),
  firestoreCommitmentStore: {
    active: async () => h.commitments,
    markFollowedUp: async () => undefined,
  },
}));
vi.mock('../../../memory/storage/call-summaries.js', () => ({
  readCallSummaries: async () => {
    if (h.failSummaries) throw new Error('summaries down');
    return { docs: h.summaries.map((s) => ({ id: s.id, data: () => s.data })) };
  },
}));
vi.mock('../../../memory/recall/forget.js', () => ({
  forgottenTopicsOrNull: async () => h.forgotten,
}));

const { createFollowUpSources } = await import('../follow-through-sources.js');

function remindersDb(reminders: Array<{ id: string; data: Record<string, unknown> }>): Firestore {
  const q = {
    where: (_f: string, _op: string, v: unknown) => ({
      limit: () => ({
        get: async () => ({
          docs: reminders
            .filter((r) => r.data.status === v)
            .map((r) => ({ id: r.id, data: () => r.data })),
        }),
      }),
    }),
  };
  return { collection: () => ({ doc: () => ({ collection: () => q }) }) } as unknown as Firestore;
}

const NOW = new Date('2026-10-12T22:00:00.000Z');
const DAY = 86_400_000;
const commitment = (id: string, statement: string) => ({
  id,
  data: {
    status: 'active',
    statement,
    createdAt: NOW.getTime() - DAY,
    followUpAfter: NOW.getTime() + DAY,
  },
});

beforeEach(() => {
  h.commitments = [];
  h.summaries = [];
  h.forgotten = [];
  h.failSummaries = false;
});

describe('follow-through sources', () => {
  it('maps pending reminders with their own zone, and skips ones with no message or time', async () => {
    const db = remindersDb([
      {
        id: 'r1',
        data: {
          status: 'pending',
          message: 'Call mom',
          scheduledFor: '2026-10-13T16:00:00.000Z',
          timezone: 'America/New_York',
        },
      },
      {
        id: 'r2',
        data: { status: 'pending', message: '', scheduledFor: '2026-10-13T16:00:00.000Z' },
      },
      {
        id: 'r3',
        data: { status: 'delivered', message: 'old', scheduledFor: '2026-10-01T16:00:00.000Z' },
      },
      {
        id: 'r4',
        data: {
          status: 'pending',
          message: 'Pay rent',
          scheduledFor: 'tomorrow',
          timezone: 'Mars/Base',
        },
      },
    ]);
    const items = await createFollowUpSources(db).itemsFor('u1', NOW);
    expect(items).toEqual([
      {
        kind: 'reminder',
        text: 'Call mom',
        dueAt: '2026-10-13T16:00:00.000Z',
        repeat: null,
        source: { store: 'reminders', ref: 'r1' },
        zone: 'America/New_York',
      },
    ]);
  });

  it('keeps real commitments and drops sign-offs, by the check-in’s own rules', async () => {
    h.commitments = [
      commitment('c1', 'I am going to apply for that job by Friday'),
      commitment('c2', 'I need to go'),
    ];
    const items = await createFollowUpSources(remindersDb([])).itemsFor('u1', NOW);
    expect(items.map((i) => [i.kind, i.source.ref])).toEqual([['commitment', 'c1']]);
    expect(items[0].dueAt).toBe(new Date(NOW.getTime() + DAY).toISOString());
  });

  it('brings in threads from the last calls', async () => {
    h.summaries = [
      { id: 's1', data: { followUpItems: ['how the interview went', ' '], callerProvenance: 1 } },
    ];
    const items = await createFollowUpSources(remindersDb([])).itemsFor('u1', NOW);
    expect(items).toEqual([
      {
        kind: 'thread',
        text: 'how the interview went',
        dueAt: null,
        repeat: null,
        source: { store: 'summaries', ref: 's1:0' },
      },
    ]);
  });

  it('leaves out anything about a topic they asked Ferni to forget', async () => {
    h.forgotten = ['ex wife'];
    h.commitments = [commitment('c1', 'I will call my ex wife about the house this week')];
    h.summaries = [
      {
        id: 's1',
        data: {
          followUpItems: ['the ex-wife and the house', 'the marathon training plan'],
          callerProvenance: 1,
        },
      },
    ];
    const items = await createFollowUpSources(remindersDb([])).itemsFor('u1', NOW);
    expect(items.map((i) => i.text)).toEqual(['the marathon training plan']);
  });

  it('when the forget list cannot be read, imports reminders only', async () => {
    h.forgotten = null;
    h.commitments = [commitment('c1', 'I am going to apply for that job by Friday')];
    h.summaries = [
      { id: 's1', data: { followUpItems: ['how the interview went'], callerProvenance: 1 } },
    ];
    const db = remindersDb([
      {
        id: 'r1',
        data: { status: 'pending', message: 'Call mom', scheduledFor: '2026-10-13T16:00:00.000Z' },
      },
    ]);
    const items = await createFollowUpSources(db).itemsFor('u1', NOW);
    expect(items.map((i) => i.kind)).toEqual(['reminder']);
  });

  describe('summary threads: only what the caller raised', () => {
    const threads = async () =>
      (await createFollowUpSources(remindersDb([])).itemsFor('u1', NOW)).map((i) => [
        i.text,
        i.source.ref,
      ]);

    it('skips a summary that was never checked against the caller (no callerProvenance)', async () => {
      h.summaries = [
        { id: 'checked', data: { callerProvenance: 1, followUpItems: ['the marathon plan'] } },
        { id: 'legacy', data: { followUpItems: ['the offer Ferni brought up'] } },
        { id: 'other', data: { callerProvenance: 2, followUpItems: ['an unknown marker'] } },
      ];
      expect(await threads()).toEqual([['the marathon plan', 'checked:0']]);
    });

    it('drops items the assistant raised', async () => {
      h.summaries = [
        {
          id: 's1',
          data: {
            callerProvenance: 1,
            followUpItems: ['the marathon plan', 'the career offer'],
            assistantRaisedItems: ['the career offer'],
          },
        },
      ];
      expect(await threads()).toEqual([['the marathon plan', 's1:0']]);
    });

    it('drops items the caller disputed', async () => {
      h.summaries = [
        {
          id: 's1',
          data: {
            callerProvenance: 1,
            followUpItems: ['the move to Denver', 'the marathon plan'],
            disputedItems: ['the move to Denver'],
          },
        },
      ];
      expect(await threads()).toEqual([['the marathon plan', 's1:1']]);
    });

    it('keeps the stored index in the ref, so a thread id does not move when an earlier item goes', async () => {
      h.summaries = [
        {
          id: 's1',
          data: {
            callerProvenance: 1,
            followUpItems: ['the career offer', 'the move', 'the marathon plan'],
            assistantRaisedItems: ['the career offer'],
            disputedItems: ['the move'],
          },
        },
      ];
      expect(await threads()).toEqual([['the marathon plan', 's1:2']]);
    });
  });

  it('one source failing does not lose the others', async () => {
    h.failSummaries = true;
    h.commitments = [commitment('c1', 'I am going to apply for that job by Friday')];
    const items = await createFollowUpSources(remindersDb([])).itemsFor('u1', NOW);
    expect(items.map((i) => i.source.ref)).toEqual(['c1']);
  });

  describe('timed dates (BOOKENDS)', () => {
    const fact = (id: string, value: string) => ({
      id,
      subject: 'self',
      value,
      origin: 'dates',
      kind: 'medical',
      recurrence: 'once',
      eventDate: '2026-10-14',
      at: '15:00',
      validTo: null,
    });
    const facts = { listOpen: vi.fn(async () => [fact('wd_1', 'biopsy'), fact('wd_2', 'therapy')]) }; // prettier-ignore
    const sources = () =>
      createFollowUpSources(remindersDb([]), { facts: facts as never, heavy: () => false });
    const BOOKENDS = { bookends: { zone: 'America/New_York' } };
    beforeEach(() => facts.listOpen.mockClear());

    it('without the option the facts are never read, and the items are as before', async () => {
      h.commitments = [commitment('c1', 'I am going to apply for that job by Friday')];
      const before = await createFollowUpSources(remindersDb([])).itemsFor('u1', NOW);
      expect(await sources().itemsFor('u1', NOW)).toEqual(before);
      expect(facts.listOpen).not.toHaveBeenCalled();
    });

    it('with it, brings them in minus a forgotten topic, and reads none when topics are unreadable', async () => {
      h.forgotten = ['therapy'];
      const items = await sources().itemsFor('u1', NOW, BOOKENDS);
      expect(items.map((i) => [i.source.ref, i.eventAt])).toEqual([
        ['wd_1', '2026-10-14T19:00:00.000Z'],
      ]);
      h.forgotten = null;
      expect(await sources().itemsFor('u1', NOW, BOOKENDS)).toEqual([]);
      expect(facts.listOpen).toHaveBeenCalledTimes(1);
    });
  });
});
