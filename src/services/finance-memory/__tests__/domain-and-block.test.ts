/**
 * Money memory through the memory-control registry (conversation and fact
 * cascades, export, delete-all, voice forget "forget what I told you about my
 * debt") and the session-start prompt block (consent, char budget, rounded
 * amounts, kind tone, proactive boundaries).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeFirestore,
  type FakeFirestore,
} from '../../user-preferences/__tests__/fake-firestore.js';
import type { FinanceItem } from '../types.js';

let fake: FakeFirestore;
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => fake,
}));
const dates = vi.hoisted(() => ({
  deleteImportantDate: vi.fn(async () => ({ success: true, data: { deleted: true } })),
}));
vi.mock('../../important-dates/index.js', () => dates);

const consent = await import('../../memory-consent/index.js');
const fin = await import('../index.js');
const domains = await import('../../memory-control/domains.js');
const { registerFinanceMemoryDomain } = await import('../../memory-control/builtin-domains.js');

const U = 'user-1';

async function seed(): Promise<void> {
  await fin.upsertFinanceItem(U, {
    kind: 'debt',
    subject: 'credit card',
    text: 'Paying off their credit card',
    confidence: 0.85,
    source: 'explicit',
    conversationId: 'conv-1',
    amount: { value: 4200, currency: 'USD', said: '$4,200' },
  });
  await fin.upsertFinanceItem(U, {
    kind: 'worry',
    subject: 'rent',
    text: 'Worried about paying rent',
    confidence: 0.7,
    source: 'inferred',
    factId: 'fact-9',
  });
}

beforeEach(async () => {
  fake = createFakeFirestore();
  consent.clearConsentCache();
  fin.clearFinanceBuffers();
  domains.resetMemoryDomains({ loadBuiltIns: false });
  registerFinanceMemoryDomain();
  await consent.setCategoryConsent(U, 'finances', true, 'page');
  await seed();
});

describe('finances memory domain', () => {
  it('conversation delete cascades and tombstones what came only from it', async () => {
    const out = await domains.deleteDomainsForConversation(U, ['conv-1']);
    expect(out.finances).toBe(1);
    expect((await fin.listFinanceItems(U)).map((i) => i.subject)).toEqual(['rent']);
    const id = fin.financeIdFor('debt', 'credit card');
    expect(fake.store.get(`bogle_users/${U}/memory_tombstones/${id}`)).toMatchObject({
      reason: 'conversation_deleted',
    });
  });

  it('deleting the source fact removes what was inferred from it', async () => {
    await domains.deleteDomainsForFacts(U, ['fact-9']);
    expect((await fin.listFinanceItems(U)).map((i) => i.subject)).toEqual(['credit card']);
  });

  it('export contains every item and whether Money is on', async () => {
    const exported = (await domains.exportDomains(U)).finances as {
      enabled: boolean;
      items: FinanceItem[];
    };
    expect(exported.enabled).toBe(true);
    expect(exported.items).toHaveLength(2);
  });

  it('delete-all wipes money memory', async () => {
    const out = await domains.deleteAllDomains(U);
    expect(out.finances).toBe(2);
    expect(await fin.listFinanceItems(U)).toEqual([]);
  });

  it('voice forget: "forget what I told you about my debt"', async () => {
    const found = await domains.findInDomains(U, 'forget what I told you about my debt');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      domain: 'finances',
      label: 'the money note "Paying off their credit card"',
    });
    expect(await domains.forgetInDomain(U, 'finances', found[0]!.id)).toBe(true);
    expect(fake.store.get(`bogle_users/${U}/memory_tombstones/${found[0]!.id}`)).toMatchObject({
      reason: 'voice_forget',
    });
  });

  it('"forget everything about money" matches every money note', async () => {
    expect(await domains.findInDomains(U, 'my money stuff')).toHaveLength(2);
  });
});

describe('prompt block', () => {
  it('is empty with Money off, even with items stored', async () => {
    await consent.setCategoryConsent(U, 'finances', false, 'page');
    expect(await fin.loadFinanceBlock(U, { topicCheck: async () => true })).toBe('');
  });

  it('rounds amounts, stays kind, and fits the budget', async () => {
    const block = await fin.loadFinanceBlock(U, { topicCheck: async () => true });
    expect(block).toContain('Paying off their credit card (about $4k)');
    expect(block).toContain('Never shame, lecture, or give investment advice');
    expect(block).not.toContain('4,200');
    expect(block.length).toBeLessThanOrEqual(fin.DEFAULT_FINANCE_BLOCK_BUDGET);
  });

  it('respects proactive boundaries per item and for money as a whole', async () => {
    const noRent = await fin.loadFinanceBlock(U, {
      topicCheck: async (_u, topic) => !topic.includes('rent'),
    });
    expect(noRent).toContain('credit card');
    expect(noRent).not.toContain('rent');
    const noMoney = await fin.loadFinanceBlock(U, {
      topicCheck: async (_u, topic) => topic !== 'money',
    });
    expect(noMoney).toBe('');
  });

  it('drops lines that do not fit a small budget', () => {
    const now = new Date().toISOString();
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: `fin_${String(i).padStart(24, '0')}`,
      kind: 'debt' as const,
      subject: `loan ${i}`,
      text: `Paying off loan number ${i} which is a long description`,
      status: 'active' as const,
      confidence: 0.8,
      source: 'explicit' as const,
      sourceConversationIds: [],
      sourceFactIds: [],
      mentions: 1,
      userEdited: false,
      firstMentionedAt: now,
      lastMentionedAt: now,
      updatedAt: now,
    }));
    const block = fin.buildFinanceBlock({ items, budget: 400 });
    expect(block.length).toBeLessThanOrEqual(400);
    expect(block.split('\n- ').length - 1).toBeLessThan(6);
    expect(fin.buildFinanceBlock({ items: [], budget: 400 })).toBe('');
  });

  it('formats bills and finished debts', () => {
    const now = new Date().toISOString();
    const base = {
      status: 'active' as const,
      confidence: 0.8,
      source: 'explicit' as const,
      sourceConversationIds: [],
      sourceFactIds: [],
      mentions: 1,
      userEdited: false,
      firstMentionedAt: now,
      lastMentionedAt: now,
      updatedAt: now,
    };
    expect(
      fin.lineFor({
        ...base,
        id: 'fin_1',
        kind: 'bill',
        subject: 'phone bill',
        text: 'Pays phone bill',
        dueDay: 22,
        amount: { value: 85, currency: 'USD', period: 'month', said: '$85 a month' },
      })
    ).toBe('- Pays phone bill (about $85 a month), due the 22nd');
    expect(
      fin.lineFor({
        ...base,
        id: 'fin_2',
        kind: 'debt',
        subject: 'car loan',
        text: 'Paid off their car loan',
        status: 'done',
      })
    ).toBe('- Paid off their car loan (a win)');
  });
});
