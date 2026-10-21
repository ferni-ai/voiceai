/**
 * recallPreviousConversation ("what did we talk about last time?") answers only
 * from conversations before this call. The store also holds this call's own
 * writes (memories, facts, in-progress summaries); those must never come back
 * as "last time".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RAGResult } from '../../../../memory/semantic-rag.js';

const semanticSearch = vi.hoisted(() => vi.fn(async (): Promise<RAGResult[]> => []));
vi.mock('../../../../memory/semantic-rag.js', () => ({ semanticSearch }));
const recordFeedback = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/unified-memory-service.js', () => ({
  getUnifiedMemoryService: () => ({ recordFeedback }),
}));

import {
  isFromThisCall,
  NO_EARLIER_CONVERSATION,
} from '../../../../services/memory/earlier-conversations.js';
import { recallPreviousConversationUnifiedDef } from '../tools-unified.js';

const SESSION = 'session-AJ_now-1792445295024';
const STARTED = 1_792_445_295_024;
const CONV = 'conv_1792445295572_now';
const call = { sessionId: SESSION, conversationId: CONV, startedAt: STARTED };

const hit = (id: string, content: string, metadata: Record<string, unknown>): RAGResult => ({
  id,
  content,
  source: 'conversation',
  score: 0.8,
  metadata,
});
const pastSummary = hit(
  'conversation_summary_session-AJ_before-1792433151004_1792433233552',
  'talked about the garden',
  { source: 'conversation', timestamp: new Date(STARTED - 3 * 3600_000) }
);
// This call's own writes, each marked a different way (session id, conversation id, time).
const thisSessionFact = hit('memory_u1_mem_1', 'asked what Ferni was doing', { sessionId: SESSION }); // prettier-ignore
const thisConversationSummary = hit(`conversation_summary_conv_${CONV}_1`, 'said hello', {});
const writtenThisCall = hit('memory_u1_mem_2', 'mentioned a dog', { timestamp: { toMillis: () => STARTED + 30_000 } }); // prettier-ignore

type Execute = (args: { query: string }, opts: unknown) => Promise<string>;
const recall = (userData: Record<string, unknown>) =>
  (
    recallPreviousConversationUnifiedDef.create({ agentId: 'ferni' } as never) as unknown as {
      execute: Execute;
    }
  ).execute(
    // prettier-ignore
    { query: 'what we talked about' },
    { ctx: { userData } }
  );
const caller = {
  userId: 'u1',
  services: { sessionId: SESSION, sessionStartTime: STARTED, realtimeConversationId: CONV },
};

afterEach(() => {
  semanticSearch.mockReset();
  recordFeedback.mockClear();
});

describe('recallPreviousConversation', () => {
  it('returns the past conversation and none of this call', async () => {
    semanticSearch.mockResolvedValueOnce([thisSessionFact, pastSummary, thisConversationSummary, writtenThisCall]); // prettier-ignore
    const said = await recall(caller);
    expect(said).toBe('From a conversation before this call: talked about the garden');
    expect(recordFeedback).toHaveBeenCalledTimes(1);
  });

  it('says there is no earlier conversation when every match is from this call', async () => {
    semanticSearch.mockResolvedValueOnce([thisSessionFact]);
    expect(await recall(caller)).toBe(NO_EARLIER_CONVERSATION);
    semanticSearch.mockResolvedValueOnce([thisConversationSummary, writtenThisCall]);
    expect(await recall(caller)).toBe(NO_EARLIER_CONVERSATION);
    expect(recordFeedback).not.toHaveBeenCalled();
  });

  it('keeps the plain no-memory answer when nothing matches at all', async () => {
    semanticSearch.mockResolvedValueOnce([]);
    const said = await recall(caller);
    expect(said).toContain("I don't have specific memories");
    expect(said).not.toBe(NO_EARLIER_CONVERSATION);
  });

  it('searches only the caller, conversations and memories', async () => {
    await recall(caller);
    expect(semanticSearch).toHaveBeenCalledWith('what we talked about', expect.objectContaining({ userId: 'u1', sources: ['conversation', 'memory'] })); // prettier-ignore
  });
});

describe('isFromThisCall', () => {
  it('marks a hit by session id, conversation id, or a write after the call began', () => {
    expect(isFromThisCall(thisSessionFact, call)).toBe(true);
    expect(isFromThisCall(hit(`conversation_summary_${SESSION}_9`, 'x', {}), call)).toBe(true);
    expect(isFromThisCall(thisConversationSummary, call)).toBe(true);
    expect(isFromThisCall(hit('m', 'x', { timestamp: new Date(STARTED).toISOString() }), call)).toBe(true); // prettier-ignore
    expect(isFromThisCall(writtenThisCall, call)).toBe(true);
  });

  it('keeps hits from before the call, and ones it cannot place', () => {
    expect(isFromThisCall(pastSummary, call)).toBe(false);
    expect(isFromThisCall(hit('m', 'x', { timestamp: { seconds: STARTED / 1000 - 60 } }), call)).toBe(false); // prettier-ignore
    expect(isFromThisCall(hit('m', 'x', {}), call)).toBe(false);
    expect(isFromThisCall(thisSessionFact, {})).toBe(false);
  });
});
