/**
 * Supersession rules and what the after-call sink refuses to store.
 */

import { FieldValue } from '@google-cloud/firestore';
import { describe, expect, it, vi } from 'vitest';
import { recordWorldObservations } from '../ingest.js';
import { planResolution, type SupersedeJudge } from '../resolve.js';
import { createFirestoreWorldFactStore } from '../store.js';
import { createMemoryWorldFactStore } from './memory-store.js';
import type { TemporalFact, WorldObservation } from '../types.js';

const ON = { WORLD_MODEL_TEMPORAL: 'on' };

function o(
  value: string,
  attribute = 'status',
  at = '2026-10-10T18:00:00.000Z',
  extra: Partial<WorldObservation> = {}
): WorldObservation {
  return {
    subject: 'Mindy',
    subjectKind: 'person',
    attribute,
    value,
    observedAt: at,
    confidence: 0.8,
    source: { kind: 'turn', sessionId: 's1' },
    ...extra,
  };
}

function seq() {
  let n = 0;
  return () => `id${++n}`;
}

describe('planResolution', () => {
  it('hearing the same thing again refreshes it instead of adding a copy', async () => {
    const first = await planResolution([], [o('in hospital')], { newId: seq() });
    const open = first.create;
    const again = await planResolution(open, [
      o('In  Hospital', 'status', '2026-10-11T18:00:00.000Z', { confidence: 0.95 }),
    ]);
    expect(again.create).toEqual([]);
    expect(again.close).toEqual([]);
    expect(again.refresh).toEqual([
      { id: 'id1', observedAt: '2026-10-11T18:00:00.000Z', confidence: 0.95 },
    ]);
  });

  it('two values for one slot in the same call: the later one is current', async () => {
    const plan = await planResolution(
      [],
      [
        o('recovering', 'status', '2026-10-10T18:05:00.000Z'),
        o('in surgery', 'status', '2026-10-10T18:01:00.000Z'),
      ],
      { newId: seq() }
    );
    expect(plan.create.map((f) => [f.value, f.validTo])).toEqual([
      ['in surgery', '2026-10-10T18:05:00.000Z'],
      ['recovering', null],
    ]);
  });

  it('the judge is asked only when the subject has open many-value facts', async () => {
    const judge = vi.fn<SupersedeJudge>(async () => []);
    await planResolution([], [o('recovering')], { judge, newId: seq() });
    expect(judge).not.toHaveBeenCalled();

    const event: TemporalFact = {
      ...o('knee surgery', 'event'),
      id: 'e1',
      subjectKey: 'person:mindy',
      validFrom: '2026-10-10T18:00:00.000Z',
      validTo: null,
    };
    const other: TemporalFact = { ...event, id: 'x1', subject: 'Dana', subjectKey: 'person:dana' };
    await planResolution([event, other], [o('recovering', 'status', '2026-10-14T14:00:00.000Z')], {
      judge,
      newId: seq(),
    });
    expect(judge).toHaveBeenCalledTimes(1);
    expect(judge.mock.calls[0][1].map((f) => f.id)).toEqual(['e1']);
  });

  it('a failing judge, or one naming facts it was not shown, closes nothing', async () => {
    const event: TemporalFact = {
      ...o('knee surgery', 'event'),
      id: 'e1',
      subjectKey: 'person:mindy',
      validFrom: '2026-10-10T18:00:00.000Z',
      validTo: null,
    };
    const throws: SupersedeJudge = async () => {
      throw new Error('vertex down');
    };
    const rogue: SupersedeJudge = async () => ['not-shown'];
    for (const judge of [throws, rogue]) {
      const plan = await planResolution(
        [event],
        [o('recovering', 'status', '2026-10-14T14:00:00.000Z')],
        { judge, newId: seq() }
      );
      expect(plan.close).toEqual([]);
      expect(plan.create).toHaveLength(1);
    }
  });
});

describe('owner (by)', () => {
  const self = { subject: 'self', subjectKind: 'self' as const };
  const promise = (by?: 'caller' | 'ferni', at?: string) =>
    o('call Friday', 'commitment', at, { ...self, ...(by ? { by } : {}) });

  it("Ferni's promise and the caller's same plan are two facts; the owner is stored", async () => {
    const plan = await planResolution([], [promise('ferni'), promise()], { newId: seq() });
    expect(plan.create.map((f) => [f.value, f.by ?? 'caller'])).toEqual([
      ['call Friday', 'ferni'],
      ['call Friday', 'caller'],
    ]);
    expect(plan.refresh).toEqual([]);
  });

  it("a caller's fact never closes Ferni's, by hint or by judge; by:'caller' is the default", async () => {
    const kept: TemporalFact = {
      ...promise('ferni'),
      id: 'p1',
      subjectKey: 'self',
      validFrom: '2026-10-10T18:00:00.000Z',
      validTo: null,
    };
    const judge = vi.fn<SupersedeJudge>(async (_obs, open) => open.map((f) => f.id));
    const plan = await planResolution(
      [kept],
      [
        o('called on Friday', 'commitment', '2026-10-12T18:00:00.000Z', {
          ...self,
          replaces: { attribute: 'commitment' },
        }),
      ],
      { judge, newId: seq() }
    );
    expect(plan.close).toEqual([]);
    expect(judge).not.toHaveBeenCalled();
    // Heard again from Ferni: the same fact, refreshed.
    const again = await planResolution([kept], [promise('ferni', '2026-10-12T18:00:00.000Z')]);
    expect(again.create).toEqual([]);
    expect(again.refresh.map((r) => r.id)).toEqual(['p1']);
  });
});

describe("extraction's replaces hint", () => {
  const open = (id: string, attribute: string, value: string): TemporalFact => ({
    ...o(value, attribute),
    subject: 'self',
    subjectKind: 'self',
    id,
    subjectKey: 'self',
    validFrom: '2026-10-01T18:00:00.000Z',
    validTo: null,
  });
  const quit = (replaces: WorldObservation['replaces']) =>
    o('between jobs', 'thread', '2026-10-14T14:00:00.000Z', {
      subject: 'self',
      subjectKind: 'self',
      replaces,
    });

  it('closes the named attribute without asking the judge', async () => {
    const judge = vi.fn<SupersedeJudge>(async () => []);
    const facts = [
      open('j1', 'commitment', 'job at Acme'),
      open('t1', 'thread', 'training for a 10k'),
    ];
    const plan = await planResolution(facts, [quit({ attribute: 'commitment' })], {
      judge,
      newId: seq(),
    });
    expect(plan.close.map((c) => c.id)).toEqual(['j1']);
    expect(plan.create[0]).toMatchObject({ replaced: 'job at Acme', supersedes: ['j1'] });
    expect(judge.mock.calls[0][1].map((f) => f.id)).toEqual(['t1']);
  });

  it('priorValue narrows it to the matching fact', async () => {
    const facts = [open('a', 'goal', 'run a half marathon'), open('b', 'goal', 'learn Spanish')];
    const plan = await planResolution(
      facts,
      [quit({ attribute: 'goal', priorValue: 'half marathon' })],
      { newId: seq() }
    );
    expect(plan.close.map((c) => c.id)).toEqual(['a']);
  });
});

describe('recordWorldObservations', () => {
  it('a store failure is logged and reported as null, not thrown', async () => {
    const store = createMemoryWorldFactStore();
    store.listOpen = async () => {
      throw new Error('firestore unavailable');
    };
    await expect(
      recordWorldObservations('u1', 's1', [o('recovering')], { store, env: ON })
    ).resolves.toBeNull();
  });
});

describe('createFirestoreWorldFactStore', () => {
  it('reads only open facts and writes one batch per call', async () => {
    const where = vi.fn();
    const ops: Array<[string, string, unknown]> = [];
    const col = {
      where: (...args: unknown[]) => {
        where(...args);
        return {
          limit: () => ({
            get: async () => ({ docs: [{ id: 'a', data: () => ({ value: 'x', validTo: null }) }] }),
          }),
        };
      },
      doc: (id: string) => id,
    };
    const db = {
      collection: (name: string) => ({
        doc: (uid: string) => ({
          collection: (sub: string) => (ops.push(['path', `${name}/${uid}/${sub}`, null]), col),
        }),
      }),
      batch: () => ({
        set: (id: string, data: unknown) => ops.push(['set', id, data]),
        update: (id: string, data: unknown) => ops.push(['update', id, data]),
        commit: async () => ops.push(['commit', '', null]),
      }),
    };
    const store = createFirestoreWorldFactStore(() => db as never);

    expect(await store.listOpen('u1')).toEqual([{ id: 'a', value: 'x', validTo: null }]);
    expect(where).toHaveBeenCalledWith('validTo', '==', null);

    const plan = await planResolution([], [o('recovering')], { newId: seq() });
    await store.apply('u1', { ...plan, close: [{ id: 'old', validTo: 'T', supersededBy: 'id1' }] });
    expect(ops.filter(([op]) => op !== 'path').map(([op, id]) => `${op}:${id}`)).toEqual([
      'set:id1',
      'update:old',
      'commit:',
    ]);
    expect(ops[0][1]).toBe('bogle_users/u1/world_facts');
    const written = ops.find(([op]) => op === 'set')?.[2] as Record<string, unknown>;
    expect(Object.values(written)).not.toContain(undefined);
  });

  it("a refresh writes a date's time only when it changed, and deletes one dropped", async () => {
    const updates: Array<[string, Record<string, unknown>]> = [];
    const sub = { doc: (id: string) => id };
    const db = {
      collection: () => ({ doc: () => ({ collection: () => sub }) }),
      batch: () => ({
        set: () => {},
        update: (id: string, data: Record<string, unknown>) => updates.push([id, data]),
        commit: async () => {},
      }),
    };
    await createFirestoreWorldFactStore(() => db as never).apply('u1', {
      create: [],
      close: [],
      refresh: [
        { id: 'same', observedAt: 'T', confidence: 0.9 },
        { id: 'moved', observedAt: 'T', confidence: 0.9, at: '16:00' },
        { id: 'dropped', observedAt: 'T', confidence: 0.9, at: null },
      ],
    });
    expect(updates.slice(0, 2)).toEqual([
      ['same', { observedAt: 'T', confidence: 0.9 }],
      ['moved', { observedAt: 'T', confidence: 0.9, at: '16:00' }],
    ]);
    const dropped = updates[2][1].at;
    expect(dropped instanceof FieldValue && dropped.isEqual(FieldValue.delete())).toBe(true);
  });
});
