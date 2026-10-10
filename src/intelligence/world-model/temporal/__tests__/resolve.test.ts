/**
 * Supersession rules and what the after-call sink refuses to store.
 */

import { describe, expect, it, vi } from 'vitest';
import { recordWorldObservations, validObservation } from '../ingest.js';
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

describe('recordWorldObservations input checks', () => {
  it('drops crisis text, missing fields and bad kinds; drops a date that does not parse', () => {
    expect(validObservation(o('said she wants to end my life'), 's1')).toBeNull();
    expect(validObservation(o('  '), 's1')).toBeNull();
    expect(validObservation({ ...o('fine'), subjectKind: 'pet' as never }, 's1')).toBeNull();
    const kept = validObservation(
      o('knee surgery', 'event', undefined, { eventDate: 'Tuesday', confidence: 7 }),
      ''
    );
    expect(kept).toMatchObject({ eventDate: undefined, confidence: 1 });
  });

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
});
