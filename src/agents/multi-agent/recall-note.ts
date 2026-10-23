/**
 * Puts a memory-recall note (memory-recall-hook.ts) into the agent's chat context.
 *
 * @module agents/multi-agent/recall-note
 */
import { createLogger } from '../../utils/safe-logger.js';
import type { ForgottenCheck } from '../../memory/recall/forget-every-reader.js';
import { RECALL_NOTE_ID_PREFIX } from './turn-context-header.js';

const log = createLogger({ module: 'MemoryRecall' });

/** Recall notes added so far, for their ids (RECALL_NOTE_ID_PREFIX). */
let recallNotes = 0;

/** A chat item as far as this module reads it. */
interface NoteItem {
  id?: string;
  textContent?: string;
}

/** The slice of the SDK Agent this needs. */
export interface RecallAgent {
  readonly chatCtx: {
    copy(): {
      addMessage(msg: { role: 'system'; content: string; id?: string }): unknown;
      items?: unknown[];
    };
  };
  updateChatCtx(chatCtx: unknown): Promise<void>;
}

function update(agent: RecallAgent, ctx: unknown): void {
  agent.updateChatCtx(ctx).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Recall note not added');
  });
}

/**
 * Add a recall note to the agent's context now. updateChatCtx assigns the
 * context before its first await, so the note is in place for the preemptive
 * generation the SDK starts right after the transcript event.
 */
export function addRecallNote(agent: RecallAgent, note: string): void {
  const ctx = agent.chatCtx.copy();
  ctx.addMessage({ role: 'system', content: note, id: `${RECALL_NOTE_ID_PREFIX}${++recallNotes}` });
  update(agent, ctx);
}

/**
 * Take recall notes already in the chat that are about a forgotten topic
 * back out (FORGET_EVERY_READER, forget-every-reader.ts), whole: a forget
 * mid-call otherwise left them in front of the model for the rest of the
 * call. Only recall's own notes are touched, never what anyone said.
 */
export function dropForgottenNotes(agent: RecallAgent, forgotten: ForgottenCheck | null): number {
  if (!forgotten) return 0;
  const ctx = agent.chatCtx.copy();
  const items = (ctx.items ?? []) as NoteItem[];
  const kept = items.filter(
    (i) => !(i?.id?.startsWith(RECALL_NOTE_ID_PREFIX) && forgotten(i.textContent ?? ''))
  );
  const dropped = items.length - kept.length;
  if (dropped === 0) return 0;
  ctx.items = kept;
  update(agent, ctx);
  log.info({ dropped }, 'Forgotten recall notes taken out');
  return dropped;
}
