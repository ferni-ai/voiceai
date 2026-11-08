/**
 * Puts a memory-recall note (memory-recall-hook.ts) into the agent's chat context.
 *
 * @module agents/multi-agent/recall-note
 */
import { createLogger } from '../../utils/safe-logger.js';
import type { ForgottenCheck } from '../../memory/recall/forget-every-reader.js';
import { afterPreemptive, preemptStableMode, restartPreemptive } from './preempt-stable-context.js';
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
 *
 * A note on a later transcript (the final, after the preflight started the
 * reply) changes the context under that reply. PREEMPT_STABLE_CONTEXT=on starts
 * the reply again from it at once; =defer holds it for the next reply
 * (preempt-stable-context.ts). `said` is the transcript the note was built for.
 */
export function addRecallNote(
  agent: RecallAgent,
  note: string,
  said?: string,
  id = `${RECALL_NOTE_ID_PREFIX}${++recallNotes}`
): void {
  const write = () => {
    const ctx = agent.chatCtx.copy();
    ctx.addMessage({ role: 'system', content: note, id });
    agent.updateChatCtx(ctx).catch((error: unknown) => {
      log.warn({ error: String(error) }, 'Recall note not added');
    });
  };
  const mode = preemptStableMode();
  if (mode === 'defer') return void afterPreemptive(agent, 'recall', write);
  write();
  if (mode === 'on') restartPreemptive(agent, said);
}

/**
 * Take recall notes already in the chat that are about a forgotten topic
 * back out (FORGET_EVERY_READER, forget-every-reader.ts), whole: a forget
 * mid-call otherwise left them in front of the model for the rest of the
 * call. Only recall's own notes are touched, never what anyone said.
 *
 * Never held for a preemptive reply (PREEMPT_STABLE_CONTEXT): that reply was
 * started from the note, and a changed context makes the commit drop it. With
 * the flag on, it starts again now from the context without the note. `said`
 * is the transcript the turn answers.
 */
export function dropForgottenNotes(
  agent: RecallAgent,
  forgotten: ForgottenCheck | null,
  said?: string
): number {
  if (!forgotten) return 0;
  const dropped = dropNotes(
    agent,
    (i) => !!i?.id?.startsWith(RECALL_NOTE_ID_PREFIX) && forgotten(i.textContent ?? ''),
    said
  );
  if (dropped > 0) log.info({ dropped }, 'Forgotten recall notes taken out');
  return dropped;
}

/** Take the notes `drop` picks out of the chat now, restarting a preemptive reply (above). */
function dropNotes(agent: RecallAgent, drop: (item: NoteItem) => boolean, said?: string): number {
  const ctx = agent.chatCtx.copy();
  const items = (ctx.items ?? []) as NoteItem[];
  const kept = items.filter((i) => !drop(i));
  const dropped = items.length - kept.length;
  if (dropped === 0) return 0;
  ctx.items = kept;
  update(agent, ctx);
  if (preemptStableMode() === 'on') restartPreemptive(agent, said);
  return dropped;
}

/**
 * PERSONA_GROWTH's note (persona-growth-recall.ts) goes in on its own, under
 * this id, so a crisis on the call can take it back out alone: the rest of
 * recall stays. A recall id, so prompt sections and the director read it as recall.
 */
export const GROWTH_NOTE_ID = `${RECALL_NOTE_ID_PREFIX}growth`;

/** Take the growth note back out of the chat (a crisis showed on the call); how many went. */
export function dropGrowthNote(agent: RecallAgent, said?: string): number {
  return dropNotes(agent, (i) => i?.id === GROWTH_NOTE_ID, said);
}

/** A request without the growth note: a crisis-guided reply never sees it (crisis-gate.ts). */
export function withoutGrowthNote<C extends { items: Array<{ id?: string }>; copy(): C }>(
  chatCtx: C,
  when = true
): C {
  if (!when || !chatCtx.items.some((i) => i?.id === GROWTH_NOTE_ID)) return chatCtx;
  const ctx = chatCtx.copy();
  ctx.items = ctx.items.filter((i) => i?.id !== GROWTH_NOTE_ID);
  return ctx;
}
