/**
 * Puts a memory-recall note (memory-recall-hook.ts) into the agent's chat context.
 *
 * @module agents/multi-agent/recall-note
 */
import { createLogger } from '../../utils/safe-logger.js';
import { afterPreemptive, preemptStableMode, restartPreemptive } from './preempt-stable-context.js';
import { RECALL_NOTE_ID_PREFIX } from './turn-context-header.js';

const log = createLogger({ module: 'MemoryRecall' });

/** Recall notes added so far, for their ids (RECALL_NOTE_ID_PREFIX). */
let recallNotes = 0;

/** The slice of the SDK Agent this needs. */
export interface RecallAgent {
  readonly chatCtx: {
    copy(): { addMessage(msg: { role: 'system'; content: string; id?: string }): unknown };
  };
  updateChatCtx(chatCtx: unknown): Promise<void>;
}

/**
 * Add a recall note to the agent's context now. updateChatCtx assigns the
 * context before its first await, so the note is in place for the preemptive
 * generation the SDK starts right after the transcript event.
 *
 * A note on a later transcript (the final, after the preflight started the
 * reply) changes the context under that reply. PREEMPT_STABLE_CONTEXT=on starts
 * the reply again from it at once; =defer holds it for the next reply
 * (preempt-stable-context.ts). `said` is the transcript the note was built for.
 */
export function addRecallNote(agent: RecallAgent, note: string, said?: string): void {
  const write = () => {
    const ctx = agent.chatCtx.copy();
    ctx.addMessage({
      role: 'system',
      content: note,
      id: `${RECALL_NOTE_ID_PREFIX}${++recallNotes}`,
    });
    agent.updateChatCtx(ctx).catch((error: unknown) => {
      log.warn({ error: String(error) }, 'Recall note not added');
    });
  };
  const mode = preemptStableMode();
  if (mode === 'defer') return void afterPreemptive(agent, 'recall', write);
  write();
  if (mode === 'on') restartPreemptive(agent, said);
}
