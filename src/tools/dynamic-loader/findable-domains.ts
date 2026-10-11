/**
 * The domains findTools may reach under TOOL_CORE_STATIC: the essential
 * domains and the ones the topic loader can load mid-call, so it reaches no
 * tool a call can't already get. Never developer (runBash), developer-custom,
 * webhooks, voice-enrollment, settings or commerce, whatever those lists say.
 *
 * @module tools/dynamic-loader/findable-domains
 */

import { DEFAULT_ESSENTIAL_DOMAINS } from './essential-domains.js';
import { TOPIC_TO_DOMAINS } from './topic-mappings.js';

export const NEVER_FINDABLE_DOMAINS: readonly string[] = [
  'developer',
  'developer-custom',
  'webhooks',
  'voice-enrollment',
  'settings',
  'commerce',
];

const FINDABLE = new Set<string>([
  ...DEFAULT_ESSENTIAL_DOMAINS,
  ...Object.values(TOPIC_TO_DOMAINS).flat(),
]);

export function isFindableDomain(domain: string | undefined): boolean {
  return domain !== undefined && FINDABLE.has(domain) && !NEVER_FINDABLE_DOMAINS.includes(domain);
}
