/**
 * #2978's open items, fixed before the dual-write (M8b): a late-arriving fact is stored
 * as history, contact data in any written form is refused while dates, years and prices
 * are kept, and a fact about a forgotten topic is refused. Fixtures are fictional.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getPersonaFactRefusedCount,
  resetMemoryExtractionTelemetry,
} from '../../operations/memory-extraction-telemetry.js';
import { fakeFirestore } from '../../../services/stores/__tests__/fake-firestore.js';
import { proposeFact, type FactProposal } from '../../writer/memory-writer.js';
import { getCurrentFacts, getFactsAsOf, listFactHistory } from '../facts-store.js';

const ON = { MEMORY_FACTS: 'on' };
const at = (day: string): string => `${day}T12:00:00.000Z`;
const city = (value: string, key: string, validFrom: string | null): FactProposal => ({
  subjectId: 'self',
  attribute: 'city',
  value,
  source: 'manual',
  provenance: 'user_said',
  sourceKey: key,
  validFrom: validFrom && at(validFrom),
  at: new Date(at('2026-10-30')),
});
const factDocs = (docs: Map<string, Record<string, unknown>>) =>
  [...docs.entries()].filter(([p]) => p.includes('/facts/'));
const propose = async (db: ReturnType<typeof fakeFirestore>['db'], p: FactProposal) => {
  const r = await proposeFact(db, 'u1', p, ON);
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r;
};

describe('a late-arriving fact', () => {
  it('is stored as history when a newer validFrom is current; the current fact is unchanged', async () => {
    const { db, docs } = fakeFirestore();
    const now = await propose(db, city('Austin', 'k1', '2026-03-01'));
    const before = structuredClone(docs.get(`bogle_users/u1/facts/${now.fact.id}`));

    const late = await propose(db, city('Denver', 'k2', '2025-06-01'));

    expect(late.op).toBe('history');
    expect(docs.get(`bogle_users/u1/facts/${now.fact.id}`)).toEqual(before); // untouched
    expect(late.fact).toMatchObject({
      value: 'Denver',
      validFrom: at('2025-06-01'),
      validTo: at('2026-03-01'),
      supersededBy: now.fact.id,
    });
    expect(late.fact.retiredAt).not.toBeNull();
    const current = await getCurrentFacts(db, 'u1', 'self', 'city', ON);
    expect(current.map((f) => f.value)).toEqual(['Austin']);
    const asOf = async (day: string) =>
      (await getFactsAsOf(db, 'u1', 'self', 'city', new Date(at(day)), ON)).map((f) => f.value);
    expect(await asOf('2025-09-01')).toEqual(['Denver']);
    expect(await asOf('2026-05-01')).toEqual(['Austin']);
  });

  it('trims the retired fact whose window held it, so asOf answers one value', async () => {
    const { db } = fakeFirestore();
    const first = await propose(db, city('Tampa', 'k1', '2020-01-01'));
    await propose(db, city('Austin', 'k2', '2026-01-01')); // Tampa retired at 2026-01-01
    const late = await propose(db, city('Denver', 'k3', '2023-01-01'));
    expect(late.op).toBe('history');

    const history = await listFactHistory(db, 'u1', 'self', 'city', ON);
    const tampa = history.find((f) => f.id === first.fact.id);
    expect(tampa).toMatchObject({ validTo: at('2023-01-01'), supersededBy: late.fact.id });
    for (const [day, want] of [
      ['2021-06-01', 'Tampa'],
      ['2024-06-01', 'Denver'],
      ['2026-06-01', 'Austin'],
    ]) {
      const got = await getFactsAsOf(db, 'u1', 'self', 'city', new Date(at(day)), ON);
      expect(
        got.map((f) => f.value),
        day
      ).toEqual([want]);
    }
  });

  it('a newer validFrom still supersedes as before (UPDATE)', async () => {
    const { db } = fakeFirestore();
    await propose(db, city('Austin', 'k1', '2025-01-01'));
    expect((await propose(db, city('Denver', 'k2', '2026-01-01'))).op).toBe('update');
  });
});

describe('the value guard', () => {
  const other = (value: string, key: string): FactProposal => ({
    ...city(value, key, null),
    attribute: 'other',
  });

  it.each([
    'reach jo at example dot com',
    'jo%40example.com',
    'jo&#64;example.com',
    'jo&#x40;example.com',
    'email jo at gmail',
    'her number is five five five zero one four two',
    'call 555 then 0142',
    'five five five and zero one four two',
    'call 727-555-0142',
  ])('refuses %j and writes nothing', async (value) => {
    const { db, docs } = fakeFirestore();
    expect(await proposeFact(db, 'u1', other(value, 'k1'), ON)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(factDocs(docs)).toEqual([]);
  });

  it.each([
    'worked there 2019 to 2023',
    'born 1987, moved 2015',
    'wedding anniversary 06/12/2010',
    'graduated on 2019-05-20',
    'paid $1,250 for the trip',
    'bought the house in 2019 for $450,000',
  ])('keeps the date, year or price %j', async (value) => {
    const { db, docs } = fakeFirestore();
    expect(await propose(db, other(value, 'k1'))).toMatchObject({ op: 'add' });
    expect(factDocs(docs)).toHaveLength(1);
  });
});

describe('a forgotten topic', () => {
  const forget = (docs: Map<string, Record<string, unknown>>, topics: unknown) =>
    docs.set('bogle_users/u1/memory_state/forgotten', { topics });
  const pet = (value: string, subjectId = 'self'): FactProposal => ({
    ...city(value, 'k1', null),
    attribute: 'pet',
    subjectId,
  });

  it('is refused on write, by value, attribute or subject, and nothing is stored', async () => {
    const { db, docs } = fakeFirestore();
    forget(docs, ['Biscuit']);
    expect(await proposeFact(db, 'u1', pet('a beagle named Biscuit'), ON)).toEqual({
      ok: false,
      reason: 'forgotten',
    });
    forget(docs, ['pet']);
    expect(await proposeFact(db, 'u1', pet('a cat named Pepper'), ON)).toMatchObject({
      reason: 'forgotten',
    });
    forget(docs, ['Mindy']);
    expect(await proposeFact(db, 'u1', pet('a cat', 'person:mindy'), ON)).toMatchObject({
      reason: 'forgotten',
    });
    expect(factDocs(docs)).toEqual([]);
    // another topic does not block it
    forget(docs, ['Tampa']);
    expect(await propose(db, pet('a beagle named Biscuit'))).toMatchObject({ op: 'add' });
  });

  it('nothing is written while the forgotten topics cannot be read', async () => {
    const { db, docs } = fakeFirestore();
    forget(docs, 'not a list');
    expect(await proposeFact(db, 'u1', pet('a beagle named Biscuit'), ON)).toEqual({
      ok: false,
      reason: 'unreadable',
    });
    expect(factDocs(docs)).toEqual([]);
  });
});

describe("Ferni's own life", () => {
  beforeEach(() => resetMemoryExtractionTelemetry());
  const said = (o: Partial<FactProposal>): FactProposal => ({
    ...city('Portland', 'k1', null),
    attribute: 'other',
    value: 'grew up near the coast',
    ...o,
  });

  it('persona canon is refused, whoever it is about, and nothing is stored', async () => {
    const { db, docs } = fakeFirestore();
    for (const subjectId of ['self', 'person:jo-rivera'])
      expect(
        await proposeFact(db, 'u1', said({ provenance: 'persona_canon', subjectId }), ON)
      ).toEqual({ ok: false, reason: 'persona' });
    expect(factDocs(docs)).toEqual([]);
  });

  it('a fact about Ferni or a teammate is refused even when labelled user_said', async () => {
    const { db, docs } = fakeFirestore();
    for (const subjectId of ['entity:ferni', 'person:ferni', 'person:maya', 'entity:peter-john'])
      expect(await proposeFact(db, 'u1', said({ subjectId }), ON), subjectId).toEqual({
        ok: false,
        reason: 'persona',
      });
    expect(factDocs(docs)).toEqual([]);
    expect(getPersonaFactRefusedCount()).toBe(4); // each refusal counted
    // a real person who only shares a word with a teammate is kept
    expect(await propose(db, said({ subjectId: 'person:maya-angelou' }))).toMatchObject({
      op: 'add',
      fact: { provenance: 'user_said' },
    });
  });

  it("a teammate name with a stated relationship is the person's own: stored", async () => {
    const { db, docs } = fakeFirestore();
    // "my friend Maya is moving to Denver"
    const denver = said({ subjectId: 'person:maya', relationship: 'friend', attribute: 'city' });
    expect(await propose(db, { ...denver, value: 'Denver' })).toMatchObject({ op: 'add' });
    // "my cousin Peter": the relation fact on file counts for later facts about him
    const peter = { subjectId: 'person:peter', sourceKey: 'k2' };
    expect(
      await propose(db, said({ ...peter, attribute: 'relation', value: 'cousin' }))
    ).toMatchObject({
      op: 'add',
    });
    expect(
      await propose(db, said({ ...peter, attribute: 'pet', value: 'a cat', sourceKey: 'k3' }))
    ).toMatchObject({ op: 'add' });
    expect(factDocs(docs)).toHaveLength(3);
    expect(getPersonaFactRefusedCount()).toBe(0);
  });

  it('a teammate name with no relationship, or Ferni with any, is refused and counted', async () => {
    const { db, docs } = fakeFirestore();
    // "Maya loves hiking"
    const hiking = said({
      subjectId: 'person:maya',
      attribute: 'preference',
      value: 'loves hiking',
    });
    expect(await proposeFact(db, 'u1', hiking, ON)).toEqual({ ok: false, reason: 'persona' });
    for (const relationship of ['acquaintance', 'Unknown', 'other', null])
      expect(await proposeFact(db, 'u1', { ...hiking, relationship }, ON)).toMatchObject({
        reason: 'persona',
      });
    expect(
      await proposeFact(db, 'u1', said({ subjectId: 'entity:ferni', relationship: 'friend' }), ON)
    ).toMatchObject({ reason: 'persona' });
    expect(factDocs(docs)).toEqual([]);
    expect(getPersonaFactRefusedCount()).toBe(6);
    // any stated relation keeps a teammate's name, even a coach
    const coach = { ...hiking, relationship: 'coach', sourceKey: 'k9' };
    expect(await propose(db, coach)).toMatchObject({ op: 'add' });
  });
});
