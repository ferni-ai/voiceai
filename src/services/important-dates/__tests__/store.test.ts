import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, type FakeDb } from './fake-firestore.js';

let db: FakeDb;
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => db }));

import {
  deleteAllImportantDates,
  deleteImportantDate,
  deleteImportantDatesFor,
  exportImportantDates,
  getUpcomingDates,
  importantDateIdFor,
  importantDateKey,
  listImportantDates,
  upsertImportantDate,
  type ImportantDateInput,
} from '../index.js';
import { resetMigrationCacheForTests } from '../legacy-migration.js';

const U = 'user-1';
const base = (over: Partial<ImportantDateInput> = {}): ImportantDateInput => ({
  key: 'birthday:sam',
  title: "Sam's birthday",
  date: '--06-12',
  recurring: true,
  kind: 'birthday',
  source: 'detected',
  sourceConversationIds: ['c1'],
  confidence: 0.6,
  ...over,
});
const path = (id: string) => `bogle_users/${U}/important_dates/${id}`;

beforeEach(() => {
  db = createFakeDb();
  resetMigrationCacheForTests();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-06-01T15:00:00Z') });
});
afterEach(() => vi.useRealTimers());

describe('identity', () => {
  it('derives the same id from equivalent keys', () => {
    expect(importantDateIdFor('Birthday:Sam')).toBe(importantDateIdFor(' birthday:sam '));
    expect(importantDateIdFor('birthday:sam')).toMatch(/^date_[a-f0-9]{24}$/);
    expect(importantDateKey({ kind: 'anniversary', person: 'my' })).toBe('anniversary:self');
    expect(importantDateKey({ kind: 'birthday', person: "Sam's" })).toBe('birthday:sam');
    expect(importantDateKey({ kind: 'deadline', title: 'Tax return!' })).toBe(
      'deadline:tax return'
    );
  });
});

describe('upsertImportantDate', () => {
  it('creates once and upserts by key (no duplicates), unioning provenance', async () => {
    const a = await upsertImportantDate(U, base());
    const b = await upsertImportantDate(
      U,
      base({ sourceConversationIds: ['c2'], confidence: 0.9 })
    );
    expect(a.success && a.data.status).toBe('created');
    expect(b.success && b.data.status).toBe('updated');
    const listed = await listImportantDates(U);
    expect(listed.success && listed.data).toHaveLength(1);
    const rec = listed.success ? listed.data[0] : null;
    expect(rec?.sourceConversationIds).toEqual(['c1', 'c2']);
    expect(rec?.confidence).toBe(0.9);
    expect(rec?.reminders).toEqual({ enabled: true, offsets: [7, 1, 0], custom: false });
    expect(rec?.nextReminderAt).toBeTruthy();
  });

  it('never lets a detected upsert overwrite a user date (only provenance is added)', async () => {
    await upsertImportantDate(U, base({ source: 'user', date: '--06-12', confidence: 1 }));
    const r = await upsertImportantDate(
      U,
      base({ date: '--07-01', title: 'Wrong', sourceConversationIds: ['c9'] })
    );
    expect(r.success && r.data.status).toBe('provenance_merged');
    const doc = db.read(path(importantDateIdFor('birthday:sam')))!;
    expect(doc.date).toBe('--06-12');
    expect(doc.title).toBe("Sam's birthday");
    expect(doc.source).toBe('user');
    expect(doc.sourceConversationIds).toEqual(['c1', 'c9']);
  });

  it('lets the user override a detected date', async () => {
    await upsertImportantDate(U, base());
    await upsertImportantDate(U, base({ source: 'user', date: '--06-13', confidence: 1 }));
    const doc = db.read(path(importantDateIdFor('birthday:sam')))!;
    expect(doc.source).toBe('user');
    expect(doc.date).toBe('--06-13');
    expect(doc.userEditedAt).toBeTruthy();
  });

  it('validates input', async () => {
    const r = await upsertImportantDate(U, base({ date: '2026-02-30' }));
    expect(r.success).toBe(false);
    const r2 = await upsertImportantDate(U, base({ date: '--06-12', recurring: false }));
    expect(!r2.success && r2.error.code).toBe('invalid_input');
  });
});

describe('tombstones', () => {
  it('a deleted date is tombstoned; detection cannot re-add it, the user can', async () => {
    const created = await upsertImportantDate(U, base());
    const id = created.success ? created.data.id : '';
    expect((await deleteImportantDate(U, id)).success).toBe(true);
    expect(db.read(`bogle_users/${U}/memory_tombstones/${id}`)?.reason).toBe('user_deleted');

    const again = await upsertImportantDate(U, base());
    expect(again.success && again.data.status).toBe('skipped_tombstoned');
    expect(db.read(path(id))).toBeUndefined();

    const byUser = await upsertImportantDate(U, base({ source: 'user' }));
    expect(byUser.success && byUser.data.status).toBe('created');
    expect(db.read(`bogle_users/${U}/memory_tombstones/${id}`)).toBeUndefined();
  });

  it('deleting an unknown id is not_found', async () => {
    const r = await deleteImportantDate(U, importantDateIdFor('nope'));
    expect(!r.success && r.error.code).toBe('not_found');
  });
});

describe('deleteImportantDatesFor (conversation cascade)', () => {
  it('removes provenance, deletes and tombstones detected dates left with none, keeps user dates', async () => {
    await upsertImportantDate(U, base({ sourceConversationIds: ['c1'] })); // only c1
    await upsertImportantDate(
      U,
      base({ key: 'birthday:ana', title: "Ana's birthday", sourceConversationIds: ['c1', 'c2'] })
    );
    await upsertImportantDate(
      U,
      base({
        key: 'anniversary:self',
        kind: 'anniversary',
        title: 'Your anniversary',
        source: 'user',
        sourceConversationIds: ['c1'],
      })
    );

    const r = await deleteImportantDatesFor(U, 'c1');
    expect(r.success && r.data).toEqual({ updated: 2, deleted: 1 });

    const sam = importantDateIdFor('birthday:sam');
    expect(db.read(path(sam))).toBeUndefined();
    expect(db.read(`bogle_users/${U}/memory_tombstones/${sam}`)).toBeDefined();
    expect(db.read(path(importantDateIdFor('birthday:ana')))?.sourceConversationIds).toEqual([
      'c2',
    ]);
    const mine = db.read(path(importantDateIdFor('anniversary:self')));
    expect(mine?.sourceConversationIds).toEqual([]);
    expect(mine?.source).toBe('user');
  });
});

describe('list / upcoming / export / delete all', () => {
  it('returns upcoming dates soonest first within the window', async () => {
    await upsertImportantDate(U, base()); // June 12
    await upsertImportantDate(
      U,
      base({
        key: 'deadline:taxes',
        kind: 'deadline',
        title: 'Taxes',
        date: '2026-06-03',
        recurring: false,
      })
    );
    await upsertImportantDate(
      U,
      base({ key: 'birthday:zed', title: "Zed's birthday", date: '--12-01' })
    );
    const up = await getUpcomingDates(U, 14);
    expect(up.success && up.data.map((u) => [u.record.title, u.daysUntil])).toEqual([
      ['Taxes', 2],
      ["Sam's birthday", 11],
    ]);
  });

  it('exports and wipes', async () => {
    await upsertImportantDate(U, base());
    const ex = await exportImportantDates(U);
    expect(ex.success && ex.data[0]).toMatchObject({
      title: "Sam's birthday",
      date: '--06-12',
      kind: 'birthday',
    });
    const wiped = await deleteAllImportantDates(U);
    expect(wiped.success && wiped.data.deleted).toBe(1);
    const listed = await listImportantDates(U);
    expect(listed.success && listed.data).toEqual([]);
  });

  it('fails cleanly without storage', async () => {
    db = null as unknown as FakeDb;
    const r = await listImportantDates(U);
    expect(!r.success && r.error.code).toBe('storage_unavailable');
  });
});
