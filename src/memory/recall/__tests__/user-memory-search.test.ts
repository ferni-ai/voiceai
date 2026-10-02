/**
 * The recall tools search the caller's own memory: their facts, people and
 * past conversations; never another user's, and never persona content.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: vi.fn(() => null) }));

import { FakeFirestore } from '../../dynamic/__tests__/helpers/fake-firestore.js';
import {
  formatConversationHits,
  searchUserConversations,
  searchUserFacts,
  type ConversationHit,
} from '../user-memory-search.js';

const ME = 'user-me';
const OTHER = 'user-other';
let db: FakeFirestore;

function fact(uid: string, id: string, data: Record<string, unknown>) {
  db.docs.set(`bogle_users/${uid}/dynamic_facts/${id}`, { confidence: 0.8, ...data });
}

function conversation(
  uid: string,
  id: string,
  startedAt: string,
  data: Record<string, unknown>,
  turns: Array<Record<string, unknown>> = []
) {
  db.docs.set(`bogle_users/${uid}/conversations/${id}`, {
    startedAt: new Date(startedAt),
    ...data,
  });
  turns.forEach((t, i) => db.docs.set(`bogle_users/${uid}/conversations/${id}/turns/t${i}`, t));
}

beforeEach(() => {
  db = new FakeFirestore();
});

describe('searchUserFacts', () => {
  beforeEach(() => {
    fact(ME, 'f1', {
      entityName: 'Emma',
      key: 'relationship',
      value: 'sister',
      updatedAt: new Date('2026-09-01'),
    });
    fact(ME, 'f2', {
      entityName: 'Emma',
      key: 'lives_in',
      value: 'Denver',
      updatedAt: new Date('2026-09-20'),
    });
    fact(ME, 'f3', { entityName: 'Biscuit', key: 'breed', value: 'golden retriever' }); // legacy: no updatedAt
    fact(ME, 'f4', {
      text: 'My sister Emma is a nurse, not a teacher',
      userEdited: true,
      entityName: 'Emma',
      key: 'job',
      value: 'teacher',
    });
    fact(OTHER, 'x1', { entityName: 'Emma', key: 'secret', value: 'other user data' });
    db.docs.set(`bogle_users/${ME}/dynamic_entities/p1`, {
      name: 'Emma',
      type: 'person',
      attributes: { relationship: 'sister' },
    });
  });

  it("returns this user's facts and people about the topic, user edits verbatim", async () => {
    const hits = await searchUserFacts(
      ME,
      'what do you know about my sister Emma?',
      {},
      { db, embed: null }
    );
    const texts = hits.map((h) => h.text);
    expect(texts).toContain('My sister Emma is a nurse, not a teacher');
    expect(texts).toContain('Emma: lives in = Denver');
    expect(texts.some((t) => t.startsWith('Emma (sister)'))).toBe(true);
    expect(texts.join(' ')).not.toContain('other user data');
    expect(hits.find((h) => h.kind === 'person')?.id).toBe('p1');
  });

  it('finds legacy facts without updatedAt', async () => {
    const hits = await searchUserFacts(ME, 'Biscuit', {}, { db, embed: null });
    expect(hits.map((h) => h.id)).toEqual(['f3']);
  });

  it('caps results', async () => {
    const hits = await searchUserFacts(ME, 'Emma', { maxItems: 1 }, { db, embed: null });
    // One regular fact plus the user-edited one.
    expect(hits).toHaveLength(2);
  });

  it('returns nothing without a user or a database', async () => {
    expect(await searchUserFacts('', 'Emma', {}, { db, embed: null })).toEqual([]);
    expect(await searchUserFacts(ME, 'Emma', {}, { db: null, embed: null })).toEqual([]);
  });
});

describe('searchUserConversations', () => {
  beforeEach(() => {
    conversation(ME, 'conv_old', '2026-09-01T10:00:00Z', {
      summary: 'Talked about the job interview at the hospital',
    });
    conversation(ME, 'conv_new', '2026-09-25T10:00:00Z', {}, [
      {
        role: 'assistant',
        text: 'How did the move go?',
        timestamp: new Date('2026-09-25T10:01:00Z'),
      },
      {
        role: 'user',
        content: 'The move to Denver was exhausting but Emma helped a lot',
        timestamp: new Date('2026-09-25T10:02:00Z'),
      },
    ]);
    conversation(OTHER, 'conv_other', '2026-09-26T10:00:00Z', {
      summary: 'The move to Denver, other person',
    });
  });

  it("finds this user's conversations by summary and by what was said, with dates and ids", async () => {
    const hits = await searchUserConversations(
      ME,
      'the move to Denver',
      {},
      { db, summarySearch: null }
    );
    expect(hits.map((h) => h.conversationId)).toEqual(['conv_new']);
    expect(hits[0].snippet).toBe(
      'They said: "The move to Denver was exhausting but Emma helped a lot"'
    );
    expect(hits[0].date?.toISOString()).toBe('2026-09-25T10:02:00.000Z');

    const interview = await searchUserConversations(
      ME,
      'job interview',
      {},
      { db, summarySearch: null }
    );
    expect(interview.map((h) => h.conversationId)).toEqual(['conv_old']);
    expect(interview[0].source).toBe('summary');
  });

  it('merges vector summary hits scoped to the user, best first', async () => {
    const summarySearch = vi.fn(
      async (_q: string, uid: string): Promise<ConversationHit[]> => [
        {
          conversationId: 'conv_old',
          snippet: 'Hospital job interview prep',
          source: 'summary',
          score: 2.5,
          date: new Date('2026-09-01'),
        },
      ]
    );
    const hits = await searchUserConversations(ME, 'the move to Denver', {}, { db, summarySearch });
    expect(summarySearch).toHaveBeenCalledWith('the move to Denver', ME);
    expect(hits.map((h) => h.conversationId)).toEqual(['conv_old', 'conv_new']);
    const text = formatConversationHits(hits);
    expect(text).toContain('[2026-09-01 · conversation conv_old] Hospital job interview prep');
    expect(text).toContain('[2026-09-25T'.slice(0, 11));
  });

  it('keeps working when the vector store fails', async () => {
    const hits = await searchUserConversations(
      ME,
      'Denver',
      {},
      {
        db,
        summarySearch: async () => {
          throw new Error('vector store down');
        },
      }
    );
    expect(hits.map((h) => h.conversationId)).toEqual(['conv_new']);
  });
});
