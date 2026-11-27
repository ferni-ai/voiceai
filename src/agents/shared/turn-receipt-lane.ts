/**
 * The TURN_RECEIPT's two lane fields for one request (turn-receipt.ts onRequest).
 *
 * - `lane`: where FastLaneLLM sends the request, by the router's own decision (the crisis
 *   mark, then the caller's words; fast-lane.ts routeOf). Only while CASCADE_FAST_LANE is on,
 *   so it always means "where the turn went", and so does the BigQuery `lane` column.
 * - `laneShadow`: the same decision while the lane is off and FAST_LANE_SHADOW is not off, so
 *   prod can count where turns would go before any promotion without changing where they go.
 *
 * At most one is set. Each holds the lane and the router's fixed reason: never words.
 *
 * The shadow records nothing for a held call, for the rest of the call (shadowQuiet): once the
 * call is crisis-held, has a crisis read still running, sounds under 18, is care- or write-held
 * (try-first, MINOR_CARE, SEXUAL_TOPIC_BOUNDARY), or a request was crisis-marked, laneShadow is
 * null for every later request of that session too. A read that throws, or a request with no
 * session, also logs nothing: the shadow fails closed. `lane` is not touched by this.
 *
 * @module agents/shared/turn-receipt-lane
 */
import { FLAG_MANIFEST } from '../../config/flag-manifest.js';
import { crisisReadsSettled } from '../../utils/crisis-memory-hold.js';
import { ageSignal, writeHeld } from '../../utils/minor-care.js';
import {
  fastLaneEnabled,
  routeOf,
  type LaneRoute,
  type RoutedRequest,
} from '../model-provider/fast-lane.js';
import { trialSlot, type TrialSlot } from '../model-provider/trial-lane.js';

type Env = Record<string, string | undefined>;

/** The call a request belongs to (TurnReceiptOptions). */
export interface LaneCall {
  sessionId: string | undefined;
  userId: string | undefined;
}

/** Sessions the shadow stays quiet for, for the rest of the call. Oldest first. */
const quiet = new Set<string>();
/** Past this many, the oldest go: by then those calls have long ended. */
const MAX_QUIET = 5000;

function quietFor(sessionId: string): void {
  quiet.delete(sessionId);
  quiet.add(sessionId);
  while (quiet.size > MAX_QUIET) quiet.delete(quiet.values().next().value as string);
}

/**
 * Any hold on this call, read now. Throws if a reader does: the caller fails closed.
 * - writeHeld: every writer's check. The session's care holds (try-first, MINOR_CARE,
 *   SEXUAL_TOPIC_BOUNDARY) and its crisis hold, any held session of this user, a placeholder id.
 * - a crisis read still running: its verdict could hold the call.
 * - ageSignal: sounds under 18 with MINOR_CARE off or in shadow too (writeHeld needs it on).
 */
const heldNow = (call: LaneCall, sessionId: string, env: Env): boolean =>
  writeHeld(call.userId, sessionId, env) ||
  crisisReadsSettled(sessionId) !== null ||
  ageSignal(sessionId);

/**
 * Whether the shadow logs nothing for this request: no session, a hold now or earlier in the
 * call, a crisis-marked request (that latches the call), or a reader that threw.
 */
function shadowQuiet(call: LaneCall, route: LaneRoute, env: Env = process.env): boolean {
  const { sessionId } = call;
  if (!sessionId) return true;
  if (quiet.has(sessionId)) return true;
  let held: boolean;
  try {
    held = route.reason === 'crisis' || heldNow(call, sessionId, env);
  } catch {
    held = true;
  }
  if (held) quietFor(sessionId);
  return held;
}

/**
 * Where the router would send a turn with the lane off. Counts and fixed words only: later
 * shadow fields (a sampled fast reply's shape) join lane and reason here, as numbers and flags.
 */
export type LaneShadow = LaneRoute;

/** FAST_LANE_SHADOW, any case; unset reads the manifest default (off), anything unknown is off. */
function shadowMode(env: Env): 'off' | 'decision' | 'sample' {
  const mode = env.FAST_LANE_SHADOW?.trim().toLowerCase() || FLAG_MANIFEST.FAST_LANE_SHADOW.default;
  return mode === 'decision' || mode === 'sample' ? mode : 'off';
}

/** The receipt's lane fields for this request of this call, with the dev trial's slot. */
export function laneFields(
  request: RoutedRequest,
  call: LaneCall,
  env: Env = process.env
): { lane: LaneRoute | null; laneShadow: LaneShadow | null; trial: TrialSlot | null } {
  const trial = trialSlot(request, env); // CASCADE_TRIAL_MODEL (trial-lane.ts); null when off
  if (fastLaneEnabled(env)) return { lane: routeOf(request), laneShadow: null, trial };
  if (shadowMode(env) === 'off') return { lane: null, laneShadow: null, trial };
  const route = routeOf(request);
  return { lane: null, laneShadow: shadowQuiet(call, route, env) ? null : route, trial };
}
