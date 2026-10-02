/**
 * Work & places store and service: dedupe + provenance, job history, user
 * edits win, tombstones, cascades (conversation, facts, delete-all), export,
 * voice forget through the memory-control domain registry, reminders for
 * trips and interviews, capture hooks, consent gate.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeFirestore,
  type FakeFirestore,
} from '../../user-preferences/__tests__/fake-firestore.js';

let fake: FakeFirestore;
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => fake,
}));

const dates = vi.hoisted(() => ({
  upsertImportantDate: vi.fn(),
  deleteImportantDate: vi.fn(),
}));
vi.mock('../../important-dates/index.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../important-dates/index.js')>();
  return {
    ...real,
    upsertImportantDate: dates.upsertImportantDate,
    deleteImportantDate: dates.deleteImportantDate,
  };
});

const svc = await import('../index.js');
const { setConsentCheckForTests } = await import('../consent.js');
const domains = await import('../../memory-control/domains.js');
const { registerWorkAndPlacesDomains } = await import('../../memory-control/builtin-domains.js');

const U = 'user-1';
const workPath = (id: string) => `bogle_users/${U}/work_memory/${id}`;
const tombPath = (id: string) => `bogle_users/${U}/memory_tombstones/${id}`;

function job(employer: string, extra: Partial<import('../types.js').LifeInput> = {}) {
  return {
    area: 'work' as const,
    kind: 'job' as const,
    subject: employer,
    employer,
    source: 'stated' as const,
    confidence: 0.85,
    conversationId: 'c1',
    ...extra,
  };
}

beforeEach(() => {
  fake = createFakeFirestore();
  setConsentCheckForTests(null);
  dates.upsertImportantDate.mockReset();
  dates.deleteImportantDate.mockReset();
  dates.upsertImportantDate.mockResolvedValue({
    success: true,
    data: { id: 'x', status: 'created' },
  });
  dates.deleteImportantDate.mockResolvedValue({ success: true, data: { deleted: true } });
  domains.resetMemoryDomains({ loadBuiltIns: false });
  registerWorkAndPlacesDomains();
});

describe('capture into the store', () => {
  it('re-learning upserts one doc and unions conversation provenance', async () => {
    const a = await svc.upsertLifeItem(U, job('Acme'));
    const b = await svc.upsertLifeItem(U, job('ACME', { conversationId: 'c2' }));
    expect(a.outcome).toBe('created');
    expect(b.outcome).toBe('reinforced');
    const items = await svc.listLifeItems(U, 'work');
    expect(items).toHaveLength(1);
    expect(items[0].sourceConversationIds).toEqual(['c1', 'c2']);
    expect(items[0].confidence).toBeGreaterThan(0.85);
  });

  it('a job change keeps the old job as past (history, not overwrite)', async () => {
    await svc.upsertLifeItem(U, job('Acme', { status: 'current', role: 'analyst' }));
    const r = await svc.upsertLifeItem(
      U,
      job('Globex', { status: 'current', startDate: '2026-09', conversationId: 'c2' })
    );
    expect(r.superseded?.map((i) => i.employer)).toEqual(['Acme']);
    const items = await svc.listLifeItems(U, 'work');
    const acme = items.find((i) => i.employer === 'Acme');
    const globex = items.find((i) => i.employer === 'Globex');
    expect(acme).toMatchObject({ status: 'past', endDate: '2026-09', role: 'analyst' });
    expect(globex).toMatchObject({ status: 'current' });
  });

  it('a role known before the employer folds into the job instead of becoming a past job', async () => {
    await svc.upsertLifeItem(U, {
      area: 'work',
      kind: 'job',
      subject: 'nurse',
      role: 'nurse',
      status: 'current',
      source: 'stated',
      confidence: 0.85,
      conversationId: 'c1',
    });
    await svc.upsertLifeItem(U, job('Mercy', { status: 'current', conversationId: 'c2' }));
    const items = await svc.listLifeItems(U, 'work');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      employer: 'Mercy',
      role: 'nurse',
      title: 'nurse at Mercy',
      status: 'current',
      sourceConversationIds: ['c2', 'c1'],
    });
  });

  it('a second job does not end the first; a promotion keeps the previous role', async () => {
    await svc.upsertLifeItem(U, job('Acme', { status: 'current', role: 'analyst' }));
    await svc.upsertLifeItem(U, job('Starbucks', { status: 'current', additional: true }));
    await svc.upsertLifeItem(U, job('Acme', { role: 'senior analyst' }));
    const items = await svc.listLifeItems(U, 'work');
    expect(items.filter((i) => i.status === 'current')).toHaveLength(2);
    expect(items.find((i) => i.employer === 'Acme')).toMatchObject({
      role: 'senior analyst',
      previousRoles: ['analyst'],
      title: 'senior analyst at Acme',
    });
  });

  it('user edits win over later inference; capture only adds provenance', async () => {
    const created = await svc.upsertLifeItem(U, job('Acme', { role: 'analyst' }));
    const id = created.item!.id;
    const edited = await svc.editUserLifeItem(U, 'work', id, {
      role: 'lead analyst',
      title: 'Lead analyst at Acme',
    });
    expect(edited.success && edited.data.userEdited).toBe(true);
    const r = await svc.upsertLifeItem(
      U,
      job('Acme', { role: 'intern', conversationId: 'c9', source: 'inferred' })
    );
    expect(r.outcome).toBe('skipped_user_edited');
    const item = await svc.getLifeItem(U, 'work', id);
    expect(item).toMatchObject({ role: 'lead analyst', title: 'Lead analyst at Acme' });
    expect(item?.sourceConversationIds).toEqual(['c1', 'c9']);
    // A user-edited current job is not moved to the past by inference either.
    await svc.upsertLifeItem(U, job('Globex', { status: 'current', source: 'inferred' }));
    expect((await svc.getLifeItem(U, 'work', id))?.status).toBe('current');
  });

  it('stated beats inferred; inferred only fills gaps', async () => {
    await svc.upsertLifeItem(U, job('Acme', { role: 'designer' }));
    await svc.upsertLifeItem(
      U,
      job('Acme', { role: 'engineer', team: 'growth team', source: 'inferred' })
    );
    expect((await svc.listLifeItems(U, 'work'))[0]).toMatchObject({
      role: 'designer',
      team: 'growth team',
    });
  });

  it('deleted items are tombstoned and never re-learned; the user adding it back clears that', async () => {
    const { item } = await svc.upsertLifeItem(U, job('Acme'));
    const del = await svc.forgetLifeItem(U, 'work', item!.id);
    expect(del.success).toBe(true);
    expect(fake.store.get(tombPath(item!.id))).toMatchObject({
      reason: 'user_deleted',
      kind: 'work',
    });
    expect((await svc.upsertLifeItem(U, job('Acme'))).outcome).toBe('skipped_tombstoned');
    const back = await svc.createUserLifeItem(U, {
      area: 'work',
      kind: 'job',
      subject: 'Acme',
      employer: 'Acme',
    });
    expect(back.outcome).toBe('created');
    expect(fake.store.has(tombPath(item!.id))).toBe(false);
  });

  it('respects a consent service when one exists (fails closed)', async () => {
    setConsentCheckForTests(async (_u, category) => category !== 'places');
    expect((await svc.upsertLifeItem(U, job('Acme'))).outcome).toBe('created');
    const trip = await svc.upsertLifeItem(U, {
      area: 'places',
      kind: 'trip',
      subject: 'Lisbon',
      place: 'Lisbon',
      source: 'stated',
      confidence: 0.9,
    });
    expect(trip.outcome).toBe('skipped_disabled');
    setConsentCheckForTests(() => {
      throw new Error('down');
    });
    expect((await svc.upsertLifeItem(U, job('Globex'))).outcome).toBe('skipped_disabled');
  });

  it('rejects invalid input', async () => {
    expect((await svc.upsertLifeItem(U, job('A'))).outcome).toBe('invalid');
    expect((await svc.upsertLifeItem(U, job('Acme', { startDate: 'March' }))).outcome).toBe(
      'invalid'
    );
    expect((await svc.upsertLifeItem(U, { ...job('Acme'), kind: 'trip' })).outcome).toBe('invalid');
  });
});

describe('trips and interviews become important dates', () => {
  it('a planned trip with a day is reminded; deleting it removes the reminder', async () => {
    const r = await svc.recordLifeItem(U, {
      area: 'places',
      kind: 'trip',
      subject: 'Lisbon',
      place: 'Lisbon',
      status: 'planned',
      startDate: '2026-10-09',
      source: 'stated',
      confidence: 0.85,
      conversationId: 'c1',
    });
    expect(dates.upsertImportantDate).toHaveBeenCalledWith(
      U,
      expect.objectContaining({
        title: 'Trip to Lisbon',
        date: '2026-10-09',
        kind: 'event',
        subtype: 'trip',
        source: 'detected',
        sourceConversationIds: ['c1'],
      })
    );
    expect(r.item?.dateId).toMatch(/^date_/);
    await svc.forgetLifeItem(U, 'places', r.item!.id, 'voice_forget');
    expect(dates.deleteImportantDate).toHaveBeenCalledWith(U, r.item!.dateId, 'voice_forget');
  });

  it('month-only trips and done trips are not reminded', async () => {
    await svc.recordLifeItem(U, {
      area: 'places',
      kind: 'trip',
      subject: 'Rome',
      status: 'planned',
      startDate: '2027-05',
      source: 'stated',
      confidence: 0.85,
    });
    expect(dates.upsertImportantDate).not.toHaveBeenCalled();
  });

  it('an interview is reminded as a career event', async () => {
    await svc.recordLifeItem(U, {
      area: 'work',
      kind: 'event',
      eventType: 'interview',
      subject: 'interview Stripe',
      title: 'Interview at Stripe',
      status: 'planned',
      startDate: '2026-10-06',
      source: 'stated',
      confidence: 0.85,
    });
    expect(dates.upsertImportantDate).toHaveBeenCalledWith(
      U,
      expect.objectContaining({ title: 'Interview at Stripe', kind: 'event', subtype: 'career' })
    );
  });

  it('a trip mentioned again without a date joins the planned one', async () => {
    const first = await svc.upsertLifeItem(U, {
      area: 'places',
      kind: 'trip',
      subject: 'Lisbon',
      status: 'planned',
      startDate: '2027-01-10',
      source: 'stated',
      confidence: 0.85,
    });
    const again = await svc.upsertLifeItem(U, {
      area: 'places',
      kind: 'trip',
      subject: 'Lisbon',
      source: 'inferred',
      confidence: 0.6,
      conversationId: 'c2',
    });
    expect(again.item?.id).toBe(first.item?.id);
    expect(await svc.listLifeItems(U, 'places')).toHaveLength(1);
  });
});

describe('memory control cascades (domain registry)', () => {
  it('conversation delete removes provenance; orphans are deleted and tombstoned; user items stay', async () => {
    const auto = (await svc.upsertLifeItem(U, job('Acme'))).item!;
    const shared = (await svc.upsertLifeItem(U, job('Globex', { additional: true }))).item!;
    await svc.upsertLifeItem(U, job('Globex', { conversationId: 'c2', additional: true }));
    const mine = (
      await svc.createUserLifeItem(U, { area: 'work', kind: 'goal', subject: 'Lead a team' })
    ).item!;
    await svc.upsertLifeItem(U, {
      area: 'work',
      kind: 'goal',
      subject: 'Lead a team',
      source: 'inferred',
      confidence: 0.6,
      conversationId: 'c1',
    });

    const out = await domains.deleteDomainsForConversation(U, ['c1']);
    expect(out.work).toBe(3);
    expect(out.places).toBe(0);
    expect(fake.store.has(workPath(auto.id))).toBe(false);
    expect(fake.store.get(tombPath(auto.id))).toMatchObject({ reason: 'conversation_deleted' });
    expect((await svc.getLifeItem(U, 'work', shared.id))?.sourceConversationIds).toEqual(['c2']);
    expect((await svc.getLifeItem(U, 'work', mine.id))?.sourceConversationIds).toEqual([]);
    // Catch-up extraction from the old conversation can't bring it back.
    expect((await svc.upsertLifeItem(U, job('Acme'))).outcome).toBe('skipped_tombstoned');
  });

  it('fact delete removes items derived only from that fact', async () => {
    const fromFact = (
      await svc.upsertLifeItem(
        U,
        job('Acme', { conversationId: undefined, factId: 'f1', source: 'inferred' })
      )
    ).item!;
    const both = (await svc.upsertLifeItem(U, job('Globex', { factId: 'f1', additional: true })))
      .item!;
    await domains.deleteDomainsForFacts(U, ['f1']);
    expect(await svc.getLifeItem(U, 'work', fromFact.id)).toBeNull();
    expect((await svc.getLifeItem(U, 'work', both.id))?.sourceFactIds).toEqual([]);
  });

  it('delete-all wipes both areas; export has both', async () => {
    await svc.upsertLifeItem(U, job('Acme'));
    await svc.upsertLifeItem(U, {
      area: 'places',
      kind: 'home',
      subject: 'Denver',
      place: 'Denver',
      source: 'stated',
      confidence: 0.9,
    });
    const exported = await domains.exportDomains(U);
    expect((exported.work as { items: unknown[] }).items).toHaveLength(1);
    expect((exported.places as { items: { place: string }[] }).items[0].place).toBe('Denver');
    const wiped = await domains.deleteAllDomains(U);
    expect(wiped).toEqual({ work: 1, places: 1 });
    expect(await svc.listLifeItems(U, 'work')).toEqual([]);
    expect(await svc.listLifeItems(U, 'places')).toEqual([]);
  });

  it('voice forget finds and deletes with a tombstone', async () => {
    await svc.upsertLifeItem(U, {
      area: 'places',
      kind: 'trip',
      subject: 'Lisbon',
      place: 'Lisbon',
      status: 'planned',
      source: 'stated',
      confidence: 0.9,
    });
    const found = await domains.findInDomains(U, 'forget my trip to Lisbon');
    expect(found).toEqual([
      expect.objectContaining({ domain: 'places', label: 'your trip "Trip to Lisbon"', score: 1 }),
    ]);
    expect(await domains.forgetInDomain(U, 'places', found[0].id)).toBe(true);
    expect(fake.store.get(tombPath(found[0].id))).toMatchObject({ reason: 'voice_forget' });
    expect(await domains.findInDomains(U, 'Lisbon')).toEqual([]);
  });
});

describe('capture hooks', () => {
  it('summarized conversation: turns, summary, facts and place entities', async () => {
    fake.store.set(`bogle_users/${U}/dynamic_facts/f1`, {
      entityName: 'user',
      key: 'job_title',
      value: 'staff engineer',
      sourceConversationIds: ['c1'],
    });
    fake.store.set(`bogle_users/${U}/dynamic_entities/e1`, {
      name: 'Lisbon',
      type: 'place',
      attributes: {},
      sourceConversationIds: ['c1'],
    });
    const r = await svc.onConversationSummarized(
      U,
      'c1',
      'The user is planning a trip to Lisbon next month.',
      [
        { role: 'user', text: 'I just started at Globex. Work has been intense.' },
        { role: 'assistant', text: 'I work at Ferni HQ, ha.' },
      ]
    );
    expect(r.applied).toBeGreaterThan(0);
    const work = await svc.listLifeItems(U, 'work');
    expect(work.find((i) => i.kind === 'job')).toMatchObject({
      employer: 'Globex',
      role: 'staff engineer',
      sourceFactIds: ['f1'],
    });
    expect(work.some((i) => i.employer === 'Ferni HQ')).toBe(false); // assistant turns never count
    expect(work.some((i) => i.kind === 'stress')).toBe(true);
    const trip = (await svc.listLifeItems(U, 'places'))[0];
    expect(trip).toMatchObject({
      kind: 'trip',
      place: 'Lisbon',
      entityId: 'e1',
      source: 'inferred',
    });
  });

  it('"I quit my job" ends the current job (kept as past)', async () => {
    await svc.recordUserTurnWorkAndPlaces(U, 'I work at Acme as a nurse, honestly.', 'c1');
    await svc.recordUserTurnWorkAndPlaces(U, 'So yeah, I quit my job today.', 'c2');
    const [acme] = await svc.listLifeItems(U, 'work');
    expect(acme).toMatchObject({ employer: 'Acme', status: 'past' });
    expect(acme.sourceConversationIds).toEqual(['c1', 'c2']);
  });

  it('anonymous users are never captured', async () => {
    expect(await svc.recordUserTurnWorkAndPlaces('anonymous', 'I work at Acme.', 'c1')).toEqual([]);
  });
});
