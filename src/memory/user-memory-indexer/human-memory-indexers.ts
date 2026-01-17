/**
 * Human Memory Indexers
 *
 * Index human-centric memory data: important dates, inside jokes, running themes,
 * values, dreams, fears, growth markers, challenges, avoidances, temporal patterns,
 * comfort patterns, stress triggers, emotional tells.
 *
 * @module memory/user-memory-indexer/human-memory-indexers
 */

import { getLogger } from '../../utils/safe-logger.js';
import type {
  HumanMemory,
  ImportantDate,
  InsideJoke,
  RunningTheme,
  CoreValue,
  Dream,
  Fear,
  GrowthMarker,
  ChallengeProgress,
  RecurringAvoidance,
  SeasonalPattern,
  ComfortPattern,
  StressTrigger,
  EmotionalTell,
} from '../../types/human-memory.js';
import { generateDocId, type AnyVectorStore, type VectorDocument } from './types.js';

const log = getLogger().child({ module: 'UserMemoryIndexer' });

// ============================================================================
// IMPORTANT DATES
// ============================================================================

/**
 * Index important dates (birthdays, anniversaries, etc.)
 */
export async function indexImportantDates(
  userId: string,
  dates: ImportantDate[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const date of dates) {
    const text = `Important date: ${date.label}. Type: ${date.type}. ${
      date.relatedPerson ? `Related to ${date.relatedPerson}. ` : ''
    }Occurs ${date.month}/${date.day}${date.year ? `/${date.year}` : ' annually'}. ${
      date.notes || ''
    }`;

    const doc: VectorDocument = {
      id: generateDocId('important_date', userId, date.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'important_date',
        dateType: date.type,
        month: date.month,
        day: date.day,
        year: date.year,
        relatedPerson: date.relatedPerson,
        significance: date.significance,
        sentiment: date.sentiment,
        wantsAcknowledgment: date.wantsAcknowledgment,
        userId,
        timestamp: date.discoveredAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, dateId: date.id }, 'Failed to index important date');
    }
  }

  return indexed;
}

// ============================================================================
// INSIDE JOKES
// ============================================================================

/**
 * Index inside jokes for relationship texture
 */
export async function indexInsideJokes(
  userId: string,
  jokes: InsideJoke[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const joke of jokes) {
    const text = `Inside joke: "${joke.reference}". Origin: ${joke.origin}. Status: ${joke.status}`;

    const doc: VectorDocument = {
      id: generateDocId('inside_joke', userId, joke.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'inside_joke',
        status: joke.status,
        usageCount: joke.usageCount,
        userId,
        timestamp: joke.originatedAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, jokeId: joke.id }, 'Failed to index inside joke');
    }
  }

  return indexed;
}

// ============================================================================
// RUNNING THEMES
// ============================================================================

/**
 * Index running themes in conversations
 */
export async function indexRunningThemes(
  userId: string,
  themes: RunningTheme[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const theme of themes) {
    const keyMomentsSummary = theme.keyMoments
      .slice(-3)
      .map((m) => m.summary)
      .join('; ');
    const text = `Running theme: ${theme.theme}. Comes up ${theme.frequency}. Sentiment: ${theme.sentiment}. ${
      keyMomentsSummary ? `Key moments: ${keyMomentsSummary}` : ''
    }`;

    const doc: VectorDocument = {
      id: generateDocId('running_theme', userId, theme.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'running_theme',
        frequency: theme.frequency,
        sentiment: theme.sentiment,
        userId,
        startedAt: theme.startedAt,
        timestamp: theme.lastMentioned,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, themeId: theme.id }, 'Failed to index running theme');
    }
  }

  return indexed;
}

// ============================================================================
// VALUES, DREAMS, FEARS
// ============================================================================

/**
 * Index core values
 */
export async function indexValues(
  userId: string,
  values: CoreValue[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const value of values) {
    const text = `Core value: ${value.value}. Strength: ${value.strength}. Evidence: ${value.evidence.join('; ')}`;

    const doc: VectorDocument = {
      id: generateDocId('value', userId, value.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'value',
        strength: value.strength,
        userId,
        timestamp: value.discoveredAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, valueId: value.id }, 'Failed to index value');
    }
  }

  return indexed;
}

/**
 * Index dreams and aspirations
 */
export async function indexDreams(
  userId: string,
  dreams: Dream[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const dream of dreams) {
    const text = `Dream: ${dream.description}. Category: ${dream.category}. Sentiment: ${dream.sentiment}. Status: ${dream.status}`;

    const doc: VectorDocument = {
      id: generateDocId('dream', userId, dream.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'dream',
        dreamCategory: dream.category,
        sentiment: dream.sentiment,
        status: dream.status,
        userId,
        timestamp: dream.firstMentioned,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, dreamId: dream.id }, 'Failed to index dream');
    }
  }

  return indexed;
}

/**
 * Index fears and worries
 */
export async function indexFears(
  userId: string,
  fears: Fear[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const fear of fears) {
    const text = `Fear/Worry: ${fear.fear}. Frequency: ${fear.frequency}. ${
      fear.copingMechanisms?.length ? `Coping: ${fear.copingMechanisms.join(', ')}` : ''
    }`;

    const doc: VectorDocument = {
      id: generateDocId('fear', userId, fear.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'fear',
        frequency: fear.frequency,
        sensitivity: fear.sensitivity,
        userId,
        timestamp: fear.discoveredAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, fearId: fear.id }, 'Failed to index fear');
    }
  }

  return indexed;
}

// ============================================================================
// GROWTH & CHALLENGES
// ============================================================================

/**
 * Index growth markers ("look how far you've come")
 */
export async function indexGrowthMarkers(
  userId: string,
  markers: GrowthMarker[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const marker of markers) {
    const text = `Growth: ${marker.description}. Before: ${marker.before}. After: ${marker.after}. ${
      marker.acknowledged
        ? `Acknowledged (reaction: ${marker.reactionWhenAcknowledged})`
        : 'Not yet acknowledged'
    }`;

    const doc: VectorDocument = {
      id: generateDocId('growth_marker', userId, marker.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'growth_marker',
        acknowledged: marker.acknowledged,
        reactionWhenAcknowledged: marker.reactionWhenAcknowledged,
        userId,
        timestamp: marker.observedAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, markerId: marker.id }, 'Failed to index growth marker');
    }
  }

  return indexed;
}

/**
 * Index challenges they're working through
 */
export async function indexChallenges(
  userId: string,
  challenges: ChallengeProgress[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const challenge of challenges) {
    const milestonesSummary = challenge.milestones
      .slice(-3)
      .map((m) => m.description)
      .join('; ');
    const text = `Challenge: ${challenge.challenge}. Status: ${challenge.status}. ${
      milestonesSummary ? `Progress: ${milestonesSummary}` : ''
    }`;

    const doc: VectorDocument = {
      id: generateDocId('challenge', userId, challenge.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'challenge',
        status: challenge.status,
        userId,
        startedAt: challenge.startedAt,
        timestamp: challenge.lastUpdate,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, challengeId: challenge.id }, 'Failed to index challenge');
    }
  }

  return indexed;
}

// ============================================================================
// BEHAVIORAL PATTERNS
// ============================================================================

/**
 * Index recurring avoidances (what they don't want to talk about)
 */
export async function indexAvoidances(
  userId: string,
  avoidances: RecurringAvoidance[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const avoidance of avoidances) {
    const text = `Avoids topic: ${avoidance.topic}. Style: ${avoidance.avoidanceStyle}. Observed ${avoidance.observations} times. ${
      avoidance.possibleReason ? `Possible reason: ${avoidance.possibleReason}` : ''
    }. Approach: ${avoidance.approach}`;

    const doc: VectorDocument = {
      id: generateDocId('avoidance', userId, avoidance.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'avoidance',
        avoidanceStyle: avoidance.avoidanceStyle,
        observations: avoidance.observations,
        approach: avoidance.approach,
        userId,
        timestamp: avoidance.firstNoticed,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, avoidanceId: avoidance.id }, 'Failed to index avoidance');
    }
  }

  return indexed;
}

/**
 * Index seasonal/temporal patterns
 */
export async function indexTemporalPatterns(
  userId: string,
  patterns: SeasonalPattern[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const pattern of patterns) {
    const text = `Seasonal pattern: ${pattern.pattern}. Timing: ${pattern.timing}${
      pattern.customTiming ? ` (${pattern.customTiming})` : ''
    }. Emotional tone: ${pattern.emotionalTone}. ${pattern.approach ? `Approach: ${pattern.approach}` : ''}`;

    const doc: VectorDocument = {
      id: generateDocId('temporal_pattern', userId, pattern.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'temporal_pattern',
        timing: pattern.timing,
        emotionalTone: pattern.emotionalTone,
        confidence: pattern.confidence,
        yearsObserved: pattern.yearsObserved,
        userId,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, patternId: pattern.id }, 'Failed to index temporal pattern');
    }
  }

  return indexed;
}

/**
 * Index comfort patterns (what helps when they're struggling)
 */
export async function indexComfortPatterns(
  userId: string,
  patterns: ComfortPattern[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const pattern of patterns) {
    const text = `Comfort: ${pattern.type} works for ${pattern.effectiveFor}. Evidence: ${pattern.evidence}`;

    const doc: VectorDocument = {
      id: generateDocId('comfort_pattern', userId, pattern.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'comfort_pattern',
        comfortType: pattern.type,
        effectiveFor: pattern.effectiveFor,
        userId,
        timestamp: pattern.discoveredAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, patternId: pattern.id }, 'Failed to index comfort pattern');
    }
  }

  return indexed;
}

/**
 * Index stress triggers
 */
export async function indexStressTriggers(
  userId: string,
  triggers: StressTrigger[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const trigger of triggers) {
    const text = `Stress trigger: ${trigger.trigger}. Category: ${trigger.category}. Intensity: ${trigger.intensity}. ${
      trigger.helpfulResponses?.length ? `Helpful: ${trigger.helpfulResponses.join(', ')}` : ''
    }`;

    const doc: VectorDocument = {
      id: generateDocId('stress_trigger', userId, trigger.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'stress_trigger',
        triggerCategory: trigger.category,
        intensity: trigger.intensity,
        userId,
        timestamp: trigger.discoveredAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, triggerId: trigger.id }, 'Failed to index stress trigger');
    }
  }

  return indexed;
}

/**
 * Index emotional tells
 */
export async function indexEmotionalTells(
  userId: string,
  tells: EmotionalTell[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const tell of tells) {
    const text = `Emotional tell: When they "${tell.signal}", it usually means ${tell.interpretation}. Observed ${tell.observations} times. Confidence: ${Math.round(tell.confidence * 100)}%`;

    const doc: VectorDocument = {
      id: generateDocId('emotional_tell', userId, tell.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'emotional_tell',
        signal: tell.signal,
        interpretation: tell.interpretation,
        confidence: tell.confidence,
        observations: tell.observations,
        userId,
        timestamp: tell.discoveredAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, tellId: tell.id }, 'Failed to index emotional tell');
    }
  }

  return indexed;
}

// ============================================================================
// COMBINED HUMAN MEMORY
// ============================================================================

/**
 * Index complete human memory profile
 */
export async function indexHumanMemory(
  userId: string,
  humanMemory: Partial<HumanMemory>,
  store: AnyVectorStore
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  // Important dates
  if (humanMemory.importantDates?.length) {
    counts['important_date'] = await indexImportantDates(userId, humanMemory.importantDates, store);
  }

  // Inside jokes
  if (humanMemory.insideJokes?.length) {
    counts['inside_joke'] = await indexInsideJokes(userId, humanMemory.insideJokes, store);
  }

  // Running themes
  if (humanMemory.runningThemes?.length) {
    counts['running_theme'] = await indexRunningThemes(userId, humanMemory.runningThemes, store);
  }

  // Emotional signature components
  if (humanMemory.emotionalSignature) {
    const sig = humanMemory.emotionalSignature;

    if (sig.comfortPatterns?.length) {
      counts['comfort_pattern'] = await indexComfortPatterns(userId, sig.comfortPatterns, store);
    }

    if (sig.stressTriggers?.length) {
      counts['stress_trigger'] = await indexStressTriggers(userId, sig.stressTriggers, store);
    }

    if (sig.tells?.length) {
      counts['emotional_tell'] = await indexEmotionalTells(userId, sig.tells, store);
    }
  }

  // Identity components
  if (humanMemory.identity) {
    const { identity } = humanMemory;

    if (identity.values?.length) {
      counts['value'] = await indexValues(userId, identity.values, store);
    }

    if (identity.dreams?.length) {
      counts['dream'] = await indexDreams(userId, identity.dreams, store);
    }

    if (identity.fears?.length) {
      counts['fear'] = await indexFears(userId, identity.fears, store);
    }
  }

  // Growth arc
  if (humanMemory.growthArc) {
    if (humanMemory.growthArc.markers?.length) {
      counts['growth_marker'] = await indexGrowthMarkers(
        userId,
        humanMemory.growthArc.markers,
        store
      );
    }

    if (humanMemory.growthArc.challenges?.length) {
      counts['challenge'] = await indexChallenges(userId, humanMemory.growthArc.challenges, store);
    }
  }

  // Unspoken patterns
  if (humanMemory.unspoken?.avoidances?.length) {
    counts['avoidance'] = await indexAvoidances(userId, humanMemory.unspoken.avoidances, store);
  }

  // Temporal patterns
  if (humanMemory.temporal?.seasonal?.length) {
    counts['temporal_pattern'] = await indexTemporalPatterns(
      userId,
      humanMemory.temporal.seasonal,
      store
    );
  }

  return counts;
}
