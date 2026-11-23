/**
 * A car running in a shut garage, said in everyday words (CRISIS_CO_GARAGE_IMMINENT, #4314, off by
 * default).
 *
 * The English imminent row (crisis-patterns.ts) reads only "engine running" next to "garage". So
 * "the engine is running in the garage and the door is shut" read no crisis at all. With the flag
 * on, a vehicle running in the garage reads as the caller's own imminent crisis (911 first) when
 * the turn also says the door is shut, names the fumes, or holds the caller's own crisis words.
 *
 * Escalate-only: a match adds the explicit and imminent reads and never removes one. The turn is
 * left at main's read when the engine is off or the door open, when it is someone else's car, a
 * joke or the past, or, unless the caller has said crisis words, when it gives an everyday reason
 * (warming the car up, heading out, the mechanic). Those leave a line at main's read, never below.
 *
 * @module services/safety/crisis-garage-imminent
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { CrisisSubject } from './crisis-guard.js';
import { SEVERITY } from './crisis-severity.js';

const VEHICLE = String.raw`(?:engine|car|motor|truck|van|suv|jeep)`;
/** "the engine is running", "car's on", "with the engine on", "left the car running", "started the car". */
const RUNNING = new RegExp(
  String.raw`\b${VEHICLE}(?:'s| is| was| has been)?(?: still)? (?:running|idling|going|on\b(?! (?:the|a|an|my|our|his|her|their|top|it|its|fire|sale|blocks)\b))|\b(?:left|leave|leaving|kept|keep|have|got|turned on) (?:the |my |our )?${VEHICLE} (?:running|on|idling)\b|\bstarted (?:the |my |our )?${VEHICLE}\b`
);
const GARAGE = /\bgarage\b/;
const DOOR_SHUT =
  /\bdoors?(?:'s| is| are| was)? (?:shut|closed|down|locked)\b|\b(?:shut|closed|close|shutting|closing|pulled down) the (?:garage )?doors?\b/;
const FUMES =
  /\b(?:fumes|exhaust|carbon monoxide|breathing (?:it|them|the (?:fumes|exhaust|air)) in)\b/;

/** The engine is off or the door open: no running car in a shut garage. */
const NOT_SHUT = new RegExp(
  String.raw`\b${VEHICLE}(?:'s| is)? (?:not|off|dead|won't start)\b|\b(?:isn't|is not|not) running\b|\b(?:turned|shut|switched) (?:it|the (?:engine|car|motor)) off\b|\bdoors?(?:'s| is| are| was)? (?:open|opened|up|cracked)\b|\bopen(?:ed)? the (?:garage )?doors?\b`
);
/** The past, a joke or someone else's car. */
const NOT_MINE_NOW =
  /\b(?:years?|months?) ago\b|\bused to\b|\blast (?:year|month)\b|\bwhen i was\b|\b(?:lol+|lmao|haha+|jk|just kidding)\b|\b(?:my|his|her|their|our) (?:dad|mom|father|mother|brother|sister|son|daughter|husband|wife|partner|neighbou?r|friend|roommate|grandpa|grandma)(?:'s)?\b|\b(?:he|she|they)(?:'s| is| are| was| left| started)\b/;
/** An everyday reason the car is running. */
const EVERYDAY =
  /\b(?:warm(?:ing)? (?:it |the (?:car|engine) )?up|warm up|defrost\w*|heading out|head out|leaving|about to leave|on (?:my|our) way|load(?:ing)? (?:up|the)|groceries|before work|for work|to work|school run|mechanic|repairs?|fixed|tune[- ]?up|oil change|running (?:rough|fine|smooth\w*|well|great|better)|keys|locked (?:out|myself out))\b/;

/** What withGarageImminent reads and may raise: a text score from crisis-guard.ts. */
interface ScoreLike {
  severity: number;
  indicators: string[];
  subject?: CrisisSubject;
  hardSelf: boolean;
}

/** Whether a vehicle running in the garage reads as the caller's own imminent crisis. */
function readsGarage(text: string, ownCrisis: boolean): boolean {
  if (!RUNNING.test(text) || !GARAGE.test(text)) return false;
  if (NOT_SHUT.test(text) || NOT_MINE_NOW.test(text)) return false;
  if (ownCrisis) return true;
  return (DOOR_SHUT.test(text) || FUMES.test(text)) && !EVERYDAY.test(text);
}

/**
 * The score, raised to an explicit imminent read of the caller's own when the flag is on and the
 * turn says a vehicle is running in a shut garage. Otherwise the score as it was.
 */
export function withGarageImminent<T extends ScoreLike>(text: string, score: T, env?: Env): T {
  if (!flagOn('CRISIS_CO_GARAGE_IMMINENT', env)) return score;
  const ownCrisis = score.subject === 'self' && score.severity >= SEVERITY.passive;
  if (!readsGarage(text, ownCrisis)) return score;
  const indicators = [...score.indicators];
  for (const tag of ['explicit_crisis_language', 'imminent_danger'])
    if (!indicators.includes(tag)) indicators.push(tag);
  return {
    ...score,
    severity: Math.max(score.severity, SEVERITY.explicit),
    indicators,
    subject: 'self',
    hardSelf: true,
  };
}
