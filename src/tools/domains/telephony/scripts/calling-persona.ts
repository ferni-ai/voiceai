/**
 * Who places a call the owner asked for (CALL_AS_PERSONA): the persona that was
 * asked. When Alex is asked to call David, Alex speaks to David, in Alex's name
 * and voice, and the reply says "Alex will call David now" (owner, 2026-11-18).
 *
 * The persona id is recorded on the request, travels in the signed dispatch as
 * `persona_id` (on-behalf-dispatch.ts), and the agent session loads that
 * persona's voice through the usual persona loading (metadata-parser.ts
 * parseJobMetadata). Flag off, nothing is recorded and Ferni calls, as before.
 *
 * @module tools/domains/telephony/scripts/calling-persona
 */

import { flagOn, type Env } from '../../../../config/env-flag.js';
import {
  CANONICAL_IDS,
  DISPLAY_NAMES,
  livePersonaId,
  type CanonicalPersonaId,
} from '../../../../personas/index.js';

const { COACH: FERNI, RESEARCHER, COMMUNICATOR, BUDGETER, PLANNER, SAGE } = CANONICAL_IDS;

/**
 * The personas that may place a call: the Ferni team. A custom agent, a
 * template, a retired or unknown id, and the financial legends (a separate
 * roster the owner's decision didn't cover) call as Ferni.
 */
const CALLERS: readonly CanonicalPersonaId[] = [
  FERNI,
  RESEARCHER,
  COMMUNICATOR,
  BUDGETER,
  PLANNER,
  SAGE,
];

/** The persona that places the call for `id`: a team persona as its canonical id, anything else Ferni. */
export function callingPersonaOf(id: unknown): CanonicalPersonaId {
  const live = livePersonaId(typeof id === 'string' ? id : '');
  return CALLERS.find((caller) => caller === live) ?? FERNI;
}

/** The name the caller gives on the phone ("Alex"); Ferni when no persona is recorded. */
export function callingPersonaName(id: unknown): string {
  return DISPLAY_NAMES[callingPersonaOf(id)];
}

/** What callOnBehalf records about the persona that was asked: nothing with the flag off. */
export function askingPersonaRecord(
  askingPersonaId: string | undefined,
  env: Env = process.env
): { callingPersonaId?: string } {
  if (!flagOn('CALL_AS_PERSONA', env) || !askingPersonaId) return {};
  return { callingPersonaId: callingPersonaOf(askingPersonaId) };
}

/** How the reply names who rings: "I'm calling" when Ferni does, "Alex will call" otherwise. */
export function callingLead(callingPersonaId: string | undefined): string {
  const caller = callingPersonaOf(callingPersonaId);
  return caller === FERNI ? "I'm calling" : `${callingPersonaName(caller)} will call`;
}
