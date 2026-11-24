/**
 * What findTools may reach under TOOL_CORE_STATIC: the domains a call can load
 * today (essential + topic), never NEVER_FINDABLE_DOMAINS (runBash, webhooks).
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

/**
 * Tools that text, call or email someone: only the caller's own words load
 * them (topic loader), so injected web text can't. callOnBehalf is core.
 */
export const NEVER_PIN_TOOLS: readonly string[] = [
  'approveMessage',
  'callAndConverse',
  'multiOutreach',
  'quickCall',
  'quickEmail',
  'quickText',
  'reachOut',
  'scheduleAtBestTime',
  'scheduleEmail',
  'scheduleMessage',
  'sendBatchMessages',
  'sendMessageNow',
];

/**
 * FINDABLE_PERSONA_DOMAINS: a persona's own manifest domains it may also find,
 * never these. home: the vibe tools share it, run as any session id and set the
 * thermostat (smart-home-topics.ts). concierge: reservations and appointments
 * call businesses for the caller, which, like NEVER_PIN_TOOLS, only the
 * caller's own words should load.
 */
const NEVER_FINDABLE_FOR_PERSONA: readonly string[] = ['home', 'concierge'];

function personaMayFind(domain: string): boolean {
  return !NEVER_FINDABLE_DOMAINS.includes(domain) && !NEVER_FINDABLE_FOR_PERSONA.includes(domain);
}

const NONE: ReadonlySet<string> = new Set();

/**
 * A tool findTools may offer and pin: a findable domain, or one of `persona`
 * (the persona's manifest domains) it may find, and not one that contacts people.
 */
export function isFindableTool(
  name: string,
  domain: string | undefined,
  persona: ReadonlySet<string> = NONE
): boolean {
  if (NEVER_PIN_TOOLS.includes(name) || domain === undefined) return false;
  return isFindableDomain(domain) || (persona.has(domain) && personaMayFind(domain));
}
