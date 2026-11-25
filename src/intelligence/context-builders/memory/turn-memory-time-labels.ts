/**
 * Per-turn memories carry when they were said and where the times they name
 * stand now (#2530), with MEMORY_TIME_LABELS on: the attribution becomes
 * "Said a few minutes ago" and each dated clause is marked, by the same rules
 * as the system prompt's last-call summary (understanding/temporal/memory-time.ts).
 * A memory with no saved time is left as it was. Off, the block is exactly as before.
 *
 * @module intelligence/context-builders/memory/turn-memory-time-labels
 */
import { type Env } from '../../../config/env-flag.js';
import {
  formatMemoryContextForPrompt,
  formatProactiveMemory,
  type MemoryContext,
  type RetrievedMemoryForTurn,
} from '../../../memory/retrieval/index.js';
import { labelTimes, memoryTimeLabelsOn, whenSaid } from '../../../understanding/temporal/index.js';
import { userTimeZone } from '../../../utils/caller-time-zone.js';

/** The memory with its time marks, or as it was when it has no saved time. */
function labelled(
  memory: RetrievedMemoryForTurn,
  now: number,
  timeZone?: string
): RetrievedMemoryForTurn {
  const savedAt = memory.timestamp?.getTime();
  if (savedAt === undefined || !Number.isFinite(savedAt)) return memory;
  const content = labelTimes(memory.content, savedAt, now, timeZone).text;
  return { ...memory, content, attribution: `Said ${whenSaid(savedAt, now, timeZone)}` };
}

/** The turn's memory block and proactive hint (with its memory's relevance), as they go into the prompt. */
export interface TurnMemoryPrompts {
  memory: string | null;
  proactive?: { text: string; relevance: number };
}

function proactiveHint(memory: RetrievedMemoryForTurn | undefined): TurnMemoryPrompts['proactive'] {
  return memory && { text: formatProactiveMemory(memory), relevance: memory.relevance };
}

/**
 * The per-turn memory block and proactive hint for this call. Off, these are
 * formatMemoryContextForPrompt's and formatProactiveMemory's output unchanged.
 */
export function turnMemoryPrompts(
  context: MemoryContext,
  call: { sessionId?: string; userId?: string },
  now: number = Date.now(),
  env: Env = process.env
): TurnMemoryPrompts {
  if (!memoryTimeLabelsOn(env)) {
    return {
      memory: formatMemoryContextForPrompt(context),
      proactive: proactiveHint(context.proactiveMemory),
    };
  }
  const zone = userTimeZone(call);
  const memories = context.memories.map((m) => labelled(m, now, zone));
  const pro = context.proactiveMemory && labelled(context.proactiveMemory, now, zone);
  return {
    memory: formatMemoryContextForPrompt({ ...context, memories }),
    proactive: proactiveHint(pro),
  };
}
