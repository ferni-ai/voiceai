/**
 * What Ferni knows, grouped: each store lands in its section with where it
 * came from, only what the live readers would use is shown, pondering stays
 * hidden behind its own flag, and every read is under the caller's own path.
 */
import { describe, expect, it, vi } from 'vitest';

const { buildKnownView, ForgottenTopicsUnreadable, loadKnownView, isMemoryViewPonderingOn } =
  await import('../known.js');
const { loadRecallSnapshot } = await import('../../../memory/recall/session-recall.js');
import type { KnownStore } from '../known.js';
import type { TemporalFact } from '../../world-model/temporal/types.js';
import type { MindModel } from '../../theory-of-mind/types.js';

const NOW = new Date('2026-10-11T15:00:00.000Z');

function world(over: Partial<TemporalFact>): TemporalFact {
  return {
    id: 'w1',
    subject: 'Mindy',
    subjectKind: 'person',
    subjectKey: 'person:mindy',
    relation: 'sister',
    attribute: 'health',
    value: 'recovering from knee surgery',
    observedAt: '2026-10-09T18:00:00.000Z',
    confidence: 0.9,
    source: { kind: 'summary', sessionId: 's1', quote: 'her knee surgery went fine' },
    validFrom: '2026-10-09T18:00:00.000Z',
    validTo: null,
    ...over,
  };
}

const mind: MindModel = {
  userId: 'u-1',
  version: 1,
  calls: 4,
  toldFerni: [],
  patterns: [
    {
      key: 'jokes-when-anxious',
      kind: 'coping',
      statement: 'jokes when anxious, then wants practical help',
      moments: [
        { sessionId: 's1', at: '2026-10-01T00:00:00.000Z', cue: 'laughed off the layoff news' },
        { sessionId: 's2', at: '2026-10-08T00:00:00.000Z', cue: 'joked before asking for a plan' },
      ],
      contradictions: 0,
      confidence: 0.55,
      lastSeen: '2026-10-08T00:00:00.000Z',
    },
    {
      key: 'one-moment-only',
      kind: 'feeling',
      statement: 'not sure yet',
      moments: [{ sessionId: 's1', at: '2026-10-01T00:00:00.000Z', cue: 'once' }],
      contradictions: 0,
      confidence: 0.2,
      lastSeen: '2026-10-01T00:00:00.000Z',
    },
  ],
  sensitivities: [{ topic: 'her dad', how: "doesn't want to talk about it", at: '2026-10-02' }],
  updatedAt: '2026-10-08T00:00:00.000Z',
};

const pondering = {
  followUps: [{ text: 'Is the all-hands still on for next month?', basis: 'sum-1' }],
  thinkingOf: [{ text: "your sister's move to Denver", basis: 'sum-2' }],
};

const empty = {
  facts: [],
  world: [],
  mind: null,
  pondering: null,
  summaryDays: new Map<string, string>(),
  forgotten: [] as string[],
};

describe('buildKnownView', () => {
  it('files facts under people, preferences and life now, with when they were learned', () => {
    const view = buildKnownView(
      {
        ...empty,
        facts: [
          {
            id: 'f1',
            subject: 'Biscuit',
            detail: 'breed: golden retriever',
            learnedAt: '2026-10-09T00:00:00Z',
          },
          { id: 'f2', subject: 'you', detail: 'loves trail running' },
          { id: 'f3', subject: 'you', detail: 'job: nurse', earlier: true, fromYou: true },
        ],
      },
      NOW,
      false
    );
    expect(view.people).toEqual([
      expect.objectContaining({
        id: 'f1',
        kind: 'fact',
        about: 'Biscuit',
        source: 'told',
        at: '2026-10-09T00:00:00Z',
      }),
    ]);
    expect(view.preferences.map((i) => i.id)).toEqual(['f2']);
    expect(view.lifeNow).toEqual([
      expect.objectContaining({ id: 'f3', earlier: true, fromYou: true }),
    ]);
    expect(view.thinkingAbout).toBeUndefined();
  });

  it('shows current world facts with the caller’s own words, and dated ones as dates in order', () => {
    const view = buildKnownView(
      {
        ...empty,
        world: [
          world({}),
          world({
            id: 'w2',
            subject: 'self',
            subjectKind: 'self',
            attribute: 'job',
            value: 'nurse at St. Mary’s',
          }),
          world({ id: 'w3', attribute: 'event', value: 'move to Denver', eventDate: '2026-11-01' }),
          world({ id: 'w4', attribute: 'event', value: 'dentist', eventDate: '2026-10-12' }),
          world({ id: 'w5', attribute: 'event', value: 'long past', eventDate: '2026-08-01' }),
          world({ id: 'w6', value: 'closed fact', validTo: '2026-10-10T00:00:00.000Z' }),
        ],
      },
      NOW,
      false
    );
    expect(view.people).toEqual([
      expect.objectContaining({
        id: 'w1',
        kind: 'world',
        about: 'Mindy',
        relation: 'sister',
        text: 'health: recovering from knee surgery',
        quote: 'her knee surgery went fine',
        at: '2026-10-09T18:00:00.000Z',
      }),
    ]);
    expect(view.lifeNow.map((i) => [i.id, i.text])).toEqual([['w2', 'job: nurse at St. Mary’s']]);
    expect(view.dates.map((i) => [i.id, i.day])).toEqual([
      ['w4', '2026-10-12'],
      ['w3', '2026-11-01'],
    ]);
  });

  it('shows only patterns Ferni acts on, as noticed, and sensitivities as told', () => {
    const view = buildKnownView({ ...empty, mind }, NOW, false);
    expect(view.readsYou).toEqual([
      expect.objectContaining({
        id: 'jokes-when-anxious',
        kind: 'pattern',
        source: 'noticed',
        quote: 'joked before asking for a plan',
      }),
      expect.objectContaining({
        kind: 'sensitivity',
        source: 'told',
        text: "her dad: doesn't want to talk about it",
      }),
    ]);
  });

  it('dates pondering items by the call they came from, only when its section is on', () => {
    const parts = { ...empty, pondering, summaryDays: new Map([['sum-1', '2026-10-09']]) };
    expect(buildKnownView(parts, NOW, false).thinkingAbout).toBeUndefined();
    const view = buildKnownView(parts, NOW, true);
    expect(view.thinkingAbout).toEqual([
      expect.objectContaining({
        kind: 'ponder',
        source: 'noticed',
        at: '2026-10-09T12:00:00.000Z',
      }),
      expect.objectContaining({ text: "your sister's move to Denver" }),
    ]);
    expect(view.thinkingAbout?.[1]?.at).toBeUndefined();
  });

  it('empty stores give empty sections, not errors', () => {
    expect(buildKnownView(empty, NOW, true)).toEqual({
      people: [],
      lifeNow: [],
      dates: [],
      preferences: [],
      readsYou: [],
      thinkingAbout: [],
    });
  });
});

describe('what the caller asked Ferni to forget', () => {
  it('is left out of every section, with the matcher recall uses', () => {
    const view = buildKnownView(
      {
        facts: [
          { id: 'f1', subject: 'Biscuit', detail: 'breed: golden retriever' },
          { id: 'f2', subject: 'you', detail: 'employer: Acme' },
        ],
        world: [
          world({}),
          world({
            id: 'w2',
            subject: 'self',
            subjectKind: 'self',
            attribute: 'job',
            value: 'Acme',
          }),
          world({ id: 'w3', attribute: 'event', value: 'knee surgery', eventDate: '2026-10-12' }),
        ],
        mind: {
          ...mind,
          sensitivities: [{ topic: 'knee surgery', how: 'go gently', at: 'x' }],
        },
        pondering: {
          followUps: [{ text: 'How is Mindy’s knee surgery recovery going?', basis: 'sum-1' }],
          thinkingOf: [{ text: 'your new job at Acme', basis: 'sum-3' }],
          dismissed: ['sum-3'],
        },
        summaryDays: new Map(),
        forgotten: ['knee surgery', 'jokes anxious'],
      },
      NOW,
      true
    );
    const ids = Object.values(view).flatMap((items) => items.map((i: { id: string }) => i.id));
    expect(ids).toEqual(['f1', 'f2', 'w2']);
  });

  it("drops a kept item's quote when the quote names a forgotten topic", () => {
    const view = buildKnownView(
      {
        ...empty,
        // Kept by subject/attribute/value, but the quote names the forgotten topic.
        world: [
          world({
            id: 'w4',
            value: 'back at work',
            source: { kind: 'summary', sessionId: 's1', quote: 'after the knee surgery' },
          }),
        ],
        mind: {
          ...mind,
          patterns: [
            {
              ...mind.patterns[0],
              moments: [
                ...mind.patterns[0].moments,
                { sessionId: 's3', at: '2026-10-09T00:00:00.000Z', cue: 'joked about the layoff' },
              ],
            },
          ],
          sensitivities: [],
        },
        forgotten: ['knee surgery', 'layoff'],
      },
      NOW,
      false
    );
    const items = Object.values(view).flatMap(
      (list) => list as Array<{ id: string; quote?: string }>
    );
    const w4 = items.find((i) => i.id === 'w4');
    const pattern = items.find((i) => i.id === 'jokes-when-anxious');
    expect(w4).toBeDefined();
    expect(w4?.quote).toBeUndefined();
    expect(pattern).toBeDefined();
    expect(pattern?.quote).toBeUndefined();
    expect(JSON.stringify(view)).not.toMatch(/knee surgery|layoff/i);
  });

  it('matches recall: a forgotten fact is in neither, a kept one in both', async () => {
    const docs = [
      { entityName: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 0.9 },
      { entityName: 'user', key: 'employer', value: 'Acme', confidence: 0.9 },
    ];
    for (const topics of [
      ['biscuit'],
      ['employer acme'],
      ['retriever golden'],
      ['nothing like it'],
    ]) {
      const recalled = await loadRecallSnapshot(
        { facts: async () => docs, summaries: async () => [], forgotten: async () => topics },
        'u-1'
      );
      const view = buildKnownView(
        {
          ...empty,
          facts: docs.map((d, i) => ({
            id: `f${i}`,
            subject: d.entityName === 'user' ? 'you' : d.entityName,
            detail: `${d.key}: ${d.value}`,
          })),
          forgotten: topics,
        },
        NOW,
        false
      );
      const shown = [...view.people, ...view.lifeNow].map((i) => i.text.split(': ')[1]);
      expect(shown.sort(), topics[0]).toEqual(recalled.facts.map((f) => f.value).sort());
    }
  });
});

describe('loadKnownView', () => {
  function store(): KnownStore & Record<string, ReturnType<typeof vi.fn>> {
    return {
      facts: vi.fn(async () => []),
      worldFacts: vi.fn(async () => [world({})]),
      mindModel: vi.fn(async () => {
        throw new Error('unreadable');
      }),
      pondering: vi.fn(async () => pondering),
      summaryDays: vi.fn(async () => new Map()),
      forgotten: vi.fn(async () => []),
    };
  }

  it('reads every source for the caller only; one failing source leaves its section empty', async () => {
    const s = store();
    const env = { MEMORY_VIEW: 'on', MEMORY_VIEW_PONDERING: 'on' };
    const view = await loadKnownView('u-1', s, { now: NOW, env });
    for (const fn of [s.facts, s.forgotten, s.worldFacts, s.mindModel, s.pondering]) {
      expect(fn).toHaveBeenCalledWith('u-1');
    }
    expect(s.summaryDays).toHaveBeenCalledWith('u-1', ['sum-1', 'sum-2']);
    expect(view.people).toHaveLength(1);
    expect(view.readsYou).toEqual([]);
    expect(view.thinkingAbout).toHaveLength(2);
  });

  it('returns no items, and reads nothing else, when the forgotten topics are unreadable', async () => {
    const failures: Array<() => Promise<string[] | null>> = [
      async () => {
        throw new Error('firestore down');
      },
      async () => null, // the forget store's "unreadable or malformed" (#1094)
      async () => [42] as unknown as string[],
    ];
    for (const failure of failures) {
      const s = store();
      vi.mocked(s.forgotten).mockImplementationOnce(failure);
      const result = loadKnownView('u-1', s, {
        now: NOW,
        env: { MEMORY_VIEW: 'on', MEMORY_VIEW_PONDERING: 'on' },
      });
      await expect(result).rejects.toBeInstanceOf(ForgottenTopicsUnreadable);
      for (const fn of [s.facts, s.worldFacts, s.mindModel, s.pondering]) {
        expect(fn).not.toHaveBeenCalled();
      }
    }
  });

  // MEMORY_VIEW_PONDERING: default on since 2026-10-31; `off` is the kill switch
  it.each([undefined, 'on'])('reads pondering when its flag is %s (unset is on)', async (value) => {
    const s = store();
    const env = { MEMORY_VIEW: 'on', MEMORY_VIEW_PONDERING: value };
    const view = await loadKnownView('u-1', s, { now: NOW, env });
    expect(s.pondering).toHaveBeenCalledWith('u-1');
    expect(view.thinkingAbout).toHaveLength(2);
  });

  it.each(['off', 'false', '0', 'OFF'])(
    'never reads pondering when its flag is %s',
    async (value) => {
      const s = store();
      const env = { MEMORY_VIEW: 'on', MEMORY_VIEW_PONDERING: value };
      const view = await loadKnownView('u-1', s, { now: NOW, env });
      expect(s.pondering).not.toHaveBeenCalled();
      expect(s.summaryDays).not.toHaveBeenCalled();
      expect(view.thinkingAbout).toBeUndefined();
    }
  );

  it('needs the memory view itself: pondering alone turns nothing on', () => {
    expect(isMemoryViewPonderingOn({})).toBe(false);
    expect(isMemoryViewPonderingOn({ MEMORY_VIEW_PONDERING: 'on' })).toBe(false);
    expect(isMemoryViewPonderingOn({ MEMORY_VIEW: 'on' })).toBe(true);
  });

  it('a caller the ponder job never pondered gets an empty section, and no extra read', async () => {
    const s = store();
    vi.mocked(s.pondering).mockResolvedValueOnce(null);
    const view = await loadKnownView('u-1', s, { now: NOW, env: { MEMORY_VIEW: 'on' } });
    expect(view.thinkingAbout).toEqual([]);
    expect(s.summaryDays).not.toHaveBeenCalled();
    expect(view.people).toHaveLength(1); // the rest of the view is unchanged
  });

  it('an unreadable pondering doc leaves only that section empty', async () => {
    const s = store();
    vi.mocked(s.pondering).mockRejectedValueOnce(new Error('firestore down'));
    const view = await loadKnownView('u-1', s, { now: NOW, env: { MEMORY_VIEW: 'on' } });
    expect(view.thinkingAbout).toEqual([]);
    expect(view.people).toHaveLength(1);
  });
});
