import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import { ponderUser, toPonderSummary } from '../ponder-user.js';
import {
  buildPonderingPrompt,
  callerOnly,
  isFerniLine,
  isSubstantive,
  friendWorthy,
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
    expect(p).toContain('never refer to them in the third person');
    expect(p).toMatch(/setback or disappointment is never a thinkingOf note/);
    expect(p).toMatch(/Never routine daily life/);
    expect(p).toMatch(/Never ask how something went unless you know it has happened/);
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

describe('friendWorthy', () => {
  it('keeps what a friend would say', () => {
    expect(friendWorthy({ text: "How's the sourdough coming along?" })).toBe(true);
    expect(friendWorthy({ text: 'How did the bake sale go?', when: '2026-10-17' })).toBe(true);
    expect(friendWorthy({ text: 'Is the all-hands still on for next month?' })).toBe(true);
  });

  it('drops notes to self, routine trivia and "how did it go" before the event', () => {
    expect(friendWorthy({ text: 'Ask how the bake sale went', when: '2026-10-17' })).toBe(false);
    expect(friendWorthy({ text: 'Check if they used the banneton' })).toBe(false);
    expect(friendWorthy({ text: 'Did you get to bed early like you planned?' })).toBe(false);
    expect(friendWorthy({ text: 'How did the all-hands presentation go?' })).toBe(false);
    expect(friendWorthy({ text: 'How was the trip?' })).toBe(false);
  });
});

describe('parsePondering', () => {
  const ids = new Set(['s1', 's2']);

  it('drops anything that does not cite a summary it was given', () => {
    const p = parsePondering(
      reply({
        followUps: [
          { text: 'How did the surgery go?', when: '2026-10-14', basis: 's1' },
          { text: 'How is the promotion going?', basis: 'made-up' },
          { text: 'No basis at all' },
        ],
        thinkingOf: [
          { text: 'your mom', basis: 's2' },
          { text: 'invented', basis: 'x' },
        ],
      }),
      ids,
      today
    );
    expect(p.followUps).toEqual([
      { text: 'How did the surgery go?', when: '2026-10-14', basis: 's1' },
    ]);
    expect(p.thinkingOf).toEqual([{ text: 'your mom', basis: 's2' }]);
  });

  it('drops a note drawn from the same call as a follow-up: one thought, not two', () => {
    const p = parsePondering(
      reply({
        followUps: [{ text: 'Did skipping the snooze button stick?', basis: 's1' }],
        thinkingOf: [
          { text: 'your chaotic mornings and the snooze button', basis: 's1' },
          { text: "your grandmother's bread", basis: 's2' },
        ],
      }),
      ids,
      today
    );
    expect(p.followUps).toHaveLength(1);
    expect(p.thinkingOf).toEqual([{ text: "your grandmother's bread", basis: 's2' }]);
  });

  it('keeps a follow-up but drops a date in the past', () => {
    const p = parsePondering(
      reply({ followUps: [{ text: 'How is your mom?', when: '2026-01-01', basis: 's1' }] }),
      ids,
      today
    );
    expect(p.followUps).toEqual([{ text: 'How is your mom?', basis: 's1' }]);
  });

  it('keeps only follow-ups a friend would say', () => {
    const p = parsePondering(
      reply({
        followUps: [
          { text: 'Ask how the late-night run went', basis: 's1' },
          { text: 'Did you get to bed early?', basis: 's1' },
          { text: 'How did the all-hands go?', basis: 's2' },
          { text: "How's your dad feeling after the surgery?", when: '2026-10-14', basis: 's2' },
        ],
      }),
      ids,
      today
    );
    expect(p.followUps.map((f) => f.text)).toEqual(["How's your dad feeling after the surgery?"]);
  });

  it('caps follow-ups at 3 and notes at 2', () => {
    const many = (basis: string) =>
      Array.from({ length: 6 }, (_, i) => ({ text: `item ${i}`, basis }));
    const p = parsePondering(reply({ followUps: many('s1'), thinkingOf: many('s2') }), ids, today);
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
          { text: 'How is your mom doing?', basis: 'a' },
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
    expect(out.followUps).toEqual([{ text: 'How is your mom doing?', basis: 'a' }]);
    expect(llm.mock.calls[0]?.[0]).not.toContain('[junk]');
  });
});

describe("only the caller's own lines", () => {
  // The 2026-10-10 dry run credited Ferni's own Silk Road story to the caller.
  const silk = call('a', {
    topics: ['Silk Road', 'knee surgery'],
    keyPoints: [
      'The assistant shared a story about walking the Silk Road',
      'Mom has knee surgery Tuesday',
      'Seth is driving her',
    ],
  });

  it('recognises lines about Ferni in the shapes summaries write them', () => {
    expect(isFerniLine('The assistant shared observations of horses in the pasture')).toBe(true);
    expect(isFerniLine('Assistant is a proud parent.')).toBe(true);
    expect(isFerniLine('Share more about myself (the AI) as requested.')).toBe(true);
    expect(isFerniLine('Seth addressed the assistant as Fern')).toBe(false);
    expect(isFerniLine("Seth's sister is moving to Boise")).toBe(false);
  });

  it("never shows the model Ferni's story, and drops a note it invents from the topics", async () => {
    const llm = vi.fn().mockResolvedValue(
      reply({
        followUps: [{ text: 'How did the Silk Road walk go?', when: '2026-10-12', basis: 'a' }],
        thinkingOf: [
          { text: 'your Silk Road trip', basis: 'b' },
          { text: "your mom's knee surgery", basis: 'b' },
        ],
      })
    );
    const out = await ponder([silk, call('b')], today, llm);
    const prompt = String(llm.mock.calls[0]?.[0]);
    expect(prompt).not.toContain('The assistant shared');
    expect(out.followUps).toEqual([]);
    expect(out.thinkingOf).toEqual([{ text: "your mom's knee surgery", basis: 'b' }]);
  });

  it('drops items about Ferni, and items drawn only from the follow-up notes', async () => {
    const jack = call('a', {
      keyPoints: ['Seth switched to a faster model', 'The new model is slower at night'],
      followUps: ["Ask about Jack's impression of the AI"],
    });
    const llm = vi.fn().mockResolvedValue(
      reply({
        followUps: [
          { text: 'What did Jack think of me when you introduced us?', basis: 'a' },
          { text: 'How did your mom react when I called her?', when: '2026-10-11', basis: 'b' },
          { text: "How's Jack doing?", basis: 'a' },
        ],
        thinkingOf: [{ text: 'how we both grew up with six siblings', basis: 'b' }],
      })
    );
    const out = await ponder([jack, call('b')], today, llm);
    expect(out).toEqual({ followUps: [], thinkingOf: [] });
  });

  it('leaves calls older than a month out', async () => {
    const llm = vi.fn();
    const old = await ponder([call('a', { date: '2026-08-01' }), call('b')], today, llm);
    expect(old).toEqual({ followUps: [], thinkingOf: [] });
    expect(llm).not.toHaveBeenCalled();
  });

  it('keeps a call whose only real lines were Ferni talking out of the pass', () => {
    const ferniOnly = call('c', {
      keyPoints: ['The assistant talked about jazz', 'Assistant expressed affection'],
    });
    expect(isSubstantive(callerOnly(ferniOnly))).toBe(false);
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

  it('with nothing worth saying, records only when it pondered, keeping earlier items', async () => {
    const { db, set } = fakeDb([live('a'), live('b')]);
    const out = await ponderUser(db, 'u1', async () => reply({ followUps: [], thinkingOf: [] }), {
      now,
      env: { PONDERING: 'on' },
    });
    expect(out.status).toBe('nothing');
    expect(set).toHaveBeenCalledWith({ ponderedAt: now.toISOString() }, { merge: true });
  });

  it('writes nothing in a dry run', async () => {
    const { db, set } = fakeDb([live('a'), live('b')]);
    const out = await ponderUser(
      db,
      'u1',
      async () => reply({ followUps: [{ text: 'How is your mom doing?', basis: 'a' }] }),
      { now, env: { PONDERING: 'on' }, dryRun: true }
    );
    expect(out.status).toBe('dry-run');
    expect(out.pondering?.followUps).toHaveLength(1);
    expect(set).not.toHaveBeenCalled();
  });

  it('stores the grounded result with what it was based on', async () => {
    const { db, set } = fakeDb([live('a'), live('b')]);
    const out = await ponderUser(
      db,
      'u1',
      async () =>
        reply({
          followUps: [{ text: 'How is your mom doing?', when: '2026-10-14', basis: 'a' }],
          thinkingOf: [],
        }),
      { now, env: { PONDERING: 'on' } }
    );
    expect(out.status).toBe('stored');
    // Merged, so the record of items already raised survives a new pass.
    expect(set).toHaveBeenCalledWith(
      {
        followUps: [{ text: 'How is your mom doing?', when: '2026-10-14', basis: 'a' }],
        thinkingOf: [],
        generatedAt: now.toISOString(),
        ponderedAt: now.toISOString(),
        basedOn: ['a', 'b'],
      },
      { merge: true }
    );
  });
});
