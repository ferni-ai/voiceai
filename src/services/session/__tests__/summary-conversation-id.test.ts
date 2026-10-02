/**
 * Session-end summaries carry the realtime conversation id, in the saved
 * summary and in its vector index metadata.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ indexed: [] as Array<Record<string, unknown>> }));

vi.mock('../../../memory/index.js', () => ({
  indexConversationSummary: vi.fn(async (_userId: string, doc: Record<string, unknown>) => {
    h.indexed.push(doc);
  }),
  summarizeConversation: vi.fn(),
}));

import { indexSummaryForRetrieval, withConversationId } from '../summarization.js';
import type { ConversationSummary } from '../../../types/user-profile.js';

const summary: ConversationSummary = {
  id: 'sum_1',
  sessionId: 'room-abc',
  timestamp: new Date('2026-09-01T10:00:00Z'),
  duration: 300,
  turnCount: 6,
  mainTopics: ['moving to Denver'],
  keyPoints: ['worried about the dog'],
  emotionalArc: 'anxious to hopeful',
};

beforeEach(() => {
  h.indexed = [];
});

describe('withConversationId', () => {
  it('adds the realtime conversation id and keeps the session id', () => {
    expect(withConversationId(summary, 'conv_123')).toEqual({
      ...summary,
      conversationId: 'conv_123',
    });
  });

  it('leaves the summary alone without a conversation id', () => {
    expect(withConversationId(summary, undefined)).toBe(summary);
  });
});

describe('indexSummaryForRetrieval', () => {
  it('puts the conversation id in the index metadata so recall can cite it', async () => {
    await indexSummaryForRetrieval('u1', withConversationId(summary, 'conv_123'));
    expect(h.indexed).toEqual([
      expect.objectContaining({ id: 'sum_1', conversationId: 'conv_123' }),
    ]);
  });

  it('indexes without one when the session had no realtime conversation', async () => {
    await indexSummaryForRetrieval('u1', summary);
    expect(h.indexed[0]).not.toHaveProperty('conversationId');
  });
});
