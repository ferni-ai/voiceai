/**
 * Life story, values and beliefs: consent (beliefs gated, values not),
 * switching Beliefs off (buffers dropped, deletion offered), story dedupe
 * (one story, two tellings), user edits win, tombstones, conversation and
 * fact cascades, export, delete-all, voice forget, links to people / places /
 * dates (fake Firestore).
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

const h = vi.hoisted(() => ({
  upsertImportantDate: vi.fn(),
  deleteImportantDate: vi.fn(),
}));
vi.mock('../../important-dates/index.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../important-dates/index.js')>();
  return {
    ...real,
    upsertImportantDate: h.upsertImportantDate,
    deleteImportantDate: h.deleteImportantDate,
  };
});
vi.mock('../../personal-insights/index.js', () => ({
  getPeople: async () => [{ id: 'person-sam', name: 'Sam', aliases: ['Sam'] }],
  findPerson: (people: Array<{ id: string; name: string }>, name: string) =>
    people.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? null,
}));
vi.mock('../../work-and-places/index.js', () => ({
  listLifeItems: async () => [{ id: 'place_ohio', title: 'Ohio', place: 'Ohio' }],
}));

const consent = await import('../../memory-consent/index.js');
const svc = await import('../index.js');
const domains = await import('../../memory-control/domains.js');
const { registerLifeStoryDomains } = await import('../../memory-control/builtin-domains.js');

const U = 'user-1';
const docs = (collection: string) =>
  [...fake.store.keys()].filter((k) => k.startsWith(`bogle_users/${U}/${collection}/`));
const tomb = (id: string) => fake.store.get(`bogle_users/${U}/memory_tombstones/${id}`);

beforeEach(() => {
  fake = createFakeFirestore();
  consent.clearConsentCache();
  consent.resetCategoryStores();
  svc.setConsentCheckForTests(null);
  svc.resetBeliefBuffers();
  h.upsertImportantDate
    .mockReset()
    .mockResolvedValue({ success: true, data: { id: 'd', status: 'created' } });
  h.deleteImportantDate.mockReset().mockResolvedValue({ success: true, data: { deleted: true } });
  domains.resetMemoryDomains({ loadBuiltIns: false });
  registerLifeStoryDomains();
});

describe('consent', () => {
  it('Beliefs off (the default): no beliefs stored, values and story still are', async () => {
    const report = await svc.recordUserTurnLifeStory(
      U,
      'Family matters most to me. I go to mass on Sundays. I grew up in Ohio.',
      'c1'
    );
    expect(report.beliefs.map((b) => b.outcome)).toEqual(['skipped_no_consent']);
    expect(docs('beliefs_memory')).toEqual([]);
    expect((await svc.listValues(U)).map((v) => v.label)).toEqual(['family']);
    expect((await svc.listItems(U, 'story')).map((i) => i.title)).toEqual(['Grew up in Ohio']);
  });

  it('a story that reveals faith is held back while Beliefs is off', async () => {
    const r = await svc.recordUserTurnLifeStory(
      U,
      'When I was little, we went to mass every Sunday with my grandmother.',
      'c1'
    );
    expect(r.stories.map((s) => s.outcome)).toEqual(['skipped_no_consent']);
    expect(docs('life_story')).toEqual([]);
  });

  it('Beliefs on: beliefs are stored with provenance', async () => {
    await consent.setCategoryConsent(U, 'beliefs', true, 'page');
    await svc.recordUserTurnLifeStory(U, "I'm Buddhist.", 'c1');
    const items = await svc.listItems(U, 'beliefs');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'faith',
      title: 'Buddhist',
      sourceConversationIds: ['c1'],
    });
  });

  it('switching Beliefs off stops capture, drops buffers and offers deletion', async () => {
    await consent.setCategoryConsent(U, 'beliefs', true, 'page');
    await svc.recordUserTurnLifeStory(U, "I'm Catholic. I pray every morning.", 'c1');
    expect(svc.pendingBeliefBuffers(U)).toBe(2);
    await consent.setCategoryConsent(U, 'beliefs', false, 'page');
    expect(svc.pendingBeliefBuffers(U)).toBe(0);
    await svc.recordUserTurnLifeStory(U, "I've been questioning my faith.", 'c2');
    expect(docs('beliefs_memory')).toHaveLength(2);

    const summary = await consent.summarizeCategoryData(U, 'beliefs');
    expect(summary.byStore.beliefsMemory).toBe(2);
    const deleted = await consent.deleteCategoryData(U, 'beliefs');
    expect(deleted.byStore.beliefsMemory).toBe(2);
    expect(docs('beliefs_memory')).toEqual([]);
  });

  it('the page cannot add a belief while Beliefs is off', async () => {
    const r = await svc.createUserItem(U, { area: 'beliefs', kind: 'faith', title: 'Quaker' });
    expect(r).toEqual({ success: false, error: 'consent_off' });
  });
});

describe('stories', () => {
  it('the same story told twice is one entry with two sources', async () => {
    await svc.recordUserTurnLifeStory(
      U,
      'When I was nine, my brother Sam and I built a treehouse.',
      'c1'
    );
    await svc.recordUserTurnLifeStory(
      U,
      'I still remember when my brother and I built that treehouse.',
      'c2'
    );
    const stories = (await svc.listItems(U, 'story')).filter((i) => i.kind === 'story');
    expect(stories).toHaveLength(1);
    expect(stories[0].sourceConversationIds).toEqual(['c1', 'c2']);
    expect(stories[0].mentions).toBe(2);
    expect(stories[0].people).toEqual(
      expect.arrayContaining([{ name: 'Sam', personId: 'person-sam' }])
    );
  });

  it('links the place they grew up to work & places', async () => {
    await svc.recordUserTurnLifeStory(U, 'I grew up in Ohio.', 'c1');
    const [origin] = await svc.listItems(U, 'story');
    expect(origin.place).toEqual({ name: 'Ohio', placeId: 'place_ohio' });
  });

  it('a story pinned to a day becomes an important date, removed with the story', async () => {
    const r = await svc.createUserItem(U, {
      area: 'story',
      kind: 'turning_point',
      title: 'The day I got sober',
      date: '2015-03-14',
    });
    expect(r.success).toBe(true);
    expect(h.upsertImportantDate).toHaveBeenCalledWith(
      U,
      expect.objectContaining({
        date: '2015-03-14',
        recurring: true,
        subtype: 'life_story',
        source: 'user',
      })
    );
    const id = r.success ? r.data.id : '';
    expect((await svc.forgetItem(U, id)).success).toBe(true);
    expect(h.deleteImportantDate).toHaveBeenCalled();
  });

  it("the user's edit wins over later capture", async () => {
    await svc.recordUserTurnLifeStory(U, 'I grew up in Ohio.', 'c1');
    const [origin] = await svc.listItems(U, 'story');
    await svc.editUserItem(U, 'story', origin.id, {
      title: 'Grew up in rural Ohio',
      period: '1990s',
    });
    await svc.recordUserTurnLifeStory(U, 'I grew up in Ohio.', 'c2');
    const [after] = await svc.listItems(U, 'story');
    expect(after).toMatchObject({
      title: 'Grew up in rural Ohio',
      period: '1990s',
      userEdited: true,
    });
    expect(after.sourceConversationIds).toEqual(['c1', 'c2']);
  });

  it('a forgotten story is not learned again, even retold in other words', async () => {
    await svc.recordUserTurnLifeStory(
      U,
      'When I was nine, my brother and I built a treehouse.',
      'c1'
    );
    const [story] = await svc.listItems(U, 'story');
    await svc.forgetItem(U, story.id, 'user_deleted');
    expect(tomb(story.id)).toMatchObject({ reason: 'user_deleted', kind: 'story' });
    const r = await svc.recordUserTurnLifeStory(
      U,
      'I remember when my brother and I built the treehouse.',
      'c2'
    );
    expect(r.stories.map((s) => s.outcome)).toEqual(['skipped_tombstoned']);
    expect(docs('life_story')).toEqual([]);
  });
});

describe('values', () => {
  it('re-hearing a value upserts one document with provenance', async () => {
    await svc.recordUserTurnLifeStory(U, 'Honesty is really important to me.', 'c1');
    await svc.recordUserTurnLifeStory(U, 'What matters most to me is honesty.', 'c2');
    const values = await svc.listValues(U);
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({
      label: 'honesty',
      category: 'authenticity',
      sourceConversationIds: ['c1', 'c2'],
    });
  });

  it('a deleted value stays deleted', async () => {
    await svc.recordUserTurnLifeStory(U, 'Family matters most to me.', 'c1');
    const [v] = await svc.listValues(U);
    await svc.forgetItem(U, v.id);
    await svc.recordUserTurnLifeStory(U, 'Family matters most to me.', 'c2');
    expect(await svc.listValues(U)).toEqual([]);
  });
});

describe('memory control', () => {
  beforeEach(async () => {
    await consent.setCategoryConsent(U, 'beliefs', true, 'page');
    await svc.recordUserTurnLifeStory(U, 'I grew up in Ohio. Family matters most to me.', 'c1');
    await svc.recordUserTurnLifeStory(
      U,
      "I'm Catholic. When I was 12, I won the regional spelling bee.",
      'c2'
    );
    await svc.createUserItem(U, { area: 'story', kind: 'chapter', title: 'My Berlin years' });
  });

  it('conversation delete removes what came only from it and keeps the rest', async () => {
    const out = await domains.deleteDomainsForConversation(U, ['c1']);
    expect(out.lifeStory).toBeGreaterThan(0);
    expect((await svc.listItems(U, 'story')).map((i) => i.title).sort()).toEqual([
      'I won the regional spelling bee',
      'My Berlin years',
    ]);
    expect(await svc.listValues(U)).toEqual([]);
    await domains.deleteDomainsForConversation(U, ['c2']);
    expect(await svc.listItems(U, 'beliefs')).toEqual([]);
    expect((await svc.listItems(U, 'story')).map((i) => i.title)).toEqual(['My Berlin years']);
  });

  it('fact delete removes items derived only from that fact', async () => {
    await svc.onConversationSummarized(U, 'c3', '', []);
    fake.store.set(`bogle_users/${U}/dynamic_facts/f9`, {
      entityName: 'user',
      key: 'life_theme',
      value: 'Always the caretaker',
      sourceConversationIds: ['c9'],
    });
    await svc.onConversationSummarized(U, 'c9', '', []);
    const theme = (await svc.listItems(U, 'story')).find((i) => i.kind === 'theme');
    expect(theme?.sourceFactIds).toEqual(['f9']);
    await domains.deleteDomainsForFacts(U, ['f9']);
    // still carries conversation c9, so it stays with the fact removed
    const after = (await svc.listItems(U, 'story')).find((i) => i.kind === 'theme');
    expect(after?.sourceFactIds).toEqual([]);
    await domains.deleteDomainsForConversation(U, ['c9']);
    expect((await svc.listItems(U, 'story')).find((i) => i.kind === 'theme')).toBeUndefined();
  });

  it('export has story, values, beliefs and the legacy narrative', async () => {
    fake.store.set(`bogle_users/${U}/life_chapters/ch1`, {
      title: 'The Shift',
      sourceConversationIds: ['c1'],
    });
    const out = (await domains.exportDomains(U)) as Record<string, Record<string, unknown[]>>;
    expect(out.lifeStory.story).toHaveLength(3);
    expect(out.lifeStory.values).toHaveLength(1);
    expect(out.lifeStory.lifeChapters).toHaveLength(1);
    expect(out.beliefs.items).toHaveLength(1);
  });

  it('delete-all wipes story, values, beliefs and legacy chapters', async () => {
    fake.store.set(`bogle_users/${U}/life_chapters/ch1`, { title: 'The Shift' });
    fake.store.set(`bogle_users/${U}/meta/identity`, { coreValues: [] });
    const out = await domains.deleteAllDomains(U);
    expect(out.lifeStory).toBeGreaterThan(0);
    expect(out.beliefs).toBe(1);
    for (const c of ['life_story', 'values', 'beliefs_memory', 'life_chapters', 'meta']) {
      expect(docs(c)).toEqual([]);
    }
  });

  it('voice forget finds and forgets a story and a belief', async () => {
    const found = await domains.findInDomains(U, 'spelling bee');
    expect(found[0]).toMatchObject({ domain: 'lifeStory' });
    expect(await domains.forgetInDomain(U, 'lifeStory', found[0].id)).toBe(true);
    expect(tomb(found[0].id)).toMatchObject({ reason: 'voice_forget' });
    const belief = await domains.findInDomains(U, 'catholic');
    expect(belief[0]).toMatchObject({ domain: 'beliefs' });
    expect(await domains.forgetInDomain(U, 'beliefs', belief[0].id)).toBe(true);
    expect(await svc.listItems(U, 'beliefs')).toEqual([]);
  });
});
