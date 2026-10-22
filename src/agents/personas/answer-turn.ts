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
import { answersWho, asksWho, onlyGreets, sharedWords } from './caller-greeting.js';

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
const LEAD_IN =
  /^(?:(?:oh|well|um+|uh+|ah|haha+|ha|hey|hi|hello|fern(?:i|ie|ee|ey|y))\b[\s,.!]*)+/i;
/** How answers to a yes/no or how-did-it-go question start. Whole words only. */
const ANSWER_START =
  /^(?:yes|yeah|yep|yup|ya|no|nope|nah|not (?:yet|really|quite|at all)|i (?:did|didn'?t|did not|have|haven'?t|was|wasn'?t|will|won'?t|do|don'?t|think so|guess)|i'm|i am|it'?s (?:done|sent|finished|over|handled)|kind of|kinda|sort of|a little|a bit|did|done|sure|ok(?:ay)?|alright|definitely|absolutely|totally|of course|maybe|mostly|almost|finally|never|nothing)\b/i;
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

/**
 * The caller's words answer the question in Ferni's line. When unsure, they don't:
 * taken for an answer, a hello got "take up their answer first" and the model made
 * the answer up in the caller's voice (dev sweep 2026-10-21; replayed, 33/60 replies
 * vs 0/60 without that line), while a missed answer costs a little warmth. LLMs pair
 * questions with answers near chance, so this stays a rule, not a model call.
 * `opener`: Ferni's line opened the call. Then only words that touch the question
 * answer it, whatever their shape. Mid-call the short-declarative rule is as before:
 * "pretty good" after "how's the knee?" answers it.
 */
export function answersQuestion(
  ferniLine: string,
  said: string,
  { opener = false }: { opener?: boolean } = {}
): boolean {
  if (!endsOnQuestion(ferniLine)) return false;
  const words = said.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length === 0 || words.every((w) => NOT_AN_ANSWER_WORDS.has(w))) return false;
  // "Hey Ferni, it's me.": a hello, not an answer, unless he asked who it is (caller-greeting.ts).
  if (answersWho(said, ferniLine)) return true;
  if (onlyGreets(said, ferniLine)) return false;
  const touches = sharedWords(said, ferniLine).length > 0;
  // Only on the opener: an answer to "what's your name?" is a name, wherever it comes.
  if (opener && !touches && !asksWho(ferniLine)) return false;
  const answer = said.trim().replace(LEAD_IN, '');
  if (ASKS.test(answer) || CHANGES_TOPIC.test(answer)) return false;
  if (ANSWER_START.test(answer)) return words.length <= MAX_ANSWER_WORDS;
  // A repeat of the question's verb ("Tackled it.") is a short declarative.
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
  if (!answerTurnGuardEnabled(env) || !said) return false;
  return answersQuestion(lastFerniLine(items), said, { opener: ferniOpened(items) });
}

/** Ferni's last line opened the call: no words from the caller come before it. */
export function ferniOpened(items: ReadonlyArray<Item>): boolean {
  const spoken = (item: Item) =>
    item.type === 'message' && !item.textContent?.startsWith(TURN_CONTEXT_HEADER);
  let i = items.length - 1;
  while (i >= 0 && !(spoken(items[i]) && items[i].role === 'assistant')) i--;
  return i >= 0 && !items.slice(0, i).some((item) => spoken(item) && item.role === 'user');
}

/** The turn's signals on an answer turn: no story or advice ask of his own. */
export function asAnswer(signals: TurnSignals): TurnSignals {
  return { ...signals, answered: true, adviceFits: false };
}
