/**
 * What the caller just did, read from their words: an acknowledgement, a
 * look-up, a request, a question about him, or something shared. The regex
 * read of the turn (turn-shape.ts re-exports it; turn-understanding.ts is the
 * model's read of the same five moves).
 *
 * @module agents/personas/caller-move
 */

import { stayWhenAskedOn } from './self-share-asked.js';
import { nothingOfTheirs, onlyLeadIn, riskOnCall, riskRead } from './self-share-stay.js';

export type CallerMove = 'request' | 'about_ferni' | 'ack' | 'share' | 'lookup';

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

export const isLookup = (t: string): boolean => LIVE_TOPIC.test(t) && ASKED.test(t);

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
export const ABOUT_FERNI =
  /\b(how are you|how('s| is| was) your|what about you|and you\b|what('re| are) you (doing|up to)|what did you|do you (like|have|ever|remember)|do you think (?:(?:of|about) )?(?:you|your|yourself)\b|have you (ever|been)|your (day|week|weekend|morning|life|wife|dad))\b/i;
/**
 * SELF_SHARE_STAY_WHEN_ASKED=on (#3475): more ways a caller turns it round to
 * him. ABOUT_FERNI read three of the four on the 2026-11-04 red team
 * (scripts/voice-eval/scenarios/your-day-specific.txt) as a share: "What'd you
 * get up to today?", "is that a normal day for you", "what's something that's
 * bugging you lately". Read only with the flag on; off, every turn reads as before.
 * Each is read only when it is all the turn says (self-share-stay.ts): it
 * opens the turn after nothing but lead-in words ("Okay, so", "Huh. Okay.
 * And", "Enough about me."), so their own news, tasks and the questions they
 * report stay theirs ("I got these for you", "what'd you do with the
 * reminder?", "my mom kept asking what'd you do today", "my coworker goes,
 * what'd you get up to"); nothing of their own comes after it; and no safety
 * reader marks the turn. Verifier 2026-11-05: "What'd you get up to today?
 * He hit me again last night." read as about him, so he answered from his
 * day and handed no question back.
 */
const DESCRIBES =
  '(?:normal|usual|typical|regular|weird|strange|odd|unusual|new|different|hard|easy|tough|rough|fun|good|bad|nice|big|scary|stressful|tiring|busy|quiet|long|boring|exciting|difficult|lonely|sad|annoying)';
/** "a normal day", "a big deal", "a weird one": a stretch of his life, not an object. */
const SPAN = '(?:day|week|weekend|morning|afternoon|evening|night|year|month|time|thing|one|deal)';
/** "what'd you do with the reminder / to the printer / that for": about a thing or a task, not his day (TASK_LINE). */
const ON_A_THING = String.raw`\s+(?:(?:that|this|it)\s+)?(?:with|to|for|about)\b`;
const TASK_AFTER = new RegExp(String.raw`^\s*(?:get up to|do)\b${ON_A_THING}`, 'i');
const asked = (ask: string): RegExp => new RegExp(String.raw`\b(?:${ask})`, 'gi');
const ABOUT_FERNI_WIDE = [
  asked(String.raw`what'?d you (?:get up to|do)\b(?!${ON_A_THING})`),
  // How something is FOR HIM ("a normal day", "hard", "a lot"), never a thing being for him ("is that thing for you?").
  asked(
    String.raw`(?:is|was) that\s+(?:(?:really|kind of|kinda|pretty|so|too|very)\s+)?(?:an?\s+${DESCRIBES}\s+${SPAN}|${DESCRIBES}|a lot|too much)\s+for you\b`
  ),
  asked(
    String.raw`what(?:'s| is) (?:something|anything)(?:\s+(?:that'?s|that|is|has|been|really|kind of|kinda|lately|actually))*\s+(?:(?:bugging|bothering|annoying|worrying|stressing) you\b|on your mind\b)`
  ),
  asked(String.raw`what about yourself\b`),
  asked(String.raw`tell me (?:something|anything) about (?:you|yourself)\b`),
];
const ABOUT_FERNI_ALL = new RegExp(ABOUT_FERNI.source, 'gi');
/** ABOUT_FERNI forms that may ask about what he said or has, not his life ("what did you mean by that?", "do you have a pen?"): main's lines, no stay. */
const NOT_HIS_LIFE =
  /^(?:what did you\b(?!\s+(?:\w+ly\s+)?(?:do|get up to)\b)|do you (?:have|remember)\b)/i;

/** Each ask about him in t, where it starts and ends: the wider forms, and ABOUT_FERNI's too `withMain`. */
function asksIn(t: string, withMain: boolean): Array<[number, number]> {
  const forms = withMain ? [ABOUT_FERNI_ALL, ...ABOUT_FERNI_WIDE] : ABOUT_FERNI_WIDE;
  return forms.flatMap((re) =>
    [...t.matchAll(re)].map((m): [number, number] => [m.index ?? 0, (m.index ?? 0) + m[0].length])
  );
}

/**
 * An ask that is all the turn says (self-share-stay.ts): only lead-in words
 * before it ("Okay, so", "Enough about me."), not about a thing ("what did you
 * do to the printer"), and nothing of their own after it.
 */
const theirsAlone =
  (t: string) =>
  ([start, end]: [number, number]): boolean =>
    onlyLeadIn(t.slice(0, start)) &&
    !NOT_HIS_LIFE.test(t.slice(start)) &&
    !TASK_AFTER.test(t.slice(end)) &&
    nothingOfTheirs(t.slice(end));

/**
 * SELF_SHARE_STAY_WHEN_ASKED=on: the turn only asks about him, so his answer
 * may stop there; no risk read on it (self-share-stay.ts). Undefined when off.
 */
function onlyAsksAboutHim(
  text: string,
  env: Record<string, string | undefined> = process.env
): boolean | undefined {
  if (!stayWhenAskedOn(env)) return undefined;
  const t = text.trim();
  return asksIn(t, true).some(theirsAlone(t)) && !riskRead(t);
}

/**
 * SELF_SHARE_STAY_WHEN_ASKED=on: he answers about himself and leaves it there.
 * Only when they asked about him and only that, with no risk read on the turn
 * and none noted on the call (self-share-stay.ts). Undefined when off or not asked.
 */
export function staysOn(
  text: string,
  move: CallerMove,
  sessionId?: string,
  env: Record<string, string | undefined> = process.env
): boolean | undefined {
  if (move !== 'about_ferni') return undefined;
  const only = onlyAsksAboutHim(text, env);
  return only === undefined ? undefined : only && !riskOnCall(sessionId, text);
}

/** A question about him: ABOUT_FERNI, and with SELF_SHARE_STAY_WHEN_ASKED on the wider forms when they are all the turn asks. */
function asksAboutHim(t: string, env: Record<string, string | undefined>): boolean {
  if (ABOUT_FERNI.test(t)) return true;
  return stayWhenAskedOn(env) && asksIn(t, false).some(theirsAlone(t)) && !riskRead(t);
}

/** SELF_SHARE_STAY_WHEN_ASKED=on: read as about him only by the wider forms (turn-shape.ts holds ABOUT_YOU back on risk). */
export function widenedAsk(
  text: string,
  env: Record<string, string | undefined> = process.env
): boolean {
  return stayWhenAskedOn(env) && !ABOUT_FERNI.test(text.trim()) && asksAboutHim(text.trim(), env);
}

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
export const ABOUT_THEIR_THINGS =
  /\b(?:do|did|can|could|would|will) you (?:still |even |actually )?(?:have|know|remember|keep|save|store|see|get|call|text|reach|ring|phone|message|email|send)\b(?:\s+\w+)?\s+(?:my|me|mine|our|us)\b/i;

export function callerMove(
  text: string,
  env: Record<string, string | undefined> = process.env
): CallerMove {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words <= 3 && ACK.test(t)) return 'ack';
  if (isLookup(t)) return 'lookup';
  if (ASKS_FOR_MORE.test(t) || ABOUT_THEIR_THINGS.test(t)) return 'request';
  if (asksAboutHim(t, env)) return 'about_ferni';
  if (OPINION_ASK.test(t)) return 'request';
  return 'share';
}

/** Asked for his take on their topic, not about him (callerMove's opinion branch). */
export function opinionAsk(text: string): boolean {
  return OPINION_ASK.test(text) && callerMove(text) === 'request';
}
