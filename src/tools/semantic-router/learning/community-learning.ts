/**
 * Community Learning System
 *
 * Aggregates routing patterns across ALL users to improve the semantic router
 * for everyone. Privacy-preserving: stores patterns, not personal data.
 *
 * PHILOSOPHY:
 * - Individual corrections help one user
 * - Community patterns help EVERYONE
 * - When many users correct the same mistake, we know it's a systemic issue
 *
 * PRIVACY GUARANTEES:
 * - No user identifiers stored in community patterns
 * - Only aggregated statistics are used
 * - Minimum threshold before a pattern affects routing (prevents gaming)
 *
 * @module tools/semantic-router/learning/community-learning
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  getFirestore,
  isPersistenceAvailable,
  initializeFirestorePersistence,
} from '../persistence/index.js';
import type { RoutingCorrection } from './correction-store.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'semantic-router:community-learning' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Aggregated pattern learned from community corrections
 */
export interface CommunityPattern {
  /** Unique identifier for this pattern */
  patternId: string;

  /** Normalized query pattern (e.g., "play * music", "what's the weather *") */
  queryPattern: string;

  /** Keywords extracted from queries that led to this correction */
  keywords: string[];

  /** The predicted tool that was incorrect */
  incorrectTool: string;

  /** The correct tool that should be used */
  correctTool: string;

  /** How many unique users reported this correction */
  userCount: number;

  /** How many times this correction occurred */
  occurrenceCount: number;

  /** Confidence score (0-1) based on user count and consistency */
  confidence: number;

  /** When this pattern was first identified */
  createdAt: Date;

  /** When this pattern was last updated */
  updatedAt: Date;

  /** Whether this pattern is active (above threshold) */
  isActive: boolean;
}

/**
 * Query example that contributed to a pattern
 */
interface QueryExample {
  normalizedQuery: string;
  count: number;
}

/**
 * Raw pattern data before aggregation
 */
interface PatternCandidate {
  incorrectTool: string;
  correctTool: string;
  queries: QueryExample[];
  userIds: Set<string>; // Hashed for privacy
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Minimum users before a pattern becomes active */
const MIN_USERS_FOR_ACTIVE = 3;

/** Minimum occurrences before a pattern is considered */
const MIN_OCCURRENCES = 5;

/** Maximum patterns to cache in memory */
const MAX_CACHED_PATTERNS = 500;

/** How often to refresh patterns from Firestore (ms) */
const REFRESH_INTERVAL_MS = 60000; // 1 minute

// ============================================================================
// STATE
// ============================================================================

/** In-memory cache of active community patterns */
const cachedPatterns = new Map<string, CommunityPattern>();

/** Last time patterns were refreshed */
let lastRefreshTime = 0;

/** Whether the system is initialized */
let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the community learning system
 */
export async function initializeCommunityLearning(): Promise<void> {
  if (isInitialized) return;

  try {
    await initializeFirestorePersistence();
    await loadPatternsFromFirestore();
    isInitialized = true;
    log.info({ patternCount: cachedPatterns.size }, 'Community learning initialized');
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to initialize community learning');
    // Continue without community patterns - not fatal
    isInitialized = true;
  }
}

// ============================================================================
// PATTERN LEARNING
// ============================================================================

/**
 * Report a correction to the community learning system
 * Aggregates with existing patterns or creates new candidate
 */
export async function reportCorrectionToCommunity(correction: RoutingCorrection): Promise<void> {
  if (!correction.actualTool || correction.actualTool === correction.predictedTool) {
    return; // Not a correction we can learn from
  }

  const patternId = generatePatternId(correction.predictedTool, correction.actualTool);
  const userHash = hashUserId(correction.userId);
  const normalizedQuery = normalizeQueryForPattern(correction.normalizedQuery);

  try {
    await updatePatternInFirestore(
      patternId,
      correction.predictedTool,
      correction.actualTool,
      normalizedQuery,
      extractKeywords(correction.normalizedQuery),
      userHash
    );

    log.debug(
      {
        patternId,
        incorrectTool: correction.predictedTool,
        correctTool: correction.actualTool,
      },
      'Reported correction to community learning'
    );
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to report to community learning');
    // Non-critical - don't block
  }
}

// ============================================================================
// PATTERN RETRIEVAL
// ============================================================================

/**
 * Get community patterns that may apply to a query
 * Returns patterns where the predicted tool matches and keywords overlap
 */
export async function getCommunityPatternsForQuery(
  predictedTool: string,
  query: string
): Promise<CommunityPattern[]> {
  await maybeRefreshPatterns();

  const queryKeywords = extractKeywords(query);
  const matches: CommunityPattern[] = [];

  for (const pattern of cachedPatterns.values()) {
    if (!pattern.isActive) continue;
    if (pattern.incorrectTool !== predictedTool) continue;

    // Check keyword overlap
    const overlap = pattern.keywords.filter((k) => queryKeywords.includes(k));
    if (overlap.length >= 2 || (overlap.length >= 1 && pattern.confidence > 0.8)) {
      matches.push(pattern);
    }
  }

  // Sort by confidence
  matches.sort((a, b) => b.confidence - a.confidence);

  return matches.slice(0, 5); // Return top 5
}

/**
 * Check if a specific tool prediction should be corrected based on community patterns
 * Returns the suggested correct tool if confidence is high enough
 */
export function getCommunityCorrection(
  predictedTool: string,
  query: string
): { correctTool: string; confidence: number } | null {
  const queryKeywords = extractKeywords(query);

  for (const pattern of cachedPatterns.values()) {
    if (!pattern.isActive) continue;
    if (pattern.incorrectTool !== predictedTool) continue;
    if (pattern.confidence < 0.7) continue;

    // Check strong keyword match
    const overlap = pattern.keywords.filter((k) => queryKeywords.includes(k));
    if (overlap.length >= 2) {
      return {
        correctTool: pattern.correctTool,
        confidence: pattern.confidence * (overlap.length / pattern.keywords.length),
      };
    }
  }

  return null;
}

/**
 * Get all active community patterns
 */
export async function getActivePatterns(): Promise<CommunityPattern[]> {
  await maybeRefreshPatterns();
  return Array.from(cachedPatterns.values()).filter((p) => p.isActive);
}

/**
 * Get pattern statistics for observability
 */
export function getPatternStats(): {
  totalPatterns: number;
  activePatterns: number;
  lastRefresh: Date;
  topPatterns: Array<{
    incorrectTool: string;
    correctTool: string;
    userCount: number;
    confidence: number;
  }>;
} {
  const patterns = Array.from(cachedPatterns.values());
  const active = patterns.filter((p) => p.isActive);

  return {
    totalPatterns: patterns.length,
    activePatterns: active.length,
    lastRefresh: new Date(lastRefreshTime),
    topPatterns: active
      .sort((a, b) => b.userCount - a.userCount)
      .slice(0, 10)
      .map((p) => ({
        incorrectTool: p.incorrectTool,
        correctTool: p.correctTool,
        userCount: p.userCount,
        confidence: p.confidence,
      })),
  };
}

// ============================================================================
// FIRESTORE OPERATIONS
// ============================================================================

const COLLECTION_NAME = 'semantic_router_community_patterns';

/**
 * Load patterns from Firestore
 */
async function loadPatternsFromFirestore(): Promise<void> {
  if (!isPersistenceAvailable()) {
    log.debug('Firestore not available - community learning disabled');
    return;
  }

  try {
    const db = getFirestore();
    if (!db) return;

    const patternsRef = db.collection(COLLECTION_NAME);

    const snapshot = await patternsRef
      .where('isActive', '==', true)
      .orderBy('confidence', 'desc')
      .limit(MAX_CACHED_PATTERNS)
      .get();

    cachedPatterns.clear();

    for (const doc of snapshot.docs) {
      const data = doc.data() as Record<string, unknown>;
      const pattern: CommunityPattern = {
        patternId: doc.id,
        queryPattern: (data.queryPattern as string) || '',
        keywords: (data.keywords as string[]) || [],
        incorrectTool: data.incorrectTool as string,
        correctTool: data.correctTool as string,
        userCount: (data.userCount as number) || 0,
        occurrenceCount: (data.occurrenceCount as number) || 0,
        confidence: (data.confidence as number) || 0,
        createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() || new Date(),
        updatedAt: (data.updatedAt as { toDate?: () => Date })?.toDate?.() || new Date(),
        isActive: (data.isActive as boolean) ?? false,
      };

      cachedPatterns.set(pattern.patternId, pattern);
    }

    lastRefreshTime = Date.now();
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to load community patterns');
  }
}

/**
 * Update a pattern in Firestore (atomic increment)
 */
async function updatePatternInFirestore(
  patternId: string,
  incorrectTool: string,
  correctTool: string,
  normalizedQuery: string,
  keywords: string[],
  userHash: string
): Promise<void> {
  if (!isPersistenceAvailable()) return;

  try {
    const db = getFirestore();
    if (!db) return;

    const patternRef = db.collection(COLLECTION_NAME).doc(patternId);

    const doc = await patternRef.get();

    if (doc.exists) {
      // Update existing pattern
      const data = doc.data() as Record<string, unknown> | undefined;
      const existingUsers = new Set<string>((data?.userHashes as string[]) || []);
      const isNewUser = !existingUsers.has(userHash);

      existingUsers.add(cleanForFirestore(userHash));
      const userCount = existingUsers.size;
      const occurrenceCount = ((data?.occurrenceCount as number) || 0) + 1;

      // Merge keywords
      const existingKeywords = new Set<string>((data?.keywords as string[]) || []);
      for (const k of keywords) {
        existingKeywords.add(cleanForFirestore(k));
      }

      // Calculate confidence
      const confidence = calculateConfidence(userCount, occurrenceCount);

      await patternRef.update(
        cleanForFirestore({
          userHashes: Array.from(existingUsers),
          userCount,
          occurrenceCount,
          keywords: Array.from(existingKeywords).slice(0, 20), // Limit keywords
          confidence,
          isActive: userCount >= MIN_USERS_FOR_ACTIVE && occurrenceCount >= MIN_OCCURRENCES,
          updatedAt: new Date(),
          // Add query pattern example
          queryExamples: addQueryExample(
            (data?.queryExamples as QueryExample[]) || [],
            normalizedQuery
          ),
        })
      );

      if (isNewUser) {
        log.info({ patternId, userCount, confidence }, 'Community pattern updated with new user');
      }
    } else {
      // Create new pattern
      await patternRef.set(
        cleanForFirestore({
          patternId,
          incorrectTool,
          correctTool,
          queryPattern: extractQueryPattern(normalizedQuery),
          keywords,
          userHashes: [userHash],
          userCount: 1,
          occurrenceCount: 1,
          confidence: 0.1, // Low initial confidence
          isActive: false, // Not active until threshold reached
          createdAt: new Date(),
          updatedAt: new Date(),
          queryExamples: [{ query: normalizedQuery, count: 1 }],
        })
      );

      log.debug({ patternId, incorrectTool, correctTool }, 'New community pattern created');
    }
  } catch (error) {
    log.debug({ error: String(error), patternId }, 'Failed to update community pattern');
  }
}

/**
 * Refresh patterns if cache is stale
 */
async function maybeRefreshPatterns(): Promise<void> {
  if (!isInitialized) {
    await initializeCommunityLearning();
    return;
  }

  if (Date.now() - lastRefreshTime > REFRESH_INTERVAL_MS) {
    await loadPatternsFromFirestore();
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate a unique pattern ID from tool pair
 */
function generatePatternId(incorrectTool: string, correctTool: string): string {
  return `${incorrectTool}_to_${correctTool}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Hash user ID for privacy (one-way)
 */
function hashUserId(userId: string): string {
  // Simple hash - in production use crypto
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `u${Math.abs(hash).toString(36)}`;
}

/**
 * Normalize query for pattern matching
 */
function normalizeQueryForPattern(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract keywords from a query
 */
function extractKeywords(query: string): string[] {
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'can',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'up',
    'about',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'and',
    'or',
    'but',
    'if',
    'then',
    'so',
    'because',
    'as',
    'until',
    'while',
    'i',
    'me',
    'my',
    'we',
    'you',
    'your',
    'he',
    'she',
    'it',
    'they',
    'them',
    'their',
    'this',
    'that',
    'these',
    'those',
    'what',
    'which',
    'who',
    'when',
    'where',
    'why',
    'how',
    'some',
    'any',
    'all',
    'just',
    'more',
    'very',
    'also',
    'too',
    'please',
    "let's",
    'lets',
    'gonna',
    'wanna',
  ]);

  return normalizeQueryForPattern(query)
    .split(' ')
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/**
 * Extract a generalized query pattern
 */
function extractQueryPattern(query: string): string {
  // Replace specific terms with wildcards
  return normalizeQueryForPattern(query)
    .replace(/\b\d+\b/g, '*') // Numbers
    .replace(/\b(morning|afternoon|evening|night|today|tomorrow|yesterday)\b/g, '*') // Time words
    .replace(/\b[A-Z][a-z]+\b/g, '*'); // Proper nouns
}

/**
 * Calculate confidence score
 */
function calculateConfidence(userCount: number, occurrenceCount: number): number {
  // Confidence increases with users (more important) and occurrences
  const userScore = Math.min(userCount / 10, 1); // Max at 10 users
  const occurrenceScore = Math.min(occurrenceCount / 50, 1); // Max at 50 occurrences

  // Users count more than occurrences (prevents gaming by one user)
  return userScore * 0.7 + occurrenceScore * 0.3;
}

/**
 * Add a query example to the list (deduped, limited)
 */
function addQueryExample(existing: QueryExample[], newQuery: string): QueryExample[] {
  const found = existing.find((e) => e.normalizedQuery === newQuery);
  if (found) {
    found.count++;
  } else {
    existing.push({ normalizedQuery: newQuery, count: 1 });
  }

  // Keep top 10 by count
  return existing.sort((a, b) => b.count - a.count).slice(0, 10);
}

// ============================================================================
// INTEGRATION WITH SEMANTIC ROUTER
// ============================================================================

/**
 * Apply community learning to a routing decision
 * Returns adjusted confidence and potential tool suggestion
 */
export async function applyCommunityLearning(
  predictedTool: string,
  predictedConfidence: number,
  query: string
): Promise<{
  adjustedConfidence: number;
  suggestedTool?: string;
  communityInfluence: number;
}> {
  const correction = getCommunityCorrection(predictedTool, query);

  if (correction && correction.confidence > 0.7) {
    // Strong community signal to use different tool
    return {
      adjustedConfidence: predictedConfidence * (1 - correction.confidence * 0.5),
      suggestedTool: correction.correctTool,
      communityInfluence: correction.confidence,
    };
  }

  // No strong community signal
  return {
    adjustedConfidence: predictedConfidence,
    communityInfluence: 0,
  };
}
