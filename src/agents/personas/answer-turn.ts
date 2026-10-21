/**
 * Is the caller answering the question Ferni just asked?
 *
 * The director writes its notes after Ferni's reply, and they ride the next
 * one (director-notes.ts). So a note about one turn lands on the turn where
 * the caller answers the question Ferni asked in it. On Seth's prod call
 * (2026-10-12) Ferni asked "did you tackle that mail yet?" after a "Hello,
 * hello.", the director wrote "Drop the mail topic and match his slower pace"
 * about the greeting, Seth said "I did.", and Ferni talked about his own
 * morning instead. The turn shape had also read "I did." as something shared
 * (callerMove's fall-through), which invites a story of Ferni's own.
 *
 * DIRECTOR_ANSWER_TURN_GUARD=on: on an answer turn the pending notes are left
 * out of the request, all of them, because every one was written before the
 * answer and the director writes fresh ones after this reply; and the reply's
 * shape takes up the answer instead of trading a story (turn-shape.ts).
 *
 * @module agents/personas/answer-turn
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import type { TurnSignals } from './turn-extras.js';

export function answerTurnGuardEnabled(env: Env = process.env): boolean {
  return flagOn('DIRECTOR_ANSWER_TURN_GUARD', env);
}

/** Ferni's line asked something: a question mark in its last sentence. */
export function endsOnQuestion(ferniLine: string): boolean {
  const sentences = ferniLine
    .replace(/<[^>]+>/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.at(-1)?.includes('?') ?? false;
}

/** Throat-clearing before the answer ("Oh, I did.", "Hey Ferni, I did."). */
const LEAD_IN = /^(?:(?:oh|well|um+|uh+|ah|haha+|ha|hey|hi|hello|ferni)\b[\s,.!]*)+/i;
/**
 * The caller saying who it is: "it's me", "me again", "I'm back". On a return call
 * the greeting asks about something ("did you end up sending that resume to Dana?"),
 * the caller says "Hey Ferni, it's me.", and read as an answer it got "They just
 * answered what you asked: take up their answer first", so the model made the answer
 * up as the caller: "Yeah, I sent it over." (dev capability sweep 2026-10-21, 3 of
 * 10 return calls; replayed 20x on each, 33/60 replies with that line, 0/60 without).
 */
const SAYS_WHO_IT_IS =
  /^(?:(?:it'?s|it is|this is)\s+(?:just\s+)?me(?:\s+again)?|(?:just\s+)?me again|i'?m back(?:\s+again)?|back again)[\s.!,]*$/i;
/** How answers to a yes/no or how-did-it-go question start. Whole words only. */
const ANSWER_START =
  /^(?:yes|yeah|yep|yup|ya|no|nope|nah|not (?:yet|really|quite|at all)|i (?:did|didn'?t|did not|have|haven'?t|was|wasn'?t|will|won'?t|do|don'?t|think so|guess)|i'm|i am|kind of|kinda|sort of|a little|a bit|did|done|sure|ok(?:ay)?|alright|definitely|absolutely|totally|of course|maybe|mostly|almost|finally|never|nothing)\b/i;
/** Their own question: a question mark, or a question word up front (STT drops the mark). */
const ASKS =
  /\?|^(?:what|what's|whats|who|who's|when|where|where's|why|how|how's|which|can you|could you|would you|will you|do you|did you|have you|are you|is it|is there|should i|should we)\b/i;
/** Asking for something or moving on: "play some music", "anyway, ...". */
const CHANGES_TOPIC =
  /\b(?:play|put on|turn (?:it )?(?:on|off|up|down)|let'?s|anyway|anyways|by the way|speaking of|tell me|remind me|look up|search for|set (?:a|an))\b/i;
/** A turn made only of these is a greeting or a sound, not an answer ("Hello, hello."). */
const NOT_AN_ANSWER_WORDS = new Set([
  'hello',
  'hi',
  'hey',
  'hiya',
  'howdy',
  'yo',
  'good',
  'morning',
  'afternoon',
  'evening',
  'there',
  'ferni',
  'um',
  'uh',
  'hmm',
  'hm',
  'mm',
  'oh',
  'ah',
]);
const MAX_ANSWER_WORDS = 12;
const MAX_SHORT_DECLARATIVE_WORDS = 6;

/** The caller's words answer the question in Ferni's line. */
export function answersQuestion(ferniLine: string, said: string): boolean {
  if (!endsOnQuestion(ferniLine)) return false;
  const words = said.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length === 0 || words.every((w) => NOT_AN_ANSWER_WORDS.has(w))) return false;
  const answer = said.trim().replace(LEAD_IN, '');
  if (SAYS_WHO_IT_IS.test(answer)) return false;
  if (ASKS.test(answer) || CHANGES_TOPIC.test(answer)) return false;
  // A repeat of the question's verb ("Tackled it.") is a short declarative.
  if (ANSWER_START.test(answer)) return words.length <= MAX_ANSWER_WORDS;
  return words.length <= MAX_SHORT_DECLARATIVE_WORDS;
}

interface Item {
  type?: string;
  role?: string;
  textContent?: string;
}

/** Ferni's last spoken line before the caller's latest words, or ''. */
export function lastFerniLine(items: ReadonlyArray<Item>): string {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type !== 'message' || item.textContent?.startsWith(TURN_CONTEXT_HEADER)) continue;
    if (item.role === 'assistant') return item.textContent ?? '';
  }
  return '';
}

/** With the flag on: the caller's words (`said`) answer the question Ferni just asked. */
export function isAnswerTurn(
  items: ReadonlyArray<Item>,
  said: string,
  env: Env = process.env
): boolean {
  return answerTurnGuardEnabled(env) && !!said && answersQuestion(lastFerniLine(items), said);
}

/** The turn's signals on an answer turn: no story or advice ask of his own. */
export function asAnswer(signals: TurnSignals): TurnSignals {
  return { ...signals, answered: true, adviceFits: false };
}
