/**
 * Dynamic Tool Loader - whole-word patterns for the topic keywords.
 */

import type { ToolDomain } from '../registry/types.js';
import { TOPIC_TO_DOMAINS } from './topic-mappings.js';

/**
 * Topic keywords match whole words (with -s, -es, -ed or -ing). A plain substring test
 * fired on fragments: "start" loaded the play domain via "art", "recall"
 * telephony via "call", "moment" family via "mom", "funeral" games via "fun".
 * Each false hit swapped the agent's tools mid-turn, which also discards the
 * SDK's preemptive reply.
 */
export const TOPIC_PATTERNS: Array<[string, readonly ToolDomain[], RegExp]> = Object.entries(
  TOPIC_TO_DOMAINS
).map(([topic, domains]) => [
  topic,
  domains,
  new RegExp(`(?<![a-z])${topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s|es|ed|ing)?(?![a-z])`),
]);
