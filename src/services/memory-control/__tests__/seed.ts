/**
 * Seed data shared by memory-control tests.
 */

import type { FakeFirestore } from './fake-firestore.js';
import type { FakeVectorStore } from './fake-vector-store.js';

export const UID = 'user-a';
export const OTHER = 'user-b';

export const base = (uid: string = UID): string => `bogle_users/${uid}`;

export function seedUser(db: FakeFirestore, vectors: FakeVectorStore, uid: string = UID): void {
  const u = base(uid);
  db.seed(u, {
    name: 'Ana',
    preferences: { verbosity: 'concise' },
    conversationSummaries: [
      { id: 's-old', sessionId: 'sess-old', keyPoints: ['old'] },
      { id: 's1', sessionId: 'sess-1', keyPoints: ['job interview'] },
    ],
    lastConversationSummary: 'Talked about the job interview',
    keyMoments: [{ id: 'k1' }],
  });

  // Conversations: c1 (with a voice session id) and c2
  db.seed(`${u}/conversations/c1`, {
    startedAt: new Date('2026-09-01T10:00:00Z'),
    endedAt: new Date('2026-09-01T10:30:00Z'),
    personaId: 'ferni',
    summary: 'Job interview nerves at Acme',
    turnCount: 3,
    summarized: true,
    sessionId: 'sess-1',
  });
  db.seed(`${u}/conversations/c1/turns/t1`, {
    role: 'user',
    text: 'I have a job interview at Acme',
    timestamp: new Date('2026-09-01T10:01:00Z'),
    turnNumber: 1,
  });
  db.seed(`${u}/conversations/c1/turns/t2`, {
    role: 'assistant',
    content: 'That sounds exciting. How are you feeling?',
    timestamp: new Date('2026-09-01T10:02:00Z'),
    turnNumber: 2,
  });
  db.seed(`${u}/conversations/c1/turns/t3`, {
    role: 'user',
    text: 'Nervous!',
    timestamp: new Date('2026-09-01T10:03:00Z'),
    turnNumber: 3,
  });
  db.seed(`${u}/conversations/c2`, {
    startedAt: new Date('2026-09-10T10:00:00Z'),
    endedAt: new Date('2026-09-10T10:20:00Z'),
    personaId: 'maya',
    summary: 'Morning run habit',
    turnCount: 1,
    summarized: true,
  });
  db.seed(`${u}/conversations/c2/turns/t1`, {
    role: 'user',
    text: 'I ran 5k',
    timestamp: new Date('2026-09-10T10:01:00Z'),
  });

  // Summaries (+ embeddings) for c1
  db.seed(`${u}/summaries/s1-${uid}`, {
    id: `s1-${uid}`,
    sessionId: 'sess-1',
    timestamp: new Date('2026-09-01T10:30:00Z'),
  });
  vectors.add({
    id: `conversation_s1-${uid}`,
    text: 'job interview',
    metadata: { source: 'conversation', userId: uid },
  });

  // Facts
  db.seed(`${u}/dynamic_facts/f-only-c1`, {
    text: 'Has a job interview at Acme',
    category: 'career',
    confidence: 0.8,
    sourceConversationIds: ['c1'],
    userEdited: false,
    updatedAt: new Date('2026-09-01T10:30:00Z'),
  });
  db.seed(`${u}/dynamic_facts/f-both`, {
    text: 'Feels nervous before big events',
    category: 'emotional',
    confidence: 0.7,
    sourceConversationIds: ['c1', 'c2'],
    userEdited: false,
    updatedAt: new Date('2026-09-10T10:30:00Z'),
  });
  db.seed(`${u}/dynamic_facts/f-edited`, {
    text: 'Works in design',
    category: 'career',
    confidence: 0.9,
    sourceConversationIds: ['c1'],
    userEdited: true,
    updatedAt: new Date('2026-09-02T10:30:00Z'),
  });
  db.seed(`${u}/dynamic_facts/f-legacy`, {
    entityName: 'Sarah',
    factType: 'attribute',
    key: 'job',
    value: 'nurse',
    confidence: 0.6,
    sessionId: 'sess-1',
    extractedAt: '2026-09-01T10:10:00.000Z',
  });
  if (uid === UID) {
    vectors.add({
      id: 'conversation_fact_f-only-c1',
      text: 'job interview',
      metadata: { source: 'conversation', userId: uid },
    });
  }

  // People (two docs for the same person) + relationship
  db.seed(`${u}/dynamic_entities/p1`, {
    name: 'Sarah',
    type: 'person',
    attributes: { relationship: 'sister' },
    lastMentioned: new Date('2026-09-01T10:10:00Z'),
    sessionId: 'sess-other',
  });
  db.seed(`${u}/dynamic_entities/p2`, {
    name: 'Sarah',
    type: 'person',
    attributes: { notes: 'Lives in Lisbon' },
    lastMentioned: new Date('2026-09-05T10:10:00Z'),
  });
  db.seed(`${u}/dynamic_entities/place1`, { name: 'Lisbon', type: 'place' });
  db.seed(`${u}/dynamic_entities/e-c1`, {
    name: 'Acme',
    type: 'organization',
    sessionId: 'sess-1',
  });
  db.seed(`${u}/dynamic_relationships/r1`, { source: 'user', target: 'Sarah', type: 'sibling' });

  // Explicit "remember that ..." fact
  db.seed(`${u}/extracted_facts/x1`, {
    fact: 'My favourite colour is green',
    category: 'preference',
    sessionId: 'c1',
    extractedAt: new Date('2026-09-03T10:00:00Z'),
  });
  vectors.add({
    id: `fact_${uid}_123`,
    text: 'My favourite colour is green',
    metadata: { source: 'user_memory', userId: uid },
  });

  db.seed(`${u}/extraction_history/j1`, {
    sessionId: 'sess-1',
    transcript: 'I have a job interview',
  });
  db.seed(`${u}/conversation_threads/th1`, { sessionId: 'sess-1' });
  db.seed(`${u}/conversation_threads/th1/messages/m1`, { role: 'user', content: 'hi' });
  db.seed(`${u}/conversation_threads/th2`, { topic: 'sms' });
  db.seed(`${u}/conversation_threads/th2/messages/m1`, {
    role: 'user',
    content: 'sms',
    sessionId: 'other',
  });
}
