/**
 * Dynamic Tool Loader - words that offer the drive-time and flight tools.
 *
 * Asked "How long to drive from the Denver airport to downtown Boulder?" and
 * "cheapest one-way flight Denver to Phoenix", Ferni called searchWeb both
 * times (dev e2e sweep, 2026-10-30): no topic word offered getCommuteTime
 * (information) or searchFlights (travel), and the call's first 64 tools hold
 * neither. "drive", "fly" and "flight" are idioms too ("drive me crazy", "fly
 * off the handle", "a flight of fancy", "fight or flight"), so they match only
 * inside a travel phrase: each false load swaps the agent's tools mid-turn.
 *
 * Never transportation: it holds the ride tools (cancelRide acts on a linked
 * Uber account), and a topic domain is findable (findable-domains.ts).
 */

import type { ToolDomain } from '../registry/types.js';

const DRIVE_TOOLS = ['getCommuteTime', 'getDirections'];
const FLIGHT_TOOLS = ['searchFlights', 'getFlightPrice'];

/** Plain whole-word keys for TOPIC_TO_DOMAINS (topic-patterns.ts adds -s/-es/-ed/-ing). */
export const TRAVEL_TOPICS: Record<string, ToolDomain[]> = {
  commute: ['information'],
  traffic: ['information'],
  'how long to get to': ['information'],
};

/**
 * Travel phrases a plain key would over-match. The flight words load travel,
 * which stays out of TOPIC_TO_DOMAINS (so not findable) and offers only
 * TOPIC_ONLY_TOOLS. Input is lower-case.
 */
export const TRAVEL_TOPIC_PATTERNS: Array<[string, readonly ToolDomain[], RegExp]> = [
  [
    'drive',
    ['information'],
    new RegExp(
      '(?<![a-z])(?:drive|drives|driving|drove)\\s+(?:to|from|into|over to|back to|down to|up to|' +
        'there|time|times|distance|directions)(?![a-z])' +
        '|(?<![a-z])(?:long|short|quick)\\s+drive(?![a-z])' +
        '|(?<![a-z])how\\s+(?:long|far)\\b[^.?!]{0,40}?(?<![a-z])(?:drive|driving)(?![a-z])'
    ),
  ],
  [
    'directions',
    ['information'],
    /(?<![a-z])(?:(?:get|need|give me|want)\s+directions|directions\s+(?:to|from)|(?:driving|walking|transit)\s+directions)(?![a-z])/,
  ],
  [
    'how far',
    ['information'],
    /(?<![a-z])how\s+far\s+(?:is|away|to|from|it is|would it be)(?![a-z])/,
  ],
  [
    'how long does it take to get',
    ['information'],
    // "get" only to a place: not "how long does it take to get over a breakup"
    /(?<![a-z])how\s+long\s+(?:does|will|would)\s+it\s+take\s+(?:me\s+|us\s+)?to\s+(?:drive|get\s+(?:to|there|here|home|from|downtown|back\s+(?:to|home)))(?![a-z])/,
  ],
  [
    'fly',
    ['travel'],
    /(?<![a-z])(?:fly|flies|flying|flew)\s+(?:to|from|into|out of|out to|back to|back from|home|direct|nonstop)(?![a-z])/,
  ],
  // Not "a flight of stairs/fancy", not "fight or flight".
  ['flight', ['travel'], /(?<!fight or |fight-or-)(?<![a-z])flights?(?![a-z])(?!\s+of\s)/],
  ['airfare', ['travel'], /(?<![a-z])(?:airfares?|(?:plane|airline) tickets?)(?![a-z])/],
  ['travel', ['travel'], /(?<![a-z])travel(?:s|ed|ing|led|ling)?(?![a-z])/],
];

/**
 * The tools a topic asks for, offered first: the same-turn lookup adds at most
 * 8 tools and the mid-call update has 24 slots, and getCommuteTime sits deep
 * in information's ~57.
 */
export const TOPIC_LEAD_TOOLS: Readonly<Record<string, readonly string[]>> = {
  commute: DRIVE_TOOLS,
  traffic: DRIVE_TOOLS,
  'how long to get to': DRIVE_TOOLS,
  drive: DRIVE_TOOLS,
  directions: DRIVE_TOOLS,
  'how far': DRIVE_TOOLS,
  'how long does it take to get': DRIVE_TOOLS,
  fly: FLIGHT_TOOLS,
  flight: FLIGHT_TOOLS,
  airfare: FLIGHT_TOOLS,
  travel: FLIGHT_TOOLS,
};

/**
 * Domains a topic offers only these tools of: travel's planTrip writes a
 * saved trip, so the flight words bring the two read-only lookups alone.
 */
export const TOPIC_ONLY_TOOLS: Partial<Record<ToolDomain, readonly string[]>> = {
  travel: FLIGHT_TOOLS,
};
