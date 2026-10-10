/**
 * Last-call time from two collections that each miss some calls.
 */

import { describe, expect, it } from 'vitest';
import { lastCallEndedAt, toDate } from '../last-call.js';
import { loadTemporalWorld } from '../load.js';
import { createMemoryWorldFactStore } from './memory-store.js';
import { recordWorldObservations } from '../ingest.js';

/** A Firestore Timestamp as summaries stores it. */
const ts = (iso: string) => ({ toDate: () => new Date(iso) });

/** bogle_users/{uid}/{collection} ordered by `field` desc, limit 1. */
function fakeDb(rows: Record<string, Array<Record<string, unknown>> | Error>) {
  const queried: string[] = [];
  const db = {
    collection: () => ({
      doc: () => ({
        collection: (name: string) => ({
          orderBy: (field: string, dir: string) => ({
            limit: (n: number) => ({
              get: async () => {
                queried.push(`${name}.${field} ${dir} ${n}`);
                const docs = rows[name] ?? [];
                if (docs instanceof Error) throw docs;
                return {
                  empty: docs.length === 0,
                  docs: docs.slice(0, n).map((d) => ({ data: () => d })),
                };
              },
            }),
          }),
        }),
      }),
    }),
  };
  return { db: () => db as never, queried };
}

describe('lastCallEndedAt', () => {
  it('only voice_sessions has the latest call (10-04): it wins', async () => {
    const { db, queried } = fakeDb({
      voice_sessions: [{ endedAt: '2026-10-04T21:45:00.000Z' }],
      summaries: [{ timestamp: ts('2026-06-08T15:00:00.000Z') }],
    });
    expect((await lastCallEndedAt('u', db))?.toISOString()).toBe('2026-10-04T21:45:00.000Z');
    expect(queried.sort()).toEqual(['summaries.timestamp desc 1', 'voice_sessions.endedAt desc 1']);
  });

  it('only summaries has the latest call: it wins', async () => {
    const { db } = fakeDb({
      voice_sessions: [{ endedAt: '2026-02-24T10:00:00.000Z' }],
      summaries: [{ timestamp: ts('2026-06-08T15:00:00.000Z') }],
    });
    expect((await lastCallEndedAt('u', db))?.toISOString()).toBe('2026-06-08T15:00:00.000Z');
  });

  it('one collection failing or empty still gives the other; neither gives unknown', async () => {
    const failing = fakeDb({
      voice_sessions: new Error('index'),
      summaries: [{ timestamp: ts('2026-10-10T18:20:00.000Z') }],
    });
    expect((await lastCallEndedAt('u', failing.db))?.toISOString()).toBe(
      '2026-10-10T18:20:00.000Z'
    );
    expect(await lastCallEndedAt('u', fakeDb({}).db)).toBeNull();
    expect(await lastCallEndedAt('u', () => null)).toBeNull();
  });

  it('reads Timestamps, Dates, ISO strings and epoch ms; junk is null', () => {
    const iso = '2026-10-10T18:20:00.000Z';
    for (const v of [ts(iso), new Date(iso), iso, Date.parse(iso)]) {
      expect(toDate(v)?.toISOString()).toBe(iso);
    }
    for (const v of [undefined, null, 'soon', {}, Number.NaN]) expect(toDate(v)).toBeNull();
  });
});

describe('loadTemporalWorld with the real last-call reader', () => {
  async function storeWithSurgery() {
    const store = createMemoryWorldFactStore();
    await recordWorldObservations(
      'u',
      's1',
      [
        {
          subject: 'Mindy',
          subjectKind: 'person',
          relation: 'sister',
          attribute: 'event',
          value: 'knee surgery',
          eventDate: '2026-10-13',
          observedAt: '2026-10-10T18:00:00.000Z',
          confidence: 0.9,
          source: { kind: 'summary', sessionId: 's1' },
        },
      ],
      { store, env: { WORLD_MODEL_TEMPORAL: 'on' }, judge: async () => [] }
    );
    return store;
  }
  const load = async (rows: Parameters<typeof fakeDb>[0]) =>
    loadTemporalWorld('u', {
      store: await storeWithSurgery(),
      env: { WORLD_MODEL_TEMPORAL: 'on' },
      now: new Date('2026-10-14T14:00:00.000Z'),
      timeZone: 'America/New_York',
      lastCallEndedAt: (userId) => lastCallEndedAt(userId, fakeDb(rows).db),
    });

  it('the call only summaries recorded counts as the last call', async () => {
    // voice_sessions alone says the last call was 10-10: the surgery would be "due".
    const sessionsOnly = await load({ voice_sessions: [{ endedAt: '2026-10-10T18:20:00.000Z' }] });
    expect(sessionsOnly?.sinceLastCall.map((i) => i.kind)).toEqual(['due']);
    // summaries has a call this morning, after the surgery: it was already due then.
    const both = await load({
      voice_sessions: [{ endedAt: '2026-10-10T18:20:00.000Z' }],
      summaries: [{ timestamp: ts('2026-10-14T13:00:00.000Z') }],
    });
    expect(both?.sinceLastCall).toEqual([]);
  });

  it('last call unknown: nothing "since", current facts still shown', async () => {
    const world = await load({});
    expect(world?.sinceLastCall).toEqual([]);
    expect(world?.lines).toEqual(['Mindy (sister), knee surgery (was yesterday)']);
  });
});
