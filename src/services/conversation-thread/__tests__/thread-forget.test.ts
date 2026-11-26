/**
 * The thread context an agent reads on a text or call (buildAgentContext) leaves out messages and
 * topic tags about a topic the caller asked Ferni to forget, with FORGET_EVERY_READER on; off,
 * the context is built as before. The stored thread is never changed. Runs the real thread
 * manager and the real forget check; only persistence and the forgotten list are faked.
 * Fictional data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firestoreForgetStore } from '../../../memory/recall/forget.js';
import { resetForgetTopicsSource } from '../../../memory/recall/forget-topics-source.js';

vi.mock('../thread-persistence.js', () => ({
  saveThread: vi.fn().mockResolvedValue(true),
  loadThread: vi.fn().mockResolvedValue(null),
  loadActiveThread: vi.fn().mockResolvedValue(null),
  saveMessage: vi.fn().mockResolvedValue(true),
  loadMessages: vi.fn().mockResolvedValue([]),
  closeThread: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../data-layer/hooks/index.js', () => ({
  onConversationThreadChange: vi.fn().mockResolvedValue(undefined),
}));

const threads = await import('../thread-manager.js');

let n = 0;
async function seededThread() {
  const thread = await threads.getOrCreateThread(`u-fiction-${++n}`, 'sms', 'ferni');
  const text = (content: string) =>
    threads.addMessage(thread.id, {
      role: 'user',
      channel: 'sms',
      direction: 'inbound',
      content,
      timestamp: new Date(),
    });
  await text('Theo here, I got the offer from the Denver office');
  await text('also the tomatoes are finally in the ground');
  await threads.updateThreadTopics(thread.id, ['Denver office', 'garden']);
  return thread;
}

const forgotten = (topics: string[]) =>
  vi.spyOn(firestoreForgetStore, 'topics').mockImplementation(async () => topics);

beforeEach(() => {
  vi.stubEnv('FORGET_EVERY_READER', 'on');
  resetForgetTopicsSource();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('buildAgentContext with FORGET_EVERY_READER on', () => {
  it('leaves the forgotten message and topic out of the context, keeps the rest', async () => {
    forgotten(['Denver job']);
    const thread = await seededThread();
    const context = await threads.buildAgentContext(thread.id, 'ferni');
    expect(context.llmContext).not.toContain('Denver');
    expect(context.llmContext).toContain('the tomatoes are finally in the ground');
    expect(context.llmContext).toContain('Topics discussed: garden');
    expect(context.recentMessages.map((m) => m.content)).toEqual([
      'also the tomatoes are finally in the ground',
    ]);
    // The stored thread keeps its tags: only what is shown changes.
    expect((await threads.getThread(thread.id))?.topicTags).toEqual(['Denver office', 'garden']);
  });

  it('nothing forgotten: every message and topic', async () => {
    forgotten([]);
    const thread = await seededThread();
    const context = await threads.buildAgentContext(thread.id, 'ferni');
    expect(context.recentMessages).toHaveLength(2);
    expect(context.llmContext).toContain('Topics discussed: Denver office, garden');
  });
});

describe('with FORGET_EVERY_READER off (prod today)', () => {
  it.each([[undefined], ['off']])(
    'FORGET_EVERY_READER=%s builds the context as before',
    async (v) => {
      vi.stubEnv('FORGET_EVERY_READER', v);
      const read = forgotten(['Denver job']);
      const thread = await seededThread();
      const context = await threads.buildAgentContext(thread.id, 'ferni');
      expect(context.llmContext).toContain('I got the offer from the Denver office');
      expect(context.llmContext).toContain('Topics discussed: Denver office, garden');
      expect(context.recentMessages).toHaveLength(2);
      expect(context.thread).toBe(await threads.getThread(thread.id));
      expect(read).not.toHaveBeenCalled();
    }
  );
});
