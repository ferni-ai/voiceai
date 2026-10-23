/**
 * PRIVACY: event planning keeps each caller's events, purchases, vacations
 * and annual plans to themselves.
 *
 * The worker process is long-lived and serves calls one after another, so
 * anything held at module level outlives the call. These tests run two
 * callers in one process and check that neither can read the other's plans
 * and that saving one caller never writes the other's items.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// One fake Firestore doc per user, so the tests can read exactly what each save wrote.
const docs = vi.hoisted(() => new Map<string, unknown>());
// Users whose next read errors, the way the real store does: strict throws, non-strict answers null.
const failNextRead = vi.hoisted(() => new Set<string>());

// Like the real store, a load answers from this worker's cache unless asked for a fresh read.
const cache = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../../../services/persistence/index.js', () => {
  return {
    createPersistenceStore: () => ({
      load: vi.fn(async (userId: string, options?: { strict?: boolean; fresh?: boolean }) => {
        if (failNextRead.delete(userId)) {
          if (options?.strict) throw new Error('firestore unavailable');
          return null;
        }
        if (cache.has(userId) && !options?.fresh) return structuredClone(cache.get(userId));
        const doc = docs.has(userId) ? structuredClone(docs.get(userId)) : null;
        if (doc) cache.set(userId, doc);
        return doc;
      }),
      set: vi.fn((userId: string, data: unknown) => {
        cache.set(userId, structuredClone(data));
        docs.set(userId, structuredClone(data));
      }),
      flush: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

import type { UserEventPlanningData } from '../types.js';

type Execute = (args: Record<string, unknown>, opts: unknown) => Promise<string>;

let tools: Record<string, { execute: Execute }>;

/** LiveKit's tool options: the caller is the call's own userData.userId. */
function as(userId: string | undefined) {
  return {
    ctx: { userData: userId === undefined ? {} : { userId } },
    toolCallId: 'test',
    abortSignal: new AbortController().signal,
  };
}

function run(tool: string, args: Record<string, unknown>, userId: string | undefined) {
  return tools[tool].execute(args, as(userId));
}

function savedDoc(userId: string): UserEventPlanningData | undefined {
  return docs.get(userId) as UserEventPlanningData | undefined;
}

function storedEvent(id: string, name: string) {
  return {
    id,
    name,
    type: 'birthday',
    date: '2030-12-15T00:00:00.000Z',
    guestCount: 1,
    budget: 1,
    spent: 0,
    status: 'planning',
    checklist: [],
    guests: [],
    vendors: [],
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const A = 'user-alice';
const B = 'user-bob';
const A_EVENT = 'Alice Secret Surprise Party';
const PARTY = { type: 'other', date: 'May 1, 2030', guestCount: 5, budget: 100 };

// A fresh module per test: nothing a previous test cached survives, as in a new worker.
beforeEach(async () => {
  docs.clear();
  cache.clear();
  failNextRead.clear();
  vi.resetModules();
  const mod = await import('../../domains/life-planning/event-planning.js');
  tools = mod.createEventPlanningTools() as unknown as Record<string, { execute: Execute }>;
});

describe('event planning keeps each caller to their own plans', () => {
  it("saving B's event writes none of A's items into B's doc", async () => {
    await run(
      'createEvent',
      { name: A_EVENT, type: 'birthday', date: 'December 15, 2030', guestCount: 20, budget: 1000 },
      A
    );
    await run('planMajorPurchase', { type: 'car', name: 'Alice car', budget: 30000 }, A);
    await run(
      'planVacation',
      { name: 'Alice trip', destination: 'Lisbon', travelers: 2, budget: 5000 },
      A
    );

    await run(
      'createEvent',
      { name: 'Bob BBQ', type: 'other', date: 'July 4, 2030', guestCount: 10, budget: 300 },
      B
    );

    const bDoc = savedDoc(B);
    expect(bDoc?.events.map((e) => e.name)).toEqual(['Bob BBQ']);
    expect(bDoc?.majorPurchases).toEqual([]);
    expect(bDoc?.vacations).toEqual([]);
    // And A's doc still holds only A's items.
    expect(savedDoc(A)?.events.map((e) => e.name)).toEqual([A_EVENT]);
  });

  it("B's reads never return A's event", async () => {
    await run(
      'createEvent',
      { name: A_EVENT, type: 'birthday', date: 'December 15, 2030', guestCount: 20, budget: 1000 },
      A
    );
    await run('addGuests', { guests: [{ name: 'Carol Private', plusOne: false }] }, A);

    for (const tool of ['getEventSummary', 'getChecklist', 'getGuestList']) {
      const reply = await run(tool, {}, B);
      expect(reply).not.toContain(A_EVENT);
      expect(reply).not.toContain('Carol Private');
    }
    // The same reads still work for A.
    expect(await run('getEventSummary', {}, A)).toContain(A_EVENT);
    expect(await run('getGuestList', {}, A)).toContain('Carol Private');
  });

  it("B's writes never land on A's event", async () => {
    await run(
      'createEvent',
      { name: A_EVENT, type: 'birthday', date: 'December 15, 2030', guestCount: 20, budget: 1000 },
      A
    );

    expect(
      await run('addGuests', { guests: [{ name: 'Mallory', plusOne: false }] }, B)
    ).not.toContain(A_EVENT);
    expect(
      await run('trackExpense', { description: 'cake', amount: 50, category: 'catering' }, B)
    ).not.toContain('Expense Tracked');

    const aEvent = savedDoc(A)?.events[0];
    expect(aEvent?.guests).toEqual([]);
    expect(aEvent?.spent).toBe(0);
    expect(savedDoc(B)).toBeUndefined();
  });

  it('two callers with a plan for the same year each keep their own', async () => {
    await run(
      'createAnnualPlan',
      { year: 2031, goals: [{ description: 'Alice run a marathon', category: 'health' }] },
      A
    );
    await run(
      'createAnnualPlan',
      { year: 2031, goals: [{ description: 'Bob learn piano', category: 'learning' }] },
      B
    );

    const aStatus = await run('getAnnualPlanStatus', { year: 2031 }, A);
    expect(aStatus).toContain('Alice run a marathon');
    expect(aStatus).not.toContain('Bob learn piano');
    expect(savedDoc(A)?.annualPlans.flatMap((p) => p.goals.map((g) => g.description))).toEqual([
      'Alice run a marathon',
    ]);
    expect(savedDoc(B)?.annualPlans.flatMap((p) => p.goals.map((g) => g.description))).toEqual([
      'Bob learn piano',
    ]);
  });

  it("an unidentified caller shares no one's plans and saves nothing to a shared 'default' doc", async () => {
    await run(
      'createEvent',
      { name: A_EVENT, type: 'birthday', date: 'December 15, 2030', guestCount: 20, budget: 1000 },
      A
    );

    expect(await run('getEventSummary', {}, undefined)).not.toContain(A_EVENT);
    await run(
      'createEvent',
      { name: 'Nobody party', type: 'other', date: 'May 1, 2030', guestCount: 5, budget: 100 },
      undefined
    );
    expect(await run('getEventSummary', {}, undefined)).not.toContain('Nobody party');
    expect(await run('getEventSummary', {}, 'anonymous')).not.toContain('Nobody party');

    expect(docs.has('default')).toBe(false);
    expect(docs.has('anonymous')).toBe(false);
    expect(savedDoc(A)?.events.map((e) => e.name)).toEqual([A_EVENT]);
  });

  it('ignores a userId that arrives as context.userId (the model could choose it)', async () => {
    await tools.createEvent.execute({ name: 'Chosen by args', ...PARTY }, { userId: A });
    await tools.createEvent.execute(
      { name: 'Chosen by args', ...PARTY, userId: A },
      {
        userId: A,
      }
    );
    expect(docs.size).toBe(0);
  });

  it.each(['anon:x', 'onbehalf:x', 'Default', ' anonymous', 'default', 'anonymous', ''])(
    'saves nothing for a caller who is not a member (%j)',
    async (id) => {
      await run('createEvent', { name: 'Third party plan', ...PARTY }, id);
      expect(docs.size).toBe(0);
      expect(await run('getEventSummary', {}, id)).not.toContain('Third party plan');
    }
  );

  it("trims a member's id before keying their doc", async () => {
    await run('createEvent', { name: 'Padded id party', ...PARTY }, ` ${A} `);
    expect([...docs.keys()]).toEqual([A]);
  });
});

describe('a failed or stale read never overwrites saved plans', () => {
  it("a failed read leaves the member's saved events in place", async () => {
    docs.set(A, {
      events: [storedEvent('event_1', A_EVENT)],
      majorPurchases: [],
      vacations: [],
      annualPlans: [],
    });

    failNextRead.add(A);
    await run('createEvent', { name: 'During the outage', ...PARTY }, A);
    expect(savedDoc(A)?.events.map((e) => e.name)).toEqual([A_EVENT]);

    // The next call reads again and still finds the saved event.
    expect(await run('getEventSummary', { eventId: 'event_1' }, A)).toContain(A_EVENT);
  });

  it("reads fresh each call, so another worker's newer save is kept", async () => {
    await run('createEvent', { name: 'First party', ...PARTY }, A);
    // Another worker adds an event to A's doc.
    const doc = savedDoc(A)!;
    docs.set(A, {
      ...doc,
      events: [...doc.events, storedEvent('event_other', 'Other worker party')],
    });

    await run('planMajorPurchase', { type: 'car', name: 'Alice car', budget: 30000 }, A);
    expect(savedDoc(A)?.events.map((e) => e.name)).toContain('Other worker party');
  });
});

describe('the module exports no per-user storage internals', () => {
  it('index does not re-export the raw storage helpers', async () => {
    const index = await import('../index.js');
    for (const name of [
      'storesFor',
      'loadedUsers',
      'ensureUserLoaded',
      'persistEventPlanningData',
      'events',
    ]) {
      expect(index).not.toHaveProperty(name);
    }
  });
});
