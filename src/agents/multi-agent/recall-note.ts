/**
 * Puts a memory-recall note (memory-recall-hook.ts) into the agent's chat context.
 *
 * @module agents/multi-agent/recall-note
 */
import { createLogger } from '../../utils/safe-logger.js';
import { forgottenCheckNow, type ForgottenCheck } from '../../memory/recall/forget-every-reader.js';
import { onForget } from '../../memory/recall/forget.js';
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
 * `forgotten` is asked again when the note lands (FORGET_EVERY_READER): a held
 * note about a topic forgotten while it waited never goes in.
 */
export function addRecallNote(
  agent: RecallAgent,
  note: string,
  said?: string,
  forgotten?: () => ForgottenCheck | null
): void {
  const write = () => {
    if (forgotten?.()?.(note)) return void log.info('Held recall note forgotten before it landed');
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
  const ctx = agent.chatCtx.copy();
  const items = (ctx.items ?? []) as NoteItem[];
  const kept = items.filter(
    (i) => !(i?.id?.startsWith(RECALL_NOTE_ID_PREFIX) && forgotten(i.textContent ?? ''))
  );
  const dropped = items.length - kept.length;
  if (dropped === 0) return 0;
  ctx.items = kept;
  update(agent, ctx);
  if (preemptStableMode() === 'on') restartPreemptive(agent, said);
  log.info({ dropped }, 'Forgotten recall notes taken out');
  return dropped;
}

/** Agents recall has written to, per caller (FORGET_EVERY_READER): a forget clears each at once. */
const written = new Map<string, Set<WeakRef<RecallAgent>>>();
export const MAX_WATCHED_CALLERS = 1000;
let watching = false;

/**
 * Take this agent's recall notes about a topic out the moment its caller
 * forgets it (forget.ts onForget), not on the next transcript: a reply the
 * agent starts on its own, or a handoff copying its chat, would see them.
 */
export function watchForgets(agent: RecallAgent, userId: string): void {
  if (!watching) {
    watching = true;
    onForget((id) => {
      for (const ref of written.get(id) ?? []) {
        const live = ref.deref();
        if (live) dropForgottenNotes(live, forgottenCheckNow(id, 'recall-forget'));
      }
    });
  }
  const refs = written.get(userId) ?? new Set<WeakRef<RecallAgent>>();
  for (const ref of refs) if (!ref.deref() || ref.deref() === agent) refs.delete(ref);
  refs.add(new WeakRef(agent));
  written.delete(userId); // newest last, so the oldest caller goes first
  written.set(userId, refs);
  if (written.size > MAX_WATCHED_CALLERS) written.delete(written.keys().next().value as string);
}
