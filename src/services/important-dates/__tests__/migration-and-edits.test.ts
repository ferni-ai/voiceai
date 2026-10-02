import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, type FakeDb } from './fake-firestore.js';

let db: FakeDb;
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => db }));

import {
  createUserDate,
  editImportantDate,
  findImportantDates,
  importantDateIdFor,
  listImportantDates,
  parsePatch,
  upsertImportantDate,
} from '../index.js';
import { migrateLegacyDates, resetMigrationCacheForTests } from '../legacy-migration.js';
import { loadMilestoneDates, trackMilestoneDate } from '../milestone-bridge.js';

const U = 'user-1';

beforeEach(() => {
  db = createFakeDb();
  resetMigrationCacheForTests();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-05-01T12:00:00Z') });
});
afterEach(() => vi.useRealTimers());

describe('legacy migration', () => {
  it('copies special_dates, milestone tracked dates and extracted signal dates once', async () => {
    db.docs.set(`bogle_users/${U}/special_dates/mom_birthday`, {
      contactName: 'Mom',
      dateType: 'birthday',
      date: '03-15',
      year: 1960,
    });
    db.docs.set(`bogle_users/${U}/milestone_detector/profile`, {
      trackedDates: [
        { label: 'Wedding anniversary', date: '2015-06-20', type: 'anniversary', recurring: true },
      ],
    });
    db.docs.set(`bogle_users/${U}/human_signals/important_dates`, {
      items: [
        {
          type: 'loss_anniversary',
          label: "Dad's passing",
          month: 11,
          day: 2,
          sentiment: 'sensitive',
          wantsAcknowledgment: false,
        },
        { type: 'birthday', label: "Mom's birthday", month: 3, day: 15, relatedPerson: 'Mom' },
      ],
    });

    const listed = await listImportantDates(U);
    expect(listed.success).toBe(true);
    const byTitle = Object.fromEntries(
      (listed.success ? listed.data : []).map((r) => [r.title, r])
    );
    expect(Object.keys(byTitle).sort()).toEqual([
      "Dad's passing",
      "Mom's birthday",
      'Wedding anniversary',
    ]);
    // The user's own record wins over the extracted duplicate (same key).
    expect(byTitle["Mom's birthday"]).toMatchObject({
      source: 'user',
      date: '1960-03-15',
      kind: 'birthday',
    });
    expect(byTitle['Wedding anniversary']).toMatchObject({
      source: 'user',
      kind: 'anniversary',
      date: '2015-06-20',
    });
    expect(byTitle["Dad's passing"]).toMatchObject({ source: 'detected', subtype: 'memorial' });
    expect(byTitle["Dad's passing"].reminders.enabled).toBe(false);
    expect(db.read(`bogle_users/${U}/reminder_settings/legacy_migration`)?.copied).toBe(4);

    resetMigrationCacheForTests();
    expect(await migrateLegacyDates(U)).toBe(0);
  });
});

describe('user edits', () => {
  it('creates a user date with custom reminders and channels', async () => {
    const r = await createUserDate(U, {
      title: "Sam's birthday",
      date: '--06-12',
      recurring: true,
      kind: 'birthday',
      person: 'Sam',
      reminderOffsets: [14],
      channels: ['push'],
    });
    expect(r.success && r.data).toMatchObject({
      id: importantDateIdFor('birthday:sam'),
      reminders: { enabled: true, offsets: [14], custom: true },
      channels: ['push'],
      source: 'user',
    });
  });

  it("editing a detected date makes it the user's, and custom offsets survive detection", async () => {
    const up = await upsertImportantDate(U, {
      key: 'anniversary:self',
      title: 'Anniversary',
      date: '--06-12',
      recurring: true,
      kind: 'anniversary',
      source: 'detected',
      sourceConversationIds: ['c1'],
      confidence: 0.5,
    });
    const id = up.success ? up.data.id : '';
    const edited = await editImportantDate(U, id, {
      title: 'Our anniversary',
      reminderOffsets: [3],
    });
    expect(edited.success && edited.data).toMatchObject({
      source: 'user',
      title: 'Our anniversary',
    });
    await upsertImportantDate(U, {
      key: 'anniversary:self',
      title: 'Anniversary',
      date: '--06-13',
      recurring: true,
      kind: 'anniversary',
      source: 'detected',
      sourceConversationIds: ['c2'],
      confidence: 0.9,
    });
    const doc = db.read(`bogle_users/${U}/important_dates/${id}`)!;
    expect(doc).toMatchObject({
      title: 'Our anniversary',
      date: '--06-12',
      reminders: { offsets: [3], custom: true },
    });
  });

  it('rejects inconsistent edits and bad patches', async () => {
    await createUserDate(U, {
      title: 'Taxes',
      date: '2026-06-15',
      recurring: false,
      kind: 'deadline',
    });
    const id = importantDateIdFor('deadline:taxes');
    const bad = await editImportantDate(U, id, { date: '--06-15' });
    expect(!bad.success && bad.error.code).toBe('invalid_input');
    expect(parsePatch({ reminderOffsets: [-1] }).success).toBe(false);
    expect(parsePatch({ channels: ['fax'] }).success).toBe(false);
    expect(parsePatch({ kind: 'party' }).success).toBe(false);
    expect(parsePatch({ title: 'x', channels: null }).success).toBe(true);
  });

  it('finds dates by spoken reference', async () => {
    await createUserDate(U, {
      title: "Sam's birthday",
      date: '--06-12',
      recurring: true,
      kind: 'birthday',
      person: 'Sam',
    });
    await createUserDate(U, {
      title: 'Tax return',
      date: '2026-06-15',
      recurring: false,
      kind: 'deadline',
    });
    const sam = await findImportantDates(U, "Sam's birthday");
    expect(sam.success && sam.data.map((r) => r.title)).toEqual(["Sam's birthday"]);
    const tax = await findImportantDates(U, 'the tax deadline');
    expect(tax.success && tax.data.map((r) => r.title)).toEqual(['Tax return']);
  });
});

describe('milestone bridge', () => {
  it('stores detector dates canonically and reads back anniversaries with a year', async () => {
    const t = await trackMilestoneDate(U, 'Started at Acme', '2021-09-01', 'career');
    expect(t.id).toBe(importantDateIdFor('event:started at acme'));
    await createUserDate(U, {
      title: "Sam's birthday",
      date: '1990-06-12',
      recurring: true,
      kind: 'birthday',
      person: 'Sam',
    });
    const dates = await loadMilestoneDates(U);
    expect(dates.map((d) => [d.label, d.type])).toEqual([['Started at Acme', 'career']]);
  });
});
