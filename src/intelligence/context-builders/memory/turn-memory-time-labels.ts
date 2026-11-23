/**
 * Per-turn memories carry when they were said and where the event they name
 * stands now (#2530), with TURN_MEMORY_TIME_LABELS on.
 *
 * Dev, memory flags on (1cf4bd64b): the caller's snack-mom duty was at
 * Saturday's tournament, still ahead, and a mid-call reply said "I hope you
 * survived being the snack mom", from a memory injected that turn. The hello
 * already reads an event's state (greeting-not-yet.ts, #2482); the per-turn
 * memory block did not, and gave no hint of when a line was said, so another
 * call heard "not what you said earlier this morning" about a line from two
 * minutes before, at night.
 *
 * Each memory with a saved time now leads with when it was said, read on the
 * caller's clock ("a few minutes ago", "earlier today", "yesterday"), and, if
 * it names a time, whether that is still ahead, going on now or over
 * (eventState, the hello's own rule). Off, the block is exactly as before.
 *
 * @module intelligence/context-builders/memory/turn-memory-time-labels
 */
import { flagOn, type Env } from '../../../config/env-flag.js';
import {
  formatMemoryContextForPrompt,
  formatProactiveMemory,
  type MemoryContext,
  type RetrievedMemoryForTurn,
} from '../../../memory/retrieval/index.js';
import {
  eventState,
  resolveTimes,
  sentenceTense,
  warmTemporalParser,
  type EventState,
} from '../../../understanding/temporal/index.js';
import { calendarDaysSince, daysAgoInWords } from '../../../utils/calendar-days.js';
import { userTimeZone } from '../../../utils/caller-time-zone.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** TURN_MEMORY_TIME_LABELS. */
function turnMemoryTimeLabelsOn(env: Env = process.env): boolean {
  return flagOn('TURN_MEMORY_TIME_LABELS', env);
}

/** What the reply model is told about an event's state. */
const STATE_WORDS: Record<EventState, string> = {
  upcoming: 'still ahead, not happened yet',
  ongoing: 'going on now',
  past: 'already over',
};

/** Follows the block when a memory names a time: one example per label, nothing to copy word for word. */
const TIME_LABEL_EXAMPLE =
  'Go by these time labels. A plan still ahead has not happened, so "good luck Saturday", never "how did it go". A line said a few minutes ago was just now, so "you just said", never "this morning".';

/** How long ago a memory was saved, as a friend would say it, on the caller's calendar. */
function whenSaid(savedAt: number, now: number, timeZone?: string): string {
  const ago = Math.max(0, now - savedAt);
  if (ago < 15 * MINUTE_MS) return 'a few minutes ago';
  if (ago < HOUR_MS) return 'within the last hour';
  return daysAgoInWords(calendarDaysSince(savedAt, now, timeZone));
}

/**
 * Where the time a memory names stands now, read from when it was saved in
 * the tense its verbs give, as the hello reads a topic (greeting-not-yet.ts).
 * A time going on now wins, then one still ahead, so "the first round was
 * last Saturday, the final is next Saturday" is still ahead. An ambiguous
 * reading counts: "next Saturday" said on a Wednesday is this week's or the
 * next, ahead either way. Undefined when it names none.
 */
function memoryEventState(
  text: string,
  savedAt: number,
  now: number,
  timeZone?: string
): EventState | undefined {
  const states = resolveTimes(text, savedAt, timeZone, { tense: sentenceTense(text) }).map((t) =>
    eventState(t, now, timeZone)
  );
  return (['ongoing', 'upcoming', 'past'] as const).find((s) => states.includes(s));
}

/** The memory with its labels in the attribution, or as it was when it has no saved time. */
function labelled(
  memory: RetrievedMemoryForTurn,
  now: number,
  timeZone?: string
): { memory: RetrievedMemoryForTurn; timed: boolean } {
  const savedAt = memory.timestamp?.getTime();
  if (savedAt === undefined || !Number.isFinite(savedAt)) return { memory, timed: false };
  const state = memoryEventState(memory.content, savedAt, now, timeZone);
  const said = `Said ${whenSaid(savedAt, now, timeZone)}`;
  const attribution = state ? `${said} (${STATE_WORDS[state]})` : said;
  return { memory: { ...memory, attribution }, timed: state !== undefined };
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
  if (!turnMemoryTimeLabelsOn(env)) {
    return {
      memory: formatMemoryContextForPrompt(context),
      proactive: proactiveHint(context.proactiveMemory),
    };
  }
  void warmTemporalParser(); // rules only until compromise loads, once per process
  const zone = userTimeZone(call);
  const shown = context.memories.map((m) => labelled(m, now, zone));
  const block = formatMemoryContextForPrompt({ ...context, memories: shown.map((s) => s.memory) });
  const memory = block && shown.some((s) => s.timed) ? `${block}\n${TIME_LABEL_EXAMPLE}` : block;
  const pro = context.proactiveMemory && labelled(context.proactiveMemory, now, zone).memory;
  return { memory, proactive: proactiveHint(pro) };
}
