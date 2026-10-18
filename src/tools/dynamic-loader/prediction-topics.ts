/**
 * Dynamic Tool Loader - what loads Peter's "predict my week" game
 * (weeklyPrediction, in the engagement domain) with WEEKLY_PREDICTION=on.
 *
 * Nothing did: the engagement domain had no topic, so in 821 prod tool sets
 * over 14 days weeklyPrediction never appeared (audit, 2026-10-17), and a
 * caller who asked to predict their week got a Peter who couldn't save it.
 * These are phrases, not the bare word: "I predict rain" must not swap the
 * agent's tools mid-turn.
 *
 * A week later the call asks how the week went (prediction-check-in.ts).
 * Their answer ("deep work was about three hours") names no topic, so once
 * that question is asked the caller's next words load the game too, once.
 */

import type { ToolDomain } from '../registry/types.js';

export type TopicPattern = [string, readonly ToolDomain[], RegExp];

const GAME: readonly ToolDomain[] = ['engagement'];

/** Matched against the caller's words, lower-cased. */
export const PREDICTION_TOPIC_PATTERNS: readonly TopicPattern[] = [
  [
    'predict my week',
    GAME,
    /\bpredict(?:ing)?\s+(?:how\s+)?(?:my|the|this|next|your|our)\s+(?:whole\s+)?week\b/,
  ],
  ['weekly prediction', GAME, /\b(?:weekly|week)\s+predictions?\b/],
  ['prediction game', GAME, /\bpredictions?\s+game\b|\bpeter(?:'|’)?s\s+(?:prediction\s+)?game\b/],
  ['my predictions', GAME, /\bmy\s+predictions?\b/],
];

const CHECK_IN: TopicPattern = ['weekly prediction check-in', GAME, /(?:)/];

/** Callers just asked how their predicted week went. */
const askedAboutWeek = new Set<string>();

/** The call asked how their week went: their next words load the game to record it. */
export function predictionCheckInAsked(userId: string): void {
  askedAboutWeek.add(userId);
}

/** The prediction patterns for this caller's words: plus a one-time match after the check-in. */
export function predictionTopicPatterns(userId: string | undefined): readonly TopicPattern[] {
  if (!userId || !askedAboutWeek.delete(userId)) return PREDICTION_TOPIC_PATTERNS;
  return [...PREDICTION_TOPIC_PATTERNS, CHECK_IN];
}
