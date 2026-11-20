/**
 * A returning caller's hello must say who (or what) its callback is about.
 *
 * Prod (issue #2388): "Hey Seth. Did you end up calling her yesterday?" and
 * "Hey Seth. Did you end up checking in with her later on?" opened returning
 * calls, and the caller had to ask "Calling who?". The hello's direction asks
 * the model to name the thing (GREETING_DIRECTION), but nothing checked the
 * line. With GREETING_NAMES_WHO on, a hello with a question whose object is a
 * bare "her", "him", "them", "it" or "that", where nothing in that question or
 * before it says who or what, is turned away and the scripted hello plays.
 *
 * Narrow on purpose. It reads Ferni's own line, never the caller's; a false
 * positive costs one callback (the scripted hello plays), a miss keeps today's
 * behaviour. A pronoun that is the subject ("Did that help?", "How did it
 * go?") is left alone: the check is for a callback's object.
 *
 * @module agents/multi-agent/greeting-names-who
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { ACTS, KIN, NOT_PEOPLE } from '../personas/unclear-turn.js';

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

/** Capitalised words that open a sentence without naming anyone ("You said", "Morning, Sam"). */
const OPENERS = new Set(
  'you we they did how morning evening afternoon well good nice hello long'.split(' ')
);

/**
 * A capitalised name in the sentence that is not the caller, "I" or a day, month
 * or opener. A sentence's first word counts only when it reads as someone:
 * "Maya, did you", "Priya was flying in", "Priya's flight".
 */
function namesSomeone(tokens: string[], raw: string[], caller: string | undefined): boolean {
  return tokens.some((word, i) => {
    const bare = word.replace(/'s$/, '');
    const lower = bare.toLowerCase();
    if (!/^[A-Z][a-z]+$/.test(bare) || NOT_PEOPLE.has(lower) || lower === caller) return false;
    if (i > 0) return true;
    if (OPENERS.has(lower)) return false;
    return /,$/.test(raw[0] ?? '') || bare !== word || ACTS.test(tokens[1]?.toLowerCase() ?? '');
  });
}

/** A pronoun that is the object of the question and says nothing about who or what. */
function bareObject(tokens: string[], i: number): boolean {
  const word = tokens[i].toLowerCase();
  const before = tokens[i - 1]?.toLowerCase();
  const after = tokens[i + 1]?.toLowerCase();
  if (before === undefined || SUBJECT_AFTER.has(before)) return false;
  if (PERSON.has(word)) return !(after && KIN.has(after)); // "her sister"
  if (!THING.has(word) || /^mak(?:e|es|ing)$|^made$/.test(before)) return false; // "make it"
  return word !== 'that' || !after || AFTER_BARE.test(after); // "that essay"
}

/** "Dr. Patel": a title's full stop does not end the sentence. */
const TITLE = /\b(Mr|Mrs|Ms|Dr|St|Jr)\./g;

/** The sentence names someone or something: a name, a kin word, "the interview". */
function namesAnything(sentence: string, caller: string | undefined): boolean {
  const tokens = words(sentence);
  return (
    namesSomeone(tokens, sentence.trim().split(/\s+/), caller) ||
    tokens.some((w) => KIN.has(w.toLowerCase().replace(/'s$/, ''))) ||
    NAMED_THING.test(sentence)
  );
}

/** A question in it has a bare object pronoun ("calling her", "figure that out"). */
function asksBare(sentence: string): boolean {
  if (!sentence.trim().endsWith('?')) return false;
  const tokens = words(sentence);
  return tokens.some((_, i) => bareObject(tokens, i));
}

/**
 * True when a question in the hello asks about "her" or "it" and nothing in it,
 * or in the hello before it, says who or what ("Priya was flying in. Did you
 * pick her up?" says who).
 */
export function callbackNamesNoOne(line: string, userName?: string): boolean {
  const caller = userName?.trim().split(/\s+/)[0]?.toLowerCase();
  const sentences = line.replace(TITLE, '$1').match(/[^.!?]+[.!?]*/g) ?? [];
  let named = false;
  for (const sentence of sentences) {
    named ||= namesAnything(sentence, caller);
    if (!named && asksBare(sentence)) return true;
  }
  return false;
}

/** The returning caller's hello guard (the cue's `rejectIf`): undefined with the flag off. */
export function namesWhoCheck(
  userName: string | undefined,
  env: Env = process.env
): ((line: string) => boolean) | undefined {
  if (!flagOn('GREETING_NAMES_WHO', env)) return undefined;
  return (line) => callbackNamesNoOne(line, userName);
}
