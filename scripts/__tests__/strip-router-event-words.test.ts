import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  main,
  stripRouterEventWords,
  type EventsDb,
  type EventsQuery,
} from '../migrations/strip-router-event-words.js';

const DELETE = Symbol('delete');
const SENTINEL = 'tell my boss Priya I have a migraine again';

type Data = Record<string, unknown>;

/** semantic_router_events/{day}/events/{id} as day → id → fields, with the surface the job uses */
function fakeDb(days: Record<string, Record<string, Data>>) {
  const commits: number[] = [];
  const events = (day: string) => {
    const query = (after?: string, limit = Infinity): EventsQuery => ({
      orderBy: () => query(after, limit),
      select: () => query(after, limit),
      limit: (n) => query(after, n),
      startAfter: (d) => query((d.ref as { id: string }).id, limit),
      get: async () => ({
        docs: Object.keys(days[day] ?? {})
          .sort()
          .filter((id) => after === undefined || id > after)
          .slice(0, limit)
          .map((id) => ({ ref: { day, id }, get: (f: string) => days[day]?.[id]?.[f] })),
      }),
    });
    return query();
  };
  const db: EventsDb = {
    collection: () => ({
      listDocuments: async () =>
        Object.keys(days).map((id) => ({ id, collection: () => events(id) })),
    }),
    batch: () => {
      const updates: Array<[{ day: string; id: string }, Data]> = [];
      return {
        update: (ref, data) => updates.push([ref as { day: string; id: string }, data]),
        commit: async () => {
          commits.push(updates.length);
          for (const [{ day, id }, data] of updates) {
            const doc = days[day]?.[id] ?? {};
            for (const [k, v] of Object.entries(data)) {
              if (v === DELETE) delete doc[k];
              else doc[k] = v;
            }
          }
        },
      };
    },
  };
  return { db, days, commits };
}

const withWords = (n: number): Data => ({
  userId: 'u-test',
  inputText: `${SENTINEL} #${n}`,
  actionType: 'execute',
  toolId: 'send_message',
  confidence: 0.9,
  latencyMs: 8,
});

let logged: string[];
beforeEach(() => {
  process.exitCode = undefined;
  logged = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logged.push(a.join(' ')));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('strip-router-event-words', () => {
  it('dry run counts across days and pages, changes nothing, and prints only counts', async () => {
    const day: Record<string, Data> = {};
    for (let i = 0; i < 401; i++) day[`e${String(i).padStart(4, '0')}`] = withWords(i);
    const { db, days, commits } = fakeDb({
      '2026-03-01': day,
      '2026-10-24': { clean: { userId: 'u-test', inputLength: 9, actionType: 'hint' } },
    });
    const before = JSON.stringify(days);
    await main(['node', 'strip'], db, DELETE);
    expect(JSON.stringify(days)).toBe(before);
    expect(commits).toEqual([]);
    const out = logged.join('\n');
    expect(out).toContain('Scanned 402 events over 2 days; 401 hold words');
    expect(out).toContain('DRY RUN: would strip words from 401 events');
    expect(out).not.toContain('Priya');
    expect(out).not.toMatch(/e0\d{3}|u-test/);
  });

  it('refuses --apply without the matching --confirm-project', async () => {
    const { db, days } = fakeDb({ '2026-03-01': { e1: withWords(1) } });
    await main(['node', 'strip', '--apply'], db, DELETE);
    expect(process.exitCode).toBe(1);
    expect(days['2026-03-01']?.e1?.inputText).toBeDefined();
  });

  it('--apply strips every word field, records the length, and keeps every other field', async () => {
    const { db, days, commits } = fakeDb({
      '2026-03-01': {
        e1: withWords(1),
        e2: { ...withWords(2), normalizedText: SENTINEL, intent: { specific: SENTINEL } },
      },
      '2026-10-24': { e3: { userId: 'u-test', inputLength: 9, actionType: 'hint' } },
    });
    await main(['node', 'strip', '--apply', '--confirm-project=johnb-2025'], db, DELETE);
    expect(JSON.stringify(days)).not.toContain('Priya');
    expect(days['2026-03-01']?.e1).toEqual({
      userId: 'u-test',
      actionType: 'execute',
      toolId: 'send_message',
      confidence: 0.9,
      latencyMs: 8,
      inputLength: `${SENTINEL} #1`.length,
    });
    expect(days['2026-10-24']?.e3).toEqual({
      userId: 'u-test',
      inputLength: 9,
      actionType: 'hint',
    });
    expect(commits).toEqual([2]);
    expect(logged.join('\n')).toContain('Stripped words from 2 events');
  });

  it('a rerun writes nothing, and --from resumes at a day', async () => {
    const { db, commits } = fakeDb({
      '2026-03-01': { e1: withWords(1) },
      '2026-03-02': { e2: withWords(2) },
    });
    const resumed = await stripRouterEventWords(db, {
      apply: true,
      deleteField: DELETE,
      from: '2026-03-02',
    });
    expect(resumed).toEqual({ days: 1, scanned: 1, withWords: 1, written: 1 });
    const all = await stripRouterEventWords(db, { apply: true, deleteField: DELETE });
    expect(all).toEqual({ days: 2, scanned: 2, withWords: 1, written: 1 });
    expect(await stripRouterEventWords(db, { apply: true, deleteField: DELETE })).toMatchObject({
      withWords: 0,
      written: 0,
    });
    expect(commits).toEqual([1, 1]);
  });

  it('refuses a --from that is not a day', async () => {
    const { db } = fakeDb({});
    await main(['node', 'strip', '--from=yesterday'], db, DELETE);
    expect(process.exitCode).toBe(1);
  });
});
