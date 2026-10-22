/**
 * Earlier conversations: what "last time" may be drawn from.
 *
 * recallPreviousConversation answers "what did we talk about last time?". The
 * vector store it searches also fills up during a call (memories, facts and
 * summaries carry the call's session or conversation id, or a timestamp from
 * after the call began), so a plain search can hand back the call being had
 * right now as if it were an earlier one. Only conversations from before this
 * call started count; the caller is told plainly when there are none.
 *
 * @module services/memory/earlier-conversations
 */

import { semanticSearch, type RAGResult } from '../../memory/semantic-rag.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

/** The call the question is asked in. Any field may be missing. */
export interface ThisCall {
  sessionId?: string;
  conversationId?: string;
  /** When this call started, ms since epoch. */
  startedAt?: number;
}

/** Tool result when every match came from this call. Said plainly so nothing is invented. */
export const NO_EARLIER_CONVERSATION =
  'No earlier conversation found. The only matches are from this call, so none of it is from last time.';

export type EarlierConversations =
  | { kind: 'found'; text: string }
  /** Matches existed, but every one came from this call. */
  | { kind: 'only_this_call' }
  | { kind: 'none' };

/** The session services on a call's userData carry the call's ids and start time. */
export function thisCallOf(userData: unknown): ThisCall {
  const services = (userData as { services?: Record<string, unknown> } | undefined)?.services;
  const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  const startedAt = services?.sessionStartTime;
  return {
    sessionId: text(services?.sessionId),
    conversationId: text(services?.realtimeConversationId),
    startedAt: typeof startedAt === 'number' && startedAt > 0 ? startedAt : undefined,
  };
}

/** A stored timestamp as ms: a Date, a number, an ISO string, or a Firestore Timestamp. */
function toMillis(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? undefined : ms;
  }
  const ts = value as { toMillis?: () => number; seconds?: number } | null | undefined;
  if (typeof ts?.toMillis === 'function') return ts.toMillis();
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  return undefined;
}

/** True when a search hit was written by this call, so it is not "last time". */
export function isFromThisCall(hit: Pick<RAGResult, 'id' | 'metadata'>, call: ThisCall): boolean {
  const id = hit.id ?? '';
  const meta = hit.metadata ?? {};
  const names = (key: string | undefined, field: string) =>
    !!key && (meta[field] === key || id.includes(key));
  if (names(call.sessionId, 'sessionId')) return true;
  if (names(call.conversationId, 'conversationId')) return true;
  const writtenAt = toMillis(meta.timestamp);
  return call.startedAt !== undefined && writtenAt !== undefined && writtenAt >= call.startedAt;
}

/**
 * Search the caller's past conversations and memories, keeping only what came
 * before this call. Over-fetches so dropping this call's hits still leaves up to `limit`.
 */
export async function searchEarlierConversations(options: {
  query: string;
  userId: string;
  thisCall: ThisCall;
  limit?: number;
  minScore?: number;
}): Promise<EarlierConversations> {
  const { query, userId, thisCall, limit = 5, minScore = 0.35 } = options;
  try {
    const hits = await semanticSearch(query, {
      topK: limit * 2,
      sources: ['conversation', 'memory'],
      userId,
      minScore,
    });
    const earlier = hits.filter((hit) => !isFromThisCall(hit, thisCall)).slice(0, limit);
    if (earlier.length > 0) {
      return { kind: 'found', text: earlier.map((r) => r.content.slice(0, 200)).join(' | ') };
    }
    return hits.length > 0 ? { kind: 'only_this_call' } : { kind: 'none' };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Earlier-conversation search failed');
    return { kind: 'none' };
  }
}
