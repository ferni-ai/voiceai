/**
 * A returning caller's hello must say who (or what) its callback is about.
 *
 * Prod (issue #2388): "Hey Seth. Did you end up calling her yesterday?" and
 * "Hey Seth. Did you end up checking in with her later on?" opened returning
 * calls, and the caller had to ask "Calling who?". The hello's direction asks
 * the model to name the thing (GREETING_DIRECTION), but nothing checked the
 * line. With GREETING_NAMES_WHO on, a hello with a question whose object is a
 * bare "her", "him", "them", "it" or "that", and that never says who or what
 * in that sentence, is turned away and the scripted hello plays instead.
 *
 * Narrow on purpose. It reads Ferni's own line, never the caller's; a false
 * positive costs one callback (the scripted hello plays), a miss keeps today's
 * behaviour. A pronoun that is the subject ("Did that help?", "How did it
 * go?") is left alone: the check is for a callback's object.
 *
 * @module agents/multi-agent/greeting-names-who
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { KIN, NOT_PEOPLE } from '../personas/unclear-turn.js';

const PERSON = new Set(['her', 'him', 'them']);
const THING = new Set(['it', 'that']);
/** Right before one of these, a pronoun is the subject ("did that help", "how'd it go"). */
const SUBJECT_AFTER = new Set(
  "did didn't does do was were is isn't has had will would could can how how'd how's what's where's and but so or if".split(
    ' '
  )
);
/** After "that", these leave it bare ("figure that out"); any other word makes it "that essay". */
const AFTER_BARE =
  /^(?:out|up|off|over|back|again|yet|later|yesterday|today|tonight|already|after|in|on|with|to|about|for|by|then|or|and|at|this|last|ok|okay)$/;
/** "the interview", "your move": a thing the line names. */
const NAMED_THING = /\b(?:the|your|my|our|his|their)\s+[a-z]/i;

const words = (sentence: string): string[] =>
  sentence
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z']/g, ''))
    .filter(Boolean);

/** A capitalised name in the sentence that is not the caller, "I" or a day, month or opener. */
function namesSomeone(tokens: string[], raw: string[], caller: string | undefined): boolean {
  return tokens.some((word, i) => {
    const bare = word.replace(/'s$/, '');
    if (!/^[A-Z][a-z]+$/.test(bare)) return false;
    if (NOT_PEOPLE.has(bare.toLowerCase()) || bare.toLowerCase() === caller) return false;
    return i > 0 || /,$/.test(raw[0] ?? ''); // "Maya, did you call her?"
  });
}

/** A pronoun that is the object of the question and says nothing about who or what. */
function bareObject(tokens: string[], i: number): 'person' | 'thing' | undefined {
  const word = tokens[i].toLowerCase();
  const before = tokens[i - 1]?.toLowerCase();
  const after = tokens[i + 1]?.toLowerCase();
  if (before === undefined || SUBJECT_AFTER.has(before)) return undefined;
  if (PERSON.has(word)) return after && KIN.has(after) ? undefined : 'person'; // "her sister"
  if (!THING.has(word) || /^mak(?:e|es|ing)$|^made$/.test(before)) return undefined; // "make it"
  if (word === 'that' && after && !AFTER_BARE.test(after)) return undefined; // "that essay"
  return 'thing';
}

/** True for a question that asks about "her" or "it" and never says who or what. */
function questionNamesNoOne(sentence: string, caller: string | undefined): boolean {
  const raw = sentence.trim().split(/\s+/);
  const tokens = words(sentence);
  const kinds = tokens.map((_, i) => bareObject(tokens, i)).filter(Boolean);
  if (kinds.length === 0) return false;
  if (namesSomeone(tokens, raw, caller) || tokens.some((w) => KIN.has(w.toLowerCase())))
    return false;
  return kinds.includes('person') || !NAMED_THING.test(sentence);
}

/** True when a question in the hello is a callback that never says who or what it is about. */
export function callbackNamesNoOne(line: string, userName?: string): boolean {
  const caller = userName?.trim().split(/\s+/)[0]?.toLowerCase();
  const questions = line.match(/[^.!?]*\?/g) ?? [];
  return questions.some((q) => questionNamesNoOne(q, caller));
}

/** The returning caller's hello guard (the cue's `rejectIf`): undefined with the flag off. */
export function namesWhoCheck(
  userName: string | undefined,
  env: Env = process.env
): ((line: string) => boolean) | undefined {
  if (!flagOn('GREETING_NAMES_WHO', env)) return undefined;
  return (line) => callbackNamesNoOne(line, userName);
}
