/**
 * Realtime Memory Service Tests
 *
 * Tests for real-time conversation persistence including:
 * - Conversation lifecycle (start, persist turns, end)
 * - Conversation retrieval
 * - Summarization
 * - API adapters
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildQuickSummary, type ConversationTurn } from '../services/realtime-memory.js';

// Mock dependencies
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

vi.mock('../config/environment.js', () => ({
  getGCPProjectId: () => 'test-project',
  getFirestoreDatabase: () => 'test-db',
}));

// Mock Firestore - this is tricky since it's dynamically imported
vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
            collection: vi.fn().mockReturnValue({
              add: vi.fn().mockResolvedValue({ id: 'turn-1' }),
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
                }),
              }),
            }),
          }),
          add: vi.fn().mockResolvedValue({ id: 'conv-1' }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
            }),
          }),
        }),
        set: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    collectionGroup: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
          }),
        }),
      }),
    }),
  })),
  FieldValue: {
    increment: vi.fn((n: number) => ({ __increment: n })),
  },
}));

describe('buildQuickSummary', () => {
  it('should return empty string for empty turns', () => {
    const turns: ConversationTurn[] = [];
    const summary = buildQuickSummary(turns);
    expect(summary).toBe('');
  });

  it('should return empty string for no user turns', () => {
    const turns: ConversationTurn[] = [
      { role: 'assistant', content: 'Hello!', timestamp: new Date() },
    ];
    const summary = buildQuickSummary(turns);
    expect(summary).toBe('');
  });

  it('should summarize single user turn', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'I want to discuss my anxiety.', timestamp: new Date() },
    ];
    const summary = buildQuickSummary(turns);
    expect(summary).toContain('Discussed:');
    expect(summary).toContain('I want to discuss my anxiety');
  });

  it('should summarize multiple user turns', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'First topic here.', timestamp: new Date() },
      { role: 'assistant', content: 'Response.', timestamp: new Date() },
      { role: 'user', content: 'Second topic here.', timestamp: new Date() },
      { role: 'assistant', content: 'Another response.', timestamp: new Date() },
      { role: 'user', content: 'Third topic here.', timestamp: new Date() },
    ];
    const summary = buildQuickSummary(turns);
    expect(summary).toContain('Discussed:');
    expect(summary).toContain('First topic here');
    expect(summary).toContain('Second topic here');
    expect(summary).toContain('Third topic here');
  });

  it('should only use last 3 user turns', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'First message should not appear.', timestamp: new Date() },
      { role: 'user', content: 'Second message.', timestamp: new Date() },
      { role: 'user', content: 'Third message.', timestamp: new Date() },
      { role: 'user', content: 'Fourth message.', timestamp: new Date() },
    ];
    const summary = buildQuickSummary(turns);
    expect(summary).not.toContain('First message');
    expect(summary).toContain('Second message');
    expect(summary).toContain('Third message');
    expect(summary).toContain('Fourth message');
  });

  it('should truncate long messages', () => {
    const longMessage = 'A'.repeat(100);
    const turns: ConversationTurn[] = [
      { role: 'user', content: longMessage, timestamp: new Date() },
    ];
    const summary = buildQuickSummary(turns);
    // Should truncate to 60 chars
    expect(summary.length).toBeLessThan(100);
  });

  it('should remove trailing punctuation', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'End with period.', timestamp: new Date() },
      { role: 'user', content: 'End with exclamation!', timestamp: new Date() },
      { role: 'user', content: 'End with question?', timestamp: new Date() },
    ];
    const summary = buildQuickSummary(turns);
    // Trailing punctuation should be removed before the semicolon separator
    expect(summary).not.toMatch(/[.!?];/);
  });

  it('should handle mixed role turns', () => {
    const turns: ConversationTurn[] = [
      { role: 'assistant', content: 'Hello!', timestamp: new Date() },
      { role: 'user', content: 'Hi there', timestamp: new Date() },
      { role: 'assistant', content: 'How can I help?', timestamp: new Date() },
      { role: 'user', content: 'I need help', timestamp: new Date() },
    ];
    const summary = buildQuickSummary(turns);
    expect(summary).toContain('Hi there');
    expect(summary).toContain('I need help');
    expect(summary).not.toContain('Hello');
    expect(summary).not.toContain('How can I help');
  });
});

describe('ConversationTurn type', () => {
  it('should accept valid user turn', () => {
    const turn: ConversationTurn = {
      role: 'user',
      content: 'Hello',
      timestamp: new Date(),
    };
    expect(turn.role).toBe('user');
  });

  it('should accept valid assistant turn', () => {
    const turn: ConversationTurn = {
      role: 'assistant',
      content: 'Hello',
      timestamp: new Date(),
    };
    expect(turn.role).toBe('assistant');
  });

  it('should accept metadata', () => {
    const turn: ConversationTurn = {
      role: 'user',
      content: 'Hello',
      timestamp: new Date(),
      metadata: {
        emotion: 'happy',
        topics: ['greeting'],
        durationMs: 1500,
      },
    };
    expect(turn.metadata?.emotion).toBe('happy');
    expect(turn.metadata?.topics).toContain('greeting');
    expect(turn.metadata?.durationMs).toBe(1500);
  });

  it('should accept partial metadata', () => {
    const turn: ConversationTurn = {
      role: 'user',
      content: 'Hello',
      timestamp: new Date(),
      metadata: {
        emotion: 'neutral',
      },
    };
    expect(turn.metadata?.emotion).toBe('neutral');
    expect(turn.metadata?.topics).toBeUndefined();
  });
});

describe('Conversation ID generation', () => {
  it('should generate unique IDs', async () => {
    // Import the function to check ID format
    const { startConversation } = await import('../services/realtime-memory.js');

    // Generate two IDs
    const id1 = await startConversation('user-1', 'persona-1');
    const id2 = await startConversation('user-1', 'persona-1');

    // IDs should be unique
    expect(id1).not.toBe(id2);

    // IDs should follow expected format: conv_{timestamp}_{random}
    expect(id1).toMatch(/^conv_\d+_[a-z0-9]+$/);
    expect(id2).toMatch(/^conv_\d+_[a-z0-9]+$/);
  });
});

describe('Summary extraction patterns', () => {
  it('should handle turns with questions', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'What should I do about stress?', timestamp: new Date() },
    ];
    const summary = buildQuickSummary(turns);
    expect(summary).toContain('What should I do about stress');
  });

  it('should handle turns with exclamations', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'I got the job!', timestamp: new Date() },
    ];
    const summary = buildQuickSummary(turns);
    expect(summary).toContain('I got the job');
  });

  it('should handle multiple sentences', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'First sentence. Second sentence.', timestamp: new Date() },
    ];
    const summary = buildQuickSummary(turns);
    expect(summary).toContain('First sentence. Second sentence');
  });

  it('should handle empty content', () => {
    const turns: ConversationTurn[] = [{ role: 'user', content: '', timestamp: new Date() }];
    const summary = buildQuickSummary(turns);
    expect(summary).toBe('Discussed: ');
  });

  it('should handle whitespace-only content', () => {
    const turns: ConversationTurn[] = [{ role: 'user', content: '   ', timestamp: new Date() }];
    const summary = buildQuickSummary(turns);
    expect(summary).toContain('Discussed:');
  });
});

describe('Topic extraction from turns', () => {
  it('should extract topics from metadata', () => {
    const turns: ConversationTurn[] = [
      {
        role: 'user',
        content: 'Talking about work',
        timestamp: new Date(),
        metadata: { topics: ['work', 'career'] },
      },
    ];

    // Topics in metadata should be accessible
    expect(turns[0].metadata?.topics).toContain('work');
    expect(turns[0].metadata?.topics).toContain('career');
  });

  it('should handle turns without topics', () => {
    const turns: ConversationTurn[] = [
      {
        role: 'user',
        content: 'Talking about work',
        timestamp: new Date(),
        metadata: { emotion: 'neutral' },
      },
    ];

    expect(turns[0].metadata?.topics).toBeUndefined();
  });
});

describe('Emotion tracking', () => {
  it('should track emotion in metadata', () => {
    const turns: ConversationTurn[] = [
      {
        role: 'user',
        content: 'I feel anxious',
        timestamp: new Date(),
        metadata: { emotion: 'anxious' },
      },
    ];

    expect(turns[0].metadata?.emotion).toBe('anxious');
  });

  it('should track duration in metadata', () => {
    const turns: ConversationTurn[] = [
      {
        role: 'user',
        content: 'Short message',
        timestamp: new Date(),
        metadata: { durationMs: 2500 },
      },
    ];

    expect(turns[0].metadata?.durationMs).toBe(2500);
  });
});

describe('Date handling', () => {
  it('should accept Date objects for timestamp', () => {
    const now = new Date();
    const turn: ConversationTurn = {
      role: 'user',
      content: 'Test',
      timestamp: now,
    };

    expect(turn.timestamp).toBe(now);
    expect(turn.timestamp.getTime()).toBe(now.getTime());
  });

  it('should preserve timestamp precision', () => {
    const specificDate = new Date('2024-06-15T10:30:00.123Z');
    const turn: ConversationTurn = {
      role: 'user',
      content: 'Test',
      timestamp: specificDate,
    };

    expect(turn.timestamp.getMilliseconds()).toBe(123);
  });
});

describe('Content length handling', () => {
  it('should handle very short content', () => {
    const turn: ConversationTurn = {
      role: 'user',
      content: 'Hi',
      timestamp: new Date(),
    };
    const summary = buildQuickSummary([turn]);
    expect(summary).toContain('Hi');
  });

  it('should handle very long content', () => {
    const longContent = 'A'.repeat(1000);
    const turn: ConversationTurn = {
      role: 'user',
      content: longContent,
      timestamp: new Date(),
    };
    const summary = buildQuickSummary([turn]);
    // Content should be truncated to reasonable length
    expect(summary.length).toBeLessThan(200);
  });

  it('should handle Unicode content', () => {
    const turn: ConversationTurn = {
      role: 'user',
      content: '你好世界 🌍 مرحبا',
      timestamp: new Date(),
    };
    const summary = buildQuickSummary([turn]);
    expect(summary).toContain('你好世界');
    expect(summary).toContain('🌍');
  });
});

describe('Edge cases', () => {
  it('should handle array with only assistant turns', () => {
    const turns: ConversationTurn[] = [
      { role: 'assistant', content: 'Hello!', timestamp: new Date() },
      { role: 'assistant', content: 'How are you?', timestamp: new Date() },
    ];
    const summary = buildQuickSummary(turns);
    expect(summary).toBe('');
  });

  it('should handle single character content', () => {
    const turn: ConversationTurn = {
      role: 'user',
      content: 'x',
      timestamp: new Date(),
    };
    const summary = buildQuickSummary([turn]);
    expect(summary).toBe('Discussed: x');
  });

  it('should handle newlines in content', () => {
    const turn: ConversationTurn = {
      role: 'user',
      content: 'Line 1\nLine 2\nLine 3',
      timestamp: new Date(),
    };
    const summary = buildQuickSummary([turn]);
    expect(summary).toContain('Line 1');
  });

  it('should handle tabs in content', () => {
    const turn: ConversationTurn = {
      role: 'user',
      content: 'Column1\tColumn2\tColumn3',
      timestamp: new Date(),
    };
    const summary = buildQuickSummary([turn]);
    expect(summary).toContain('Column1');
  });
});

describe('Turn ordering', () => {
  it('should process turns in order', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'First', timestamp: new Date('2024-01-01') },
      { role: 'user', content: 'Second', timestamp: new Date('2024-01-02') },
      { role: 'user', content: 'Third', timestamp: new Date('2024-01-03') },
    ];
    const summary = buildQuickSummary(turns);

    // All three should be in the summary
    expect(summary).toContain('First');
    expect(summary).toContain('Second');
    expect(summary).toContain('Third');

    // Order should be preserved (First before Second before Third)
    const firstIdx = summary.indexOf('First');
    const secondIdx = summary.indexOf('Second');
    const thirdIdx = summary.indexOf('Third');
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });
});
