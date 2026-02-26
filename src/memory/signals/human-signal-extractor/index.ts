/**
 * Human Signal Extractor — extracts human-centric memory signals.
 * @module memory/signals/human-signal-extractor
 */

export * from './types.js';
export { extractDates } from './dates.js';
export { extractValues, extractDreams, extractFears } from './values-dreams.js';
export { extractStressTriggers, extractGrowthMarkers, extractChallenges, extractComfortPatterns, detectInsideJokePotential } from './growth-challenges.js';
export { detectAvoidances } from './avoidances.js';
export { extractHumanSignals, mergeSignalsIntoMemory } from './main.js';
