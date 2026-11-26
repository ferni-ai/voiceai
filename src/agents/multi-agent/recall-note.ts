/**
 * Puts a memory-recall note (memory-recall-hook.ts) into the agent's chat context.
 *
 * @module agents/multi-agent/recall-note
 */
import type { Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { ForgottenCheck } from '../../memory/recall/forget-every-reader.js';
import { crisisRiskThisCall, scoreCrisisLanguage } from '../../services/safety/index.js';
import {
  crisisNoMemoryRecallOn,
  memoryFreeText,
  WITHOUT_RECALLED_MEMORY,
  withoutRecalledMemory,
} from '../processors/turn-processor/crisis-memory-recall.js';
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
      addMessage(msg: {
        role: 'system';
        content: string;
        id?: string;
        extra?: Record<string, unknown>;
      }): unknown;
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

/** One recall note and the chat id it goes in under. */
export interface RecallNote {
  note: string;
  id: string;
  /** Set on a note that carries the caller's recalled memory (generalRecallNote). */
  extra?: Record<string, unknown>;
}

/**
 * Recall's general note, as a RecallNote. With CRISIS_NO_MEMORY_RECALL on it carries the
 * caller's recalled memory, so it is marked as made of nothing without it: a request the crisis
 * gate takes crisis-held notes out of leaves it out (withoutCrisisHeldNotes). Off: unmarked.
 */
export function generalRecallNote(note: string, env: Env = process.env): RecallNote {
  const extra = crisisNoMemoryRecallOn(env) ? { [WITHOUT_RECALLED_MEMORY]: '' } : undefined;
  return { note, id: recallNoteId(), ...(extra && { extra }) };
}

/** A fresh id for a recall note, under `prefix`. */
export function recallNoteId(prefix = RECALL_NOTE_ID_PREFIX): string {
  return `${prefix}${++recallNotes}`;
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
  id = recallNoteId()
): void {
  addRecallNotes(agent, [{ note, id }], said);
}

/** Several recall notes, in order, in one context change (so one restart, above). */
export function addRecallNotes(agent: RecallAgent, notes: RecallNote[], said?: string): void {
  if (notes.length === 0) return;
  const write = () => {
    const ctx = agent.chatCtx.copy();
    for (const { note, id, extra } of notes) {
      ctx.addMessage({ role: 'system', content: note, id, ...(extra && { extra }) });
    }
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

/**
 * FERNI_SELF_RECALL's note (self-recall.ts, what he told about his own life)
 * goes in on its own too, one per turn under this prefix, and is held on a
 * crisis exactly where the growth note is (sendRecall, crisis-gate.ts).
 */
export const SELF_NOTE_ID_PREFIX = `${RECALL_NOTE_ID_PREFIX}self_`;

const isSelfNote = (id: string | undefined): boolean => !!id?.startsWith(SELF_NOTE_ID_PREFIX);

/** The notes about Ferni himself that a crisis takes out: the growth note and every self note. */
const heldOnCrisis = (id: string | undefined): boolean => id === GROWTH_NOTE_ID || isSelfNote(id);

/**
 * The crisis signal both notes are held on: a crisis read noted or still settling on this
 * call, or crisis words in these caller words.
 */
export function crisisSignalOnCall(sessionId: string, said: string): boolean {
  return crisisRiskThisCall(sessionId, said) || scoreCrisisLanguage(said).isCrisis;
}

/** The self note of one transcript: none when nothing answers or a crisis signal held it. */
export interface SelfNote {
  note: string | null;
  crisis: boolean;
}

/**
 * The self note of the last transcript, kept apart from the recall note so it is sent on
 * its own (sendRecall). Each transcript is checked, not latched as the growth note is.
 */
export interface SelfNoteSlot {
  /** A new transcript: held when a crisis signal is on these words or this call. */
  heard(said: string): void;
  held(): boolean;
  /** This transcript's note; true when there is one. */
  set(note: string | null): boolean;
  /** Taken once: then empty. */
  take(): SelfNote;
}

/**
 * A self note slot for one call. `on` is FERNI_SELF_RECALL. No call id, or a failed check,
 * holds the note, as the growth note is held (persona-growth-recall.ts).
 */
export function selfNoteSlot(sessionId: string | undefined, on: boolean): SelfNoteSlot {
  let now: SelfNote = { note: null, crisis: false };
  const signal = (said: string): boolean => {
    try {
      return !sessionId || crisisSignalOnCall(sessionId, said);
    } catch (error) {
      log.warn({ error: String(error) }, 'Self note crisis check failed; holding it');
      return true;
    }
  };
  return {
    heard(said) {
      now = { note: null, crisis: on && !!said && signal(said) };
    },
    held: () => now.crisis,
    set(note) {
      now = { ...now, note };
      return note !== null;
    },
    take() {
      const taken = now;
      now = { note: null, crisis: false };
      return taken;
    },
  };
}

/** Take the growth note back out of the chat (a crisis showed on the call); how many went. */
export function dropGrowthNote(agent: RecallAgent, said?: string): number {
  return dropNotes(agent, (i) => i?.id === GROWTH_NOTE_ID, said);
}

/** Take every self note back out of the chat (a crisis showed on the call); how many went. */
export function dropSelfNotes(agent: RecallAgent, said?: string): number {
  return dropNotes(agent, (i) => isSelfNote(i?.id), said);
}

type HeldItem = { id?: string; extra?: Record<string, unknown> };

/**
 * A request without the growth note or any self note: a crisis-guided reply, or
 * any reply on a call with risk noted, never sees them (crisis-gate.ts). With
 * CRISIS_NO_MEMORY_RECALL on, nor the caller's recalled memories: a note that
 * carries them goes in as its text without them (crisis-memory-recall.ts).
 */
export function withoutCrisisHeldNotes<C extends { items: HeldItem[]; copy(): C }>(
  chatCtx: C,
  when = true,
  env: Env = process.env
): C {
  const memory = when && crisisNoMemoryRecallOn(env);
  const held = (i: HeldItem) => heldOnCrisis(i?.id) || (memory && memoryFreeText(i) !== undefined);
  if (!when || !chatCtx.items.some(held)) return chatCtx;
  const ctx = chatCtx.copy();
  const kept = ctx.items.filter((i) => !heldOnCrisis(i?.id));
  ctx.items = memory ? withoutRecalledMemory(kept) : kept;
  return ctx;
}
