/**
 * Say the 988 crisis line as "nine eight eight" on every reply path.
 *
 * The scripted crisis response writes "988", but a model's free-text reply can
 * spell it as "ninety-eight-eight" or "nine eighty-eight", which the voice
 * reads as a different number. This pass runs on the text going to TTS (the
 * transcript keeps what was written) and turns every form of the line into
 * digits spoken one by one.
 *
 * - Spelled-out wrong forms ("ninety-eight-eight", "ninety eighty eight",
 *   "nine-eighty-eight") are always rewritten: nobody means anything else.
 * - Digit forms ("988", "9-8-8", "9 8 8") are rewritten only near a crisis
 *   line cue (call, text, dial, line, lifeline, hotline, crisis, suicide)
 *   within a few words, so "$988", "988 miles" or "room 988" stay as written.
 *
 * Kill switch: SPEAK_988_DIGITS (default on).
 *
 * @module services/safety/crisis-line-speech
 */
import { TransformStream } from 'node:stream/web';

import { flagOn, type Env } from '../../config/env-flag.js';

export const CRISIS_LINE_SPOKEN = 'nine eight eight';

const SEP = String.raw`[\s-]+`;
/** Spelled-out wrong forms: ninety-eight-eight, ninety-eighty-eight, nine-eighty-eight. */
const SPELLED = String.raw`\b(?:ninety${SEP}eighty?|nine${SEP}eighty)${SEP}eight\b`;
/** 988, 9-8-8 or 9 8 8, not part of a longer number, an amount or a word. */
const DIGITS = String.raw`(?<![\w$€£#]|\d[.,])(?:988|9-8-8|9 8 8)(?![\w%]|[.,]\d)`;
const LINE = new RegExp(`${SPELLED}|${DIGITS}`, 'gi');
const CUE = /^(?:call|calling|text|texting|dial|dialing|line|lifeline|hotline|crisis|suicide)$/i;
/** How many words either side of a digit form are searched for a cue. */
const CUE_WINDOW = 3;

function words(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z]/gi, ''))
    .filter(Boolean);
}

function nearCue(text: string, start: number, end: number): boolean {
  const before = words(text.slice(0, start)).slice(-CUE_WINDOW);
  const after = words(text.slice(end)).slice(0, CUE_WINDOW);
  return [...before, ...after].some((w) => CUE.test(w));
}

/**
 * Rewrite the crisis line to its spoken form. Only matches inside [from, to)
 * are rewritten; the text around them is context for the cue search.
 */
export function speakCrisisLine(text: string, from = 0, to = text.length): string {
  return text.replace(LINE, (m: string, at: number) => {
    if (at < from || at + m.length > to) return m;
    const digits = /\d/.test(m);
    return !digits || nearCue(text, at, at + m.length) ? CRISIS_LINE_SPOKEN : m;
  });
}

const LEAD = String.raw`^[^\w$€£#]*`;
/** A whole word that could start the line: a 9, "nine" or "ninety". */
const RISKY = new RegExp(String.raw`${LEAD}(?:9|nine(?:ty)?(?![a-z]))`, 'i');
/** A word still arriving that could grow into one ("9", "98", "n", "nin", "ninet"). */
const RISKY_PREFIX = new RegExp(
  String.raw`${LEAD}(?:9[\d-]*|n(?:i(?:n(?:e(?:t(?:y)?)?)?)?)?)$`,
  'i'
);
/** Words after a risky word before its rewrite is decided (3 for the line + the cue window). */
const SETTLE = 3 + CUE_WINDOW;
const CONTEXT_CHARS = 120;

/** Where the not-yet-decidable tail of `pending` begins. */
function holdFrom(pending: string): number {
  const tokens = [...pending.matchAll(/\S+/g)];
  const complete = /\S$/.test(pending) ? tokens.length - 1 : tokens.length;
  for (let i = 0; i < complete; i++) {
    if (complete - i - 1 < SETTLE && RISKY.test(tokens[i][0])) return tokens[i].index ?? 0;
  }
  if (complete === tokens.length) return pending.length;
  // A word still arriving is held if it is, or could grow into, a risky word.
  const last = tokens[complete];
  if (RISKY.test(last[0]) || RISKY_PREFIX.test(last[0])) return last.index ?? 0;
  return pending.length;
}

/**
 * Streaming form for the TTS text stream. Chunks split words anywhere, so a
 * word that could begin the line is held until enough words follow it to
 * decide (or the reply ends); everything else passes through at once.
 */
export function crisisLineSpeechTransform(env: Env = process.env): TransformStream<string, string> {
  if (!flagOn('SPEAK_988_DIGITS', env)) return new TransformStream<string, string>();
  let pending = '';
  let context = '';
  const release = (upTo: number): string => {
    // The held tail stays in view as after-context for the cue search.
    const all = speakCrisisLine(context + pending, context.length, context.length + upTo);
    const out = all.slice(context.length, all.length - (pending.length - upTo));
    pending = pending.slice(upTo);
    context = (context + out).slice(-CONTEXT_CHARS);
    return out;
  };
  return new TransformStream<string, string>({
    transform(chunk, controller) {
      pending += chunk;
      const out = release(holdFrom(pending));
      if (out) controller.enqueue(out);
    },
    flush(controller) {
      const out = release(pending.length);
      if (out) controller.enqueue(out);
    },
  });
}
