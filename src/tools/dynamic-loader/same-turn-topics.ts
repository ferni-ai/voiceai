/**
 * Dynamic Tool Loader - extra topic patterns while TOOLS_SAME_TURN is on
 * (config/same-turn-tools-config.ts).
 *
 * Local places: "near me", "nearby", "coffee shop" and "restaurant" already
 * load local-search (local-place-topics.ts). These add a place someone asks to
 * find ("find me a dentist", "looking for a good barber") and "find a ... near
 * ...", but not a bare "dentist" or "doctor": "my dentist said" or "I need a
 * doctor" is not a search. YouTube and video words already load video
 * (topic-mappings.ts).
 *
 * The lean always-on set moves quickSmartHome, doNotDisturb and getFunFact to
 * their topic, and simple-utilities had no topic words for them.
 */
import type { ToolDomain } from '../registry/types.js';

const PLACES =
  'dentist|doctor|pharmacy|barber|barbershop|hair salon|salon|mechanic|plumber|vet|' +
  'gym|dry cleaner|gas station|grocery store|urgent care|hardware store|bookstore|bar|pub';

export const SAME_TURN_TOPIC_PATTERNS: Array<[string, readonly ToolDomain[], RegExp]> = [
  [
    'find a place',
    ['local-search'],
    new RegExp(
      `(?<![a-z])(?:find|looking for|look for|recommend|search for|know of)\\s+(?:me\\s+)?` +
        `(?:a|an|some|the)\\s+(?:good\\s+|nice\\s+|new\\s+|cheap\\s+|decent\\s+)?(?:${PLACES})s?(?![a-z])`
    ),
  ],
  [
    'find a ... near',
    ['local-search'],
    /(?<![a-z])(?:find|looking for|look for|recommend|search for)\s+(?:me\s+)?(?:a|an|some)\s+(?:[a-z]+\s+){0,3}(?:near|around|close to)(?![a-z])/,
  ],
  ['nearest', ['local-search'], /(?<![a-z])nearest(?![a-z])/],
  [
    'lights',
    ['simple-utilities'],
    /(?<![a-z])(?:turn|switch|dim)\s+(?:on\s+|off\s+)?the\s+lights?(?![a-z])/,
  ],
  ['smart home', ['simple-utilities'], /(?<![a-z])smart home(?![a-z])/],
  ['do not disturb', ['simple-utilities'], /(?<![a-z])do not disturb(?![a-z])/],
  ['fun fact', ['simple-utilities'], /(?<![a-z])fun facts?(?![a-z])/],
];
