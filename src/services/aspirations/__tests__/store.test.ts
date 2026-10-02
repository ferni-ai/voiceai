import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, type FakeDb } from '../../important-dates/__tests__/fake-firestore.js';

let db: FakeDb;
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => db }));

import {
  aspirationIdFor,
  deleteAllAspirations,
  deleteAspiration,
  deleteAspirationsFor,
  editAspiration,
  exportAspirations,
  getAspiration,
  isConfirmed,
  listAspirations,
  normalizeAspirationTitle,
  onConversationSummarized,
  recordCheckIn,
  upsertAspiration,
  type AspirationInput,
} from '../index.js';
import { resetMigrationCacheForTests } from '../legacy-migration.js';
import { setUserPreferencesModuleForTests } from '../../important-dates/boundaries-adapter.js';

const U = 'user-1';
const path = (id: string) => `bogle_users/${U}/aspirations/${id}`;
const dream = (over: Partial<AspirationInput> = {}): AspirationInput => ({
  level: 'dream',
  title: 'live by the sea',
  source: 'explicit',
  confidence: 0.9,
  sourceConversationIds: ['c1'],
  ...over,
});

beforeEach(() => {
  db = createFakeDb();
  resetMigrationCacheForTests();
  setUserPreferencesModuleForTests(null);
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-06-01T15:00:00Z') });
});
afterEach(() => vi.useRealTimers());

describe('identity', () => {
  it('converges phrasings of the same item on one id', () => {
    expect(normalizeAspirationTitle('Someday I want to live by the sea!')).toBe('live by the sea');
    expect(normalizeAspirationTitle("I've always wanted to visit Japan")).toBe('visit japan');
    expect(normalizeAspirationTitle('My goal is to run a half marathon')).toBe(
      'run a half marathon'
    );
    expect(aspirationIdFor('dream', 'Someday I want to live by the sea')).toBe(
      aspirationIdFor('dream', 'live by the sea')
    );
    expect(aspirationIdFor('dream', 'x y z')).not.toBe(aspirationIdFor('goal', 'x y z'));
    expect(aspirationIdFor('habit', 'meditate')).toMatch(/^asp_[a-f0-9]{24}$/);
  });
});

describe('upsert', () => {
  it('creates, then merges evidence once per conversation', async () => {
    const first = await upsertAspiration(U, dream());
    expect(first.success && first.data.status).toBe('created');
    const id = aspirationIdFor('dream', 'live by the sea');
    await upsertAspiration(U, dream({ title: 'Someday I want to live by the sea' }));
    expect(db.read(path(id))?.evidenceCount).toBe(1); // same conversation
    await upsertAspiration(U, dream({ sourceConversationIds: ['c2'], why: 'the quiet' }));
    const doc = db.read(path(id));
    expect(doc?.evidenceCount).toBe(2);
    expect(doc?.why).toBe('the quiet');
    expect(doc?.sourceConversationIds).toEqual(['c1', 'c2']);
  });

  it('leaves user-edited items alone except provenance', async () => {
    const created = await upsertAspiration(U, dream());
    const id = created.success ? created.data.id : '';
    await editAspiration(U, id, { title: 'a cottage by the sea', why: 'mine' });
    // Same id is still the original title's id.
    const out = await upsertAspiration(U, dream({ why: 'auto', sourceConversationIds: ['c9'] }));
    expect(out.success && out.data.status).toBe('provenance_merged');
    const doc = db.read(path(id));
    expect(doc?.title).toBe('a cottage by the sea');
    expect(doc?.why).toBe('mine');
    expect(doc?.sourceConversationIds).toEqual(['c1', 'c9']);
  });

  it('only links a child under a higher level', async () => {
    const g = await upsertAspiration(U, {
      level: 'goal',
      title: 'run a half marathon',
      source: 'explicit',
      confidence: 1,
    });
    const goalId = g.success ? g.data.id : '';
    const h = await upsertAspiration(U, {
      level: 'habit',
      title: 'run three times a week',
      parentId: goalId,
      source: 'explicit',
      confidence: 1,
    });
    expect(h.success).toBe(true);
    const bad = await upsertAspiration(U, {
      level: 'dream',
      title: 'be a runner',
      parentId: goalId,
      source: 'explicit',
      confidence: 1,
    });
    expect(!bad.success && bad.error.code).toBe('invalid_input');
    const missing = await upsertAspiration(U, { ...dream(), level: 'goal', parentId: 'asp_nope' });
    expect(!missing.success && missing.error.message).toBe('parent not found');
  });

  it('rejects invalid input', async () => {
    const r = await upsertAspiration(U, dream({ title: '  ' }));
    expect(!r.success && r.error.code).toBe('invalid_input');
    const t = await upsertAspiration(U, dream({ level: 'goal', targetDate: 'June' }));
    expect(!t.success && t.error.code).toBe('invalid_input');
  });
});

describe('inferred threshold', () => {
  it('needs two conversations (or strong confidence) before it counts', async () => {
    const summary = 'They hope to someday open a small bakery.';
    await onConversationSummarized(U, 'c1', summary, []);
    let listed = await listAspirations(U);
    const item = listed.success ? listed.data[0] : undefined;
    expect(item?.source).toBe('inferred');
    expect(item && isConfirmed(item)).toBe(false);
    await onConversationSummarized(U, 'c1', summary, []); // same conversation: no new evidence
    await onConversationSummarized(U, 'c2', 'Dreams of open a small bakery.', []);
    listed = await listAspirations(U);
    const again = listed.success ? listed.data[0] : undefined;
    expect(again?.evidenceCount).toBe(2);
    expect(again && isConfirmed(again)).toBe(true);
  });

  it('treats first-person turns as explicit', async () => {
    await onConversationSummarized(U, 'c1', '', [
      { role: 'user', text: 'My goal is to learn Spanish.' },
    ]);
    const got = await getAspiration(U, aspirationIdFor('goal', 'learn Spanish'));
    expect(got.success && got.data.source).toBe('explicit');
  });
});

describe('delete, cascade, export', () => {
  it('tombstones deletes; inferred capture skips them, explicit re-add clears them', async () => {
    const c = await upsertAspiration(U, dream());
    const id = c.success ? c.data.id : '';
    const child = await upsertAspiration(U, {
      level: 'goal',
      title: 'buy a boat',
      parentId: id,
      source: 'explicit',
      confidence: 1,
    });
    const del = await deleteAspiration(U, id);
    expect(del.success && del.data.unlinked).toBe(1);
    expect(db.read(`bogle_users/${U}/memory_tombstones/${id}`)?.kind).toBe('aspiration');
    expect(db.read(path(child.success ? child.data.id : ''))?.parentId).toBeNull();
    const skipped = await upsertAspiration(U, dream({ source: 'inferred' }));
    expect(skipped.success && skipped.data.status).toBe('skipped_tombstoned');
    const back = await upsertAspiration(U, dream());
    expect(back.success && back.data.status).toBe('created');
  });

  it('cascades a conversation delete, keeping edited and page items', async () => {
    await upsertAspiration(U, dream()); // only c1
    await upsertAspiration(U, {
      ...dream(),
      title: 'see the aurora',
      sourceConversationIds: ['c1', 'c2'],
    });
    const h = await upsertAspiration(U, {
      level: 'habit',
      title: 'stretch',
      source: 'explicit',
      confidence: 1,
    });
    const hid = h.success ? h.data.id : '';
    await recordCheckIn(U, hid, { status: 'done', conversationId: 'c1' });
    const out = await deleteAspirationsFor(U, 'c1');
    expect(out.success && out.data).toEqual({ updated: 2, deleted: 1 });
    expect(db.read(path(aspirationIdFor('dream', 'live by the sea')))).toBeUndefined();
    expect(
      db.read(path(aspirationIdFor('dream', 'see the aurora')))?.sourceConversationIds
    ).toEqual(['c2']);
    const habit = db.read(path(hid)) as { habit: { checkIns: unknown[] } };
    expect(habit.habit.checkIns).toEqual([]);
  });

  it('exports and wipes everything but the migration marker', async () => {
    await upsertAspiration(U, dream());
    const ex = await exportAspirations(U);
    expect(ex.success && ex.data[0]).toMatchObject({
      level: 'dream',
      title: 'live by the sea',
      status: 'active',
    });
    const wiped = await deleteAllAspirations(U);
    expect(wiped.success && wiped.data.deleted).toBe(1);
    expect(db.read(`bogle_users/${U}/aspirations_meta/legacy_migration`)).toBeDefined();
    const listed = await listAspirations(U);
    expect(listed.success && listed.data).toEqual([]);
  });
});
