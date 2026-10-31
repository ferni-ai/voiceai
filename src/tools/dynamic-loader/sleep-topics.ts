/**
 * Dynamic Tool Loader - the words that load wellness (where getSleepSummary
 * lives) for a sleep question, with OURA_SLEEP_TOOL=on.
 *
 * Not in TOPIC_TO_DOMAINS: detectTopics runs on every caller transcript, and
 * each hit swaps the agent's tools mid-turn (dropping the SDK's preemptive
 * reply). With the flag off the tool can't be called, so "I slept terribly"
 * or "the readiness of the team" must load nothing new. "sleep", "sleeping"
 * and "tired" already load wellness from TOPIC_TO_DOMAINS, flag or not.
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import type { TopicPattern } from './prediction-topics.js';

const W = ['wellness'] as const;

/** Whole words, with -s/-es/-ed/-ing, as topic-patterns.ts builds them. */
const SLEEP_TOPIC_PATTERNS: readonly TopicPattern[] = ['slept', 'rested', 'readiness', 'oura'].map(
  (topic): TopicPattern => [topic, W, new RegExp(`(?<![a-z])${topic}(?:s|es|ed|ing)?(?![a-z])`)]
);

/** The sleep patterns while OURA_SLEEP_TOOL is on (ouraSleepToolEnabled); none while it is off. */
export function sleepTopicPatterns(env: Env = process.env): readonly TopicPattern[] {
  return flagOn('OURA_SLEEP_TOOL', env) ? SLEEP_TOPIC_PATTERNS : [];
}
