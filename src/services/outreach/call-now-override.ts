/**
 * The owner's "call now" for family (CALL_NOW_OWNER_OVERRIDE, off by default).
 *
 * The call-hours guard holds an on-behalf call until 9:00 AM where the person
 * lives, and before this nothing the owner said could move it: prod call
 * 2026-10-24 (phone-calls audit row 3), "she's an early riser, call now" got
 * "it's already set" and the call waited. Owner decision 2026-10-25: when the
 * owner explicitly asks, call family now.
 *
 * - Only when the model sets callNow (callOnBehalf's schema says when), never
 *   from parsing the caller's words here.
 * - Only to family. Anyone else keeps the hold.
 * - Between 10 PM and 7 AM where they are, the call is still held, and Ferni
 *   says once that it's late or early there. The owner's second yes comes back
 *   as lateConfirmed, and then it rings.
 *
 * @module services/outreach/call-now-override
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import type { OnBehalfCallRequest } from '../../tools/domains/telephony/types.js';
import { localMinutes, type CallHoursDecision } from './call-hours-guard.js';

/** 10 PM to 7 AM in the callee's time: too late or early even for family, without a second yes. */
const LATE_FROM_MIN = 22 * 60;
const LATE_UNTIL_MIN = 7 * 60;
/** With no known zone the guard checks both coasts (call-hours-guard.ts); so does this. */
const FALLBACK_ZONES = ['America/New_York', 'America/Los_Angeles'];

const FAMILY = new Set(
  `family mom mum mommy mama mother dad daddy papa father parent parents stepmom stepmother
   stepdad stepfather grandma grandmother granny nana grandpa grandfather grandparent
   sister brother sibling stepsister stepbrother wife husband spouse son daughter child kid
   grandson granddaughter grandchild aunt auntie uncle cousin niece nephew`.split(/\s+/)
);

/** "My Mom", "mother-in-law" → "mom", "mother". Whole value only: "mom's doctor" is not family. */
function relationWord(value: string | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .replace(/^my\s+/, '')
    .replace(/\s+in\s+law$/, '');
}

export function isCallNowOverrideOn(env: Env = process.env): boolean {
  return flagOn('CALL_NOW_OWNER_OVERRIDE', env);
}

/** Family by the contact's stored relationship, or by asking for them as one ("my mom"). */
export function isFamilyCallee(
  request: Pick<OnBehalfCallRequest, 'contactQuery' | 'resolvedContact'>
): boolean {
  return [request.resolvedContact?.relationship, request.contactQuery].some((v) =>
    FAMILY.has(relationWord(v))
  );
}

function isLateThere(now: Date, zone: string): boolean {
  const min = localMinutes(now, zone);
  return min >= LATE_FROM_MIN || min < LATE_UNTIL_MIN;
}

/**
 * What to do with an on-behalf call the call-hours guard would hold:
 * 'hold' as before, 'place' now (the owner's call-now to family), or
 * 'confirm_late' (held, and Ferni asks once more because it's late there).
 */
export function callNowVerdict(
  request: OnBehalfCallRequest,
  decision: Pick<CallHoursDecision, 'timezone' | 'source'>,
  now: Date,
  env: Env = process.env
): 'hold' | 'place' | 'confirm_late' {
  if (!wantsCallNow(request, env)) return 'hold';
  const zones = decision.source === 'fallback' ? FALLBACK_ZONES : [decision.timezone];
  const late = zones.some((zone) => isLateThere(now, zone));
  return late && request.lateConfirmed !== true ? 'confirm_late' : 'place';
}

/** Whether this request is the owner's call-now to family (placeOrHold won't stop at a set call). */
export function wantsCallNow(
  request: Pick<OnBehalfCallRequest, 'callNow' | 'contactQuery' | 'resolvedContact'>,
  env: Env = process.env
): boolean {
  return isCallNowOverrideOn(env) && request.callNow === true && isFamilyCallee(request);
}
