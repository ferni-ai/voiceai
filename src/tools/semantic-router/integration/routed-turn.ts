/**
 * Routed turn recording: what a turn the semantic router routed leaves behind.
 *
 * An ordinary turn leaves the prediction the correction capture compares against (the
 * caller's words stay in memory for 30 s, for correction learning), a routing event (its
 * length and the route's ids and scores, never its words) and its routing metrics. A
 * crisis turn leaves only a count: no prediction, so its words never reach learning, no
 * event and no metric, however routing ends (a route, an error or a blocked input).
 *
 * @module tools/semantic-router/integration/routed-turn
 */

import type { SemanticRouterResult } from '../types.js';
import {
  forgetRoutingPrediction,
  recordRoutingPrediction,
} from '../learning/implicit-correction-capture.js';
import {
  recordConversation,
  recordHintAdded,
  recordLLMBypass,
  recordRoutingError,
} from './metrics.js';
import { countCrisisTurn, recordRoutingEvent } from './routing-analytics.js';

/** A metric's arguments after the turn's user and session ids */
type TurnArgs<F> = F extends (userId: string, sessionId: string, ...rest: infer R) => void
  ? R
  : never;

/** The routing metrics of one turn, its user and session ids already bound */
export interface TurnMetrics {
  conversation(...args: TurnArgs<typeof recordConversation>): void;
  hint(...args: TurnArgs<typeof recordHintAdded>): void;
  bypass(...args: TurnArgs<typeof recordLLMBypass>): void;
  error(...args: TurnArgs<typeof recordRoutingError>): void;
}

const NO_METRICS: TurnMetrics = {
  conversation: () => undefined,
  hint: () => undefined,
  bypass: () => undefined,
  error: () => undefined,
};

/**
 * Start a routed turn, before anything can end it. A crisis turn is counted here, once,
 * and drops the session's pending prediction, so a tool run on it is never paired with an
 * earlier turn's words. Returns the turn's metrics: none on a crisis turn.
 */
export function startRoutedTurn(context: {
  userId: string;
  sessionId: string;
  crisisTurn?: boolean;
}): TurnMetrics {
  if (context.crisisTurn) {
    forgetRoutingPrediction(context.sessionId);
    countCrisisTurn();
    return NO_METRICS;
  }
  const { userId, sessionId } = context;
  return {
    conversation: (...args) => recordConversation(userId, sessionId, ...args),
    hint: (...args) => recordHintAdded(userId, sessionId, ...args),
    bypass: (...args) => recordLLMBypass(userId, sessionId, ...args),
    error: (...args) => recordRoutingError(userId, sessionId, ...args),
  };
}

/**
 * Record a routed turn's prediction and routing event. Returns the event's id, undefined
 * on a crisis turn, which records neither (startRoutedTurn counted it).
 */
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
  if (context.crisisTurn) return undefined;
  recordRoutingPrediction(context.sessionId, context.inputText, result);
  return recordRoutingEvent(result, context);
}
