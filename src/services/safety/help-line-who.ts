/**
 * Whom a call is asked for, read as a line Ferni can't dial: emergency
 * services, a crisis or help line, or another toll-free line. scheduleCall's
 * `who` (tools/domains/scheduling/schedule-call-who.ts) never offers a call to
 * one. A crisis or help line comes back with its CRISIS_RESOURCES entry, so
 * the caller is given the real line to call or text themselves, never a
 * number written anywhere else.
 *
 * - The 988 line and the Crisis Text Line in every form a reply writes them
 *   ("988", "nine eight eight", "741741", "the suicide hotline"), as
 *   offersCrisisLine reads them.
 * - The names callers use for one: "the hotline", "a helpline", "the crisis
 *   team", "Samaritans", "poison control", or a resource's own name ("the
 *   domestic violence hotline"), and any resource's number.
 * - "the customer service hotline" names no resource, so it is no line here.
 *
 * @module services/safety/help-line-who
 */
import { isEmergencyNumber } from '../../utils/dialable-number.js';
import { offersCrisisLine } from './crisis-line-speech.js';
import { CRISIS_RESOURCES, getCrisisResources, type CrisisResource } from './crisis-response.js';
import { EMERGENCY_SERVICE } from './emergency-number.js';

export type LineCallerDials =
  { kind: 'help-line'; resource: CrisisResource } | { kind: 'emergency' } | { kind: 'toll-free' };

/** Each resource once (its first entry), in list order, that a caller can reach by phone or text. */
const REACHABLE: CrisisResource[] = Object.values(CRISIS_RESOURCES)
  .flat()
  .filter((r, i, all) => all.findIndex((o) => o.name === r.name) === i)
  .filter((r) => /\d/.test(r.phone ?? '') || r.text !== undefined);
/** The line given when the words name no resource of their own, as getCrisisResources defaults. */
const LIFELINE = getCrisisResources('severe_distress')[0];

/** Always a crisis line, whatever else is said. */
const CRISIS_NAMED = /\b(?:crisis team|samaritans|poison control)\b/;
/** A line by kind: a crisis line only when it names a resource, or is the bare word. */
const LINE_WORD = /\b(?:hot|help|life) ?line\b/;
const BARE_LINE = /^(?:(?:the|a|an) )?(?:hot|help|life) ?line$/;
/** Words every line's name shares, so they name none of them. */
const GENERIC = new Set(
  'the a an and of for to national line hotline helpline lifeline crisis association'.split(' ')
);
const EMERGENCY = new RegExp(EMERGENCY_SERVICE);
/** 1-800, 1-888, 1-877 ... with or without the 1. */
const TOLL_FREE = /^1?8(?:00|33|44|55|66|77|88)\d{7}$/;

const nameWords = (text: string): string[] =>
  text
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((w) => !GENERIC.has(w)) ?? [];

/** The resource the words name most closely ("domestic violence"), if any. */
function byName(text: string): CrisisResource | undefined {
  const said = new Set(nameWords(text));
  let best: CrisisResource | undefined;
  let most = 0;
  for (const r of REACHABLE) {
    const shared = nameWords(r.name).filter((w) => said.has(w)).length;
    if (shared > most) [best, most] = [r, shared];
  }
  return best;
}

/** The resource whose phone or text number the digits are. */
function byNumber(digits: string): CrisisResource | undefined {
  if (!digits) return undefined;
  const numberOf = (s?: string): string => (s ?? '').replace(/\D/g, '');
  return REACHABLE.find((r) => numberOf(r.phone) === digits || numberOf(r.text) === digits);
}

/** The line whom a call is asked for is, or undefined for a person, a place or anything else. */
export function lineCallerDials(who: string): LineCallerDials | undefined {
  const text = who.toLowerCase().replace(/\s+/g, ' ').trim();
  const digits = text.replace(/\D/g, '');
  const named = byName(text);
  const helpLine = (r?: CrisisResource): LineCallerDials => ({
    kind: 'help-line',
    resource: r ?? LIFELINE,
  });
  if (offersCrisisLine(text) || CRISIS_NAMED.test(text)) return helpLine(named ?? byNumber(digits));
  if (LINE_WORD.test(text) && (named || BARE_LINE.test(text))) return helpLine(named);
  const numbered = byNumber(digits);
  if (numbered) return helpLine(numbered);
  if (isEmergencyNumber(digits) || EMERGENCY.test(text)) return { kind: 'emergency' };
  if (TOLL_FREE.test(digits)) return { kind: 'toll-free' };
  return undefined;
}

/**
 * How the caller reaches the line themselves, from its resource: "988 Suicide &
 * Crisis Lifeline any time, right now: call or text 988". A line not open all
 * hours gives its hours instead of "right now".
 */
export function reachLine(r: CrisisResource): string {
  const text = r.text ? r.text.charAt(0).toLowerCase() + r.text.slice(1) : undefined;
  const call = /\d/.test(r.phone ?? '') ? r.phone : undefined;
  const how =
    call && text === `text ${call}`
      ? `call or text ${call}`
      : [call && `call ${call}`, text].filter(Boolean).join(' or ');
  const when = r.available === '24/7' ? ' any time, right now' : ` (${r.available})`;
  return `${r.name}${when}: ${how}`;
}
