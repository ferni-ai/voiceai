/**
 * Say the caller's name in a greeting as a statement, not a question.
 *
 * Measured on Ferni's voice (sonic-3.6-2026-08-27, controlled clips plus the
 * long-day eval recordings, 2026-10-13): Sonic voices an opening vocative with
 * a low-rising (question) contour when the name runs on into the rest of the
 * reply. "Hey Seth, how's it going?" pushed as one piece rose about 5 st
 * across "Seth" (the eval's "Hey Sam, ..." greetings: 7 of 9 rose 3 st or
 * more). Pushed on its own as "Hey Seth." the name stayed level (about 2.5
 * st, mostly noise). A stressed greeting word in front of the name ("Morning,
 * Seth, ...") made it rise about 7-8 st whatever the punctuation or chunking;
 * "Hey Seth. Morning." did not.
 *
 * So, behind NAME_FALLING_INTONATION, a reply that opens on a greeting plus a
 * name is rewritten before it is chunked:
 * - "Hey Seth, how's it going?" -> "Hey Seth. How's it going?"
 * - "Morning, Seth, did you..." -> "Hey Seth. Morning. Did you..."
 * The chunker then sends "Hey Seth." to Cartesia as its own piece (a short
 * sentence may go first, chunk-boundary.ts). Only the start of a reply is
 * touched; a name later in a sentence ("That's rough, Sam.") already falls.
 *
 * NAME_FALLING_SPLIT (with the flag above), measured 2026-10-24 on the same
 * voice (voiceai-evidence/name-intonation-2026-10-24, Praat, 8 takes each):
 * - a name that opens the reply ends its own sentence: "Seth, good to hear
 *   your voice." rose 6.35 st, "Seth. Good to hear your voice." 1.44 st;
 * - a reaction word before the hello goes: "Oh hey Seth, how's it going?"
 *   rose 7.70 st, and 8.17 with a full stop after the name, against 1.97 for
 *   "Hey Seth." (the bright "Oh hey" lifts the name whatever follows it), so
 *   "Oh/Ah/Okay/Well (,) hey Seth, ..." is said "Hey Seth. ...". Checked on
 *   the code's own pushes (name-push-hold-2026-10-24): "Oh hey Seth, how was
 *   the run?" 6.58 st, as "Hey Seth. How was the run?" 2.39 st (16 takes).
 *
 * @module speech/tts-gateway/name-intonation
 */

import { TransformStream, type ReadableStream as NodeReadableStream } from 'node:stream/web';

import { flagOn } from '../../config/env-flag.js';
import { firstNameOf } from '../../utils/caller-name.js';

/** Leading markup the reply may open with: <emotion .../>, [laughter], spaces. */
const LEADING_MARKUP = /^(?:\s|<[^>]*>|\[[^\]]*\])*/;
/** Unstressed greetings: "Hey Seth." falls when it ends a piece. */
const FUSED = ['hey', 'hi', 'hiya', 'hello'];
/** Stressed greetings: the name after them rises, so the greeting moves after the name. */
const STRESSED = [
  'good morning',
  'good afternoon',
  'good evening',
  'morning',
  'afternoon',
  'evening',
];
const GREETINGS = [...STRESSED, ...FUSED]; // longest first, so "good morning" beats "morning"
const NAME = /^(,?)\s+(\p{Lu}[\p{L}'’-]*)/u;
/** Capitalized words that follow a greeting but are not a name. */
const NOT_NAMES = new Set(
  (
    'i im ive ill id so look listen okay ok well yeah yes no oh wait sorry thanks thank ' +
    'there you everyone everybody all guys again good morning afternoon evening night ' +
    'ferni just quick real this that what how'
  ).split(' ')
);
/** After the name: a comma, full stop, exclamation or dash. A "?" is a real question; left alone. */
const AFTER_NAME = /^(?:[,.!…]+|\s*[—–]|\s+-(?=\s))/;

/** Reaction words before a hello ("Oh hey Seth,"), NAME_FALLING_SPLIT. */
const INTERJECTIONS = ['oh', 'ah', 'well', 'okay', 'ok'];
const INTERJECTION = /^(?:oh|ah|well|okay|ok),?\s+/i;
/** A name that opens the reply runs on with a comma or dash: "Seth, good to..." */
const RUNS_ON = /^(?:,|\s*[—–])\s*/;

/** Still waiting for text before the reply's opening can be decided. */
export const WAIT = Symbol('wait');

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The greeting the reply opens on, WAIT while it may still be one, or undefined. */
function openingGreeting(body: string, final: boolean): string | typeof WAIT | undefined {
  const lower = body.toLowerCase();
  if (!final && GREETINGS.some((g) => g.startsWith(lower) && g !== lower)) return WAIT;
  return GREETINGS.find((g) => lower.startsWith(g) && !/[\p{L}']/u.test(body.charAt(g.length)));
}

/** The name after the greeting and the text after it, WAIT, or null when it is not a vocative. */
function nameAndRest(
  afterGreeting: string,
  final: boolean
): { name: string; rest: string } | typeof WAIT | null {
  if (!final && /^,?\s*$/.test(afterGreeting)) return WAIT;
  const name = NAME.exec(afterGreeting);
  if (!name || NOT_NAMES.has(name[2].toLowerCase().replace(/['’]/g, ''))) return null;
  const afterName = afterGreeting.slice(name[0].length);
  if (!final && afterName === '') return WAIT; // the name may still be streaming
  const punct = AFTER_NAME.exec(afterName);
  const rest = afterName.slice(punct?.[0].length ?? 0);
  if (!final && rest.trim() === '') return WAIT; // next word not here yet
  if (!punct && rest.trim() !== '') return null; // "Hey Sam how" or "Hey Sam?": not a plain vocative
  return { name: name[2], rest };
}

/** The text after an opening "Oh " / "Ah, ", WAIT while one may be arriving, or undefined. */
function afterInterjection(body: string, final: boolean): string | typeof WAIT | undefined {
  const m = INTERJECTION.exec(body);
  if (m) return body.slice(m[0].length);
  const word = body.toLowerCase().replace(/,$/, '');
  if (!final && /^[a-z]*,?$/i.test(body) && INTERJECTIONS.some((w) => w.startsWith(word))) {
    return WAIT;
  }
  return undefined;
}

/** "Seth, good to hear you." -> "Seth. Good to hear you.", WAIT, or undefined. */
function nameFirst(body: string, final: boolean, name: string): string | typeof WAIT | undefined {
  if (!final && name.startsWith(body)) return WAIT;
  if (!body.startsWith(name)) return undefined;
  const mark = RUNS_ON.exec(body.slice(name.length));
  if (!mark) return undefined; // "Seth." already ends, "Seth's", "Seth and I"
  const rest = body.slice(name.length + mark[0].length);
  if (!final && rest === '') return WAIT;
  return rest === '' ? `${name}.` : `${name}. ${capitalize(rest)}`;
}

/** NAME_FALLING_SPLIT's openings: the rewritten text, WAIT, or undefined to go on. */
function splitOpening(
  text: string,
  markup: string,
  body: string,
  final: boolean,
  name: string | null
): string | typeof WAIT | undefined {
  const first = name ? nameFirst(body, final, name) : undefined;
  if (first !== undefined) return first === WAIT ? WAIT : `${markup}${first}`;
  const rest = afterInterjection(body, final);
  if (rest === WAIT || rest === undefined) return rest;
  // Only a hello with a name loses the reaction word: "Oh hey, that's cool" stays.
  const said = fallingVocative(rest, final);
  if (said === WAIT) return WAIT;
  return said === rest ? text : `${markup}${capitalize(said)}`;
}

/**
 * Rewrite an opening "greeting + name" so the name ends its own sentence.
 *
 * @param text - the start of a reply as streamed so far
 * @param final - true when the reply has no more text coming
 * @param split - NAME_FALLING_SPLIT: the caller's first name, when the session has one
 * @returns the text to speak, or WAIT while the opening could still be a
 *   greeting with a name and more text is coming
 */
export function fallingVocative(
  text: string,
  final: boolean,
  split?: { name: string | null }
): string | typeof WAIT {
  const markup = LEADING_MARKUP.exec(text)?.[0] ?? '';
  const body = text.slice(markup.length);
  if (split) {
    const said = splitOpening(text, markup, body, final, split.name);
    if (said !== undefined) return said;
  }
  const greeting = openingGreeting(body, final);
  if (greeting === WAIT) return WAIT;
  if (!greeting) return text;
  const parts = nameAndRest(body.slice(greeting.length), final);
  if (parts === WAIT) return WAIT;
  if (!parts) return text;

  const said = body.slice(0, greeting.length);
  const hello = STRESSED.includes(greeting)
    ? `Hey ${parts.name}. ${capitalize(said)}.`
    : `${said} ${parts.name}.`;
  const tail = parts.rest.trim() === '' ? parts.rest : ` ${capitalize(parts.rest.trimStart())}`;
  return `${markup}${hello}${tail}`;
}

/**
 * Hold a reply's first words just until fallingVocative() can decide, then
 * pass everything through. Text that does not open on a greeting is never held.
 */
export function withFallingVocative(
  textStream: NodeReadableStream<string>,
  env: Record<string, string | undefined> = process.env,
  callerName?: string
): NodeReadableStream<string> {
  if (!flagOn('NAME_FALLING_INTONATION', env)) return textStream;
  const split = flagOn('NAME_FALLING_SPLIT', env) ? { name: firstNameOf(callerName) } : undefined;
  let head: string | null = '';
  return textStream.pipeThrough(
    new TransformStream<string, string>({
      transform(chunk, controller) {
        if (head === null) {
          controller.enqueue(chunk);
          return;
        }
        head += chunk;
        const decided = fallingVocative(head, false, split);
        if (decided === WAIT) return;
        head = null;
        controller.enqueue(decided);
      },
      flush(controller) {
        if (head) controller.enqueue(fallingVocative(head, true, split) as string);
      },
    })
  );
}
