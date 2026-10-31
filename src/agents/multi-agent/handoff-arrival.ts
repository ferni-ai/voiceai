/**
 * The arriving teammate's first line on a briefed handoff (handoff-brief.ts): the
 * director's cue, the moment it's told about, and the stock openers cut from what it
 * writes.
 *
 * @module agents/multi-agent/handoff-arrival
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { callerHour, partOfDay } from '../shared/time-context.js';

/**
 * Director's cue for the teammate's first line. It used to carry a copyable example
 * ("{from} said you're weighing the offer"), and in prod the teammate said exactly that
 * to a caller who had only asked for them by name.
 */
const ARRIVAL_DIRECTION_PLAIN =
  "You've just been brought onto this call by {from}. Open like a friend who was filled in: a quick hello, then, only if the facts say what they want, name it in a few of their own words. If they only asked for you by name, just say hi warmly and ask what they'd like to get into. Never say {from} told you anything that is not in the facts. At most one question, never one they already answered; don't introduce your job or make them repeat themselves. Two short sentences at most.";

/**
 * HANDOFF_ARRIVAL_CONTEXT (default on). Prod call 2026-10-17, about 1 a.m. for the caller and
 * well into the call: four of five teammates opened "What would you like to get into today?",
 * the old cue's own words for a caller who only asked for them by name. The cue now says the
 * call is under way and gives the hour, and a stock opener still written is cut
 * (withoutStockOpener).
 */
const HERE_AND_LISTENING = ", or just let them know you're here and listening";

const ARRIVAL_DIRECTION = `You're joining a call that is already under way: {from} was talking with them and they asked for you. Open like a friend who walks in mid-conversation and was filled in: a quick hello in your own voice, then, only if the facts say what they want, name it in a few of their own words. If they only asked for you by name, greet them and meet the moment (the hour, the call so far)${HERE_AND_LISTENING}. This is not the start of the call: never ask a stock opener like "what would you like to get into today?", "what can I help with?" or "what brings you here?". Never say {from} told you anything that is not in the facts. At most one question, never one they already answered; don't introduce your job or make them repeat themselves. Two short sentences at most.`;

export function arrivalContextEnabled(env: Env = process.env): boolean {
  return flagOn('HANDOFF_ARRIVAL_CONTEXT', env);
}

/** A switchboard opener: right at the start of a call, wrong for someone joining one. */
const STOCK_OPENER =
  /\bwhat (?:would|do|did|'d) you (?:like|want|wanna) to (?:get|dive|dig|jump) into\b|\bwhat can i (?:help|do for) you\b|\bhow can i help\b|\bwhat brings you\b/i;

/** The line without its stock-opener sentences; '' when nothing else is left. */
export function withoutStockOpener(line: string): string {
  const sentences = line.split(/(?<=[.?!])\s+/);
  if (!sentences.some((s) => STOCK_OPENER.test(s))) return line;
  return sentences
    .filter((s) => !STOCK_OPENER.test(s))
    .join(' ')
    .trim();
}

/**
 * HANDOFF_ARRIVAL_ONE_TO_ONE (off by default). A prod call (#2503): two of three
 * arrivals on a one-to-one call opened "Hey everyone, good evening", and others said
 * "I'm here and listening in", near the cue's own "here and listening". The cue drops
 * that example and says the call is one person, and a group address still written is cut
 * (oneToOneLine).
 */
export const ARRIVAL_ONE_TO_ONE =
  ' This is a one-to-one call with one person: talk to them alone, never "everyone", "all" or "guys", and never say you were listening in or joining a call.';

function arrivalOneToOne(env: Env = process.env): boolean {
  return flagOn('HANDOFF_ARRIVAL_ONE_TO_ONE', env);
}

/** The director's cue for the arrival line, before grounding and the reason (handoff-brief.ts) */
export function arrivalDirection(env: Env = process.env): string {
  if (!arrivalContextEnabled(env)) {
    return arrivalOneToOne(env)
      ? ARRIVAL_DIRECTION_PLAIN + ARRIVAL_ONE_TO_ONE
      : ARRIVAL_DIRECTION_PLAIN;
  }
  return arrivalOneToOne(env)
    ? ARRIVAL_DIRECTION.replace(HERE_AND_LISTENING, '') + ARRIVAL_ONE_TO_ONE
    : ARRIVAL_DIRECTION;
}

const GROUP = String.raw`(?:everyone|everybody|all|guys|folks|y'all|you all)`;
/** "Hey everyone," / "Evening all." : the greeting stays, the group goes */
const GREETING_TO_GROUP = new RegExp(
  String.raw`\b(hey|hi|hello|morning|afternoon|evening)\s+${GROUP}\b(?=\s*[,.!?]|\s*$)`,
  'gi'
);
/** "Good evening, everyone." : the group word only where its clause ends */
const TRAILING_GROUP = new RegExp(String.raw`,\s*${GROUP}(?=\s*[.!?]|\s*$)`, 'gi');
const JOINING_THE_CALL =
  /\bI(?:'m| am| have|'ve) (?:just )?(?:joining|joined) (?:the|this|your) call\b/gi;

/**
 * The line as said to one person: a group address cut ("Hey everyone, good evening." ->
 * "Hey, good evening."), "listening in" -> "listening", "I'm joining the call" -> "I'm
 * here". "Hey, all good?" is kept: the group word goes only where its clause ends.
 */
export function oneToOneLine(line: string): string {
  return line
    .replace(GREETING_TO_GROUP, '$1')
    .replace(TRAILING_GROUP, '')
    .replace(/\blistening in\b/gi, 'listening')
    .replace(JOINING_THE_CALL, "I'm here")
    .trim();
}

/** The actor's arrival line with the cuts for someone joining: stock openers, group address */
export function arrivalLineCut(
  said: string | undefined,
  env: Env = process.env
): string | undefined {
  if (said === undefined) return undefined;
  const cut = arrivalContextEnabled(env) ? withoutStockOpener(said) : said;
  return arrivalOneToOne(env) ? oneToOneLine(cut) : cut;
}

/** The caller's hour in words ("about 1 AM for them, late at night"), or undefined without a zone. */
export function callerHourFact(now: Date, timeZone: string | undefined): string | undefined {
  const hour = callerHour(now, timeZone);
  if (hour === null) return undefined;
  const clock = `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
  const part = hour < 5 ? 'late at night' : `the ${partOfDay(hour)}`;
  return `about ${clock} for them, ${part}`;
}

/** The moment: the call is under way (with whom, how long), and the caller's hour if known. */
export function momentFacts(
  fromName: string,
  callerTurns: number,
  timeZone: string | undefined,
  now: Date
): Record<string, string> {
  const longer = callerTurns > 2 ? ' for a while' : '';
  const facts: Record<string, string> = {
    'the call so far': `already under way: they have been talking with ${fromName}${longer}, and you are joining partway through`,
  };
  const hour = callerHourFact(now, timeZone);
  if (hour) facts['their time'] = hour;
  return facts;
}
