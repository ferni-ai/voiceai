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
 * @module agents/shared/turn-receipt-lane
 */
import { FLAG_MANIFEST } from '../../config/flag-manifest.js';
import {
  fastLaneEnabled,
  routeOf,
  type LaneRoute,
  type RoutedRequest,
} from '../model-provider/fast-lane.js';

type Env = Record<string, string | undefined>;

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

/** The receipt's lane and laneShadow for this request. */
export function laneFields(
  request: RoutedRequest,
  env: Env = process.env
): { lane: LaneRoute | null; laneShadow: LaneShadow | null } {
  if (fastLaneEnabled(env)) return { lane: routeOf(request), laneShadow: null };
  return { lane: null, laneShadow: shadowMode(env) === 'off' ? null : routeOf(request) };
}
