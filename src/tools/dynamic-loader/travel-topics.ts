/**
 * Dynamic Tool Loader - words that load the drive-time and flight tools.
 *
 * Asked "How long to drive from the Denver airport to downtown Boulder?" and
 * "cheapest one-way flight Denver to Phoenix", Ferni called searchWeb both
 * times (dev e2e sweep, 2026-10-30): no topic word loaded transportation
 * (getCommuteTime) or travel (searchFlights), and the call's first 64 tools
 * hold neither. "drive", "fly" and "flight" are idioms too ("drive me crazy",
 * "fly off the handle", "a flight of fancy", "fight or flight"), so they match
 * only inside a travel phrase: each false load swaps the agent's tools mid-turn.
 */

import type { ToolDomain } from '../registry/types.js';

/** Plain whole-word keys (topic-patterns.ts adds -s/-es/-ed/-ing). */
export const TRAVEL_TOPICS: Record<string, ToolDomain[]> = {
  commute: ['transportation'],
  traffic: ['transportation'],
  'how long to get to': ['transportation'],
  airfare: ['travel'],
  'plane ticket': ['travel'],
  'airline ticket': ['travel'],
};

const GETTING_AROUND: ToolDomain[] = ['transportation'];
const FLYING: ToolDomain[] = ['travel'];

/** Travel phrases a plain key would over-match. Input is lower-case. */
export const TRAVEL_TOPIC_PATTERNS: Array<[string, readonly ToolDomain[], RegExp]> = [
  [
    'drive',
    GETTING_AROUND,
    new RegExp(
      '(?<![a-z])(?:drive|drives|driving|drove)\\s+(?:to|from|into|over to|back to|down to|up to|' +
        'there|time|times|distance|directions)(?![a-z])' +
        '|(?<![a-z])(?:long|short|quick)\\s+drive(?![a-z])' +
        '|(?<![a-z])how\\s+(?:long|far)\\b[^.?!]{0,40}?(?<![a-z])(?:drive|driving)(?![a-z])'
    ),
  ],
  [
    'directions',
    GETTING_AROUND,
    /(?<![a-z])(?:(?:get|need|give me|want)\s+directions|directions\s+(?:to|from)|(?:driving|walking|transit)\s+directions)(?![a-z])/,
  ],
  [
    'how far',
    GETTING_AROUND,
    /(?<![a-z])how\s+far\s+(?:is|away|to|from|it is|would it be)(?![a-z])/,
  ],
  [
    'how long does it take to get',
    GETTING_AROUND,
    /(?<![a-z])how\s+long\s+(?:does|will|would)\s+it\s+take\s+(?:me\s+|us\s+)?to\s+(?:get|drive)(?![a-z])/,
  ],
  [
    'fly',
    FLYING,
    /(?<![a-z])(?:fly|flies|flying|flew)\s+(?:to|from|into|out of|out to|back to|back from|home|direct|nonstop)(?![a-z])/,
  ],
  // Not "a flight of stairs/fancy", not "fight or flight".
  ['flight', FLYING, /(?<!fight or |fight-or-)(?<![a-z])flights?(?![a-z])(?!\s+of\s)/],
];

/**
 * The tool a domain's travel words ask for, first in that domain's tools: the
 * same-turn lookup adds at most 8 tools and the mid-call update has 24 slots,
 * and offered after a bigger domain's tools, getCommuteTime (5th of
 * transportation's 6) fell past the 8.
 */
export const DOMAIN_LEAD_TOOLS: Partial<Record<ToolDomain, readonly string[]>> = {
  transportation: ['getCommuteTime'],
  travel: ['searchFlights', 'getFlightPrice'],
};
