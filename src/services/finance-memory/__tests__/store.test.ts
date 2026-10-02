/**
 * Money memory store and capture: consent gate (off ⇒ nothing stored,
 * switching off stops capture and drops buffers), redaction on every write,
 * amounts only from the user's words, user edits win, tombstones, links to
 * aspirations and important dates (fake Firestore).
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

const asp = vi.hoisted(() => ({
  listAspirations: vi.fn(async () => ({ success: true, data: [] as unknown[] })),
  upsertAspiration: vi.fn(async () => ({
    success: true,
    data: { id: 'asp_aaaaaaaaaaaaaaaaaaaaaaaa', status: 'created' },
  })),
  getAspiration: vi.fn(async () => ({ success: true, data: { userEdited: false } })),
  deleteAspiration: vi.fn(async () => ({ success: true, data: { deleted: true } })),
  titlesOverlap: (a: string, b: string) => a.toLowerCase().includes(b.toLowerCase()),
}));
vi.mock('../../aspirations/index.js', () => asp);

const dates = vi.hoisted(() => ({
  importantDateIdFor: (key: string) => `date_${key.length.toString(16).padStart(24, '0')}`,
  getImportantDate: vi.fn(async () => ({ success: false, error: { message: 'none' } })),
  upsertImportantDate: vi.fn(async () => ({ success: true, data: { status: 'created' } })),
  deleteImportantDate: vi.fn(async () => ({ success: true, data: { deleted: true } })),
}));
vi.mock('../../important-dates/index.js', () => dates);

const consent = await import('../../memory-consent/index.js');
const fin = await import('../index.js');

const U = 'user-1';
const docs = () => [...fake.store.keys()].filter((k) => k.includes('/finance_memory/'));
const stored = () =>
  docs().map((k) => fake.store.get(k) as Record<string, unknown> & { text: string });

const debt = {
  kind: 'debt' as const,
  subject: 'credit card',
  text: 'Paying off their credit card',
  confidence: 0.85,
  source: 'explicit' as const,
  conversationId: 'c1',
  amount: { value: 4000, currency: 'USD' as const, said: '$4,000' },
};

beforeEach(() => {
  fake = createFakeFirestore();
  consent.clearConsentCache();
  fin.clearFinanceBuffers();
  vi.clearAllMocks();
});

describe('consent gate', () => {
  it('stores nothing while Money is off (the default)', async () => {
    expect((await fin.upsertFinanceItem(U, debt)).outcome).toBe('not_consented');
    expect(await fin.recordUserTurnFinances(U, "I'm paying off my credit card", 's1')).toBe(0);
    expect(fin.bufferedFinanceCount(U)).toBe(0);
    const counts = await fin.onConversationSummarized(U, 'c1', '', [
      { role: 'user', text: "We're saving for a house" },
    ]);
    expect(counts).toEqual({ not_consented: 1 });
    expect(docs()).toEqual([]);
    expect(asp.upsertAspiration).not.toHaveBeenCalled();
  });

  it('switching Money off stops capture and drops what was buffered', async () => {
    await consent.setCategoryConsent(U, 'finances', true, 'page');
    expect(await fin.recordUserTurnFinances(U, "I'm paying off my credit card", 's1')).toBe(1);
    expect(fin.bufferedFinanceCount(U)).toBe(1);
    await consent.setCategoryConsent(U, 'finances', false, 'voice');
    expect(fin.bufferedFinanceCount(U)).toBe(0);
    await fin.onConversationSummarized(U, 's1', '', []);
    expect(await fin.recordUserTurnFinances(U, 'Money is tight', 's1')).toBe(0);
    expect(docs()).toEqual([]);
  });

  it('switching off offers deletion: the category store reports and deletes money memory', async () => {
    await consent.setCategoryConsent(U, 'finances', true, 'page');
    await fin.upsertFinanceItem(U, debt);
    await consent.setCategoryConsent(U, 'finances', false, 'page');
    consent.resetCategoryStores();
    const summary = await consent.summarizeCategoryData(U, 'finances');
    expect(summary.byStore.financeMemory).toBe(1);
    const report = await consent.deleteCategoryData(U, 'finances');
    expect(report.byStore.financeMemory).toBe(1);
    expect(docs()).toEqual([]);
  });
});

describe('store', () => {
  beforeEach(async () => {
    await consent.setCategoryConsent(U, 'finances', true, 'page');
  });

  it('re-learning updates one doc, counts conversations and unions provenance', async () => {
    await fin.upsertFinanceItem(U, debt);
    await fin.upsertFinanceItem(U, debt);
    const r = await fin.upsertFinanceItem(U, {
      ...debt,
      subject: 'Credit Card ',
      conversationId: 'c2',
    });
    expect(r.outcome).toBe('updated');
    expect(docs()).toHaveLength(1);
    expect(r.item).toMatchObject({ mentions: 2, sourceConversationIds: ['c1', 'c2'] });
    expect(r.item?.id).toBe(fin.financeIdFor('debt', 'credit card'));
  });

  it('redacts secrets before writing and refuses an item that is only a secret', async () => {
    const r = await fin.upsertFinanceItem(U, {
      ...debt,
      text: 'Paying off the card 4111 1111 1111 1111, pin is 4821',
    });
    expect(r.outcome).toBe('created');
    const raw = JSON.stringify([...fake.store.values()]);
    expect(raw).not.toMatch(/4111|4821/);
    expect(
      (await fin.upsertFinanceItem(U, { ...debt, subject: 'x', text: 'my pin is 4821' })).outcome
    ).toBe('invalid');
  });

  it('keeps amounts only from the user’s own words', async () => {
    await fin.upsertFinanceItem(U, {
      ...debt,
      source: 'inferred',
      amount: { value: 9999, currency: 'USD', said: 'x' },
    });
    expect(stored()[0]!.amount).toBeUndefined();
    await fin.upsertFinanceItem(U, debt);
    expect(stored()[0]!.amount).toMatchObject({ value: 4000 });
  });

  it('the user’s edit wins over later capture; clearing the amount removes it', async () => {
    const { item } = await fin.upsertFinanceItem(U, debt);
    const edited = await fin.editFinanceItem(U, item!.id, {
      text: 'Paying down the Visa',
      amount: null,
    });
    expect(edited.success && edited.data).toMatchObject({
      userEdited: true,
      text: 'Paying down the Visa',
    });
    expect(stored()[0]!.amount).toBeUndefined();
    const again = await fin.upsertFinanceItem(U, { ...debt, conversationId: 'c9' });
    expect(again.outcome).toBe('provenance_only');
    expect(stored()[0]).toMatchObject({
      text: 'Paying down the Visa',
      sourceConversationIds: ['c1', 'c9'],
    });
  });

  it('edits are validated and redacted', async () => {
    const { item } = await fin.upsertFinanceItem(U, debt);
    expect(await fin.editFinanceItem(U, item!.id, {})).toEqual({
      success: false,
      error: 'invalid',
    });
    expect(await fin.editFinanceItem(U, item!.id, { dueDay: 40 })).toEqual({
      success: false,
      error: 'invalid',
    });
    expect(await fin.editFinanceItem(U, 'fin_000000000000000000000000', { text: 'x y z' })).toEqual(
      {
        success: false,
        error: 'not_found',
      }
    );
    const r = await fin.editFinanceItem(U, item!.id, {
      text: 'Card 4111111111111111 is nearly paid',
    });
    expect(r.success && r.data.text).not.toContain('4111');
  });

  it('deleted stays deleted (tombstone) and the bill reminder goes too', async () => {
    const { item } = await fin.upsertFinanceItem(U, debt);
    expect(await fin.forgetFinanceItem(U, item!.id, 'user_deleted')).toBe(true);
    expect(fake.store.get(`bogle_users/${U}/memory_tombstones/${item!.id}`)).toMatchObject({
      reason: 'user_deleted',
      kind: 'finance',
    });
    expect((await fin.upsertFinanceItem(U, debt)).outcome).toBe('tombstoned');
  });
});

describe('capture', () => {
  beforeEach(async () => {
    await consent.setCategoryConsent(U, 'finances', true, 'page');
  });

  it('learns from the user’s turns when the conversation is summarized', async () => {
    await fin.recordUserTurnFinances(
      U,
      "I'm paying off my credit card, about $4,000 left.",
      'sess-1'
    );
    expect(docs()).toHaveLength(0); // buffered, not yet written
    const counts = await fin.onConversationSummarized(U, 'conv-1', 'They talked about money.', [
      { role: 'user', text: "We're saving for a house." },
      { role: 'assistant', text: "I'm paying off my car loan" }, // not the user's words
    ]);
    expect(counts.created).toBe(2);
    const items = await fin.listFinanceItems(U);
    expect(items.map((i) => i.kind).sort()).toEqual(['debt', 'savings']);
    expect(items.find((i) => i.kind === 'debt')?.amount?.value).toBe(4000);
    expect(fin.bufferedFinanceCount(U)).toBe(0);
  });

  it('links a savings goal to aspirations instead of duplicating it', async () => {
    await fin.onConversationSummarized(U, 'conv-1', '', [
      { role: 'user', text: "We're saving for a house." },
    ]);
    expect(asp.upsertAspiration).toHaveBeenCalledWith(
      U,
      expect.objectContaining({ level: 'goal', title: 'Save for a house', category: 'financial' })
    );
    expect(stored()[0]).toMatchObject({
      aspirationId: 'asp_aaaaaaaaaaaaaaaaaaaaaaaa',
      aspirationCreated: true,
    });
  });

  it('reuses an existing goal with an overlapping title', async () => {
    asp.listAspirations.mockResolvedValueOnce({
      success: true,
      data: [{ id: 'asp_bbbbbbbbbbbbbbbbbbbbbbbb', title: 'Save for a house', status: 'active' }],
    });
    await fin.onConversationSummarized(U, 'conv-1', '', [
      { role: 'user', text: "We're saving for a house." },
    ]);
    expect(asp.upsertAspiration).not.toHaveBeenCalled();
    expect(stored()[0]).toMatchObject({ aspirationId: 'asp_bbbbbbbbbbbbbbbbbbbbbbbb' });
    expect(stored()[0]!.aspirationCreated).toBeUndefined();
  });

  it('a bill with a due day is reminded through important dates', async () => {
    await fin.onConversationSummarized(U, 'conv-1', '', [
      { role: 'user', text: 'My rent is due on the 1st.' },
    ]);
    expect(dates.upsertImportantDate).toHaveBeenCalledWith(
      U,
      expect.objectContaining({
        kind: 'deadline',
        subtype: 'bill',
        title: 'Rent due',
        recurring: false,
      })
    );
    expect(typeof stored()[0]!.dateId).toBe('string');
  });

  it('learns from finance facts about the user (no amounts) with fact provenance', async () => {
    fake.store.set(`bogle_users/${U}/dynamic_facts/fact-1`, {
      entityName: 'user',
      factType: 'finance',
      category: 'finances',
      key: 'money_worry',
      value: 'worried about $3k of medical bills',
      confidence: 0.8,
      sourceConversationIds: ['conv-2'],
    });
    await fin.onConversationSummarized(U, 'conv-2', '', []);
    const [item] = await fin.listFinanceItems(U);
    expect(item).toMatchObject({ kind: 'worry', source: 'inferred', sourceFactIds: ['fact-1'] });
    expect(item!.amount).toBeUndefined();
    expect(item!.text).not.toContain('3k');
  });
});

describe('dates', () => {
  it('nextDueDate picks the next matching day and clamps short months', () => {
    expect(fin.nextDueDate(1, new Date('2026-10-02T12:00:00Z'))).toBe('2026-11-01');
    expect(fin.nextDueDate(15, new Date('2026-10-02T12:00:00Z'))).toBe('2026-10-15');
    expect(fin.nextDueDate(31, new Date('2026-02-10T12:00:00Z'))).toBe('2026-02-28');
  });

  it('savingsGoalTitle reads naturally', () => {
    expect(fin.savingsGoalTitle('house')).toBe('Save for a house');
    expect(fin.savingsGoalTitle('emergency fund')).toBe('Build an emergency fund');
    expect(fin.savingsGoalTitle('our wedding')).toBe('Save for our wedding');
  });
});
