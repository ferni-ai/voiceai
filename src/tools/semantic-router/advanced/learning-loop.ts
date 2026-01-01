/**
 * Active Learning Loop for Semantic Router
 *
 * Continuously learns from routing feedback to improve accuracy over time.
 * This is the "Better Than Human" secret sauce - we get smarter with every interaction.
 *
 * Learning signals:
 * 1. Explicit corrections - User says "no, I meant X"
 * 2. Implicit corrections - LLM uses different tool than predicted
 * 3. Success patterns - What worked well
 * 4. Failure patterns - What didn't work
 *
 * @module semantic-router/advanced/learning-loop
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  recordFeedback,
  recordCorrection,
  learnUserPhrase,
  getUserVocabulary,
  matchUserPhrases,
  updateCalibration,
  calibrateConfidence,
  getFeedbackStats,
  getAllVocabularyUserIds,
  saveVocabulary,
  type RoutingFeedback,
  type UserCorrection,
  type UserVocabulary,
} from './feedback-store.js';
import type { SemanticRouterResult } from '../types.js';

const log = createLogger({ module: 'SemanticRouter.LearningLoop' });

// ============================================================================
// TYPES
// ============================================================================

export interface LearningContext {
  userId: string;
  sessionId: string;
  personaId: string;
  inputText: string;
  inputLocale: string;
  routingResult: SemanticRouterResult;
  conversationHistory: Array<{ role: string; text: string }>;
  recentTools: string[];
}

export interface LearningOutcome {
  actualToolUsed: string | null;
  wasCorrection: boolean;
  wasSuccess: boolean;
  userFeedback?: string;
}

export interface EnhancedRouting {
  originalResult: SemanticRouterResult;
  adjustedConfidence: number;
  userVocabularyMatch?: {
    toolId: string;
    confidence: number;
    phrase: string;
  };
  boosts: Array<{
    source: string;
    toolId: string;
    boost: number;
  }>;
}

// ============================================================================
// CORE LEARNING FUNCTIONS
// ============================================================================

/**
 * Enhance routing result with learned patterns
 *
 * Call this AFTER the semantic router but BEFORE making decisions.
 * It applies user-specific vocabulary, time patterns, and calibration.
 */
export async function enhanceWithLearning(context: LearningContext): Promise<EnhancedRouting> {
  const boosts: EnhancedRouting['boosts'] = [];

  // 1. Check user vocabulary for learned phrases
  const vocabulary = await getUserVocabulary(context.userId);
  let userVocabularyMatch: EnhancedRouting['userVocabularyMatch'] | undefined;

  if (vocabulary) {
    const phraseMatch = matchUserPhrases(context.inputText, vocabulary);
    if (phraseMatch) {
      userVocabularyMatch = {
        toolId: phraseMatch.toolId,
        confidence: phraseMatch.confidence,
        phrase: context.inputText,
      };

      // Boost the matched tool
      boosts.push({
        source: 'user_vocabulary',
        toolId: phraseMatch.toolId,
        boost: phraseMatch.confidence * 0.3, // Up to 30% boost
      });
    }

    // Apply tool preferences
    for (const [toolId, pref] of Object.entries(vocabulary.toolPreferences)) {
      if (pref.boost !== 0) {
        boosts.push({
          source: 'tool_preference',
          toolId,
          boost: pref.boost * 0.1, // Up to 10% boost/penalty
        });
      }
    }

    // Apply time patterns
    const hour = new Date().getHours();
    const timeOfDay =
      hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

    for (const pattern of Object.values(vocabulary.timePatterns)) {
      if (pattern.timeOfDay === timeOfDay) {
        boosts.push({
          source: 'time_pattern',
          toolId: pattern.toolId,
          boost: pattern.probability * 0.15, // Up to 15% boost
        });
      }
    }
  }

  // 2. Apply confidence calibration
  const originalConfidence =
    context.routingResult.matches.length > 0 ? context.routingResult.matches[0].confidence : 0;
  const adjustedConfidence = calibrateConfidence(originalConfidence);

  return {
    originalResult: context.routingResult,
    adjustedConfidence,
    userVocabularyMatch,
    boosts,
  };
}

/**
 * Record the outcome of a routing decision for learning
 *
 * Call this AFTER the tool has been executed (or conversation happened).
 */
export async function recordOutcome(
  context: LearningContext,
  outcome: LearningOutcome
): Promise<void> {
  // 1. Record full feedback
  const feedback: Omit<RoutingFeedback, 'id'> = {
    timestamp: new Date(),
    userId: context.userId,
    sessionId: context.sessionId,
    personaId: context.personaId,
    inputText: context.inputText,
    inputLocale: context.inputLocale,
    routingResult: {
      predictedTool:
        context.routingResult.matches.length > 0 ? context.routingResult.matches[0].toolId : null,
      confidence:
        context.routingResult.matches.length > 0 ? context.routingResult.matches[0].confidence : 0,
      action: context.routingResult.action.type,
      alternativeTools: context.routingResult.matches.slice(1, 4).map((m) => m.toolId),
    },
    outcome: {
      actualToolUsed: outcome.actualToolUsed,
      userCorrection: outcome.wasCorrection,
      success: outcome.wasSuccess,
    },
    context: {
      conversationLength: context.conversationHistory.length,
      recentTools: context.recentTools,
      timeOfDay: getTimeOfDay(),
    },
  };

  await recordFeedback(feedback);

  // 2. Learn from corrections
  if (outcome.wasCorrection && outcome.actualToolUsed) {
    const predictedTool =
      context.routingResult.matches.length > 0 ? context.routingResult.matches[0].toolId : null;

    // Record the correction
    await recordCorrection({
      userId: context.userId,
      inputText: context.inputText,
      predictedTool,
      predictedConfidence:
        context.routingResult.matches.length > 0 ? context.routingResult.matches[0].confidence : 0,
      correctTool: outcome.actualToolUsed,
      signalStrength: 0.9,
    });

    // Learn the phrase -> tool mapping
    await learnUserPhrase(context.userId, context.inputText, outcome.actualToolUsed, 'implicit');

    log.info(
      {
        userId: context.userId,
        from: predictedTool,
        to: outcome.actualToolUsed,
        input: context.inputText.substring(0, 30),
      },
      'Learned from correction'
    );
  }

  // 3. Reinforce successful patterns
  if (outcome.wasSuccess && !outcome.wasCorrection) {
    const predictedTool =
      context.routingResult.matches.length > 0 ? context.routingResult.matches[0].toolId : null;

    if (predictedTool === outcome.actualToolUsed && predictedTool) {
      // Strengthen this phrase -> tool association
      await learnUserPhrase(context.userId, context.inputText, predictedTool, 'implicit');
    }
  }
}

/**
 * Explicit user correction
 *
 * Call this when user explicitly says something like:
 * "No, I wanted to play music, not check calendar"
 */
export async function handleExplicitCorrection(
  userId: string,
  inputText: string,
  wrongTool: string | null,
  correctTool: string
): Promise<void> {
  // Record high-confidence correction
  await recordCorrection({
    userId,
    inputText,
    predictedTool: wrongTool,
    predictedConfidence: 0.8, // Assume it was confident if we auto-executed
    correctTool,
    signalStrength: 1.0, // Maximum confidence for explicit corrections
  });

  // Learn the phrase with high confidence
  await learnUserPhrase(userId, inputText, correctTool, 'explicit');

  log.info(
    {
      userId,
      from: wrongTool,
      to: correctTool,
      phrase: inputText.substring(0, 30),
    },
    'Explicit correction processed'
  );
}

// ============================================================================
// BATCH LEARNING
// ============================================================================

/**
 * Run batch learning on accumulated feedback
 *
 * Call this periodically (e.g., nightly) to:
 * 1. Update calibration from all feedback
 * 2. Prune low-confidence vocabulary entries
 * 3. Consolidate patterns
 */
export async function runBatchLearning(): Promise<{
  calibrationUpdated: boolean;
  patternsConsolidated: number;
  vocabularyPruned: number;
}> {
  log.info('Starting batch learning...');

  // 1. Update calibration
  await updateCalibration();

  // 2. Consolidate patterns and prune vocabulary for all users
  let totalConsolidated = 0;
  let totalPruned = 0;

  // Process all user vocabularies
  const allUserIds = await getAllVocabularyUserIds();

  for (const userId of allUserIds) {
    const vocab = await getUserVocabulary(userId);
    if (!vocab || vocab.phrases.length === 0) continue;

    const { consolidated, pruned, updatedVocab } = consolidateAndPruneVocabulary(vocab);
    totalConsolidated += consolidated;
    totalPruned += pruned;

    if (consolidated > 0 || pruned > 0) {
      await saveVocabulary(updatedVocab);
      log.debug(
        { userId, consolidated, pruned, remaining: updatedVocab.phrases.length },
        'Vocabulary updated'
      );
    }
  }

  // 3. Get stats
  const stats = getFeedbackStats();

  log.info(
    {
      totalFeedback: stats.totalFeedback,
      correctionRate: (stats.correctionRate * 100).toFixed(1) + '%',
      successRate: (stats.successRate * 100).toFixed(1) + '%',
      patternsConsolidated: totalConsolidated,
      vocabularyPruned: totalPruned,
    },
    'Batch learning complete'
  );

  return {
    calibrationUpdated: true,
    patternsConsolidated: totalConsolidated,
    vocabularyPruned: totalPruned,
  };
}

/**
 * Consolidate similar phrases and prune low-quality entries
 */
function consolidateAndPruneVocabulary(vocab: UserVocabulary): {
  consolidated: number;
  pruned: number;
  updatedVocab: UserVocabulary;
} {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let consolidated = 0;
  let pruned = 0;

  // Step 1: Prune low-quality entries
  const prunedPhrases = vocab.phrases.filter((phrase) => {
    // Keep if: high confidence, or frequently used, or recently used
    const isHighConfidence = phrase.confidence >= 0.3;
    const isFrequentlyUsed = phrase.usageCount >= 2;
    const isRecentlyUsed = phrase.lastUsed >= thirtyDaysAgo;
    const isExplicit = phrase.source === 'explicit'; // Always keep explicit corrections

    const shouldKeep = isExplicit || (isHighConfidence && (isFrequentlyUsed || isRecentlyUsed));

    if (!shouldKeep) {
      pruned++;
      return false;
    }
    return true;
  });

  // Step 2: Consolidate similar phrases
  const consolidatedPhrases: typeof prunedPhrases = [];
  const processed = new Set<number>();

  for (let i = 0; i < prunedPhrases.length; i++) {
    if (processed.has(i)) continue;

    const phrase = prunedPhrases[i];
    const similar: typeof prunedPhrases = [phrase];
    processed.add(i);

    // Find similar phrases
    for (let j = i + 1; j < prunedPhrases.length; j++) {
      if (processed.has(j)) continue;

      const other = prunedPhrases[j];

      // Only consolidate if they map to the same tool
      if (phrase.toolId !== other.toolId) continue;

      if (arePhrasesSimilar(phrase.phrase, other.phrase)) {
        similar.push(other);
        processed.add(j);
        consolidated++;
      }
    }

    // Merge similar phrases into one
    if (similar.length > 1) {
      const merged = mergePhrases(similar);
      consolidatedPhrases.push(merged);
    } else {
      consolidatedPhrases.push(phrase);
    }
  }

  return {
    consolidated,
    pruned,
    updatedVocab: {
      ...vocab,
      phrases: consolidatedPhrases,
      updatedAt: now,
    },
  };
}

/**
 * Check if two phrases are similar enough to consolidate
 *
 * Uses word overlap and edit distance heuristics
 */
function arePhrasesSimilar(a: string, b: string): boolean {
  // Normalize
  const wordsA = a.toLowerCase().split(/\s+/).filter(Boolean).sort();
  const wordsB = b.toLowerCase().split(/\s+/).filter(Boolean).sort();

  // If one is much longer, they're not similar
  if (Math.abs(wordsA.length - wordsB.length) > 2) return false;

  // Calculate word overlap (Jaccard similarity)
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;

  const jaccardSimilarity = intersection / union;

  // Consider similar if >= 70% word overlap
  return jaccardSimilarity >= 0.7;
}

/**
 * Merge multiple similar phrases into one
 */
function mergePhrases(phrases: UserVocabulary['phrases']): UserVocabulary['phrases'][0] {
  // Use the shortest phrase (usually the most general)
  const sorted = [...phrases].sort((a, b) => a.phrase.length - b.phrase.length);
  const base = sorted[0];

  // Take the highest confidence
  const maxConfidence = Math.max(...phrases.map((p) => p.confidence));

  // Sum usage counts
  const totalUsage = phrases.reduce((sum, p) => sum + p.usageCount, 0);

  // Take the most recent lastUsed
  const mostRecent = phrases.reduce(
    (latest, p) => (p.lastUsed > latest ? p.lastUsed : latest),
    phrases[0].lastUsed
  );

  // Prefer explicit source if any
  const source = phrases.some((p) => p.source === 'explicit') ? 'explicit' : 'implicit';

  return {
    phrase: base.phrase,
    toolId: base.toolId,
    confidence: Math.min(1, maxConfidence + 0.05), // Small boost for consolidation
    usageCount: totalUsage,
    lastUsed: mostRecent,
    source,
  };
}

// ============================================================================
// TOOL CHAIN PREDICTION
// ============================================================================

interface ToolChainPrediction {
  currentTool: string;
  nextTools: Array<{
    toolId: string;
    probability: number;
    reason: string;
  }>;
}

// Co-occurrence matrix for tool chains (learned from data)
const toolCoOccurrence = new Map<string, Map<string, number>>();

/**
 * Predict next likely tools based on current context
 */
export async function predictToolChain(
  currentTool: string,
  context: LearningContext
): Promise<ToolChainPrediction> {
  const nextTools: ToolChainPrediction['nextTools'] = [];

  // 1. Check co-occurrence patterns
  const coOccurrence = toolCoOccurrence.get(currentTool);
  if (coOccurrence) {
    const sorted = Array.from(coOccurrence.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    for (const [toolId, count] of sorted) {
      const total = Array.from(coOccurrence.values()).reduce((a, b) => a + b, 0);
      nextTools.push({
        toolId,
        probability: count / total,
        reason: 'co-occurrence',
      });
    }
  }

  // 2. Add domain-specific chains
  const domainChains = getDomainChains(currentTool);
  for (const chain of domainChains) {
    if (!nextTools.find((t) => t.toolId === chain.toolId)) {
      nextTools.push(chain);
    }
  }

  // 3. Check user-specific patterns
  const vocabulary = await getUserVocabulary(context.userId);
  if (vocabulary) {
    // Look for time patterns that commonly follow this tool
    for (const pattern of Object.values(vocabulary.timePatterns)) {
      if (!nextTools.find((t) => t.toolId === pattern.toolId)) {
        nextTools.push({
          toolId: pattern.toolId,
          probability: pattern.probability * 0.5,
          reason: 'user_pattern',
        });
      }
    }
  }

  return {
    currentTool,
    nextTools: nextTools.slice(0, 5),
  };
}

/**
 * Record tool co-occurrence for chain learning
 */
export function recordToolCoOccurrence(tools: string[]): void {
  for (let i = 0; i < tools.length - 1; i++) {
    const current = tools[i];
    const next = tools[i + 1];

    if (!toolCoOccurrence.has(current)) {
      toolCoOccurrence.set(current, new Map());
    }

    const nextMap = toolCoOccurrence.get(current)!;
    nextMap.set(next, (nextMap.get(next) || 0) + 1);
  }
}

/**
 * Get domain-specific tool chains
 */
function getDomainChains(
  toolId: string
): Array<{ toolId: string; probability: number; reason: string }> {
  // Pre-defined domain chains based on common patterns
  const chains: Record<string, Array<{ toolId: string; probability: number; reason: string }>> = {
    // Weather chains
    weather_current: [
      { toolId: 'calendar_list_events', probability: 0.4, reason: 'planning' },
      { toolId: 'spotify_play', probability: 0.3, reason: 'mood_music' },
    ],

    // Calendar chains
    calendar_list_events: [
      { toolId: 'calendar_create_event', probability: 0.5, reason: 'scheduling' },
      { toolId: 'memory_save', probability: 0.3, reason: 'note_taking' },
    ],

    // Habit chains
    habit_track: [
      { toolId: 'habit_progress', probability: 0.6, reason: 'check_progress' },
      { toolId: 'grounding_exercise', probability: 0.2, reason: 'wellness_flow' },
    ],

    // Wellness chains
    grounding_exercise: [
      { toolId: 'breathing_exercise', probability: 0.5, reason: 'continued_calm' },
      { toolId: 'memory_save', probability: 0.2, reason: 'journal' },
    ],
  };

  return chains[toolId] || [];
}

// ============================================================================
// HELPERS
// ============================================================================

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  recordFeedback,
  recordCorrection,
  learnUserPhrase,
  getUserVocabulary,
  matchUserPhrases,
  updateCalibration,
  calibrateConfidence,
  getFeedbackStats,
};
