/**
 * Routed turn recording: what a turn the semantic router routed leaves behind.
 *
 * An ordinary turn leaves the prediction the correction capture compares against (the
 * caller's words stay in memory for 30 s, for correction learning) and a routing event
 * (its length and the route's ids and scores, never its words). A crisis turn leaves only
 * a count: no prediction, so its words never reach learning, and no event.
 *
 * @module tools/semantic-router/integration/routed-turn
 */

import type { SemanticRouterResult } from '../types.js';
import {
  forgetRoutingPrediction,
  recordRoutingPrediction,
} from '../learning/implicit-correction-capture.js';
import { countCrisisTurn, recordRoutingEvent } from './routing-analytics.js';

/** Record a routed turn. Returns the event's id, undefined on a crisis turn. */
export function recordRoutedTurn(
  result: SemanticRouterResult,
  context: {
    userId: string;
    sessionId: string;
    personaId: string;
    inputText: string;
    crisisTurn?: boolean;
  }
): string | undefined {
  if (context.crisisTurn) {
    forgetRoutingPrediction(context.sessionId);
  } else {
    recordRoutingPrediction(context.sessionId, context.inputText, result);
  }
  if (context.crisisTurn) {
    countCrisisTurn();
    return undefined;
  }
  return recordRoutingEvent(result, context);
}
