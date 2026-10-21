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
 * TURN_SHAPE=off falls back to the single reminder (turn-style.ts); the default,
 * model, lets the model judge the shape (modelChosenShape); TURN_SHAPE=dice draws it.
 * CANDOR=on fits the stance line to the moment instead of drawing it (turn-candor.ts).
 * TROUBLES_TALK=on adds how a friend listens to a trouble (troubles-talk.ts).
 *
 * @module agents/personas/turn-shape
 */

import { flagOn } from '../../config/env-flag.js';
import { mayNeedTool } from '../model-provider/fast-lane.js';
import { playfulLine, playfulOpen, SUBSTANCE_FIRST } from './ferni-playful.js';
import { biasShapeOdds, NEUTRAL_STYLE, scaled, type StyleProfile } from './style-profile.js';
import { stanceFor } from './turn-candor.js';
import {
  lengthCap,
  SHARE_LINES,
  telling,
  tellingLengthLine,
  withTrouble,
} from './troubles-talk.js';
import { extrasFor, regexSignals, type TurnSignals } from './turn-extras.js';
import {
  lengthLearned,
  lengthLine,
  targetWords,
  textureLearned,
  textureLine,
} from './turn-length.js';
import { quietLineFor } from './quiet-caller.js';

export type CallerMove = 'request' | 'about_ferni' | 'ack' | 'share' | 'lookup';
export type Shape = 'react' | 'one' | 'answer' | 'full';
/** dice: shape drawn per turn (default). model: the model judges the shape. off: turn-style.ts. */
export type TurnShapeMode = 'dice' | 'model' | 'off';

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
/**
 * "Do you think" asks about him only when what follows is about him ("do you
 * think you'd like hiking?", "what do you think of yourself?"). Matched as
 * plain "do you think", "So, what do you think?" read as about_ferni and was
 * answered from his own day: "Oh, I'm just sitting here with a cold cup of
 * tea", "My wife swears the new coffee grinder changed nothing" to "What do
 * you think her next move is?" (dev capability sweep, 2026-10-21, B3).
 */
const ABOUT_FERNI =
  /\b(how are you|how('s| is| was) your|what about you|and you\b|what('re| are) you (doing|up to)|what did you|do you (like|have|ever|remember)|do you think (?:(?:of|about) )?(?:you|your|yourself)\b|have you (ever|been)|your (day|week|weekend|morning|life|wife|dad))\b/i;
/**
 * Asked for his view on their topic: "what do you think?", "do you think I
 * should quit?", "what would you do?". A request for an answer, not a question
 * about him (read after ABOUT_FERNI, so "do you think you'd like it?" stays his).
 */
const OPINION_ASK = /\b(?:what do you think|do you think|what would you do)\b/i;
const ACK =
  /^(yeah|yep|yes|ok(ay)?|right|sure|true|totally|haha+|ha|mm+|hm+|no|nope|got it|i guess|maybe|thanks?( you)?|cool|nice|wow)[.!?,\s]*$/i;

/**
 * About their own things or what he can do for them, not about him: "do you
 * have my number?" read as about_ferni ("do you have"), so the turn asked
 * for his day and he answered "I do have your number, but ... I was just
 * about to head out and try to find a replacement houseplant" (prod,
 * 2026-10-17).
 */
const ABOUT_THEIR_THINGS =
  /\b(?:do|did|can|could|would|will) you (?:still |even |actually )?(?:have|know|remember|keep|save|store|see|get|call|text|reach|ring|phone|message|email|send)\b(?:\s+\w+)?\s+(?:my|me|mine|our|us)\b/i;

export function callerMove(text: string): CallerMove {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words <= 3 && ACK.test(t)) return 'ack';
  if (isLookup(t)) return 'lookup';
  if (ASKS_FOR_MORE.test(t) || ABOUT_THEIR_THINGS.test(t)) return 'request';
  if (ABOUT_FERNI.test(t)) return 'about_ferni';
  if (OPINION_ASK.test(t)) return 'request';
  return 'share';
}

/** Asked for his take on their topic, not about him (callerMove's opinion branch). */
export function opinionAsk(text: string): boolean {
  return OPINION_ASK.test(text) && callerMove(text) === 'request';
}

/** Asked of him, not told: a question, or "can you", "could you", "please". */
const ASKS_HIM = /\?|\b(?:can|could|would|will) you\b|\bplease\b/i;

/**
 * A turn about getting something done or found out: a look-up, a request
 * that isn't about him, a tool request put to him ("can you set a timer?"),
 * or the reply after a tool ran. His own day has no place in it.
 */
export function taskTurn(said: string, toolRan = false): boolean {
  if (toolRan) return true;
  const move = callerMove(said);
  if (move === 'lookup') return true;
  // "Tell me about your trip" is a request about him.
  const aboutHim = ABOUT_FERNI.test(said) || /\byour(?:self)?\b/i.test(said);
  if (aboutHim && !ABOUT_THEIR_THINGS.test(said)) return false;
  return move === 'request' || (mayNeedTool(said) && ASKS_HIM.test(said));
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

export function pickShape(
  move: CallerMove,
  rng: () => number = Math.random,
  lengthBias = NEUTRAL_STYLE.replyLength
): Shape {
  const odds = biasShapeOdds(SHAPE_ODDS[move], lengthBias);
  let r = rng();
  for (const [shape, p] of odds) {
    if (r < p) return shape;
    r -= p;
  }
  return odds[odds.length - 1][0];
}

/**
 * Spoken roughness, one form per reply so it never settles into a tic ("just, uh," every time).
 * Each says how to write it with commas and full stops: dashes and ellipses are
 * off limits (speech-markup-notes.ts), and without a written form the model
 * marked a restart ",," ("Cats are,, I mean", dev 2026-10-06).
 */
export const ROUGH_FORMS = [
  'Let one thought come out unpolished: start it, then restart it differently, joined with a comma ("I was, well, we were going to").',
  'Correct yourself once halfway through a thought, set off with commas ("it\'s, I mean, not exactly that").',
  'Hesitate once where you are actually working something out, with a comma either side ("it\'s, um, Thursday").',
];
/**
 * A "second story" (Sacks): people answer something shared with a small thing
 * of their own, and that trade is how closeness builds. Replayed, only 3-6% of
 * Ferni's replies said anything of his own.
 */
export const SECOND_STORY =
  'If something from your own life comes to mind, share a small piece of it (a sentence), the way a friend trades a story, rather than asking about theirs.';
export const ABOUT_YOU =
  'They asked about you: answer about yourself, something specific from your own life, before anything else.';
/**
 * DIRECTOR_ANSWER_TURN_GUARD=on: they just answered his question. "I did." to
 * "did you tackle that mail yet?" read as something shared and got a story
 * about his own morning (prod, 2026-10-12; answer-turn.ts).
 */
export const TAKE_UP_ANSWER =
  'They just answered what you asked: take up their answer first, the way a friend would, rather than anything from your own life.';

/**
 * judge.mjs on dev calls (2026-10-10): "that long drive down from the north"
 * to someone who only said they got home; "Classic Biscuit" for a dog just
 * mentioned; "I can set an alarm for you" to someone going to bed. Facts, not
 * style: kept with SCRIPT_FREE_REMINDER=on (script-free.ts).
 */
export const ONLY_WHAT_THEY_TOLD =
  'Build only on what they actually told you: never fill in details of their day, plans or people they did not mention, and never talk as if you already know someone or something they just brought up. ';
export const NOT_AN_ASSISTANT =
  'You are their friend, not an assistant: never offer to set up, remind or do things for them unless they ask.';

export const REGISTER =
  SUBSTANCE_FIRST +
  'Talk like a close friend, not a therapist, coach or host: never ask how something feels or what it\'s like for them, no stock validation ("that sounds exhausting", "I hear you"), no generic cheerleading or exclamation marks. ' +
  // Read as "no excitement", that line flattened big good news: a sister's
  // pregnancy got "Tears right on the trail, yeah, that makes sense" in 3 of 3
  // dev calls (judge.mjs, 2026-10-10).
  'When they share good news that really matters to them, be genuinely delighted about that specific thing, in your own words, the way a close friend would. ' +
  'Sound spoken, not written, and never the same filler twice in a row. No paragraph breaks. ' +
  ONLY_WHAT_THEY_TOLD +
  NOT_AN_ASSISTANT;

/**
 * PERSONA_SPARK=on, on a genuinely bright turn (good news, a win, a joke; never
 * a careful one): the register without its ban on exclamation marks, and leave
 * for one "!" and one reaction word. Sonic takes its emphasis from punctuation,
 * so the ban took away the cheapest audible sign of joy, and with it every
 * persona sounded the same on good news as on a quiet remark (persona-range
 * report, 2026-10-17). Everything else in the register stays.
 */
export const SPARK_BRIGHT =
  'This moment is genuinely bright: let it show. This once, if you really feel it, you may use one reaction word and at most one exclamation mark in the whole reply.';
const REGISTER_BRIGHT = `${REGISTER.replace('no generic cheerleading or exclamation marks', 'no generic cheerleading')} ${SPARK_BRIGHT}`;

/**
 * The register for this reply: the bright one only for a bright, uncareful turn with PERSONA_SPARK on.
 * FERNI_PLAYFUL (ferni-playful.ts): one reaction word may open an uncareful turn, and an easy,
 * neutral one gets the playfulness line.
 */
function registerFor(sig: TurnSignals): string {
  const bright = sig.bright === true && !sig.careful && !sig.supportFirst;
  const register = bright && flagOn('PERSONA_SPARK') ? REGISTER_BRIGHT : REGISTER;
  const open = playfulOpen(sig);
  if (!open) return register;
  return [register.replace(SUBSTANCE_FIRST, open), playfulLine(sig)].filter(Boolean).join(' ');
}

/**
 * Questions: people ask in a minority of turns (questions are ~6% of
 * Switchboard utterances), and a one-question allowance on every longer reply
 * was taken almost every time (replay: 35% of replies ended on one). So a
 * question is allowed on about a quarter of longer replies.
 */
function questionAllowed(shape: Shape, rng: () => number): boolean {
  return shape !== 'react' && shape !== 'one' && rng() < 0.25;
}

export const QUESTION_LINE = {
  allowed:
    'You may ask one question if you really want to know something; otherwise end on a thought.',
  none: 'No question this time: end on a thought, a reaction or something of your own.',
  /** FERNI_STATE=on, his stories held back this turn: "something of your own" invited one. */
  noneOnThem: 'No question this time: end on a thought or a reaction.',
  /** FERNI_STATE=on: a word about himself is followed by turning to them. */
  noneUnlessOwn:
    'No question this time, unless you said something about yourself: then end by asking them one about their world.',
};

/**
 * The no-question line. ownStory is Ferni's own state's say on this turn
 * (ferni-state.ts): undefined when FERNI_STATE is off, and then as before.
 */
function noQuestion(ownStory: boolean | undefined): string {
  if (ownStory === undefined) return QUESTION_LINE.none;
  return ownStory ? QUESTION_LINE.noneUnlessOwn : QUESTION_LINE.noneOnThem;
}

/** The no-question line; during a trouble (TROUBLES_TALK=on) it invites nothing of his own. */
function noQuestionFor(sig: TurnSignals): string {
  return sig.trouble ? QUESTION_LINE.noneOnThem : noQuestion(sig.ownStory);
}

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
const NEVER_MADE_UP =
  "Never state a forecast, score, headline, price, opening hour or travel time that you didn't get from a tool on this call; if no tool can get it, say you can't check that right now.";
export const LOOKUP = `They asked about something live that you have to look up: if you have no tool result for it yet, call the tool for it now and answer from what it returns. ${NEVER_MADE_UP}`;

/**
 * The rule rides the next replies too. Prod 2026-10-17: "can you check the
 * weather?" got the look-up rule, the agent asked which city, and the answer
 * ("<city>.") read as a share, with no rule: it said "I'll check" with no tool
 * call, then gave a temperature it made up. LIVE_DATA_CARRYOVER=off: the rule
 * rides only the asking turn, as before.
 */
export const LOOKUP_FOLLOW_UP = `They asked about something live a moment ago: if you still have no tool result for it, call the tool now (don't just say you'll check) and answer only from what it returns. ${NEVER_MADE_UP}`;

/** The follow-up rule when either of the caller's last two turns asked for live data and this reply has no look-up rule yet. */
export function liveDataCarryover(
  callerTurns: readonly string[],
  style: string,
  env: Record<string, string | undefined> = process.env
): string {
  if (!flagOn('LIVE_DATA_CARRYOVER', env) || style.includes(NEVER_MADE_UP)) return '';
  const recent = callerTurns.slice(-2).map((t) => t.split('\n')[0]);
  return recent.some(isLookup) ? LOOKUP_FOLLOW_UP : '';
}

/** The style reminder, then the follow-up rule if it applies (turn-request.ts). */
export function withLiveData(
  style: string,
  callerTurns: readonly string[],
  env: Record<string, string | undefined> = process.env
): [string, string] {
  return [style, liveDataCarryover(callerTurns, style, env)];
}

/**
 * TURN_SHAPE=model: the shape is the model's call, not a dice roll. Drawn at
 * random, a quarter of everything shared got "just react, six words at most",
 * so a sister's pregnancy got "No way, right on the trail" and a two-year
 * reunion "Two years is a really long time." (judge.mjs on prod calls,
 * 2026-10-10: thought 2.38, below a friend). These say how a friend fits a
 * reply to the moment and leave the fitting to the model. No example phrases:
 * the model repeats examples word for word.
 */
const FIT_THE_MOMENT =
  'How long and what kind of reply is yours to judge from what they just did, the way a good friend on the phone would. ' +
  'A passing remark or a quick yes gets a quick, natural reaction. ' +
  'Anything that matters to them, good or bad (news, something they are proud of, worried about or hurt by), gets a real response to that specific thing, with the feeling it deserves, not a remark that would fit anything. ' +
  'When they ask you something or ask for help, actually answer it; when they ask about you, talk about yourself, something specific. ' +
  'Most replies are a sentence or two, some only a few words; go longer only when they asked for it.';
/** FIT_THE_MOMENT without its fixed length rule, for TURN_LENGTH=learned (the length line says it). */
const FIT_THE_MOMENT_LEARNED = FIT_THE_MOMENT.replace(/ Most replies are .*$/, '');

function modelChosenShape(
  userText: string,
  rng: () => number,
  sig: TurnSignals,
  style: StyleProfile
): TurnShape {
  const { move } = sig;
  if (move === 'lookup') {
    const reminder = [REGISTER, LOOKUP, SHAPE_LINE.answer, QUESTION_LINE.none].join(' ');
    return { move, shape: 'answer', reminder, extras: [] };
  }
  // The model judges length and shape; the texture stays as in the dice path.
  // Without it (v1: one OWN_SELF line) quirks fell 2.80 -> 2.17 and endearing
  // 2.87 -> 2.63, replies grew 17 -> 24 words and question endings 13% -> 21%
  // (dev A/B, 15 calls per arm, judge.mjs, 2026-10-10).
  const parts = [registerFor(sig)];
  if (move === 'about_ferni' && !sig.selfBrief) parts.push(ABOUT_YOU);
  else if (sig.answered) parts.push(TAKE_UP_ANSWER);
  else if (
    move === 'share' &&
    !sig.careful &&
    rng() < 0.3 &&
    sig.ownStory !== false &&
    !sig.trouble
  )
    parts.push(SECOND_STORY);
  // TROUBLES_TALK=on (troubles-talk.ts): unset when off.
  const sharing = sig.trouble !== undefined && move === 'share';
  if (sharing) parts.push(...SHARE_LINES);
  const stance = stanceFor(
    userText,
    move,
    sig,
    move !== 'ack' && rng() < scaled(0.3, style.opinion)
  );
  parts.push(...stance.lines);
  // TURN_LENGTH / TURN_TEXTURE=learned (turn-length.ts): length and roughness drawn from friends'
  // next turns; a question or request still gets a real answer.
  const learn = { length: lengthLearned() && move !== 'request', texture: textureLearned() };
  // Off, nothing is drawn, so the rest of the reminder is the same as before.
  const target =
    learn.length || learn.texture
      ? targetWords(userText, sig.recent, rng, sig.careful || move !== 'share')
      : 0;
  const texture = learn.texture ? textureLine(target, rng) : null;
  if (texture) parts.push(texture.line);
  else if (rng() < scaled(0.5, style.filler))
    parts.push(ROUGH_FORMS[Math.floor(rng() * ROUGH_FORMS.length)]);
  const asks = rng() < 0.25;
  const extras = extrasFor(userText, move, 'answer', asks, rng, process.env, sig, style);
  parts.push(...extras.lines, learn.length ? FIT_THE_MOMENT_LEARNED : FIT_THE_MOMENT);
  // No longer than what they just told: carried by the learned length line when that is on.
  const cap = sharing && telling(userText, move) ? lengthCap(userText) : 0;
  if (learn.length) parts.push(lengthLine(cap ? Math.min(target, cap) : target));
  else if (cap) parts.push(tellingLengthLine(cap));
  if (sig.quiet) parts.push(...[quietLineFor()].filter(Boolean));
  parts.push(extras.questionLine ?? (asks ? QUESTION_LINE.allowed : noQuestionFor(sig)));
  const learned = [
    learn.length ? `length_${target}` : '',
    texture ? `texture_${texture.kind}` : '',
  ];
  return {
    move,
    shape: 'answer',
    reminder: parts.join(' '),
    extras: ['model_shape', ...stance.fired, ...extras.fired, ...learned.filter(Boolean)],
  };
}

/** The reminder for one reply to `userText`. */
export function turnShapeFor(
  userText: string,
  rng: () => number = Math.random,
  mode: TurnShapeMode = turnShapeMode(),
  signals?: TurnSignals,
  style: StyleProfile = NEUTRAL_STYLE
): TurnShape {
  const sig = withTrouble(userText, signals ?? regexSignals(userText, callerMove(userText)));
  if (mode === 'model') return modelChosenShape(userText, rng, sig, style);
  const move = sig.move;
  const shape = pickShape(move, rng, style.replyLength);
  if (move === 'lookup') {
    const reminder = [REGISTER, LOOKUP, SHAPE_LINE[shape], QUESTION_LINE.none].join(' ');
    return { move, shape, reminder, extras: [] };
  }
  // The shape goes last, nearest the reply: first, behind the register lines,
  // it was diluted (replay: 5% of replies 6 words or fewer).
  const parts = [registerFor(sig)];
  if (move === 'about_ferni' && !sig.selfBrief) parts.push(ABOUT_YOU);
  else if (sig.answered) parts.push(TAKE_UP_ANSWER);
  // Not while they're venting: a friend stays with them instead of telling a story.
  else if (
    move === 'share' &&
    shape !== 'react' &&
    !sig.careful &&
    rng() < 0.3 &&
    sig.ownStory !== false &&
    !sig.trouble
  )
    parts.push(SECOND_STORY);
  const sharing = sig.trouble !== undefined && move === 'share';
  if (sharing) parts.push(...SHARE_LINES);
  const stance = stanceFor(
    userText,
    move,
    sig,
    move !== 'ack' && rng() < scaled(0.3, style.opinion)
  );
  parts.push(...stance.lines);
  if (shape !== 'react' && rng() < scaled(0.5, style.filler))
    parts.push(ROUGH_FORMS[Math.floor(rng() * ROUGH_FORMS.length)]);
  const asks = questionAllowed(shape, rng);
  const extras = extrasFor(userText, move, shape, asks, rng, process.env, sig, style);
  parts.push(...extras.lines);
  if (sig.quiet) parts.push(...[quietLineFor()].filter(Boolean));
  parts.push(extras.shapeLine ?? SHAPE_LINE[shape]);
  if (sharing && telling(userText, move)) parts.push(tellingLengthLine(lengthCap(userText)));
  parts.push(extras.questionLine ?? (asks ? QUESTION_LINE.allowed : noQuestionFor(sig)));
  return {
    move,
    shape,
    reminder: parts.filter(Boolean).join(' '),
    extras: [...stance.fired, ...extras.fired],
  };
}

export function turnShapeMode(
  env: Record<string, string | undefined> = process.env
): TurnShapeMode {
  // model by default: it beat the dice on understanding (3.27 vs 2.33), empathy,
  // conduct, endearing and quirks at the same reply delay (dev A/B, 15 calls per
  // arm, judge.mjs, 2026-10-10). TURN_SHAPE=dice brings the old draw back.
  return env.TURN_SHAPE === 'off' ? 'off' : env.TURN_SHAPE === 'dice' ? 'dice' : 'model';
}

export function turnShapeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return turnShapeMode(env) !== 'off';
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
