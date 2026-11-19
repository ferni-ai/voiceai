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
 * The same forms are the one reader of whether a reply names 988 or 911 (names988, names911,
 * offersCrisisLine): what this pass turns into speech, a presence check must count as said.
 *
 * @module services/safety/crisis-line-speech
 */
import { TransformStream } from 'node:stream/web';

import { flagOn, type Env } from '../../config/env-flag.js';

export const CRISIS_LINE_SPOKEN = 'nine eight eight';

const SEP = String.raw`[\s-]+`;
/** Spelled-out wrong forms: ninety-eight-eight, ninety-eighty-eight, nine-eighty-eight. */
const SPELLED = String.raw`\b(?:ninety${SEP}eighty?|nine${SEP}eighty)${SEP}eight\b`;
/** Digits that are not part of a longer number, an amount or a word. */
const ALONE_BEFORE = String.raw`(?<![\w$€£#]|\d[.,])`;
const ALONE_AFTER = String.raw`(?![\w%]|[.,]\d)`;
/** 988, 9-8-8 or 9 8 8, standing alone. */
const DIGITS = `${ALONE_BEFORE}(?:988|9-8-8|9 8 8)${ALONE_AFTER}`;
/**
 * CRISIS_988_STRICT_PRESENCE (#4026): DIGITS, but not a dash-joined part of a longer number
 * (1-988-555, 9-8-8-0), not the spaced form with one more lone digit (9 8 8 0), and not an amount
 * (988 dollars). "988 24/7", "988, 24/7" and "988-lifeline" read as DIGITS does.
 */
const AMOUNT = String.raw`(?![ ]{0,3}(?:dollars?|bucks|cents?|usd|euros?|pounds?)\b)`;
const STRICT_DIGITS = String.raw`(?<!\d-)${ALONE_BEFORE}(?:988|9-8-8|9 8 8(?! \d(?:$|[.,;:!?)]| \d)))${ALONE_AFTER}(?!-\d)${AMOUNT}`;
const LINE = new RegExp(`${SPELLED}|${DIGITS}`, 'gi');
const CUE = /^(?:call|calling|text|texting|dial|dialing|line|lifeline|hotline|crisis|suicide)$/i;

/** Written transcripts also put commas between the words; the speech rewrite keeps SEP. */
const LIST_SEP = String.raw`[\s,-]+`;
/** The line already in words: "nine eight eight", "nine-eight-eight", "nine, eight, eight". */
const SPOKEN = String.raw`\bnine${LIST_SEP}eight${LIST_SEP}eight\b`;
/** The line in Spanish words, as a Spanish reply says it: "nueve ocho ocho". */
const SPOKEN_ES = String.raw`\bnueve${LIST_SEP}ocho${LIST_SEP}ocho\b`;
/** The line's site written as one word (988lifeline.org), which DIGITS reads as a longer word. */
const SITE = String.raw`\b988lifeline\b`;
const namesWith = (digits: string): RegExp =>
  new RegExp(`${SPELLED}|${digits}|${SPOKEN}|${SPOKEN_ES}|${SITE}`, 'i');
const NAMES_988 = namesWith(DIGITS);
const NAMES_988_STRICT = namesWith(STRICT_DIGITS);
/** Whether the strict 988 reader is on: only where a miss adds the line (names988, says988). */
const strict = (): boolean => flagOn('CRISIS_988_STRICT_PRESENCE');
/** 911 as digits (911 as main reads it; 9-1-1 and 9 1 1 standing alone), or in words. */
const NAMES_911 = new RegExp(
  String.raw`\b911\b|${ALONE_BEFORE}(?:9-1-1|9 1 1)${ALONE_AFTER}|\bnine${LIST_SEP}one${LIST_SEP}one\b|\bnueve${LIST_SEP}uno${LIST_SEP}uno\b`,
  'i'
);
/** The Crisis Text Line's number: 741741, 741-741, 7 4 1 7 4 1, or in words. */
const TEXT_LINE_NUMBER = new RegExp(
  String.raw`(?<![\w$])7[\s-]?4[\s-]?1[\s-]?7[\s-]?4[\s-]?1(?!\w)|\bseven${SEP}four${SEP}one${SEP}seven${SEP}four${SEP}one\b`,
  'i'
);
/** A crisis line by name: a lifeline, a crisis or suicide (hot)line, the Crisis Text Line. */
const NAMED = /\blifeline\b|\b(?:crisis|suicide)\s+(?:text\s+)?(?:hot)?line\b/i;

/** Every Unicode dash or hyphen (‐ ‑ ‒ – — ― and the minus sign −). */
const UNICODE_DASH = /[\u2010-\u2015\u2212]/g;
/** Every Unicode space a model writes between digits or words (no-break, thin, figure ...). */
const UNICODE_SPACE = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * The text as the 988 and 911 patterns read it: a model writes "9–8–8" (en dash), "9‑8‑8"
 * (non-breaking hyphen) or "9 8 8" with no-break spaces as readily as the ASCII forms, so every
 * Unicode dash becomes "-" and every Unicode space " " once, here, instead of in each pattern.
 * Presence only: the speech rewrite and the transcript keep the text as written.
 */
const asWritten = (text: string): string =>
  text.replace(UNICODE_DASH, '-').replace(UNICODE_SPACE, ' ');

/**
 * The one reader of whether text names 988, in any form a reply writes it: digits (988, 9-8-8,
 * 9 8 8, never "$988" or part of a longer number), English words ("nine eight eight",
 * "ninety-eight-eight", "nine-eighty-eight"), Spanish words ("nueve ocho ocho"), or the site
 * (988lifeline.org), with any Unicode dash or space between the parts. The 988 floor and the
 * timeout check-in read presence here, so a reply that already gave the line in any of these
 * forms never hears it twice. With CRISIS_988_STRICT_PRESENCE on it reads the strict digits
 * (#4026), where a miss only adds the line.
 */
export const names988 = (text: string): boolean =>
  strict() ? NAMES_988_STRICT.test(asWritten(text)) : names988Wide(text);

/** names988 as main reads it, always: for readers where a miss costs more than a false read. */
const names988Wide = (text: string): boolean => NAMES_988.test(asWritten(text));

/**
 * The one reader of whether text names 911: 911, 9-1-1, 9 1 1, "nine one one" or "nueve uno
 * uno", with any Unicode dash or space between the parts. Digit 911 reads exactly as main's
 * `\b911\b` (the imminent script's own text is digits).
 */
export const names911 = (text: string): boolean => NAMES_911.test(asWritten(text));

/**
 * Whether text gives someone a crisis line, in any form a reply writes it: 988 in any form
 * names988 reads, the Crisis Text Line's number (741741 in digits or words), or a line by name
 * ("Suicide and Crisis Lifeline", "crisis line", "Crisis Text Line"). For readers of a finished
 * transcript (wellbeing-tracking/after-call.ts), which keeps what was written. Only the 988 part
 * reads Unicode dashes and spaces (names988); the 741741 and by-name parts read as main does.
 */
export function offersCrisisLine(text: string): boolean {
  // Always the wide reader: a miss here (a crisis call recorded, a help line dropped) costs more.
  return names988Wide(text) || TEXT_LINE_NUMBER.test(text) || NAMED.test(text);
}

const DIGITS_ONLY = new RegExp(DIGITS);
const STRICT_DIGITS_ONLY = new RegExp(STRICT_DIGITS, 'i');

/**
 * Whether text carries 988 as a number someone can dial or text: 988, 9-8-8 or 9 8 8, never "$988"
 * or part of a longer number. Narrower than offersCrisisLine on purpose: a line named without its
 * number ("a crisis line") is not 988, so a reply that must carry 988 still gets it.
 */
export function says988(text: string): boolean {
  return (strict() ? STRICT_DIGITS_ONLY : DIGITS_ONLY).test(text);
}
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
