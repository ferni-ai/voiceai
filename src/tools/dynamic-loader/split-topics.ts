/**
 * Dynamic Tool Loader - topic keys that live in their own modules, so
 * topic-mappings.ts stays under the 500-line limit. TOPIC_TO_DOMAINS spreads
 * this at the spot where it used to spread each one, in the same order.
 */
import type { ToolDomain } from '../registry/types.js';
import { LOCAL_PLACE_TOPICS } from './local-place-topics.js';
import { SCREEN_TOPICS } from './screen-topics.js';
import { SLEEP_TOPICS } from './sleep-topics.js';
import { TRAVEL_TOPICS } from './travel-topics.js';

export const SPLIT_TOPICS: Record<string, ToolDomain[]> = {
  ...LOCAL_PLACE_TOPICS,
  ...SCREEN_TOPICS,
  ...SLEEP_TOPICS, // sleep questions load wellness (sleep-topics.ts)
  ...TRAVEL_TOPICS, // drive time (travel-topics.ts)
};
