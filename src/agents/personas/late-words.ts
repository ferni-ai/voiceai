/**
 * EOT_CONTINUED_MERGE=on: fold Ink's late last words of turn 1 into that turn.
 *
 * FIRST_TURN_FAST ends turn 1 on local silence; Ink's last word can still
 * arrive later ("...kind of a long" then "day.", 140-1030 ms after the early
 * end on dev). Today those words open a new turn (first-turn-fast.ts): the
 * SDK interrupts the reply it is generating, the noise filter calls
 * session.interrupt() on the instant start/end, and a second request starts
 * ~270-370 ms later, answering the turn as two user messages. Dev 2026-10-11:
 * 2 of 2 early ends went this way, each time with one late word.
 *
 * When the late words are a short tail (MAX_LATE_WORDS, no question, no
 * negation, no crisis signal in the whole sentence) and Ferni has not started
 * speaking, they are appended to the turn's user message in the chat context
 * instead, and the reply already in flight continues. Anything else, or once
 * Ferni speaks, keeps the new-turn behaviour.
 *
 * @module agents/personas/late-words
 */

import { llm } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import { detectCrisis } from '../safety/crisis-guard.js';

const log = createLogger({ module: 'LateWords' });

/** Longer tails are the caller going on, not Ink catching up: they stay a new turn. */
export const MAX_LATE_WORDS = 3;

export function eotContinuedMergeEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.EOT_CONTINUED_MERGE === 'on';
}

/** Whether a tail could join the turn without changing what the reply must answer. */
export function isMergeableTail(tail: string[], said: string): boolean {
  if (tail.length === 0 || tail.length > MAX_LATE_WORDS) return false;
  const text = tail.join(' ');
  if (/\?/.test(text) || /\b(not|no|never|nor)\b|n't\b/i.test(text)) return false;
  const crisis = detectCrisis(`${said} ${text}`);
  return !crisis.isCrisis && crisis.severity === 0 && crisis.indicators.length === 0;
}

export interface LateWordsMerger {
  /** Ferni has not started the reply, so a tail can still join the turn. */
  open: () => boolean;
  /** Appends `tail` to the user message `said`; false when it cannot (then: a new turn). */
  merge: (tail: string, said: string) => boolean;
}

interface ItemView {
  id: string;
  type?: string;
  role?: string;
  textContent?: string;
  createdAt?: number;
}

interface MergeAgent {
  readonly chatCtx: { copy(): { items: ItemView[] } };
  updateChatCtx(chatCtx: unknown): Promise<void>;
}

const normalized = (text: string | undefined): string =>
  (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export function lateWordsMerger(
  agent: MergeAgent,
  session: { agentState?: string }
): LateWordsMerger {
  const open = () => session.agentState !== 'speaking';
  return {
    open,
    merge(tail, said) {
      if (!open()) return false;
      const ctx = agent.chatCtx.copy();
      const items = ctx.items;
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i]!;
        if (item.type !== 'message') continue;
        if (item.role === 'assistant') return false; // the reply is already in
        if (item.role !== 'user' || normalized(item.textContent) !== normalized(said)) continue;
        items[i] = llm.ChatMessage.create({
          role: 'user',
          content: `${item.textContent ?? ''} ${tail}`.trim(),
          id: item.id,
          createdAt: item.createdAt,
        }) as unknown as ItemView;
        agent
          .updateChatCtx(ctx)
          .catch((error: unknown) => log.warn({ error: String(error) }, 'late words merge failed'));
        log.info({ words: tail.split(/\s+/).length }, 'EOT_CONTINUED_MERGE merged');
        return true;
      }
      return false; // the turn's message is not in the context yet
    },
  };
}
