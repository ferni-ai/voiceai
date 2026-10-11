import { describe, expect, it } from 'vitest';
import {
  ANSWER_CARD_KEEP_MS,
  createAnswerCard,
  deleteAnswerCardsForUser,
  getAnswerCardForUser,
  isCardId,
  listAnswerCardsForUser,
  newCardId,
  normalizeCardInput,
} from '../answer-cards.js';
import { fakeCardsDb } from './answer-cards-fake-db.js';
import { isApprovalsPageEnabled } from '../flag.js';

describe('card ids', () => {
  it('are 32 random bytes in base64url (256 bits), and never repeat', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newCardId()));
    expect(ids.size).toBe(1000);
    for (const id of ids) {
      expect(isCardId(id)).toBe(true);
      expect(Buffer.from(id, 'base64url')).toHaveLength(32);
    }
  });

  it('reject anything else', () => {
    for (const bad of [
      '',
      'abc',
      `${'a'.repeat(42)}`,
      `${'a'.repeat(44)}`,
      `${'a'.repeat(42)}/`,
      '../../x',
    ]) {
      expect(isCardId(bad)).toBe(false);
    }
  });
});

describe('normalizeCardInput', () => {
  it('keeps only http(s) source links', () => {
    const card = normalizeCardInput({
      kind: 'answer',
      answerText: 'ok',
      sources: [
        { title: 'good', url: 'https://example.org/a' },
        { title: 'plain', url: 'http://example.org/b' },
        { title: 'script', url: 'javascript:alert(1)' },
        { title: 'data', url: 'data:text/html,<b>x</b>' },
        { title: 'relative', url: '/etc/passwd' },
      ],
    });
    expect(card.sources.map((s) => s.title)).toEqual(['good', 'plain']);
  });

  it('drops oversized suggestion HTML whole instead of cutting it', () => {
    const big = `<div>${'x'.repeat(70 * 1024)}</div>`;
    expect(
      normalizeCardInput({
        kind: 'answer',
        answerText: 'a',
        sources: [],
        searchSuggestionsHtml: big,
      }).searchSuggestionsHtml
    ).toBe('');
    expect(
      normalizeCardInput({
        kind: 'answer',
        answerText: 'a',
        sources: [],
        searchSuggestionsHtml: '<b>s</b>',
      }).searchSuggestionsHtml
    ).toBe('<b>s</b>');
  });

  it("drops suggestion HTML carrying anything active, and keeps Google's chips", () => {
    const chips =
      '<style>.chip{border-radius:16px}</style><div class="carousel">' +
      '<a class="chip" href="https://www.google.com/search?q=shins">shins</a></div>';
    const shown = (html: string) =>
      normalizeCardInput({
        kind: 'answer',
        answerText: 'a',
        sources: [],
        searchSuggestionsHtml: html,
      }).searchSuggestionsHtml;
    expect(shown(chips)).toBe(chips);
    for (const bad of [
      `${chips}<script>steal()</script>`,
      `${chips}<img src=x onerror="steal()">`,
      '<a href="javascript:steal()">x</a>',
      '<iframe src="https://evil.example"></iframe>',
      '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    ]) {
      expect(shown(bad)).toBe('');
    }
  });

  it("keeps coach-media's optional fields when valid and leaves out the rest", () => {
    const card = normalizeCardInput({
      kind: 'recommendation',
      answerText: 'Try this one.',
      sources: [],
      webSearchQueries: ['shin splint stretches', ''],
      query: 'shin splint stretches',
      personaId: 'maya',
      pick: {
        kind: 'video',
        title: 'Shin splint rehab',
        by: 'A Physio',
        url: 'https://youtu.be/x',
        length: '12 min',
      },
    });
    expect(card).toMatchObject({
      webSearchQueries: ['shin splint stretches'],
      query: 'shin splint stretches',
      personaId: 'maya',
      pick: {
        kind: 'video',
        title: 'Shin splint rehab',
        by: 'A Physio',
        url: 'https://youtu.be/x',
        length: '12 min',
      },
    });
    const bare = normalizeCardInput({
      kind: 'recommendation',
      answerText: 'x',
      sources: [],
      pick: { kind: 'video', title: 'bad', by: 'x', url: 'javascript:steal()' },
      personaId: '../../etc',
    });
    // Firestore rejects undefined values, so missing fields must be absent, not undefined.
    for (const key of ['pick', 'personaId', 'query', 'expiresAt']) expect(key in bare).toBe(false);
  });

  it('refuses a card with nothing to show', () => {
    expect(() => normalizeCardInput({ kind: 'answer', answerText: '  ', sources: [] })).toThrow();
  });
});

describe('APPROVALS_PAGE', () => {
  it('is off unless exactly on', () => {
    expect(isApprovalsPageEnabled({})).toBe(false);
    expect(isApprovalsPageEnabled({ APPROVALS_PAGE: 'true' })).toBe(false);
    expect(isApprovalsPageEnabled({ APPROVALS_PAGE: 'on' })).toBe(true);
  });
});

describe('createAnswerCard and its reads', () => {
  const INPUT = { kind: 'answer' as const, answerText: 'Calf raises.', sources: [] };

  it('never gives a card to a shared service identity', async () => {
    const { db } = fakeCardsDb();
    for (const owner of ['', 'api-user', 'system']) {
      await expect(createAnswerCard(owner, INPUT, db)).rejects.toThrow();
    }
  });

  it('stores a 90-day deleteAt for the TTL policy', async () => {
    const { db, docs } = fakeCardsDb();
    const { id } = await createAnswerCard('alice', INPUT, db, 1000);
    expect((docs.get(`answer_cards/${id}`)?.deleteAt as Date).getTime()).toBe(
      1000 + ANSWER_CARD_KEEP_MS
    );
  });

  it("reads as missing after the producer's expiresAt", async () => {
    const { db } = fakeCardsDb();
    const { id } = await createAnswerCard('alice', { ...INPUT, expiresAt: 5000 }, db, 1000);
    expect(await getAnswerCardForUser(id, 'alice', db, 5000)).not.toBeNull();
    expect(await getAnswerCardForUser(id, 'alice', db, 5001)).toBeNull();
  });

  it("lists and deletes exactly one user's cards", async () => {
    const { db, docs } = fakeCardsDb();
    await createAnswerCard('alice', INPUT, db);
    await createAnswerCard('alice', INPUT, db);
    const bobs = await createAnswerCard('bob', INPUT, db);
    expect(await listAnswerCardsForUser('alice', db)).toHaveLength(2);
    expect(await deleteAnswerCardsForUser('alice', db)).toBe(2);
    expect(await listAnswerCardsForUser('alice', db)).toHaveLength(0);
    expect(docs.has(`answer_cards/${bobs.id}`)).toBe(true);
  });
});
