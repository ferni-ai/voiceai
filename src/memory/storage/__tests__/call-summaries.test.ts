import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { readCallSummaries, withLegacyNames } from '../call-summaries.js';

interface Query {
  collection: string;
  select?: string[];
  orderBy?: [string, string];
  limit?: number;
}

/** A Firestore stand-in: per-collection docs, and a log of every query run. */
function fakeDb(byCollection: Record<string, Array<Record<string, unknown>>>) {
  const queries: Query[] = [];
  const db = {
    collection: () => ({
      doc: () => ({
        collection: (name: string) => {
          const q: Query = { collection: name };
          const chain = {
            select: (...f: string[]) => ((q.select = f), chain),
            orderBy: (field: string, dir: string) => ((q.orderBy = [field, dir]), chain),
            limit: (n: number) => ((q.limit = n), chain),
            get: async () => {
              queries.push(q);
              const docs = (byCollection[name] ?? []).map((d, i) => ({
                id: `${name}-${i}`,
                data: () => d,
              }));
              return { docs, empty: docs.length === 0 };
            },
          };
          return chain;
        },
      }),
    }),
  };
  return { db: db as unknown as Firestore, queries };
}

const live = {
  timestamp: { seconds: 1 },
  mainTopics: ['martial arts'],
  keyPoints: ['Seth trains martial arts', 'Mom has knee surgery Tuesday'],
  emotionalArc: 'calm then warm',
  questionsRemaining: ['how did the belt test go'],
  followUpItems: ['ask about the belt test'],
};

describe('readCallSummaries', () => {
  it('reads conversation_summaries exactly as before when LIVE_SUMMARIES is off', async () => {
    const { db, queries } = fakeDb({
      conversation_summaries: [{ topics: ['old'] }],
      summaries: [live],
    });
    const read = await readCallSummaries(db, 'u1', { limit: 10 }, {});
    expect(read.docs.map((d) => d.data())).toEqual([{ topics: ['old'] }]);
    expect(queries).toEqual([
      { collection: 'conversation_summaries', orderBy: ['timestamp', 'desc'], limit: 10 },
    ]);
  });

  it('reads the live summaries with only the needed fields when on, under the old names', async () => {
    const { db, queries } = fakeDb({ summaries: [live] });
    const read = await readCallSummaries(db, 'u1', { limit: 10 }, { LIVE_SUMMARIES: 'on' });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({
      collection: 'summaries',
      orderBy: ['timestamp', 'desc'],
      limit: 10,
    });
    expect(queries[0]?.select).not.toContain('embedding');
    expect(read.docs[0]?.data()).toMatchObject({
      topics: ['martial arts'],
      keyMoments: ['Seth trains martial arts', 'Mom has knee surgery Tuesday'],
      unresolvedThreads: ['how did the belt test go'],
      emotionalArc: 'calm then warm',
      timestamp: { seconds: 1 },
    });
  });

  it('falls back to conversation_summaries for a user with no live summaries', async () => {
    const { db, queries } = fakeDb({ conversation_summaries: [{ topics: ['old'] }] });
    const read = await readCallSummaries(
      db,
      'u1',
      { limit: 5, direction: 'asc' },
      { LIVE_SUMMARIES: 'on' }
    );
    expect(queries.map((q) => q.collection)).toEqual(['summaries', 'conversation_summaries']);
    expect(queries[1]?.orderBy).toEqual(['timestamp', 'asc']);
    expect(read.docs.map((d) => d.data())).toEqual([{ topics: ['old'] }]);
  });
});

describe('withLegacyNames', () => {
  it('gives the indexer a summary text and the old field names, keeping the originals', () => {
    const out = withLegacyNames(live);
    expect(out.summary).toBe('Seth trains martial arts Mom has knee surgery Tuesday');
    expect(out.mainTopics).toEqual(['martial arts']);
  });

  it('turns the stored ISO timestamp into the Timestamp the readers call .toDate() on', () => {
    const out = withLegacyNames({ timestamp: '2026-10-10T18:20:05.103Z' });
    const ts = out.timestamp as { toDate?: () => Date };
    expect(typeof ts.toDate).toBe('function');
    expect(ts.toDate?.().toISOString()).toBe('2026-10-10T18:20:05.103Z');
    expect(withLegacyNames({ timestamp: 'not a date' }).timestamp).toBe('not a date');
  });

  it('fills safe defaults for a sparse summary', () => {
    expect(withLegacyNames({ keyPoints: 'not a list', emotionalArc: '' })).toMatchObject({
      topics: [],
      keyMoments: [],
      unresolvedThreads: [],
      emotionalArc: 'neutral',
      summary: '',
    });
  });
});
