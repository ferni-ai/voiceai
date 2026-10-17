/**
 * Answer cards are part of account export and erasure.
 *
 * Runs the REAL DataExportService.exportData / deleteAllData. Mocked:
 * Firestore (a Map) and eraseUserRecord; other erasure steps fail soft.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeCardsDb } from './answer-cards-fake-db.js';

const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof fakeCardsDb> | null }));
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fake.current?.db ?? null,
}));
vi.mock('../../platform/erase-user-record.js', () => ({
  eraseUserRecord: vi.fn(async () => undefined),
}));

const { createAnswerCard } = await import('../answer-cards.js');
const { getDataExportService } = await import('../../data-export.js');

const INPUT = { kind: 'answer' as const, answerText: 'Calf raises.', sources: [] };

beforeEach(() => {
  fake.current = fakeCardsDb();
});

describe('answer cards in account export and erasure', () => {
  it("exports the user's own cards, without owner id or TTL field", async () => {
    await createAnswerCard('alice', INPUT);
    await createAnswerCard('bob', { ...INPUT, answerText: 'not yours' });
    const out = JSON.parse(
      await getDataExportService().exportData('alice', 'json', ['Answer Cards'])
    ) as {
      categories: { answer_cards: Array<Record<string, unknown>> };
    };
    expect(out.categories.answer_cards).toHaveLength(1);
    expect(out.categories.answer_cards[0]).toMatchObject({ answerText: 'Calf raises.' });
    expect(out.categories.answer_cards[0]).not.toHaveProperty('userId');
    expect(out.categories.answer_cards[0]).not.toHaveProperty('deleteAt');
  });

  it("deletes the user's cards on erasure and leaves others' alone", async () => {
    await createAnswerCard('alice', INPUT);
    const bobs = await createAnswerCard('bob', INPUT);
    const results = await getDataExportService().deleteAllData('alice');
    expect(results.answer_cards).toBe(true);
    const left = [...(fake.current?.docs.keys() ?? [])];
    expect(left).toEqual([`answer_cards/${bobs.id}`]);
  });
});
