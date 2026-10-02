/**
 * Capture-side persistence: bounded turn-write retry, summary recency, and
 * the catch-up summarization of conversations that ended without a summary.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { persistTurnWithRetry } from '../turn-persistence.js';
import { isSummaryNewer, conversationEndTime } from '../conversation-summary-recency.js';
import {
  catchUpSummaryId,
  runConversationCatchUp,
  type CandidateConversation,
  type CatchUpDeps,
} from '../conversation-catchup.js';
import { getMemoryCaptureMetrics, resetMemoryCaptureMetrics } from '../memory-capture-metrics.js';
import type { ConversationTurn } from '../realtime-memory.js';

vi.mock('../../observability/firestore-monitor.js', () => ({
  recordFallback: vi.fn(),
  recordSuccess: vi.fn(),
}));

const MIN = 60_000;
const noSleep = async (): Promise<void> => undefined;

const turn = (
  role: 'user' | 'assistant',
  content: string,
  turnNumber: number
): ConversationTurn => ({
  role,
  content,
  timestamp: new Date(),
  turnNumber,
});

beforeEach(() => {
  resetMemoryCaptureMetrics();
});

describe('persistTurnWithRetry', () => {
  it('retries a failed write and succeeds without counting a failure', async () => {
    const persist = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('UNAVAILABLE'))
      .mockResolvedValueOnce(true);
    const ok = await persistTurnWithRetry('u1', 'c1', turn('assistant', 'Hi', 3), {
      persist,
      sleep: noSleep,
    });
    expect(ok).toBe(true);
    expect(persist).toHaveBeenCalledTimes(3);
    // Same turn object each time → same deterministic doc id, no duplicates
    expect(persist.mock.calls.every((c) => (c[2] as ConversationTurn).turnNumber === 3)).toBe(true);
    const m = getMemoryCaptureMetrics().turnWrites.assistant;
    expect(m).toEqual({ attempted: 1, succeeded: 1, retried: 2, failed: 0 });
  });

  it('gives up after the bounded number of attempts and counts the failure', async () => {
    const persist = vi.fn().mockResolvedValue(false);
    const ok = await persistTurnWithRetry('u1', 'c1', turn('user', 'Hello', 1), {
      persist,
      sleep: noSleep,
      retryDelaysMs: [1, 1],
    });
    expect(ok).toBe(false);
    expect(persist).toHaveBeenCalledTimes(3);
    const metrics = getMemoryCaptureMetrics();
    expect(metrics.turnWrites.user.failed).toBe(1);
    expect(metrics.lastTurnWriteFailure?.role).toBe('user');
  });
});

describe('summary recency', () => {
  const t = (iso: string): Date => new Date(iso);

  it('replaces when the user has no summary marker', () => {
    expect(isSummaryNewer(t('2026-10-01T10:00:00Z'), {})).toBe(true);
  });

  it('keeps a newer summary', () => {
    expect(
      isSummaryNewer(t('2026-10-01T10:00:00Z'), {
        lastConversationSummaryAt: t('2026-10-02T09:00:00Z'),
      })
    ).toBe(false);
  });

  it('falls back to lastContact when only the profile saver wrote a summary', () => {
    const doc = {
      lastConversationSummary: 'Talked about the move',
      lastContact: t('2026-10-02T09:00:00Z'),
    };
    expect(isSummaryNewer(t('2026-10-01T10:00:00Z'), doc)).toBe(false);
    expect(isSummaryNewer(t('2026-10-02T10:00:00Z'), doc)).toBe(true);
  });

  it('reads Firestore timestamps and prefers endedAt over lastActivityAt', () => {
    const ts = (d: Date) => ({ toDate: () => d });
    const end = conversationEndTime({
      startedAt: ts(t('2026-10-01T09:00:00Z')),
      lastActivityAt: ts(t('2026-10-01T09:20:00Z')),
      endedAt: ts(t('2026-10-01T09:25:00Z')),
    });
    expect(end?.toISOString()).toBe('2026-10-01T09:25:00.000Z');
  });
});

describe('runConversationCatchUp', () => {
  const now = new Date('2026-10-02T12:00:00Z');

  function makeDeps(candidates: CandidateConversation[], turns: ConversationTurn[]) {
    const calls: string[] = [];
    const deps: CatchUpDeps = {
      queryCandidates: vi.fn(async () => candidates),
      getTurns: vi.fn(async () => turns),
      summarize: vi.fn(async (conversationId: string) => ({
        id: catchUpSummaryId(conversationId),
        shortText: 'Planning the move to Denver; worried about the dog',
        mainTopics: ['moving'],
        keyPoints: ['Planning the move to Denver', 'worried about the dog'],
        emotionalArc: 'anxious to hopeful',
      })),
      closeConversation: vi.fn(async (_u: string, c: string) => {
        calls.push(`close:${c}`);
      }),
      saveSummary: vi.fn(async (_u: string, c: string) => {
        calls.push(`save:${c}`);
      }),
      indexSummary: vi.fn(async () => {
        calls.push('index');
      }),
      markSummarized: vi.fn(async (_u: string, c: string) => {
        calls.push(`mark:${c}`);
        return true;
      }),
    };
    return { deps, calls };
  }

  const twoTurns = [
    turn('user', 'We are moving to Denver', 1),
    turn('assistant', 'Big change! How do you feel?', 2),
  ];

  it('closes, summarizes, saves, indexes and marks a dropped call, in that order', async () => {
    const dropped: CandidateConversation = {
      userId: 'u1',
      conversationId: 'conv_dropped',
      data: {
        startedAt: new Date(now.getTime() - 90 * MIN),
        lastActivityAt: new Date(now.getTime() - 60 * MIN),
        summarized: false,
      },
    };
    const { deps, calls } = makeDeps([dropped], twoTurns);

    const result = await runConversationCatchUp(deps, { now, idleMs: 30 * MIN });

    expect(result).toMatchObject({ scanned: 1, summarized: 1, skippedActive: 0, failed: 0 });
    expect(calls).toEqual([
      'close:conv_dropped',
      'save:conv_dropped',
      'index',
      'mark:conv_dropped',
    ]);
    expect(deps.closeConversation).toHaveBeenCalledWith(
      'u1',
      'conv_dropped',
      new Date(now.getTime() - 60 * MIN)
    );
    expect(deps.markSummarized).toHaveBeenCalledWith(
      'u1',
      'conv_dropped',
      'Planning the move to Denver; worried about the dog'
    );
    expect(getMemoryCaptureMetrics().catchUp).toMatchObject({ runs: 1, summarized: 1 });
  });

  it('lets insights and preferences learn from the summarized call, after it is marked', async () => {
    const dropped: CandidateConversation = {
      userId: 'u1',
      conversationId: 'conv_dropped',
      data: {
        startedAt: new Date(now.getTime() - 90 * MIN),
        endedAt: new Date(now.getTime() - 60 * MIN),
        summarized: false,
      },
    };
    const { deps, calls } = makeDeps([dropped], twoTurns);
    deps.onSummarized = vi.fn(async (_u: string, c: string) => {
      calls.push(`learn:${c}`);
    });

    await runConversationCatchUp(deps, { now });

    expect(calls.slice(-2)).toEqual(['mark:conv_dropped', 'learn:conv_dropped']);
    expect(deps.onSummarized).toHaveBeenCalledWith(
      'u1',
      'conv_dropped',
      expect.objectContaining({ shortText: 'Planning the move to Denver; worried about the dog' }),
      twoTurns
    );
  });

  it('leaves a still-active conversation alone', async () => {
    const live: CandidateConversation = {
      userId: 'u1',
      conversationId: 'conv_live',
      data: {
        startedAt: new Date(now.getTime() - 50 * MIN),
        lastActivityAt: new Date(now.getTime() - 2 * MIN),
      },
    };
    const { deps } = makeDeps([live], twoTurns);
    const result = await runConversationCatchUp(deps, { now, idleMs: 30 * MIN });
    expect(result).toMatchObject({ scanned: 1, summarized: 0, skippedActive: 1 });
    expect(deps.summarize).not.toHaveBeenCalled();
  });

  it('does not re-close an explicitly ended conversation and marks a one-turn one as brief', async () => {
    const ended: CandidateConversation = {
      userId: 'u2',
      conversationId: 'conv_short',
      data: {
        startedAt: new Date(now.getTime() - 3 * 60 * MIN),
        endedAt: new Date(now.getTime() - 2 * 60 * MIN),
      },
    };
    const { deps } = makeDeps([ended], [turn('user', 'hi', 1)]);
    const result = await runConversationCatchUp(deps, { now });
    expect(result.summarized).toBe(1);
    expect(deps.closeConversation).not.toHaveBeenCalled();
    expect(deps.summarize).not.toHaveBeenCalled();
    expect(deps.markSummarized).toHaveBeenCalledWith('u2', 'conv_short', 'Brief conversation');
  });

  it('counts a failure and does not mark the conversation when indexing fails', async () => {
    const dropped: CandidateConversation = {
      userId: 'u1',
      conversationId: 'conv_fail',
      data: { startedAt: new Date(now.getTime() - 90 * MIN) },
    };
    const { deps } = makeDeps([dropped], twoTurns);
    deps.indexSummary = vi.fn(async () => {
      throw new Error('vector store down');
    });
    const result = await runConversationCatchUp(deps, { now });
    expect(result).toMatchObject({ summarized: 0, failed: 1 });
    expect(deps.markSummarized).not.toHaveBeenCalled();
  });

  it('dry run reports candidates without writing', async () => {
    const dropped: CandidateConversation = {
      userId: 'u1',
      conversationId: 'conv_dry',
      data: { startedAt: new Date(now.getTime() - 90 * MIN) },
    };
    const { deps } = makeDeps([dropped], twoTurns);
    const result = await runConversationCatchUp(deps, { now, dryRun: true });
    expect(result.conversationIds).toEqual(['conv_dry']);
    expect(deps.closeConversation).not.toHaveBeenCalled();
    expect(deps.markSummarized).not.toHaveBeenCalled();
  });

  it('queries the window between the lookback and the idle cutoff', async () => {
    const { deps } = makeDeps([], []);
    await runConversationCatchUp(deps, {
      now,
      idleMs: 30 * MIN,
      lookbackMs: 24 * 60 * MIN,
      batchSize: 10,
    });
    expect(deps.queryCandidates).toHaveBeenCalledWith({
      startedAfter: new Date(now.getTime() - 24 * 60 * MIN),
      startedBefore: new Date(now.getTime() - 30 * MIN),
      limit: 10,
    });
  });
});
