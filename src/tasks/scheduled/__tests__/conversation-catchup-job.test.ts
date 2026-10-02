import { describe, expect, it, vi } from 'vitest';
import { ConversationCatchUpJob } from '../conversation-catchup-job.js';
import type { CatchUpDeps } from '../../../services/memory/conversation-catchup.js';

describe('ConversationCatchUpJob', () => {
  it('runs the catch-up with its config and reports the counts', async () => {
    const old = new Date(Date.now() - 2 * 60 * 60_000);
    const deps: CatchUpDeps = {
      queryCandidates: vi.fn(async () => [
        { userId: 'u1', conversationId: 'c1', data: { startedAt: old } },
      ]),
      getTurns: vi.fn(async () => []),
      summarize: vi.fn(),
      closeConversation: vi.fn(async () => undefined),
      saveSummary: vi.fn(),
      indexSummary: vi.fn(),
      markSummarized: vi.fn(async () => true),
    };

    const result = await new ConversationCatchUpJob(deps).run({ batchSize: 5, idleMinutes: 30 });

    expect(result).toMatchObject({ scanned: 1, summarized: 1, failed: 0, successCount: 1 });
    expect(deps.queryCandidates).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
    expect(deps.markSummarized).toHaveBeenCalledWith('u1', 'c1', 'Brief conversation');
  });
});
