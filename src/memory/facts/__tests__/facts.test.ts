import { describe, expect, it } from 'vitest';
import { fakeFirestore } from '../../../services/stores/__tests__/fake-firestore.js';
import { proposeFact, type FactProposal } from '../../writer/memory-writer.js';
import { normalizeValue, toFact } from '../fact.js';
import { factDoc, getCurrentFacts, getFactsAsOf, listFactHistory } from '../facts-store.js';

const ON = { MEMORY_FACTS: 'on' };
const T0 = new Date('2026-10-01T12:00:00.000Z');
const T1 = new Date('2026-10-20T12:00:00.000Z');
const factPath = (id: string): string => `bogle_users/u1/facts/${id}`;

const city = (value: string, key: string, extra: Partial<FactProposal> = {}): FactProposal => ({
  subjectId: 'self',
  attribute: 'city',
  value,
  source: 'manual',
  provenance: 'user_said',
  sourceKey: key,
  at: T0,
  ...extra,
});
const setup = () => {
  const fake = fakeFirestore();
  for (const uid of ['u1', 'u2']) fake.docs.set(`bogle_users/${uid}`, { displayName: 'Jo Rivera' });
  return {
    ...fake,
    paths: (): string[] => [...fake.docs.keys()].filter((p) => p.includes('/facts/')),
  };
};
const added = async (db: ReturnType<typeof setup>['db'], p: FactProposal, uid = 'u1') => {
  const r = await proposeFact(db, uid, p, ON);
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r;
};

describe('the fact parser', () => {
  const good = {
    v: 1,
    subjectId: 'self',
    attribute: 'phone',
    value: '+17275550142',
    validFrom: null,
    validTo: null,
    learnedAt: T0.toISOString(),
    retiredAt: null,
    supersededBy: null,
    sourceEpisodeId: 's-1',
    source: 'manual',
    confidence: 0.9,
    sensitive: false,
    forgottenAt: null,
    lastConfirmedAt: T0.toISOString(),
  };

  it('reads what the writer stores and rejects every other shape', () => {
    expect(toFact('f1', good)).toMatchObject({ id: 'f1', value: '+17275550142' });
    const bad: Array<Record<string, unknown>> = [
      { ...good, extra: 1 },
      { ...good, v: 2 },
      { ...good, attribute: 'shoe_size' },
      { ...good, source: 'a_guess' },
      { ...good, confidence: 1.5 },
      { ...good, value: '727-555-0142' }, // a phone is stored E.164 only
      { ...good, attribute: 'city', value: 'Tampa'.repeat(50) },
      { ...good, attribute: 'email_present', value: 'maya@example.com' },
      { ...good, attribute: 'health_note', value: 'call 727 555 0142' },
      { ...good, attribute: 'role', value: 'maya@example.com' },
      { ...good, learnedAt: 'yesterday' },
      { ...good, subjectId: '../x' },
    ];
    for (const b of bad) expect(toFact('f1', b), JSON.stringify(b)).toBeNull();
    expect(toFact('f1', null)).toBeNull();
    expect(toFact('f1', [good])).toBeNull();
  });

  it('normalises: phones to E.164, whitespace folded, a date of birth allowed', () => {
    expect(normalizeValue('phone', '(727) 555-0142')).toBe('+17275550142');
    expect(normalizeValue('phone', '1-727-555-0142')).toBe('+17275550142');
    expect(normalizeValue('phone', '555-0142')).toBeNull();
    expect(normalizeValue('city', '  St.   Petersburg ')).toBe('St. Petersburg');
    expect(normalizeValue('birthday', '1960-04-12')).toBe('1960-04-12');
    expect(normalizeValue('email_present', 'true')).toBe('true');
    expect(normalizeValue('other', '')).toBeNull();
  });

  it('rejects seven or more digits however they are written or separated', () => {
    const numbers = [
      '5 5 5 0 1 4 2 1 2 3',
      '555·0142·123',
      '５５５０１４２１２３', // full-width
      '٥٥٥٠١٤٢١٢٣', // Arabic-Indic
      'reach him at 555 0142',
      '555.0142',
    ];
    for (const n of numbers) expect(normalizeValue('other', n), n).toBeNull();
    for (const n of numbers) expect(normalizeValue('health_note', n), n).toBeNull();
    // fewer than seven stay, and the E.164 phone and a dated birthday are still allowed
    expect(normalizeValue('other', 'two dogs and 3 cats')).toBe('two dogs and 3 cats');
    expect(normalizeValue('phone', '٥٥٥٠١٤٢١٢٣')).toBeNull();
    expect(normalizeValue('phone', '727·555·0142')).toBeNull();
    expect(normalizeValue('phone', '(727) 555-0142')).toBe('+17275550142');
    expect(normalizeValue('birthday', '1960-04-12')).toBe('1960-04-12');
  });
});

describe('proposeFact', () => {
  it('ADD stores a parseable fact under the owner, with the proposal as given', async () => {
    const { db, docs, paths } = setup();
    const r = await added(db, city('Tampa', 'k1', { sensitive: true, sourceEpisodeId: 's-1' }));
    expect(r).toMatchObject({ op: 'add', duplicate: false });
    expect(paths()).toEqual([factPath(r.fact.id)]);
    const stored = docs.get(factPath(r.fact.id));
    expect(stored).not.toHaveProperty('id');
    expect(toFact(r.fact.id, stored)).toMatchObject({
      value: 'Tampa',
      sensitive: true,
      sourceEpisodeId: 's-1',
      validTo: null,
      retiredAt: null,
      learnedAt: T0.toISOString(),
    });
  });

  it('UPDATE retires the old fact, keeps it, and points it at the new one', async () => {
    const { db, docs, paths } = setup();
    const old = await added(db, city('Tampa', 'k1'));
    const next = await added(
      db,
      city('St. Petersburg', 'k2', { at: T1, validFrom: T1.toISOString() })
    );
    expect(next.op).toBe('update');
    expect(paths().length).toBe(2); // kept, not overwritten
    expect(toFact(old.fact.id, docs.get(factPath(old.fact.id)))).toMatchObject({
      value: 'Tampa',
      validTo: T1.toISOString(),
      retiredAt: T1.toISOString(),
      supersededBy: next.fact.id,
    });
    expect((await getCurrentFacts(db, 'u1', 'self', 'city', ON)).map((f) => f.value)).toEqual([
      'St. Petersburg',
    ]);
    const history = await listFactHistory(db, 'u1', 'self', 'city', ON);
    expect(history.map((f) => f.value)).toEqual(['Tampa', 'St. Petersburg']);
  });

  it('asOf answers with the old value before the change and the new one from it on', async () => {
    const { db } = setup();
    await added(db, city('Tampa', 'k1'));
    await added(db, city('St. Petersburg', 'k2', { at: T1, validFrom: T1.toISOString() }));
    const at = async (d: Date): Promise<string[]> =>
      (await getFactsAsOf(db, 'u1', 'self', 'city', d, ON)).map((f) => f.value);
    expect(await at(new Date(T1.getTime() - 1))).toEqual(['Tampa']);
    expect(await at(T1)).toEqual(['St. Petersburg']);
    expect(await at(new Date(T1.getTime() + 86_400_000))).toEqual(['St. Petersburg']);
    // a fact with no validFrom was true before Ferni learned it
    expect(await at(new Date('2020-01-01T00:00:00.000Z'))).toEqual(['Tampa']);
  });

  it('NOOP on the same value (any case, spacing, phone format) only moves lastConfirmedAt', async () => {
    const { db, docs, paths } = setup();
    const first = await added(db, city('Tampa', 'k1'));
    const again = await added(db, city('  tampa ', 'k2', { at: T1 }));
    expect(again).toMatchObject({ op: 'noop', duplicate: false });
    expect(paths().length).toBe(1);
    expect(docs.get(factPath(first.fact.id))).toMatchObject({
      value: 'Tampa',
      learnedAt: T0.toISOString(),
      lastConfirmedAt: T1.toISOString(),
    });

    const phone = (value: string, key: string): FactProposal => ({
      ...city(value, key),
      attribute: 'phone',
    });
    await added(db, phone('(727) 555-0142', 'p1'));
    expect((await added(db, phone('+1 727 555 0142', 'p2'))).op).toBe('noop');
    expect(paths().length).toBe(2);
  });

  it('a retry with the same source and key writes nothing, even after the fact was replaced', async () => {
    const { db, docs } = setup();
    const first = await added(db, city('Tampa', 'k1'));
    await added(db, city('Austin', 'k2', { at: T1 }));
    const before = structuredClone(Object.fromEntries(docs));
    const retry = await added(db, city('Tampa', 'k1'));
    expect(retry).toMatchObject({ duplicate: true, fact: { id: first.fact.id } });
    expect(Object.fromEntries(docs)).toEqual(before);
  });

  it('a multi-valued attribute adds: a second pet does not retire the first', async () => {
    const { db } = setup();
    const pet = (value: string, key: string): FactProposal => ({
      ...city(value, key),
      attribute: 'pet',
    });
    await added(db, pet('a beagle named Biscuit', 'k1'));
    expect((await added(db, pet('a cat named Pepper', 'k2'))).op).toBe('add');
    expect(await getCurrentFacts(db, 'u1', 'self', 'pet', ON)).toHaveLength(2);
  });

  it('two concurrent UPDATEs end with exactly one current fact', async () => {
    const { db, docs, paths } = setup();
    await added(db, city('Tampa', 'k0'));
    const results = await Promise.all([
      proposeFact(db, 'u1', city('Austin', 'k1', { at: T1 }), ON),
      proposeFact(db, 'u1', city('Denver', 'k2', { at: new Date(T1.getTime() + 1000) }), ON),
    ]);
    expect(results.every((r) => r.ok && r.op === 'update')).toBe(true);
    expect(paths().length).toBe(3);
    const current = await getCurrentFacts(db, 'u1', 'self', 'city', ON);
    expect(current).toHaveLength(1);
    const retired = [...docs.values()].filter((d) => d.supersededBy);
    expect(retired).toHaveLength(2);
  });

  it('refuses a non-member, a bad value and a bad subject, and writes nothing', async () => {
    const { db, paths } = setup();
    for (const uid of ['onbehalf:call-9', 'anonymous', 'anon:abc']) {
      expect(await proposeFact(db, uid, city('Tampa', 'k1'), ON)).toEqual({
        ok: false,
        reason: 'not_member',
      });
    }
    const bad: FactProposal[] = [
      city('maya@example.com', 'k1'),
      city('call 727 555 0142', 'k1'),
      city('Tampa', 'k1', { subjectId: 'a/b' }),
      city('Tampa', 'k1', { confidence: 2 }),
      city('Tampa', ''),
    ];
    for (const p of bad)
      expect(await proposeFact(db, 'u1', p, ON)).toMatchObject({ reason: 'invalid' });
    expect(paths()).toEqual([]);
    await expect(proposeFact(db, 'u1/x', city('Tampa', 'k1'), ON)).rejects.toThrow(
      'invalid user id'
    );
    expect(() => factDoc(db, 'u1', 'f1/events/1')).toThrow('invalid fact id');
    expect(await getCurrentFacts(db, 'onbehalf:call-9', undefined, undefined, ON)).toEqual([]);
  });

  it('refuses a number written with spaces, dots or other digits, and stores nothing', async () => {
    const { db, paths } = setup();
    for (const [i, value] of [
      '5 5 5 0 1 4 2 1 2 3',
      '555·0142·123',
      '５５５０１４２１２３',
      '٥٥٥٠١٤٢١٢٣',
    ].entries()) {
      const p = { ...city(value, `k${i}`), attribute: 'health_note' as const };
      expect(await proposeFact(db, 'u1', p, ON), value).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(paths()).toEqual([]);
  });

  it('writes only what the parser would read: a bad field refuses the whole proposal', async () => {
    const { db, docs } = setup();
    await added(db, city('Tampa', 'k0'));
    const before = structuredClone(Object.fromEntries(docs));
    const bad: Array<[string, Partial<FactProposal>]> = [
      ['validFrom text', { validFrom: 'last spring' }],
      ['validFrom number', { validFrom: 12345 as never }],
      ['attribute', { attribute: 'shoe_size' as never }],
      ['source', { source: 'a_guess' as never }],
      ['sensitive', { sensitive: 'yes' as never }],
      ['confidence', { confidence: Number.NaN }],
      ['at invalid date', { at: new Date('nope') }],
      ['at text', { at: '2026-10-01' as never }],
      ['subject', { subjectId: 'a/b' }],
      ['episode', { sourceEpisodeId: '../x' }],
    ];
    for (const [name, extra] of bad) {
      // a would-be UPDATE: the old city must not be retired when the new fact is refused
      const r = await proposeFact(db, 'u1', city('Austin', `k-${name}`, extra), ON);
      expect(r, name).toEqual({ ok: false, reason: 'invalid' });
      expect(Object.fromEntries(docs), name).toEqual(before);
    }
  });

  it('writes and reads nothing while MEMORY_FACTS is off', async () => {
    const { db, paths } = setup();
    expect(await proposeFact(db, 'u1', city('Tampa', 'k1'), {})).toEqual({
      ok: false,
      reason: 'disabled',
    });
    expect(paths()).toEqual([]);
    await added(db, city('Tampa', 'k1'));
    expect(await getCurrentFacts(db, 'u1', 'self', 'city', {})).toEqual([]);
    expect(await getFactsAsOf(db, 'u1', 'self', 'city', T1, {})).toEqual([]);
    expect(await listFactHistory(db, 'u1', 'self', 'city', {})).toEqual([]);
  });
});

describe('forgotten and unreadable facts', () => {
  const seed = (
    docs: Map<string, Record<string, unknown>>,
    id: string,
    o: Record<string, unknown>
  ) =>
    docs.set(factPath(id), {
      v: 1,
      subjectId: 'self',
      attribute: 'city',
      value: 'Tampa',
      validFrom: null,
      validTo: null,
      learnedAt: T0.toISOString(),
      retiredAt: null,
      supersededBy: null,
      sourceEpisodeId: null,
      source: 'manual',
      confidence: 0.8,
      sensitive: false,
      forgottenAt: null,
      lastConfirmedAt: T0.toISOString(),
      ...o,
    });

  it('never returns a forgotten fact', async () => {
    const { db, docs } = setup();
    seed(docs, 'gone', { forgottenAt: T1.toISOString() });
    seed(docs, 'kept', { attribute: 'pet', value: 'a beagle named Biscuit' });
    expect(await getCurrentFacts(db, 'u1', 'self', 'city', ON)).toEqual([]);
    expect(await getFactsAsOf(db, 'u1', 'self', 'city', T1, ON)).toEqual([]);
    expect(await listFactHistory(db, 'u1', 'self', 'city', ON)).toEqual([]);
    expect((await getCurrentFacts(db, 'u1', undefined, undefined, ON)).map((f) => f.id)).toEqual([
      'kept',
    ]);
  });

  it('leaves out a fact about a forgotten topic, by value or by attribute, in every reader', async () => {
    const { db, docs } = setup();
    await added(db, { ...city('a beagle named Biscuit', 'k1'), attribute: 'pet' });
    await added(db, city('Tampa', 'k2', { at: T1 }));
    const names = async (): Promise<string[][]> => [
      (await getCurrentFacts(db, 'u1', undefined, undefined, ON)).map((f) => f.value),
      (await getFactsAsOf(db, 'u1', 'self', 'pet', T1, ON)).map((f) => f.value),
      (await listFactHistory(db, 'u1', 'self', 'pet', ON)).map((f) => f.value),
    ];
    expect(await names()).toEqual([
      ['Tampa', 'a beagle named Biscuit'],
      ['a beagle named Biscuit'],
      ['a beagle named Biscuit'],
    ]);

    docs.set('bogle_users/u1/memory_state/forgotten', { topics: ['Biscuit'] }); // not marked forgottenAt
    expect(await names()).toEqual([['Tampa'], [], []]);
    docs.set('bogle_users/u1/memory_state/forgotten', { topics: ['city'] }); // the attribute
    expect((await names())[0]).toEqual(['a beagle named Biscuit']);
  });

  it('returns nothing when the forgotten topics cannot be read', async () => {
    const { db, docs } = setup();
    await added(db, city('Tampa', 'k1'));
    docs.set('bogle_users/u1/memory_state/forgotten', { topics: 'Biscuit' });
    expect(await getCurrentFacts(db, 'u1', undefined, undefined, ON)).toEqual([]);
  });

  it('skips a document of another shape and leaves it as it is', async () => {
    const { db, docs } = setup();
    docs.set(factPath('odd'), { subjectId: 'self', attribute: 'city', transcript: 'all of it' });
    await added(db, city('Tampa', 'k1'));
    expect((await getCurrentFacts(db, 'u1', 'self', 'city', ON)).map((f) => f.value)).toEqual([
      'Tampa',
    ]);
    expect(docs.get(factPath('odd'))).toMatchObject({ transcript: 'all of it' });
  });
});
