/**
 * Human Signal Extractor — main extraction and merge functions.
 * @module memory/signals/human-signal-extractor/main
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type {
  ImportantDate, InsideJoke, CoreValue, Dream, Fear,
  GrowthMarker, ChallengeProgress, RecurringAvoidance,
  ComfortPattern, StressTrigger, HumanMemory,
} from '../../../types/human-memory.js';
import type { ConversationTurn, ExtractionContext, ExtractionResult } from './types.js';
import { extractDates } from './dates.js';
import { extractValues, extractDreams, extractFears } from './values-dreams.js';
import { extractStressTriggers, extractGrowthMarkers, extractChallenges, extractComfortPatterns, detectInsideJokePotential } from './growth-challenges.js';
import { detectAvoidances } from './avoidances.js';

const log = getLogger().child({ module: 'HumanSignalExtractor' });

// MAIN EXTRACTION FUNCTION
// ============================================================================

/**
 * Extract all human-centric memory signals from a conversation
 *
 * @param turns - Conversation turns
 * @param context - Extraction context (userId, existing memory, etc.)
 * @returns Extracted signals for each domain
 */
export function extractHumanSignals(
  turns: ConversationTurn[],
  context: ExtractionContext
): ExtractionResult {
  log.debug({ userId: context.userId, turnCount: turns.length }, 'Extracting human signals');

  const result: ExtractionResult = {
    importantDates: extractDates(turns, context),
    insideJokes: detectInsideJokePotential(turns),
    runningThemes: [], // Requires cross-session analysis
    values: extractValues(turns),
    dreams: extractDreams(turns),
    fears: extractFears(turns),
    growthMarkers: extractGrowthMarkers(turns),
    challenges: extractChallenges(turns),
    avoidances: detectAvoidances(turns),
    comfortPatterns: extractComfortPatterns(turns, context),
    stressTriggers: extractStressTriggers(turns),
    emotionalTells: [], // Requires voice/pattern analysis
  };

  const totalSignals = Object.values(result).reduce((sum, arr) => sum + arr.length, 0);
  log.info(
    {
      userId: context.userId,
      totalSignals,
      dates: result.importantDates.length,
      values: result.values.length,
      dreams: result.dreams.length,
      fears: result.fears.length,
      growth: result.growthMarkers.length,
      challenges: result.challenges.length,
      comfortPatterns: result.comfortPatterns.length,
      stressTriggers: result.stressTriggers.length,
    },
    'Human signal extraction complete'
  );

  return result;
}

// ============================================================================
// DEDUPLICATION HELPERS
// ============================================================================

/**
 * Check if two dates are essentially the same
 */
function isDuplicateDate(a: ImportantDate, b: ImportantDate): boolean {
  return a.month === b.month && a.day === b.day && a.type === b.type;
}

/**
 * Check if two values are essentially the same
 */
function isDuplicateValue(a: CoreValue, b: CoreValue): boolean {
  return a.value.toLowerCase() === b.value.toLowerCase();
}

/**
 * Check if two dreams are similar (fuzzy match)
 */
function isDuplicateDream(a: Dream, b: Dream): boolean {
  const aWords = new Set(a.description.toLowerCase().split(/\s+/));
  const bWords = new Set(b.description.toLowerCase().split(/\s+/));
  const intersection = [...aWords].filter((w) => bWords.has(w) && w.length > 3);
  return (
    intersection.length > 3 || a.description.toLowerCase().includes(b.description.toLowerCase())
  );
}

/**
 * Check if two fears are similar
 */
function isDuplicateFear(a: Fear, b: Fear): boolean {
  const aWords = new Set(a.fear.toLowerCase().split(/\s+/));
  const bWords = new Set(b.fear.toLowerCase().split(/\s+/));
  const intersection = [...aWords].filter((w) => bWords.has(w) && w.length > 3);
  return intersection.length > 2;
}

/**
 * Check if two stress triggers are similar
 */
function isDuplicateTrigger(a: StressTrigger, b: StressTrigger): boolean {
  return (
    a.category === b.category &&
    a.trigger.toLowerCase().includes(b.trigger.toLowerCase().slice(0, 30))
  );
}

/**
 * Check if two comfort patterns are similar
 */
function isDuplicateComfort(a: ComfortPattern, b: ComfortPattern): boolean {
  return a.type === b.type && a.effectiveFor.toLowerCase() === b.effectiveFor.toLowerCase();
}

/**
 * Deduplicate array using similarity function
 */
function dedupeArray<T>(existing: T[], newItems: T[], isDuplicate: (a: T, b: T) => boolean): T[] {
  const result = [...existing];

  for (const item of newItems) {
    const exists = result.some((e) => isDuplicate(e, item));
    if (!exists) {
      result.push(item);
    }
  }

  return result;
}

// ============================================================================
// MERGE WITH DEDUPLICATION
// ============================================================================

/**
 * Merge extracted signals into existing human memory with deduplication
 */
export function mergeSignalsIntoMemory(
  existing: Partial<HumanMemory> | undefined,
  extracted: ExtractionResult
): Partial<HumanMemory> {
  const now = new Date();

  return {
    // Dedupe dates by month/day/type
    importantDates: dedupeArray(
      existing?.importantDates || [],
      extracted.importantDates,
      isDuplicateDate
    ),
    // Dedupe inside jokes by reference text similarity
    insideJokes: [
      ...(existing?.insideJokes || []),
      ...extracted.insideJokes.filter(
        (newJoke) =>
          !(existing?.insideJokes || []).some(
            (e) => e.reference.toLowerCase() === newJoke.reference.toLowerCase()
          )
      ),
    ],
    runningThemes: existing?.runningThemes || [],
    userTeachings: existing?.userTeachings || [],
    identity: {
      // Dedupe values by value text
      values: dedupeArray(existing?.identity?.values || [], extracted.values, isDuplicateValue),
      // Dedupe dreams by description similarity
      dreams: dedupeArray(existing?.identity?.dreams || [], extracted.dreams, isDuplicateDream),
      // Dedupe fears by text similarity
      fears: dedupeArray(existing?.identity?.fears || [], extracted.fears, isDuplicateFear),
      formativeExperiences: existing?.identity?.formativeExperiences || [],
      updatedAt: now,
    },
    emotionalSignature: {
      humor: existing?.emotionalSignature?.humor || {
        appreciates: [],
        avoids: [],
        successfulMoments: [],
        overallLevel: 'enjoys_moderately',
      },
      // Dedupe comfort patterns by type + effectiveFor
      comfortPatterns: dedupeArray(
        existing?.emotionalSignature?.comfortPatterns || [],
        extracted.comfortPatterns,
        isDuplicateComfort
      ),
      tells: existing?.emotionalSignature?.tells || [],
      // Dedupe stress triggers by category + trigger text
      stressTriggers: dedupeArray(
        existing?.emotionalSignature?.stressTriggers || [],
        extracted.stressTriggers,
        isDuplicateTrigger
      ),
      updatedAt: now,
    },
    growthArc: {
      // Growth markers are unique events, but dedupe by description similarity
      markers: dedupeArray(existing?.growthArc?.markers || [], extracted.growthMarkers, (a, b) =>
        a.description.toLowerCase().includes(b.description.toLowerCase().slice(0, 50))
      ),
      // Challenges dedupe by challenge text
      challenges: dedupeArray(existing?.growthArc?.challenges || [], extracted.challenges, (a, b) =>
        a.challenge.toLowerCase().includes(b.challenge.toLowerCase().slice(0, 30))
      ),
      updatedAt: now,
    },
    unspoken: {
      // Avoidances - merge observations if same topic
      avoidances: mergeAvoidances(existing?.unspoken?.avoidances || [], extracted.avoidances),
      reachOutPatterns: existing?.unspoken?.reachOutPatterns || [],
      energyPatterns: existing?.unspoken?.energyPatterns || [],
      updatedAt: now,
    },
    temporal: existing?.temporal,
    updatedAt: now,
  };
}

/**
 * Merge avoidances - if same topic exists, increment observations
 */
function mergeAvoidances(
  existing: RecurringAvoidance[],
  newAvoidances: RecurringAvoidance[]
): RecurringAvoidance[] {
  const result = [...existing];

  for (const newAvoid of newAvoidances) {
    const existingIdx = result.findIndex(
      (e) => e.topic.toLowerCase() === newAvoid.topic.toLowerCase()
    );

    if (existingIdx >= 0) {
      // Same topic - increment observations
      result[existingIdx] = {
        ...result[existingIdx],
        observations: result[existingIdx].observations + 1,
      };
    } else {
      // New topic
      result.push(newAvoid);
    }
  }

  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  extractHumanSignals,
  mergeSignalsIntoMemory,
};
