/**
 * The first-response sample a call adds to the call-quality average.
 *
 * A call's firstResponseTimeMs runs from session start to Ferni's first audio.
 * On a call Ferni places (on someone's behalf, a family check-in, a proactive
 * call), that clock starts while the phone is still ringing: a 2026-10-24
 * on-behalf call started at 15:00:09 and its opener played at 15:00:45, so one
 * call averaged 17.9 s and opened "Response Time Critical" in Slack. A placed
 * call is measured from pickup (the call_answered stage) instead, and one
 * with no pickup recorded adds no sample. Inbound and app calls are unchanged.
 *
 * @module services/analytics/call-first-response
 */

import { CALL_ANSWERED_STAGE } from './call-start-stages.js';

/** Job types (metadata.type) of calls Ferni places, where the clock starts before anyone answers. */
const PLACED_CALL_TYPES = new Set(['on_behalf_call', 'family_checkin', 'proactive_outreach']);

/** True for the job type of a call Ferni places to a phone. */
export function isPlacedCallType(callType: string | undefined): boolean {
  return callType !== undefined && PLACED_CALL_TYPES.has(callType);
}

/** The call fields a sample reads; stages are ms after session start. */
interface TimedCall {
  outbound?: boolean;
  firstResponseTimeMs?: number;
  stages?: Record<string, number>;
}

/**
 * Ms the caller waited for Ferni's first audio: from session start for an
 * inbound or app call, from pickup for a placed call. Undefined when there is
 * no first audio, or a placed call has no pickup before it.
 */
export function sampleMs(call: TimedCall): number | undefined {
  const firstAudioMs = call.firstResponseTimeMs;
  if (firstAudioMs === undefined || !call.outbound) return firstAudioMs;
  const answeredMs = call.stages?.[CALL_ANSWERED_STAGE];
  if (answeredMs === undefined || answeredMs > firstAudioMs) return undefined;
  return firstAudioMs - answeredMs;
}

/** The first-response samples of these calls, skipping calls without one. */
export function samples(calls: readonly TimedCall[]): number[] {
  return calls.map(sampleMs).filter((ms): ms is number => ms !== undefined);
}
