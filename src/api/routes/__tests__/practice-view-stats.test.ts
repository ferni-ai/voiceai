/**
 * GET /api/practice-view must report only what it can compute from the user's records:
 * no canned "Maya notices" pattern, and stats from real task/habit data (or omitted).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown> & { id: string };
const store = vi.hoisted(() => ({ collections: new Map<string, Doc[]>() }));

vi.mock('@google-cloud/firestore', () => {
  type Filter = { field: string; op: string; value: unknown };
  const matches = (actual: unknown, { op, value }: Filter): boolean => {
    if (op === '==') return actual === value;
    if (op === '>=') {
      // Firestore range queries only match values of the same type
      if (actual instanceof Date && value instanceof Date) return actual >= value;
      if (typeof actual === 'string' && typeof value === 'string') return actual >= value;
    }
    return false;
  };
  class FakeQuery {
    constructor(
      readonly path: string,
      private readonly filters: Filter[] = [],
      private readonly max = Infinity
    ) {}
    where(field: string, op: string, value: unknown) {
      return new FakeQuery(this.path, [...this.filters, { field, op, value }], this.max);
    }
    orderBy() {
      return this;
    }
    select() {
      return this;
    }
    limit(n: number) {
      return new FakeQuery(this.path, this.filters, n);
    }
    doc(id: string) {
      return {
        collection: (name: string) => new FakeQuery(`${this.path}/${id}/${name}`),
        get: async () => ({ exists: false, data: () => undefined }),
      };
    }
    async get() {
      const rows = (store.collections.get(this.path) ?? [])
        .filter((row) => this.filters.every((f) => matches(row[f.field], f)))
        .slice(0, this.max);
      const docs = rows.map((row) => ({ id: row.id, exists: true, data: () => ({ ...row }) }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    }
  }
  class Firestore {
    collection(name: string) {
      return new FakeQuery(name);
    }
  }
  return { Firestore, FieldValue: {} };
});

vi.mock('../../../services/calendar/index.js', () => ({ getEvents: vi.fn(async () => []) }));
vi.mock('../../../services/superhuman/semantic-intelligence/index.js', () => ({
  buildSemanticIntelligenceContext: vi.fn(async () => ({ activeCorrelations: [] })),
}));
vi.mock('../../../services/superhuman/index.js', () => ({
  buildSuperhumanContext: vi.fn(async () => ({})),
}));
vi.mock('../../../services/superhuman/predictive-coaching.js', () => ({
  generatePredictions: vi.fn(async () => []),
}));

const { handleGetPracticeView, handleGetPatterns } = await import('../practice-view.js');
const { computePracticeStats } = await import('../practice-view-stats.js');
const { getEvents } = await import('../../../services/calendar/index.js');

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 7, 10);
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const dayStr = (days: number) => ago(days).toISOString().split('T')[0];

function call(handler: typeof handleGetPracticeView, path: string) {
  let raw = '';
  const res = {
    writeHead: vi.fn(),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => {
      raw = data ?? '';
    }),
  } as unknown as ServerResponse;
  const req = {
    headers: { 'x-firebase-uid': 'user-1' },
    method: 'GET',
  } as unknown as IncomingMessage;
  return handler(req, res, new URL(`http://localhost${path}`)).then(
    () => JSON.parse(raw) as Record<string, any>
  );
}
const getView = () => call(handleGetPracticeView, '/api/practice-view');

beforeEach(() => {
  store.collections.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('Maya notice', () => {
  it('is null when nothing in the data matches, never a random canned pattern', async () => {
    for (let i = 0; i < 3; i++) {
      const body = await getView();
      expect(body.mayaNotices).toBeNull();
    }
    const patterns = await call(handleGetPatterns as never, '/api/practice-view/patterns');
    expect(patterns.patterns).toEqual([]);
  });

  it('still reports a real busy week from the calendar', async () => {
    const meetings = Array.from({ length: 16 }, (_, i) => ({
      id: `e${i}`,
      title: `Meeting ${i}`,
      startTime: new Date(2026, 9, 5 + (i % 5), 9 + (i % 8)),
      endTime: new Date(2026, 9, 5 + (i % 5), 10 + (i % 8)),
    }));
    vi.mocked(getEvents).mockResolvedValueOnce(meetings as never);
    const body = await getView();
    expect(body.mayaNotices?.message).toMatch(/lot of meetings/i);
  });
});

describe('stats', () => {
  it('computes follow-through and habit check-ins from the last 7 days of records', async () => {
    store.collections.set('bogle_users/user-1/tasks', [
      { id: 't1', completed: true, completedAt: ago(2).toISOString() }, // ISO string
      { id: 't2', completed: true, completedAt: ago(3) }, // Date / Timestamp
      { id: 't3', completed: true, completedAt: ago(20).toISOString() }, // too old
      { id: 't4', completed: false, title: 'Open one' },
      { id: 't5', completed: false, title: 'Open two' },
    ]);
    store.collections.set('bogle_users/user-1/habits', [
      { id: 'h1', name: 'Walk', streak: 4, completedDates: [dayStr(0), dayStr(1), dayStr(10)] },
      { id: 'h2', name: 'Read', streak: 1, completedDates: [dayStr(0)] },
    ]);
    const { stats } = await getView();
    // 2 done in the last week, 2 still open: 50%. Not 0% from counting only open tasks.
    expect(stats.followThroughPercent).toBe(50);
    // 3 check-ins in the last 7 days (not "habits done today" = 2), 1 the week before
    expect(stats.habitsCompletedThisWeek).toBe(3);
    expect(stats.momentumTrend).toBe('rising');
    expect(stats.streak).toBe(4);
  });

  it('omits stats it cannot compute instead of showing 0% or "declining"', async () => {
    const { stats } = await getView();
    expect(stats.followThroughPercent).toBeUndefined();
    expect(stats.habitsCompletedThisWeek).toBeUndefined();
    expect(stats.momentumTrend).toBeUndefined();
  });
});

describe('computePracticeStats', () => {
  const habit = (completedDates: string[], streak = 0) => ({ streak, completedDates });

  it('calls a drop in check-ins declining and a flat week steady', () => {
    const prior = [dayStr(8), dayStr(9), dayStr(10)];
    expect(
      computePracticeStats(
        { habits: [habit([dayStr(1), ...prior])], tasksCompletedThisWeek: 0, tasksOpen: 0 },
        NOW
      ).momentumTrend
    ).toBe('declining');
    expect(
      computePracticeStats(
        {
          habits: [habit([dayStr(1), dayStr(2), dayStr(8), dayStr(9)])],
          tasksCompletedThisWeek: 0,
          tasksOpen: 0,
        },
        NOW
      ).momentumTrend
    ).toBe('steady');
  });

  it('calls first activity "building" and no activity in either week nothing', () => {
    const base = { tasksCompletedThisWeek: 0, tasksOpen: 0 };
    expect(computePracticeStats({ ...base, habits: [habit([dayStr(0)])] }, NOW).momentumTrend).toBe(
      'building'
    );
    const idle = computePracticeStats({ ...base, habits: [habit([dayStr(30)], 2)] }, NOW);
    expect(idle.momentumTrend).toBeUndefined();
    expect(idle.habitsCompletedThisWeek).toBe(0);
  });

  it('counts a habit day once even if recorded twice', () => {
    const stats = computePracticeStats(
      { habits: [habit([dayStr(1), dayStr(1)])], tasksCompletedThisWeek: 0, tasksOpen: 0 },
      NOW
    );
    expect(stats.habitsCompletedThisWeek).toBe(1);
  });
});
