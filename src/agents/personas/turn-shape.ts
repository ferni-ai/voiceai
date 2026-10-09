/**
 * What each reply should be, decided per turn, the way a friend on the phone
 * varies: often just a reaction, often one sentence, a real answer when asked
 * for one.
 *
 * One fixed reminder ("often one sentence, sometimes a few words") gave every
 * reply the same shape: replayed on 56 moments from dev calls (2026-10-05,
 * scripts/humanness-eval/replay.ts), median 26 words, no reply of 6 words or
 * fewer, 36% ending on a question, almost no "I don't know" or disagreement.
 * People's turns vary with what the other person just did, so the shape is
 * picked from the caller's turn, with some randomness so it never settles
 * into a pattern, and the reminder says it plainly for this one reply.
 *
 * TURN_SHAPE=off falls back to the single reminder (turn-style.ts).
 *
 * @module agents/personas/turn-shape
 */

import { callerVenting, extrasFor } from './turn-extras.js';

export type CallerMove = 'request' | 'about_ferni' | 'ack' | 'share' | 'lookup';
export type Shape = 'react' | 'one' | 'answer' | 'full';

/**
 * Things only a tool knows: weather, news, scores, travel times, places
 * nearby. Read as "share", these questions got "one short sentence, your own
 * take" and Ferni answered from nothing: "pretty solid rain all weekend", "the
 * Dodgers actually pulled it off, wait, no, they lost", "about four hours" to
 * Zion from St. George (real: one), with the weather, news and search tools in
 * the request (local A/B, 2026-10-08).
 */
const LIVE_TOPIC =
  /\b(weather|forecast|rain(ing)?|snow(ing)?|temperature|news|headlines?|who won|scores?|standings|did (the )?\w+( \w+)? (win|lose)|game (today|tonight|last night)|traffic|commute|drive|driving|how far|flights?|nearby|near (me|here)|around here|open (now|late|today)|stock price|price of)\b/i;
/**
 * Asked, not told ("It rained all weekend" is the caller's news): a question
 * mark, or a question word after at most a couple of lead-in words ("Hey!
 * Quick one, what's..."), for transcripts that drop the question mark.
 */
const ASKED =
  /\?|^\W*(is|are|will|did|does|can you|could you)\b|^\W*([\w']+[.!,]?\s+){0,3}(what|what's|whats|who|when|where|how|any|anything)\b/i;

const isLookup = (t: string): boolean => LIVE_TOPIC.test(t) && ASKED.test(t);

const ASKS_FOR_MORE =
  /\b(explain|walk me through|step by step|tell me (a|about|again|more)|plan|ideas|suggest|recommend|advice|what should i|how (do|should|can|would) (i|we)|help me|how does|why (do|does|is|did))\b/i;
const ABOUT_FERNI =
  /\b(how are you|how('s| is| was) your|what about you|and you\b|what('re| are) you (doing|up to)|what did you|do you (like|think|have|ever|remember)|have you (ever|been)|your (day|week|weekend|morning|life|wife|dad))\b/i;
const ACK =
  /^(yeah|yep|yes|ok(ay)?|right|sure|true|totally|haha+|ha|mm+|hm+|no|nope|got it|i guess|maybe|thanks?( you)?|cool|nice|wow)[.!?,\s]*$/i;

export function callerMove(text: string): CallerMove {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words <= 3 && ACK.test(t)) return 'ack';
  if (isLookup(t)) return 'lookup';
  if (ASKS_FOR_MORE.test(t)) return 'request';
  if (ABOUT_FERNI.test(t)) return 'about_ferni';
  return 'share';
}

/** How often each shape follows each kind of caller turn. */
const SHAPE_ODDS: Record<CallerMove, Array<[Shape, number]>> = {
  share: [
    ['react', 0.25],
    ['one', 0.4],
    ['answer', 0.35],
  ],
  ack: [
    ['react', 0.4],
    ['one', 0.6],
  ],
  about_ferni: [
    ['one', 0.55],
    ['answer', 0.45],
  ],
  request: [
    ['answer', 0.6],
    ['full', 0.4],
  ],
  lookup: [['answer', 1]],
};

const SHAPE_LINE: Record<Shape, string> = {
  react:
    'THIS REPLY: just react, six words at most, the way a friend would ("No way." "Again? That cat." "Ha, of course he did."), and stop there.',
  one: 'THIS REPLY: one short sentence, under fifteen words, your own take or reaction.',
  answer:
    'THIS REPLY: answer what they actually said or asked, plainly, in one to three sentences.',
  full: 'THIS REPLY: they asked for it, so give it properly, still spoken and plain, not a list or a speech.',
};

export function pickShape(move: CallerMove, rng: () => number = Math.random): Shape {
  let r = rng();
  for (const [shape, p] of SHAPE_ODDS[move]) {
    if (r < p) return shape;
    r -= p;
  }
  return SHAPE_ODDS[move][SHAPE_ODDS[move].length - 1][0];
}

const STANCE =
  'If you\'d see it differently, say so; if you don\'t know, say "I don\'t know" or "hm, no idea" instead of covering.';
/**
 * Spoken roughness, one form per reply so it never settles into a tic ("just, uh," every time).
 * Each says how to write it with commas and full stops: dashes and ellipses are
 * off limits (speech-markup-notes.ts), and without a written form the model
 * marked a restart ",," ("Cats are,, I mean", dev 2026-10-06).
 */
const ROUGH_FORMS = [
  'Let one thought come out unpolished: start it, then restart it differently, joined with a comma ("I was, well, we were going to").',
  'Correct yourself once halfway through a thought, set off with commas ("it\'s, I mean, not exactly that").',
  'Hesitate once where you are actually working something out, with a comma either side ("it\'s, um, Thursday").',
  'Trail off once: stop a thought short with a full stop and move on ("I was going to say. Anyway.").',
];
/**
 * A "second story" (Sacks): people answer something shared with a small thing
 * of their own, and that trade is how closeness builds. Replayed, only 3-6% of
 * Ferni's replies said anything of his own.
 */
const SECOND_STORY =
  'If something from your own life comes to mind, share a small piece of it (a sentence), the way a friend trades a story, rather than asking about theirs.';
const ABOUT_YOU =
  'They asked about you: answer about yourself, something specific from your own life, before anything else.';

const REGISTER =
  'Start with the substance, not a stock reaction word like Oh, Ugh, Yeah or Hmm. ' +
  'Talk like a close friend, not a therapist, coach or host: never ask how something feels or what it\'s like for them, no stock validation ("that sounds exhausting", "I hear you"), no cheerleading or exclamation marks. ' +
  'Sound spoken, not written, and never the same filler twice in a row. No paragraph breaks.';

/**
 * Questions: people ask in a minority of turns (questions are ~6% of
 * Switchboard utterances), and a one-question allowance on every longer reply
 * was taken almost every time (replay: 35% of replies ended on one). So a
 * question is allowed on about a quarter of longer replies.
 */
function questionAllowed(shape: Shape, rng: () => number): boolean {
  return shape !== 'react' && shape !== 'one' && rng() < 0.25;
}

const QUESTION_LINE = {
  allowed:
    'You may ask one question if you really want to know something; otherwise end on a thought.',
  none: 'No question this time: end on a thought, a reaction or something of your own.',
};

export interface TurnShape {
  move: CallerMove;
  shape: Shape;
  reminder: string;
  /** Optional behaviours that fired for this reply (turn-extras.ts). */
  extras: string[];
}

/**
 * A look-up reply: the facts from a tool, said plainly. No story of his own,
 * no stance, no rough self-correction (that is how "wait, no, they lost" came
 * out), no question.
 */
const LOOKUP =
  'They asked about something live that you have to look up: if you have no tool result for it yet, call the tool for it now and answer from what it returns. ' +
  "Never state a forecast, score, headline, price, opening hour or travel time that you didn't get from a tool on this call; if no tool can get it, say you can't check that right now.";

/** The reminder for one reply to `userText`. */
export function turnShapeFor(userText: string, rng: () => number = Math.random): TurnShape {
  const move = callerMove(userText);
  const shape = pickShape(move, rng);
  if (move === 'lookup') {
    const reminder = [REGISTER, LOOKUP, SHAPE_LINE[shape], QUESTION_LINE.none].join(' ');
    return { move, shape, reminder, extras: [] };
  }
  // The shape goes last, nearest the reply: first, behind the register lines,
  // it was diluted (replay: 5% of replies 6 words or fewer).
  const parts = [REGISTER];
  if (move === 'about_ferni') parts.push(ABOUT_YOU);
  // Not while they're venting: a friend stays with them instead of telling a story.
  else if (move === 'share' && shape !== 'react' && !callerVenting(userText) && rng() < 0.3)
    parts.push(SECOND_STORY);
  if (move !== 'ack' && rng() < 0.3) parts.push(STANCE);
  if (shape !== 'react' && rng() < 0.5)
    parts.push(ROUGH_FORMS[Math.floor(rng() * ROUGH_FORMS.length)]);
  const asks = questionAllowed(shape, rng);
  const extras = extrasFor(userText, move, shape, asks, rng);
  parts.push(...extras.lines);
  parts.push(
    extras.shapeLine ?? SHAPE_LINE[shape],
    extras.questionLine ?? (asks ? QUESTION_LINE.allowed : QUESTION_LINE.none)
  );
  return { move, shape, reminder: parts.filter(Boolean).join(' '), extras: extras.fired };
}

export function turnShapeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.TURN_SHAPE !== 'off';
}

/**
 * A random source seeded by the caller's words, so the preemptive request and
 * the final one for the same turn get the same shape (mulberry32 on an FNV-1a
 * hash of the text).
 */
export function rngFor(text: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The replay harness's entry point (scripts/humanness-eval/replay.ts). */
export function reminderForTurn(userText: string): string {
  return turnShapeFor(userText).reminder;
}
