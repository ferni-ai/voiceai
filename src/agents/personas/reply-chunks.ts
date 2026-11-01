/**
 * Reading the model's reply stream: which chunks are words and which are tool
 * calls. Every reply guard (action-claim-guard.ts, caller-voice-guard.ts,
 * house-facts.ts and the gates) reads chunks the same way through these.
 *
 * @module agents/personas/reply-chunks
 */
import type { llm } from '@livekit/agents';

/** A reply chunk: the model's ChatChunk, a plain string, or a sentinel such as usage. */
export type ReplyChunk = llm.ChatChunk | string | object;

/** The words in a chunk; undefined for tool calls, usage and other sentinels. */
export function contentOf(chunk: ReplyChunk): string | undefined {
  if (typeof chunk === 'string') return chunk;
  const c = chunk as Partial<llm.ChatChunk> | null;
  if (!c || typeof c !== 'object' || !c.delta || (c.delta.toolCalls?.length ?? 0) > 0) {
    return undefined;
  }
  return c.delta.content ?? '';
}

/** A chunk that carries a tool call. */
export function hasToolCall(chunk: ReplyChunk): boolean {
  if (typeof chunk !== 'object' || chunk === null) return false;
  return ((chunk as { delta?: { toolCalls?: unknown[] } }).delta?.toolCalls?.length ?? 0) > 0;
}
