import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import { ponderUser, toPonderSummary } from '../ponder-user.js';
import {
  buildPonderingPrompt,
  isSubstantive,
  parsePondering,
  ponder,
  validWhen,
  type PonderSummary,
} from '../pondering.js';

const today = '2026-10-10';
const call = (id: string, over: Partial<PonderSummary> = {}): PonderSummary => ({
  id,
  date: '2026-10-09',
  topics: ['knee surgery'],
  keyPoints: ['Mom has knee surgery Tuesday', 'Seth is driving her'],
  openThreads: ['how the surgery goes'],
  followUps: ['ask about mom on Wednesday'],
  ...over,
});
const reply = (o: unknown) => JSON.stringify(o);

describe('isSubstantive', () => {
  it('ignores the keyword fallback\'s "User asked:" summaries', () => {
    expect(isSubstantive(call('a'))).toBe(true);
    expect(
      isSubstantive(call('b', { keyPoints: ['User asked: Hey?', 'User asked: music?'] }))
    ).toBe(false);
    expect(isSubstantive(call('c', { topics: [] }))).toBe(false);
  });
});

describe('buildPonderingPrompt', () => {
  it("gives the date, the ids to cite, and keeps Ferni's own stories out of the notes", () => {
    const p = buildPonderingPrompt([call('s1')], today);
    expect(p).toContain('Today is 2026-10-10');
    expect(p).toContain('[s1] 2026-10-09');
    expect(p).toContain('Never attribute your own stories to them');
  });
});

describe('validWhen', () => {
  it('accepts a real day from today up to 60 days out', () => {
    expect(validWhen('2026-10-14', today)).toBe('2026-10-14');
    expect(validWhen('2026-10-01', today)).toBeUndefined();
    expect(validWhen('2027-03-01', today)).toBeUndefined();
    expect(validWhen('2026-02-30', today)).toBeUndefined();
    expect(validWhen('Wednesday', today)).toBeUndefined();
  });
});

describe('parsePondering', () => {
  const ids = new Set(['s1']);

  it('drops anything that does not cite a summary it was given', () => {
    const p = parsePondering(
      reply({
        followUps: [
          { text: 'Ask how the surgery went', when: '2026-10-14', basis: 's1' },
          { text: 'Ask about the promotion', basis: 'made-up' },
          { text: 'No basis at all' },
        ],
        thinkingOf: [
          { text: 'your mom', basis: 's1' },
          { text: 'invented', basis: 'x' },
        ],
      }),
      ids,
      today
    );
    expect(p.followUps).toEqual([
      { text: 'Ask how the surgery went', when: '2026-10-14', basis: 's1' },
    ]);
    expect(p.thinkingOf).toEqual([{ text: 'your mom', basis: 's1' }]);
  });

  it('keeps a follow-up but drops a date in the past', () => {
    const p = parsePondering(
      reply({ followUps: [{ text: 'Ask', when: '2026-01-01', basis: 's1' }] }),
      ids,
      today
    );
    expect(p.followUps).toEqual([{ text: 'Ask', basis: 's1' }]);
  });

  it('caps follow-ups at 3 and notes at 2', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ text: `item ${i}`, basis: 's1' }));
    const p = parsePondering(reply({ followUps: many, thinkingOf: many }), ids, today);
    expect(p.followUps).toHaveLength(3);
    expect(p.thinkingOf).toHaveLength(2);
  });

  it('returns nothing for a reply with no usable JSON', () => {
    expect(parsePondering('no', ids, today)).toEqual({ followUps: [], thinkingOf: [] });
    expect(parsePondering(null, ids, today)).toEqual({ followUps: [], thinkingOf: [] });
  });
});

describe('ponder', () => {
  it('does not call the model with fewer than two real calls', async () => {
    const llm = vi.fn();
    const out = await ponder([call('a'), call('b', { topics: [] })], today, llm);
    expect(out).toEqual({ followUps: [], thinkingOf: [] });
    expect(llm).not.toHaveBeenCalled();
  });

  it('sends only the real calls and keeps only items citing them', async () => {
    const llm = vi.fn().mockResolvedValue(
      reply({
        followUps: [
          { text: 'Ask about mom', basis: 'a' },
          { text: 'x', basis: 'junk' },
        ],
        thinkingOf: [],
      })
    );
    const out = await ponder(
      [call('a'), call('b'), call('junk', { keyPoints: ['User asked: hi'] })],
      today,
      llm
    );
    expect(out.followUps).toEqual([{ text: 'Ask about mom', basis: 'a' }]);
    expect(llm.mock.calls[0]?.[0]).not.toContain('[junk]');
  });
});

describe('toPonderSummary', () => {
  it('reads the live summary fields and both timestamp forms', () => {
    const iso = toPonderSummary('x', {
      timestamp: '2026-10-10T18:20:05.103Z',
      mainTopics: ['t'],
      keyPoints: ['k1', 'k2'],
      questionsRemaining: ['q'],
      followUpItems: ['f'],
    });
    expect(iso).toEqual({
      id: 'x',
      date: '2026-10-10',
      topics: ['t'],
      keyPoints: ['k1', 'k2'],
      openThreads: ['q'],
      followUps: ['f'],
    });
    const ts = toPonderSummary('y', {
      timestamp: { toDate: () => new Date('2026-06-08T03:48:48Z') },
    });
    expect(ts.date).toBe('2026-06-08');
  });
});

describe('ponderUser', () => {
  function fakeDb(summaries: Array<{ id: string; data: Record<string, unknown> }>) {
    const set = vi.fn(async () => undefined);
    const get = vi.fn(async () => ({
      docs: summaries.map((s) => ({ id: s.id, data: () => s.data })),
    }));
    const chain = { select: () => chain, orderBy: () => chain, limit: () => chain, get };
    const db = {
      collection: () => ({
        doc: () => ({
          collection: (name: string) => (name === 'summaries' ? chain : { doc: () => ({ set }) }),
        }),
      }),
    };
    return { db: db as unknown as Firestore, set, get };
  }
  const live = (id: string) => ({
    id,
    data: {
      timestamp: '2026-10-09T12:00:00Z',
      mainTopics: ['knee'],
      keyPoints: ['Mom surgery Tuesday', 'Driving her'],
    },
  });
  const now = new Date('2026-10-10T12:00:00Z');

  it('reads and writes nothing when PONDERING is off', async () => {
    const { db, set, get } = fakeDb([live('a'), live('b')]);
    expect(await ponderUser(db, 'u1', vi.fn(), { now, env: {} })).toEqual({ status: 'off' });
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('writes nothing when there is nothing worth saying', async () => {
    const { db, set } = fakeDb([live('a'), live('b')]);
    const out = await ponderUser(db, 'u1', async () => reply({ followUps: [], thinkingOf: [] }), {
      now,
      env: { PONDERING: 'on' },
    });
    expect(out.status).toBe('nothing');
    expect(set).not.toHaveBeenCalled();
  });

  it('stores the grounded result with what it was based on', async () => {
    const { db, set } = fakeDb([live('a'), live('b')]);
    const out = await ponderUser(
      db,
      'u1',
      async () =>
        reply({
          followUps: [{ text: 'Ask about mom', when: '2026-10-14', basis: 'a' }],
          thinkingOf: [],
        }),
      { now, env: { PONDERING: 'on' } }
    );
    expect(out.status).toBe('stored');
    expect(set).toHaveBeenCalledWith({
      followUps: [{ text: 'Ask about mom', when: '2026-10-14', basis: 'a' }],
      thinkingOf: [],
      generatedAt: now.toISOString(),
      basedOn: ['a', 'b'],
    });
  });
});
