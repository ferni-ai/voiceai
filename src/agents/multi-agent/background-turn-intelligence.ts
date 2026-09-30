/**
 * Turn intelligence without the wait.
 *
 * The turn handler (emotion, relationship, the persona's mood and inner
 * world, memory) takes 280-400 ms. Awaited in onUserTurnCompleted it delays
 * every reply by that much. Here it runs off the critical path when the
 * user's turn is committed, in advisory mode (it never speaks), and what it
 * would have injected is handed to the next LLM request that asks for it.
 *
 * A fast reply usually starts before the notes are ready, so a turn's notes
 * typically inform the following reply: the same beat later a person would
 * notice something. Notes are kept until a reply that read them is spoken,
 * so a preemptive generation and the final one see the same notes.
 *
 * @module agents/multi-agent/background-turn-intelligence
 */

import { createLogger } from '../../utils/safe-logger.js';

import { collectTurnNotes, type UserTurnHook } from './turn-intelligence.js';

const log = createLogger({ module: 'BackgroundTurnIntelligence' });

/** What the agent's llmNode reads: context notes for the reply it is about to generate. */
export interface TurnNotesSource {
  notesForReply(): string | null;
}

export interface BackgroundTurnIntelligence extends TurnNotesSource {
  /** A user turn was committed to the conversation. Runs the handler; never throws. */
  onUserTurn(text: string): Promise<void>;
  /** The agent's state changed (listening, thinking, speaking). */
  onAgentState(state: string | undefined): void;
}

export function createBackgroundTurnIntelligence(hook: UserTurnHook): BackgroundTurnIntelligence {
  let latest: string | null = null;
  let readSinceSpoken = false;
  // One run at a time: the handler writes session state (mood, shared stories).
  let queue: Promise<void> = Promise.resolve();

  const run = async (text: string): Promise<void> => {
    try {
      const notes = await collectTurnNotes(hook, text);
      if (notes) {
        latest = notes;
        readSinceSpoken = false;
      }
    } catch (error) {
      log.warn({ error: String(error) }, 'Background turn intelligence failed');
    }
  };

  return {
    onUserTurn(text: string): Promise<void> {
      if (!text.trim()) return queue;
      queue = queue.then(() => run(text));
      return queue;
    },

    notesForReply(): string | null {
      if (latest) readSinceSpoken = true;
      return latest;
    },

    onAgentState(state: string | undefined): void {
      if (state !== 'speaking' || !readSinceSpoken) return;
      latest = null;
      readSinceSpoken = false;
    },
  };
}

interface SessionEvents {
  on?: (event: string, handler: (event: unknown) => void) => void;
  off?: (event: string, handler: (event: unknown) => void) => void;
}

/** Feed the runner from the session's events. Returns the unsubscribe. */
export function wireBackgroundTurnIntelligence(
  session: SessionEvents,
  runner: BackgroundTurnIntelligence
): () => void {
  const onItem = (event: unknown) => {
    const item = (event as { item?: { type?: string; role?: string; textContent?: string } })?.item;
    if (item?.type !== 'message' || item.role !== 'user' || !item.textContent) return;
    void runner.onUserTurn(item.textContent);
  };
  const onState = (event: unknown) =>
    runner.onAgentState((event as { newState?: string })?.newState);
  session.on?.('conversation_item_added', onItem);
  session.on?.('agent_state_changed', onState);
  return () => {
    session.off?.('conversation_item_added', onItem);
    session.off?.('agent_state_changed', onState);
  };
}
