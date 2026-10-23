/**
 * Context injections that carry crisis or safety guidance for the reply they come
 * with, told apart by category, never by their text: their headers vary
 * ([ESCALATION AWARENESS], [CRISIS SUPPORT], [⚠️ EARLY WARNING ACTIVE], ...).
 * The turn's note is marked in its `extra`, so whoever moves the note
 * (PREEMPT_STABLE_CONTEXT, multi-agent/preempt-stable-context.ts) puts it in
 * at once instead of holding it for a later reply.
 *
 * @module agents/processors/turn-processor/safety-note
 */
import type { llm } from '@livekit/agents';

export const SAFETY_CATEGORIES: ReadonlySet<string> = new Set([
  'safety', // escalation awareness (safety-coaching-builders.ts)
  'crisis_response', // [CRISIS SUPPORT], crisis guidance (turn-handler.ts)
  'safety_soft_check', // SOFT_CRISIS_CHECK (crisis-agreement.ts)
  'scientific_early_warning', // early-warning.ts through scientific coaching
  'crisis_transfer', // transfer awareness with crisis indicators (better-than-human-builders.ts)
  'crisis_follow_up', // a caller with a recent crisis (better-than-human-builders.ts)
]);

/** The key, in a chat message's `extra`, that marks safety guidance. */
export const SAFETY_NOTE = 'safetyNote';

export function isSafetyCategory(category: string): boolean {
  return SAFETY_CATEGORIES.has(category);
}

/** The `extra` for a note made of these categories: marked when any is safety guidance. */
export function safetyExtra(categories: readonly string[]): Record<string, unknown> | undefined {
  return categories.some(isSafetyCategory) ? { [SAFETY_NOTE]: true } : undefined;
}

export function carriesSafety(item: { extra?: Record<string, unknown> } | undefined): boolean {
  return item?.extra?.[SAFETY_NOTE] === true;
}

/** A safety note written straight into the turn's context (the crisis override). */
export function addSafetyNote(chatCtx: llm.ChatContext, content: string): void {
  chatCtx.addMessage({ role: 'system', content, extra: { [SAFETY_NOTE]: true } });
}
