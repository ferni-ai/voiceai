/**
 * ARRIVAL_LINE_GROUNDED (off by default): a teammate's first line on a handoff restates only
 * what the caller said, or is a plain hello, and is never kept as a record of the caller.
 *
 * Prod calls (October 2026): arrival lines added what the caller never said, such as a
 * job offer they were "weighing" or a riff about something "playing hide and seek". The
 * call's summary kept the invented detail as the caller's, and later calls asked about it.
 * The claim filter (ungroundedClaim, handoff-brief.ts) only catches claim-shaped
 * sentences ("Ferni told me...", "you're ...ing"). With the flag on:
 * - the caller only asked for the teammate: no line is written, the plain hello is said;
 * - the director is told to restate the caller's words and add nothing of its own;
 * - a written line with a content word that is neither the caller's nor in the facts the
 *   director was given (their quoted words, the hour) is dropped for the plain hello;
 * - the teammate's first line is held out of the call's summary, fact extraction and
 *   conversation thread: it is the teammate speaking, never a record of the caller.
 * The line names the caller's reason in their words, never re-asks it and never repeats an
 * earlier arrival on the call: arrival-reason.ts.
 *
 * @module agents/multi-agent/arrival-grounding
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { sameWord, topicWords } from './caller-words.js';

export function arrivalGrounded(env: Env = process.env): boolean {
  return flagOn('ARRIVAL_LINE_GROUNDED', env);
}

/** Added to the director's cue for the first line when the flag is on. */
export const ARRIVAL_DIRECTION_GROUNDED =
  ' Use only words the caller actually said: add nothing of your own, no guess at how they feel, no detail, no joke or image. If the facts hold nothing they said, just say a warm hello.';

/** Words a hello is made of: they say nothing about the caller's life. */
const HELLO = new Set(
  "here there listening listen back catch caught along around join joining joined jump jumping hop happy welcome tell share whatever anything something everything maybe absolutely course hang walk hiya howdy i'll i'd we'll you'll guess bet huh".split(
    ' '
  )
);

/** True when the caller said something a line could restate (not just a teammate's name). */
export function callerSaidSomething(callerLines: string[]): boolean {
  return callerLines.some((line) => topicWords(line).length > 0);
}

/**
 * The content words of `line` found neither in `grounds` (the caller's words and the
 * facts the director was given) nor among a hello's words. Empty means it adds nothing.
 */
export function addedWords(line: string, grounds: string[]): string[] {
  const known = topicWords(grounds.join(' '));
  // "it's" reads as "it" (session-recall drops "'s"): too short to be about anything
  return topicWords(line).filter(
    (w) => w.length >= 3 && !HELLO.has(w) && !known.some((k) => sameWord(w, k))
  );
}

/** How long a first line is remembered for matching once spoken: it is committed in seconds. */
const HOLD_MS = 10 * 60_000;
const held = new Map<string, Array<{ text: string; until: number }>>();

/** Lowercase words only, so a line matches as spoken (no SSML, tags or punctuation). */
const normal = (text: string): string =>
  text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[a-z_ ]+\]/gi, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function prune(now: number): void {
  for (const [sessionId, lines] of held) {
    const live = lines.filter((l) => l.until > now);
    if (live.length === 0) held.delete(sessionId);
    else held.set(sessionId, live);
  }
}

/** Marks `line` as the teammate's first line on this call; returns it, for use inline. */
export function holdOutOfMemory(
  sessionId: string,
  line: string,
  env: Env = process.env,
  now = Date.now()
): string {
  if (!arrivalGrounded(env) || !normal(line)) return line;
  prune(now);
  held.set(sessionId, [
    ...(held.get(sessionId) ?? []),
    { text: normal(line), until: now + HOLD_MS },
  ]);
  return line;
}

/** True when `spoken` is a held first line, whole or cut short by the caller. */
export function heldOutOfMemory(
  sessionId: string,
  spoken: string,
  env: Env = process.env,
  now = Date.now()
): boolean {
  if (!arrivalGrounded(env)) return false;
  const heard = normal(spoken);
  if (!heard) return false;
  return (held.get(sessionId) ?? []).some(
    (l) => l.until > now && (l.text === heard || (heard.length >= 16 && l.text.startsWith(heard)))
  );
}

/** For tests: forgets every held line. */
export function clearHeldLines(): void {
  held.clear();
}
