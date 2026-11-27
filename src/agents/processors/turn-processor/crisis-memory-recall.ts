/**
 * The caller's recalled memories never reach a crisis reply (CRISIS_NO_MEMORY_RECALL).
 *
 * Stored caller memory (retrieval-join.ts's per-turn memories, and every injection category the
 * registry marks, intelligence/utils/caller-memory-categories.ts) goes into the turn's background
 * note (inject-context.ts), and the pusher folds that into the one pushed turn-context note
 * (turn-intelligence.ts). The note sits in history and reaches every later reply, a crisis-guided
 * one included: a note from an earlier ordinary turn too. With the flag on:
 *
 * - a line with crisis words, or a call with risk noted or a read in flight, runs no memory
 *   search at all (skipsRecall, turn-handler.ts), and builds no recall note
 *   (memory-recall-hook.ts noteFor);
 * - a turn whose own crisis read replaced, guided or eased the reply (crisisReadTurn, where no
 *   read counts as a crisis), or a call with risk noted (a read that failed or came late notes
 *   it), builds its note without that memory;
 * - every other note carries, in its `extra`, its text without that memory (recall's general
 *   note and the mind note, recall-note.ts callerMemoryNote, carry nothing: left out whole),
 *   and a request the crisis gate takes crisis-held notes out of (recall-note.ts
 *   withoutCrisisHeldNotes: every guided request, every request on a call with risk noted, and
 *   a held reply whose read failed) gets that text instead.
 *
 * An ordinary turn's request is byte-equal to the flag off: the model never reads `extra`.
 *
 * @module agents/processors/turn-processor/crisis-memory-recall
 */
import { flagOn, type Env } from '../../../config/env-flag.js';
import { carriesCallerMemory } from '../../../intelligence/utils/index.js';
import {
  crisisRiskNoted,
  crisisRiskThisCall,
  scoreCrisisLanguage,
} from '../../../services/safety/index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { crisisReadTurn } from '../../voice-agent/crisis-turn-memory.js';
import type { CrisisDetection } from '../types.js';

const log = createLogger({ module: 'CrisisMemoryRecall' });

export function crisisNoMemoryRecallOn(env: Env = process.env): boolean {
  return flagOn('CRISIS_NO_MEMORY_RECALL', env);
}

/** Categories whose content carries what is stored about the caller (the shared registry). */
const isRecalledMemory = carriesCallerMemory;

/**
 * Whether the turn's memory search is skipped before it starts (turn-handler.ts): a call with
 * crisis risk noted or a read in flight, or crisis words the patterns read in this line. The
 * turn's own classifier read is not known yet; withoutHeldMemory holds what that read finds.
 */
export function skipsRecall(sessionId: string | undefined, said: string, env: Env = process.env) {
  if (!crisisNoMemoryRecallOn(env)) return false;
  try {
    return (!!sessionId && crisisRiskThisCall(sessionId)) || scoreCrisisLanguage(said).isCrisis;
  } catch (error) {
    log.warn({ error: String(error) }, 'Crisis recall check failed; skipping the memory search');
    return true;
  }
}

/** Whether this turn's note leaves recalled memory out. A check that throws leaves it out. */
function memoryHeldOnTurn(crisis: CrisisDetection | undefined, sessionId: string | undefined) {
  try {
    return crisisReadTurn(crisis) || (!!sessionId && crisisRiskNoted(sessionId));
  } catch (error) {
    log.warn({ error: String(error) }, 'Crisis memory check failed; holding recalled memory');
    return true;
  }
}

/** The turn's injections, without recalled memory when the turn holds it (flag on). */
export function withoutHeldMemory<I extends { category: string }>(
  injections: I[],
  turn: { crisis: CrisisDetection | undefined; sessionId: string | undefined },
  env: Env = process.env
): I[] {
  if (!crisisNoMemoryRecallOn(env) || !memoryHeldOnTurn(turn.crisis, turn.sessionId)) {
    return injections;
  }
  const kept = injections.filter((injection) => !isRecalledMemory(injection.category));
  const held = injections.length - kept.length;
  if (held > 0) log.info({ held }, 'CRISIS_MEMORY_RECALL_HELD');
  return kept;
}

/** The key, in a message's `extra`, of its whole text without recalled memory ('' for none). */
export const WITHOUT_RECALLED_MEMORY = 'withoutRecalledMemory';

/** The `extra` of a note made of these injections: its text without recalled memory, if it has any. */
export function memoryFreeExtra<I extends { category: string }>(
  injections: I[],
  join: (list: I[]) => string,
  env: Env = process.env
): Record<string, string> | undefined {
  if (!crisisNoMemoryRecallOn(env) || !injections.some((i) => isRecalledMemory(i.category))) {
    return undefined;
  }
  return {
    [WITHOUT_RECALLED_MEMORY]: join(injections.filter((i) => !isRecalledMemory(i.category))),
  };
}

type Extra = { extra?: Record<string, unknown> };

/** A message's text without recalled memory, or undefined when it carries none. */
export function memoryFreeText(item: Extra | undefined): string | undefined {
  const text = item?.extra?.[WITHOUT_RECALLED_MEMORY];
  return typeof text === 'string' ? text : undefined;
}

/**
 * The items with each message that carries recalled memory put back as its text without it,
 * and left out when that is nothing. A copy of each one: the request's items are the agent's.
 */
export function withoutRecalledMemory<T extends Extra>(items: readonly T[]): T[] {
  return items.flatMap((item) => {
    const text = memoryFreeText(item);
    if (text === undefined) return [item];
    if (text === '') return [];
    const copy = Object.create(Object.getPrototypeOf(item) as object) as T;
    return [
      Object.assign(copy, item, { content: [text], extra: withoutMemoryFreeText(item.extra) }),
    ];
  });
}

/** A copy of `extra` without the memory-free text, for a note cut to less than that text. */
export function withoutMemoryFreeText(
  extra: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!extra || !(WITHOUT_RECALLED_MEMORY in extra)) return extra;
  const { [WITHOUT_RECALLED_MEMORY]: _dropped, ...rest } = extra;
  return rest;
}
