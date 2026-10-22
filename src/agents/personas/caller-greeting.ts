/**
 * Is the caller's turn only a hello, by its structure?
 *
 * On a return call Ferni's greeting asks about something ("did you end up sending
 * that resume to Dana?") and the caller answers "Hey Ferni, it's me." Read as an
 * answer (answer-turn.ts), the reply was told "They just answered what you asked",
 * and the model made the answer up in the caller's voice: "Yeah, I sent it over."
 * (dev capability sweep 2026-10-21, 3 of 10 return calls).
 *
 * A turn is only a hello when every word in it is one of these, and nothing in it
 * touches the question:
 * - greeting words ("hey", "good morning", "buddy");
 * - a vocative: a persona's name, as speech-to-text spells it ("Fernie", "Naya");
 * - saying who it is: "it's me", "me again", "I'm back", "it's Sam", "Sam here".
 *
 * Except when Ferni asked who it is or whether they're there ("hey, who's this?",
 * caller-recognition.ts): then saying who it is IS the answer.
 *
 * onlyPleasantries: the stricter reading for the caller's first words after Ferni's
 * opener. They are a non-answer only when nothing is left once greetings, saying who
 * it is and pleasantries ("pretty good", "how are you") are taken out.
 *
 * sharedWords: what two lines have in common once names and small talk are set
 * aside (greeting-claim.ts).
 *
 * @module agents/personas/caller-greeting
 */

import { contentWords } from '../../memory/recall/session-recall.js';
import { DISPLAY_NAMES } from '../../personas/persona-ids.js';

const GREETING_WORDS = new Set(
  'hey hi hiya hello howdy yo good morning afternoon evening there buddy pal friend dude oh ah um uh hmm hm mm'.split(
    ' '
  )
);
/** Allowed only around a self-identification: "it's me again", "Sam here". */
const FILLER = new Set("it's its it is this just again here i'm im".split(' '));
/** Capitalized, but never a name someone gives for themselves. */
const NOT_A_NAME = new Set(
  'monday tuesday wednesday thursday friday saturday sunday january february march april june july august september october november december'.split(
    ' '
  )
);
/** Ferni asked who it is, their name, or whether they're there: "it's me" answers that. */
const ASKS_WHO_OR_IF_THERE =
  /\bwho(?:'s| is| am i| are you)\b|\bis (?:that|this|it) you\b|\b(?:are )?you (?:back|there|still there|here)\b|\bwhat(?:'s| is) your name\b|\bwhat should i call you\b/i;

const PERSONA_NAMES = Object.values(DISPLAY_NAMES).map((n) => n.split(' ')[0].toLowerCase());

/** One edit apart at most (a letter added, dropped or changed). */
function nearly(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const rest = (x: string, skip: number): string => x.slice(i + skip);
  return rest(a, 1) === rest(b, 1) || rest(a, 1) === rest(b, 0) || rest(a, 0) === rest(b, 1);
}

/** A persona's name, as STT writes it: "Ferni", "Fernie", "Ferny", "Naya". */
export function isVocative(word: string): boolean {
  const w = word.toLowerCase();
  if (/^fern(?:i|ie|ee|ey|y|eh|ay)?$/.test(w)) return true; // STT's Ferni, two letters off too
  return w.length >= 4 && PERSONA_NAMES.some((name) => nearly(w, name));
}

/** The question's content words, without the name it greets ("Hey Sam, ..."). */
function questionWords(question: string): Set<string> {
  const words = contentWords(question);
  const addressee = question.match(ADDRESSEE)?.[1]?.toLowerCase();
  if (addressee) words.delete(addressee);
  return words;
}

/** Their own name, said as who it is: "it's Sam", "me, Sam", "Sam here", "Sam again". */
function ownName(words: string[], i: number, asked: Set<string>): boolean {
  const [w, before, after] = [i, i - 1, i + 1].map((j) => words[j]?.toLowerCase() ?? '');
  return (
    /^\p{Lu}/u.test(words[i]) &&
    (/^(?:it's|its|is|me)$/.test(before) || /^(?:here|again)$/.test(after)) &&
    !NOT_A_NAME.has(w) &&
    !asked.has(w)
  );
}

/** What a turn made only of hello words does: greet, say who it is, or neither (null). */
function helloShape(
  said: string,
  asked: Set<string>
): { greets: boolean; saysWho: boolean } | null {
  const words = said.replace(/’/g, "'").match(/\p{L}[\p{L}']*/gu) ?? [];
  let [greets, saysWho, fillers] = [false, false, 0];
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase();
    if (GREETING_WORDS.has(w) || isVocative(w)) greets = true;
    else if (w === 'me' || (w === 'back' && /^i'?m$/i.test(words[i - 1] ?? ''))) saysWho = true;
    else if (FILLER.has(w)) fillers++;
    else if (ownName(words, i, asked)) saysWho = true;
    else return null; // a word that could be about the question
  }
  return saysWho || (greets && fillers === 0) ? { greets, saysWho } : null;
}

/** True when `said` is only a hello (greetings, a name, who it is) after Ferni's `question`. */
export function onlyGreets(said: string, question: string): boolean {
  return !ASKS_WHO_OR_IF_THERE.test(question) && helloShape(said, questionWords(question)) !== null;
}

/** Ferni asked who it is or if they're there, and they said who it is ("It's me."). */
export function answersWho(said: string, question: string): boolean {
  return ASKS_WHO_OR_IF_THERE.test(question) && helloShape(said, new Set())?.saysWho === true;
}

/** Words a hello shares with almost anything without being about it. */
const SMALL_WORDS = new Set(
  'week weekend day today tonight morning afternoon evening night time call talk going doing things stuff lately yesterday tomorrow last good great nice did does done end ended ending yet still ever'.split(
    ' '
  )
);
/** "tackled" ~ "tackle", "sending" ~ "send". */
const stem = (w: string): string => w.replace(/(?:ing|ed|es|s|e)$/, '');
/** Who a line greets: "Hey Sam, ..." / "Morning, Seth." */
const ADDRESSEE =
  /^\W*(?:hey|hi|hello|morning|evening|afternoon|good (?:morning|afternoon|evening))\W+(\p{L}+)/iu;

/**
 * Content words `a` and `b` share, stemmed, leaving out persona names, the person
 * `b` greets, `exclude` (their own name) and small talk.
 */
export function sharedWords(a: string, b: string, exclude: string[] = []): string[] {
  const skip = new Set(
    [...exclude, b.match(ADDRESSEE)?.[1] ?? ''].flatMap((n) => [...contentWords(n)]).map(stem)
  );
  const keep = (w: string): boolean =>
    !SMALL_WORDS.has(w) && !GREETING_WORDS.has(w) && !isVocative(w) && !skip.has(stem(w));
  const inB = new Set([...contentWords(b)].filter(keep).map(stem));
  return [...contentWords(a)].filter((w) => keep(w) && inB.has(stem(w)));
}

/** Greetings, saying who it is and pleasantries, longest first: what a hello is made of. */
const PLEASANTRY_PHRASES = [
  "how's it going",
  'how is it going',
  'how are you',
  "what's up",
  'good morning',
  'good afternoon',
  'good evening',
  'pretty good',
  'not bad',
  "i'm good",
  'im good',
  "it's me",
  'it is me',
  'this is me',
  'me again',
];
const PLEASANTRY_WORDS = new Set('hi hey hello hiya yo oh good again there'.split(' '));
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The name Ferni's opener greets them by ("Hey Seth. Did you..."), or undefined. */
export function addresseeOf(line: string): string | undefined {
  return line.match(ADDRESSEE)?.[1];
}

/**
 * True when `said` holds nothing but greetings, saying who it is (their own name:
 * `callerName`) and pleasantries: "Hey Ferni, it's me.", "oh hi Ferni, it's Sam",
 * "pretty good". Anything else left over ("not yet", "I did") and it is not.
 */
export function onlyPleasantries(said: string, callerName?: string): boolean {
  let text = ` ${said.toLowerCase().replace(/’/g, "'")} `;
  const name = callerName?.toLowerCase();
  for (const phrase of [
    ...(name ? [`it's ${name}`, `it is ${name}`, `this is ${name}`] : []),
    ...PLEASANTRY_PHRASES,
  ])
    text = text.replace(new RegExp(`(?<![a-z'])${escape(phrase)}(?![a-z'])`, 'g'), ' ');
  const left = text.match(/[a-z']+/g) ?? [];
  return left.every((w) => PLEASANTRY_WORDS.has(w) || isVocative(w) || w === name);
}
