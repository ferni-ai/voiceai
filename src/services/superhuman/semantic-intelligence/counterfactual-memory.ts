/**
 * Counter-Factual Memory - Better Than Human Service
 *
 * "Learn from paths taken and not taken"
 *
 * Tracks when advice was given, whether it was followed,
 * and what outcomes resulted:
 *   - "You said you'd set boundaries at work. You didn't.
 *     Three weeks later you hit burnout."
 *   - Enables: "Last time this pattern started, you didn't rest.
 *     Want to try something different?"
 *
 * @module services/superhuman/semantic-intelligence/counterfactual-memory
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { embed, cosineSimilarity } from '../../../memory/embeddings.js';
import { getFirestoreDb, cleanForFirestore } from '../firestore-utils.js';
import type { DecisionPoint, CounterfactualOutcome, CounterfactualPattern } from './types.js';

const log = createLogger({ module: 'counterfactual-memory' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MAX_DECISION_POINTS: 100,
  MAX_PATTERNS: 30,
  MIN_POINTS_FOR_PATTERN: 2,
  FOLLOW_UP_WINDOW_DAYS: 30, // How long we wait to assess outcome
  SIMILARITY_THRESHOLD: 0.7,
};

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const decisionCache = new Map<string, DecisionPoint[]>();
const patternCache = new Map<string, CounterfactualPattern[]>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record a decision point where advice/suggestion was given.
 *
 * Call this whenever Ferni gives actionable advice:
 * - "You should set boundaries"
 * - "Try getting more sleep"
 * - "Consider talking to them about it"
 */
export async function recordDecisionPoint(
  userId: string,
  decision: {
    advice: string;
    context: string; // What was being discussed
    urgency?: 'low' | 'medium' | 'high';
    domain?: string; // work, health, relationship, etc.
  }
): Promise<DecisionPoint> {
  const { advice, context, urgency = 'medium', domain } = decision;
  const timestamp = Date.now();

  // Generate embedding for matching later
  let adviceEmbedding: number[] | undefined;
  try {
    adviceEmbedding = await embed(`${advice} ${context}`);
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to embed decision point');
  }

  const decisionPoint: DecisionPoint = {
    id: `dec_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    advice,
    adviceEmbedding,
    context,
    timestamp,
    pathTaken: 'unknown',
  };

  // Load and update cache
  const decisions = decisionCache.get(userId) || (await loadDecisionPoints(userId));
  decisions.push(decisionPoint);

  // Trim if too many
  if (decisions.length > CONFIG.MAX_DECISION_POINTS) {
    decisions.shift();
  }

  decisionCache.set(userId, decisions);
  await saveDecisionPoint(userId, decisionPoint);

  log.debug({ userId, advice: advice.slice(0, 50) }, '📍 Decision point recorded');
  return decisionPoint;
}

/**
 * Record follow-up on a decision point.
 *
 * Call this when we detect the user did/didn't follow advice:
 * - User mentions they tried the advice
 * - User mentions they didn't do it
 * - We detect the situation recurring
 */
export async function recordFollowUp(
  userId: string,
  followUp: {
    originalAdvice?: string; // To find matching decision point
    decisionPointId?: string; // If known
    pathTaken: 'followed' | 'ignored' | 'modified';
    reflection?: string; // What the user said about it
  }
): Promise<DecisionPoint | null> {
  const { originalAdvice, decisionPointId, pathTaken, reflection } = followUp;
  const timestamp = Date.now();

  const decisions = decisionCache.get(userId) || (await loadDecisionPoints(userId));

  // Find the decision point
  let decisionPoint: DecisionPoint | undefined;

  if (decisionPointId) {
    decisionPoint = decisions.find((d) => d.id === decisionPointId);
  } else if (originalAdvice) {
    // Find by semantic similarity
    const embedding = await embed(originalAdvice);
    let bestMatch: DecisionPoint | undefined;
    let bestSimilarity = 0;

    for (const d of decisions) {
      if (d.pathTaken !== 'unknown') continue; // Already followed up
      if (d.adviceEmbedding) {
        const similarity = cosineSimilarity(embedding, d.adviceEmbedding);
        if (similarity > CONFIG.SIMILARITY_THRESHOLD && similarity > bestSimilarity) {
          bestMatch = d;
          bestSimilarity = similarity;
        }
      }
    }
    decisionPoint = bestMatch;
  }

  if (!decisionPoint) {
    log.debug({ userId, originalAdvice }, 'No matching decision point found');
    return null;
  }

  // Update the decision point
  decisionPoint.pathTaken = pathTaken;
  decisionPoint.followUpTimestamp = timestamp;

  decisionCache.set(userId, decisions);
  await saveDecisionPoint(userId, decisionPoint);

  log.debug({ userId, decisionId: decisionPoint.id, pathTaken }, '↩️ Decision follow-up recorded');

  return decisionPoint;
}

/**
 * Record the outcome of a decision.
 *
 * Call this when we can assess what happened:
 * - User reports feeling better/worse
 * - Situation resolved/escalated
 * - Time has passed and we can reflect
 */
export async function recordOutcome(
  userId: string,
  outcome: {
    decisionPointId: string;
    result: 'positive' | 'negative' | 'neutral' | 'mixed';
    description: string;
    emotionalImpact?: number; // -1 to 1
    userReflection?: string;
  }
): Promise<void> {
  const { decisionPointId, result, description, emotionalImpact = 0, userReflection } = outcome;

  const decisions = decisionCache.get(userId) || (await loadDecisionPoints(userId));
  const decisionPoint = decisions.find((d) => d.id === decisionPointId);

  if (!decisionPoint) {
    log.debug({ userId, decisionPointId }, 'Decision point not found for outcome');
    return;
  }

  // Add outcome
  decisionPoint.outcome = {
    timestamp: Date.now(),
    result,
    description,
    emotionalImpact,
    userReflection,
  };

  // Generate lesson
  decisionPoint.lesson = generateLesson(decisionPoint);

  // Update patterns
  await updatePatterns(userId, decisionPoint);

  decisionCache.set(userId, decisions);
  await saveDecisionPoint(userId, decisionPoint);

  log.debug({ userId, decisionId: decisionPointId, result }, '📊 Outcome recorded');
}

/**
 * Generate a lesson from a decision point with outcome.
 */
function generateLesson(decision: DecisionPoint): string {
  const { advice, pathTaken, outcome } = decision;

  if (!outcome) return '';

  const action =
    pathTaken === 'followed' ? 'followed' : pathTaken === 'ignored' ? "didn't follow" : 'modified';
  const result = outcome.result;

  // Templates based on action + result
  if (pathTaken === 'followed' && result === 'positive') {
    return `When you ${advice.toLowerCase()}, it led to positive results.`;
  } else if (pathTaken === 'followed' && result === 'negative') {
    return `Even though you tried to ${advice.toLowerCase()}, it didn't work out as hoped.`;
  } else if (pathTaken === 'ignored' && result === 'negative') {
    return `You decided not to ${advice.toLowerCase()}. The situation got harder.`;
  } else if (pathTaken === 'ignored' && result === 'positive') {
    return `The situation resolved even without ${advice.toLowerCase()}.`;
  } else if (pathTaken === 'modified') {
    return `You adapted the approach and it was ${result}.`;
  }

  return `${action} the advice about ${advice.toLowerCase()} → ${result} outcome.`;
}

/**
 * Update or create patterns from decision points.
 */
async function updatePatterns(userId: string, newDecision: DecisionPoint): Promise<void> {
  const patterns = patternCache.get(userId) || (await loadPatterns(userId));
  const decisions = decisionCache.get(userId) || [];

  if (!newDecision.outcome) return;

  // Find similar past decisions
  const similarDecisions: DecisionPoint[] = [];

  for (const d of decisions) {
    if (d.id === newDecision.id) continue;
    if (!d.outcome) continue;

    if (newDecision.adviceEmbedding && d.adviceEmbedding) {
      const similarity = cosineSimilarity(newDecision.adviceEmbedding, d.adviceEmbedding);
      if (similarity >= CONFIG.SIMILARITY_THRESHOLD) {
        similarDecisions.push(d);
      }
    }
  }

  if (similarDecisions.length >= CONFIG.MIN_POINTS_FOR_PATTERN - 1) {
    // We have enough data to form/update a pattern
    const allRelated = [newDecision, ...similarDecisions];

    // Find or create pattern
    let pattern = patterns.find(
      (p) =>
        p.decisionPoints.includes(newDecision.id) ||
        similarDecisions.some((d) => p.decisionPoints.includes(d.id))
    );

    if (pattern) {
      // Update existing pattern
      if (!pattern.decisionPoints.includes(newDecision.id)) {
        pattern.decisionPoints.push(newDecision.id);
      }
    } else if (patterns.length < CONFIG.MAX_PATTERNS) {
      // Create new pattern
      pattern = {
        id: `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        pattern: extractPatternDescription(allRelated),
        patternEmbedding: newDecision.adviceEmbedding,
        decisionPoints: allRelated.map((d) => d.id),
        followedOutcomes: { positive: 0, negative: 0, neutral: 0 },
        ignoredOutcomes: { positive: 0, negative: 0, neutral: 0 },
        insight: '',
        confidence: 0,
      };
      patterns.push(pattern);
    }

    if (pattern) {
      // Tally outcomes
      for (const d of allRelated) {
        if (!d.outcome) continue;
        const outcomes =
          d.pathTaken === 'followed' || d.pathTaken === 'modified'
            ? pattern.followedOutcomes
            : pattern.ignoredOutcomes;
        const result = d.outcome.result === 'mixed' ? 'neutral' : d.outcome.result;
        outcomes[result]++;
      }

      // Calculate confidence
      const totalDataPoints = allRelated.filter((d) => d.outcome).length;
      pattern.confidence = Math.min(0.95, totalDataPoints / 10);

      // Generate insight
      pattern.insight = generatePatternInsight(pattern);

      patternCache.set(userId, patterns);
      await savePattern(userId, pattern);
    }
  }
}

/**
 * Extract a description for a pattern from related decisions.
 */
function extractPatternDescription(decisions: DecisionPoint[]): string {
  // Find common themes in the advice
  const advices = decisions.map((d) => d.advice.toLowerCase());

  // Simple keyword extraction
  const words = advices.join(' ').split(/\s+/);
  const wordFreq = new Map<string, number>();
  for (const word of words) {
    if (word.length > 4) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  }

  const topWords = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word);

  return `Decisions about ${topWords.join(', ')}`;
}

/**
 * Generate insight from a counterfactual pattern.
 */
function generatePatternInsight(pattern: CounterfactualPattern): string {
  const { followedOutcomes, ignoredOutcomes } = pattern;

  const followedTotal =
    followedOutcomes.positive + followedOutcomes.negative + followedOutcomes.neutral;
  const ignoredTotal =
    ignoredOutcomes.positive + ignoredOutcomes.negative + ignoredOutcomes.neutral;

  if (followedTotal === 0 && ignoredTotal === 0) {
    return 'Still gathering data on this pattern.';
  }

  const followedPositiveRate = followedTotal > 0 ? followedOutcomes.positive / followedTotal : 0;
  const ignoredNegativeRate = ignoredTotal > 0 ? ignoredOutcomes.negative / ignoredTotal : 0;

  if (followedPositiveRate > 0.6 && ignoredNegativeRate > 0.5) {
    return "When you follow through on this, things tend to go better. When you don't, it often gets harder.";
  } else if (followedPositiveRate > 0.6) {
    return 'Following through here usually leads to positive outcomes.';
  } else if (ignoredNegativeRate > 0.6) {
    return 'Not acting on this tends to make things more difficult.';
  } else if (followedOutcomes.negative > followedOutcomes.positive && ignoredTotal > 0) {
    return "Interestingly, this advice hasn't always worked out. Let's think about why.";
  }

  return 'The pattern here is still emerging.';
}

// ============================================================================
// RETRIEVAL FUNCTIONS
// ============================================================================

/**
 * Get pending decisions that need follow-up.
 */
export async function getPendingFollowUps(userId: string): Promise<DecisionPoint[]> {
  const decisions = decisionCache.get(userId) || (await loadDecisionPoints(userId));
  const now = Date.now();
  const windowMs = CONFIG.FOLLOW_UP_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  return decisions.filter(
    (d) =>
      d.pathTaken === 'unknown' &&
      now - d.timestamp < windowMs &&
      now - d.timestamp > 3 * 24 * 60 * 60 * 1000 // At least 3 days old
  );
}

/**
 * Get relevant patterns for current context.
 */
export async function getRelevantPatterns(
  userId: string,
  context: {
    currentTopic?: string;
    currentSituation?: string;
  }
): Promise<CounterfactualPattern[]> {
  const patterns = patternCache.get(userId) || (await loadPatterns(userId));

  if (!context.currentTopic && !context.currentSituation) {
    return patterns.filter((p) => p.confidence >= 0.5).slice(0, 3);
  }

  // Score relevance
  const contextText = `${context.currentTopic || ''} ${context.currentSituation || ''}`;
  let contextEmbedding: number[] | null = null;

  try {
    contextEmbedding = await embed(contextText);
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to embed context');
  }

  const scored = patterns.map((p) => {
    let relevance = p.confidence;

    if (contextEmbedding && p.patternEmbedding) {
      const similarity = cosineSimilarity(contextEmbedding, p.patternEmbedding);
      relevance *= similarity;
    }

    // Text matching fallback
    if (
      context.currentTopic &&
      p.pattern.toLowerCase().includes(context.currentTopic.toLowerCase())
    ) {
      relevance += 0.3;
    }

    return { pattern: p, relevance };
  });

  return scored
    .filter((s) => s.relevance > 0.3)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3)
    .map((s) => s.pattern);
}

/**
 * Find similar past decisions for current situation.
 */
export async function findSimilarPastDecisions(
  userId: string,
  currentSituation: string
): Promise<DecisionPoint[]> {
  const decisions = decisionCache.get(userId) || (await loadDecisionPoints(userId));

  let situationEmbedding: number[] | null = null;
  try {
    situationEmbedding = await embed(currentSituation);
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to embed situation');
    return [];
  }

  const scored = decisions
    .filter((d) => d.outcome) // Only decisions with outcomes
    .map((d) => {
      let similarity = 0;
      if (situationEmbedding && d.adviceEmbedding) {
        similarity = cosineSimilarity(situationEmbedding, d.adviceEmbedding);
      }
      return { decision: d, similarity };
    });

  return scored
    .filter((s) => s.similarity >= CONFIG.SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5)
    .map((s) => s.decision);
}

/**
 * Build context string for LLM injection.
 */
export async function buildCounterfactualContext(
  userId: string,
  currentContext?: {
    topic?: string;
    situation?: string;
  }
): Promise<string> {
  const pendingFollowUps = await getPendingFollowUps(userId);
  const relevantPatterns = await getRelevantPatterns(userId, {
    currentTopic: currentContext?.topic,
    currentSituation: currentContext?.situation,
  });

  if (pendingFollowUps.length === 0 && relevantPatterns.length === 0) {
    return '';
  }

  const sections: string[] = [
    '[COUNTERFACTUAL MEMORY - Learning from Paths Taken]',
    'You remember what they decided before and what happened.',
    '',
  ];

  // Pending follow-ups
  if (pendingFollowUps.length > 0) {
    sections.push('**Recent advice to follow up on:**');
    for (const d of pendingFollowUps.slice(0, 3)) {
      const daysAgo = Math.floor((Date.now() - d.timestamp) / (24 * 60 * 60 * 1000));
      sections.push(`  • "${d.advice}" (${daysAgo} days ago)`);
    }
    sections.push('');
  }

  // Relevant patterns with insights
  if (relevantPatterns.length > 0) {
    sections.push('**Patterns from past decisions:**');
    for (const p of relevantPatterns) {
      if (p.insight) {
        sections.push(`  • ${p.pattern}: ${p.insight}`);
      }
    }
    sections.push('');
  }

  // If there's a similar past decision with clear outcome
  if (currentContext?.situation) {
    const similar = await findSimilarPastDecisions(userId, currentContext.situation);
    if (similar.length > 0) {
      const mostRelevant = similar[0];
      if (mostRelevant.outcome && mostRelevant.lesson) {
        sections.push('**Relevant past experience:**');
        sections.push(`  "${mostRelevant.lesson}"`);
        sections.push('');
      }
    }
  }

  sections.push('Surface these gently. "Last time..." or "I remember when..."');

  return sections.join('\n');
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function loadDecisionPoints(userId: string): Promise<DecisionPoint[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('decision_points')
      .orderBy('timestamp', 'desc')
      .limit(CONFIG.MAX_DECISION_POINTS)
      .get();

    const decisions = snapshot.docs.map((doc) => doc.data() as DecisionPoint);
    decisionCache.set(userId, decisions);
    return decisions;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load decision points');
    return [];
  }
}

async function saveDecisionPoint(userId: string, decision: DecisionPoint): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('decision_points')
      .doc(decision.id)
      .set(cleanForFirestore(decision));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save decision point');
  }
}

async function loadPatterns(userId: string): Promise<CounterfactualPattern[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('counterfactual_patterns')
      .orderBy('confidence', 'desc')
      .limit(CONFIG.MAX_PATTERNS)
      .get();

    const patterns = snapshot.docs.map((doc) => doc.data() as CounterfactualPattern);
    patternCache.set(userId, patterns);
    return patterns;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load patterns');
    return [];
  }
}

async function savePattern(userId: string, pattern: CounterfactualPattern): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('counterfactual_patterns')
      .doc(pattern.id)
      .set(cleanForFirestore(pattern));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save pattern');
  }
}

/**
 * Clear counterfactual cache for a user.
 */
export function clearCounterfactualCache(userId?: string): void {
  if (userId) {
    decisionCache.delete(userId);
    patternCache.delete(userId);
  } else {
    decisionCache.clear();
    patternCache.clear();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const counterfactualMemory = {
  recordDecision: recordDecisionPoint,
  recordFollowUp,
  recordOutcome,
  getPendingFollowUps,
  getRelevantPatterns,
  findSimilar: findSimilarPastDecisions,
  buildContext: buildCounterfactualContext,
  clearCache: clearCounterfactualCache,
};
