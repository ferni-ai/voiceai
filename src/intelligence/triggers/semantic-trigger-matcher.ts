/**
 * Semantic Trigger Matcher
 *
 * Combines semantic (embedding-based) matching with pattern matching
 * for the ultimate "Better than Human" trigger detection.
 *
 * Philosophy: Keywords catch explicit signals; embeddings catch
 * emotional undertones and implicit meanings that humans miss.
 *
 * @module SemanticTriggerMatcher
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getTriggerEmbeddingService } from './trigger-embedding-service.js';
import type {
  TriggerContext,
  SemanticMatch,
  HybridMatchResult,
  HybridMatchConfig,
  DEFAULT_HYBRID_CONFIG,
  ProactiveTrigger,
  EmbeddedTrigger,
  TriggerCategory,
} from './types.js';
import {
  checkDynamicTriggers,
  calculateProbabilityBoost,
  shouldSkipDueToNeverWhen,
  recordTriggerCheck,
  recordTriggerMatch,
  type MatchedTrigger,
} from '../context-builders/dynamic-trigger-utils.js';

const log = createLogger({ module: 'SemanticTriggerMatcher' });

// ============================================================================
// PATTERN SCORE CALCULATION
// ============================================================================

/**
 * Keywords that boost pattern scores
 */
const PATTERN_KEYWORDS: Record<string, { patterns: RegExp[]; weight: number }> = {
  falseFine: {
    patterns: [/i['']?m fine/i, /i['']?m okay/i, /no big deal/i],
    weight: 0.8,
  },
  distress: {
    patterns: [/overwhelmed/i, /can['']?t (handle|cope)/i, /too much/i, /falling apart/i],
    weight: 0.9,
  },
  grief: {
    patterns: [/miss/i, /lost/i, /anniversary/i, /passed away/i, /died/i],
    weight: 0.85,
  },
  deflection: {
    patterns: [/anyway/i, /never ?mind/i, /forget it/i, /let['']?s move on/i],
    weight: 0.7,
  },
  meaning: {
    patterns: [/what['']?s the point/i, /why bother/i, /does it (even )?matter/i],
    weight: 0.85,
  },
  selfCriticism: {
    patterns: [/i should have/i, /what['']?s wrong with me/i, /i['']?m so (stupid|dumb)/i],
    weight: 0.75,
  },
  comparison: {
    patterns: [/everyone else/i, /other people/i, /i should be/i],
    weight: 0.65,
  },
  sleep: {
    patterns: [/can['']?t sleep/i, /insomnia/i, /up all night/i, /3 ?am/i],
    weight: 0.7,
  },
  growth: {
    patterns: [/i used to/i, /before i would/i, /i['']?ve changed/i, /different now/i],
    weight: 0.6,
  },
};

/**
 * Calculate pattern match score for user text against a trigger
 */
function calculatePatternScore(
  userText: string,
  triggerText: string,
  context: TriggerContext
): { score: number; matchedKeywords: string[] } {
  const lowerUser = userText.toLowerCase();
  const lowerTrigger = triggerText.toLowerCase();
  const matchedKeywords: string[] = [];
  let totalScore = 0;
  let matchCount = 0;

  // Check each pattern category
  for (const [category, { patterns, weight }] of Object.entries(PATTERN_KEYWORDS)) {
    // Only check if this category is relevant to the trigger
    if (!isCategoryRelevantToTrigger(category, lowerTrigger)) continue;

    for (const pattern of patterns) {
      if (pattern.test(lowerUser)) {
        matchedKeywords.push(category);
        totalScore += weight;
        matchCount++;
        break; // Only count each category once
      }
    }
  }

  // Context-based boosters
  if (context.isLateNight && lowerTrigger.includes('late night')) {
    totalScore += 0.3;
    matchedKeywords.push('lateNight');
  }

  if (
    context.daysSinceLastSession &&
    context.daysSinceLastSession > 7 &&
    (lowerTrigger.includes('returning') || lowerTrigger.includes('absence'))
  ) {
    totalScore += 0.25;
    matchedKeywords.push('returning');
  }

  // Emotion alignment
  if (context.emotion) {
    const emotionLower = context.emotion.toLowerCase();
    if (lowerTrigger.includes(emotionLower)) {
      totalScore += 0.4 * (context.emotionIntensity || 0.5);
      matchedKeywords.push(`emotion:${emotionLower}`);
    }
  }

  // Normalize score to 0-1
  const normalizedScore =
    matchCount > 0 ? Math.min(1, totalScore / Math.max(1, matchCount * 0.8)) : 0;

  return {
    score: normalizedScore,
    matchedKeywords,
  };
}

/**
 * Check if a pattern category is relevant to a trigger
 */
function isCategoryRelevantToTrigger(category: string, triggerText: string): boolean {
  const relevanceMap: Record<string, string[]> = {
    falseFine: ['fine', 'okay', 'contradict'],
    distress: ['distress', 'crisis', 'overwhelm', 'panic'],
    grief: ['grief', 'loss', 'miss', 'mourn', 'anniversary'],
    deflection: ['deflect', 'avoid', 'pivot'],
    meaning: ['meaning', 'purpose', 'point', 'existential'],
    selfCriticism: ['should', 'criticism', 'blame'],
    comparison: ['comparison', 'others', 'everyone'],
    sleep: ['sleep', 'night', 'insomnia'],
    growth: ['growth', 'change', 'different'],
  };

  const keywords = relevanceMap[category] || [];
  return keywords.some((kw) => triggerText.includes(kw));
}

// ============================================================================
// SEMANTIC TRIGGER MATCHER
// ============================================================================

/**
 * Configuration with defaults
 */
const DEFAULT_CONFIG: HybridMatchConfig = {
  semanticThreshold: 0.65,
  patternThreshold: 0.5,
  semanticWeight: 0.6,
  patternWeight: 0.4,
  maxMatches: 5,
  enableHybrid: true,
  fallbackToPattern: true,
};

/**
 * Perform hybrid semantic + pattern matching on user text
 */
export async function matchTriggersHybrid(
  userText: string,
  context: TriggerContext,
  triggers: Record<string, ProactiveTrigger>,
  personaId: string,
  config: Partial<HybridMatchConfig> = {}
): Promise<HybridMatchResult> {
  const startTime = performance.now();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Track analytics
  recordTriggerCheck('semantic-matcher');

  const service = getTriggerEmbeddingService();
  const allMatches: SemanticMatch[] = [];
  let matchingStrategy: 'semantic' | 'pattern' | 'hybrid' = 'pattern';

  try {
    // Ensure triggers are embedded
    if (!service.isInitialized()) {
      // Initialize with current triggers
      const triggerSet = {
        personaId,
        triggers,
        sourceFile: 'dynamic',
        loadedAt: new Date(),
      };
      await service.initializeForPersona(triggerSet);
    }

    // Get semantic matches
    const semanticMatches = await service.findSimilarTriggers(userText, {
      personaId,
      topK: mergedConfig.maxMatches * 2, // Get extra for filtering
      minSimilarity: mergedConfig.semanticThreshold,
    });

    if (semanticMatches.length > 0) {
      matchingStrategy = mergedConfig.enableHybrid ? 'hybrid' : 'semantic';
    }

    // Calculate combined scores
    for (const { trigger: embeddedTrigger, similarity } of semanticMatches) {
      const patternResult = calculatePatternScore(userText, embeddedTrigger.trigger, context);

      // Combine scores
      const combinedScore = mergedConfig.enableHybrid
        ? similarity * mergedConfig.semanticWeight +
          patternResult.score * mergedConfig.patternWeight
        : similarity;

      allMatches.push({
        triggerName: embeddedTrigger.name,
        trigger: embeddedTrigger.trigger,
        behavior: embeddedTrigger.behavior,
        semanticScore: similarity,
        patternScore: patternResult.score,
        combinedScore,
        matchedKeywords: patternResult.matchedKeywords,
        category: embeddedTrigger.category,
      });
    }

    // Also check pattern-only matches that might have been missed semantically
    const patternMatch = checkDynamicTriggers(triggers, context);
    if (patternMatch) {
      // Check if we already have this match
      const existingIdx = allMatches.findIndex((m) => m.triggerName === patternMatch.triggerName);

      if (existingIdx === -1) {
        // Add pattern-only match
        const embeddedTrigger = service.getTrigger(personaId, patternMatch.triggerName);
        const category = embeddedTrigger?.category || 'emotional';

        allMatches.push({
          triggerName: patternMatch.triggerName,
          trigger: patternMatch.trigger,
          behavior: patternMatch.behavior,
          semanticScore: 0, // No semantic match
          patternScore: patternMatch.confidence,
          combinedScore: patternMatch.confidence * mergedConfig.patternWeight,
          matchedKeywords: [],
          category,
        });
      } else {
        // Boost existing match with pattern confidence
        const existing = allMatches[existingIdx];
        existing.patternScore = Math.max(existing.patternScore, patternMatch.confidence);
        existing.combinedScore =
          existing.semanticScore * mergedConfig.semanticWeight +
          existing.patternScore * mergedConfig.patternWeight;
      }
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Semantic matching failed, falling back to pattern');

    // Fallback to pattern-only matching
    if (mergedConfig.fallbackToPattern) {
      const patternMatch = checkDynamicTriggers(triggers, context);
      if (patternMatch) {
        matchingStrategy = 'pattern';
        allMatches.push({
          triggerName: patternMatch.triggerName,
          trigger: patternMatch.trigger,
          behavior: patternMatch.behavior,
          semanticScore: 0,
          patternScore: patternMatch.confidence,
          combinedScore: patternMatch.confidence,
          matchedKeywords: [],
          category: 'emotional', // Default
        });
      }
    }
  }

  // Sort by combined score
  allMatches.sort((a, b) => b.combinedScore - a.combinedScore);

  // Take top matches
  const topMatches = allMatches.slice(0, mergedConfig.maxMatches);
  const bestMatch = topMatches.length > 0 ? topMatches[0] : null;

  // Record match for analytics
  if (bestMatch) {
    recordTriggerMatch(bestMatch.triggerName, 'semantic-matcher', bestMatch.combinedScore);
  }

  const processingTimeMs = performance.now() - startTime;

  log.debug(
    {
      matchCount: topMatches.length,
      bestMatch: bestMatch?.triggerName,
      bestScore: bestMatch?.combinedScore.toFixed(3),
      strategy: matchingStrategy,
      processingTimeMs: processingTimeMs.toFixed(2),
    },
    'Hybrid matching complete'
  );

  return {
    bestMatch,
    allMatches: topMatches,
    matchingStrategy,
    processingTimeMs,
  };
}

/**
 * Quick semantic similarity check (useful for filtering)
 */
export async function getSemanticSimilarity(
  userText: string,
  triggerText: string
): Promise<number> {
  const service = getTriggerEmbeddingService();

  // Get embeddings
  const [userEmbedding] = await Promise.all([service.embedUserText(userText)]);

  // Need to embed trigger text directly since it might not be in cache
  const { embed } = await import('../../memory/embeddings.js');
  const triggerEmbedding = await embed(triggerText);

  const { cosineSimilarity } = await import('../../memory/embeddings.js');
  return cosineSimilarity(userEmbedding, triggerEmbedding);
}

/**
 * Check if triggers should be skipped based on never_when
 */
export function shouldSkipTriggers(
  neverWhen: string[] | undefined,
  context: TriggerContext
): boolean {
  return shouldSkipDueToNeverWhen(neverWhen, context);
}

/**
 * Calculate probability boost from more_likely_when
 */
export function getTriggerProbabilityBoost(
  moreLikelyWhen: string[] | undefined,
  context: TriggerContext,
  match: SemanticMatch | null
): number {
  if (!match) return 1.0;

  // Convert SemanticMatch to MatchedTrigger format
  const matchedTrigger: MatchedTrigger = {
    triggerName: match.triggerName,
    trigger: match.trigger,
    behavior: match.behavior,
    confidence: match.combinedScore,
  };

  return calculateProbabilityBoost(moreLikelyWhen, context, matchedTrigger);
}

// ============================================================================
// ANALYTICS
// ============================================================================

interface SemanticAnalytics {
  totalHybridMatches: number;
  totalSemanticOnly: number;
  totalPatternOnly: number;
  averageSemanticScore: number;
  averagePatternScore: number;
  averageProcessingMs: number;
  byCategory: Map<TriggerCategory, { count: number; avgScore: number }>;
}

const semanticAnalytics: SemanticAnalytics = {
  totalHybridMatches: 0,
  totalSemanticOnly: 0,
  totalPatternOnly: 0,
  averageSemanticScore: 0,
  averagePatternScore: 0,
  averageProcessingMs: 0,
  byCategory: new Map(),
};

let matchCount = 0;
let totalSemanticScore = 0;
let totalPatternScore = 0;
let totalProcessingMs = 0;

/**
 * Record a match for analytics
 */
export function recordSemanticMatch(result: HybridMatchResult): void {
  matchCount++;

  if (result.matchingStrategy === 'hybrid') {
    semanticAnalytics.totalHybridMatches++;
  } else if (result.matchingStrategy === 'semantic') {
    semanticAnalytics.totalSemanticOnly++;
  } else {
    semanticAnalytics.totalPatternOnly++;
  }

  if (result.bestMatch) {
    totalSemanticScore += result.bestMatch.semanticScore;
    totalPatternScore += result.bestMatch.patternScore;

    // Update category stats
    const categoryStats = semanticAnalytics.byCategory.get(result.bestMatch.category) || {
      count: 0,
      avgScore: 0,
    };
    const oldTotal = categoryStats.avgScore * categoryStats.count;
    categoryStats.count++;
    categoryStats.avgScore = (oldTotal + result.bestMatch.combinedScore) / categoryStats.count;
    semanticAnalytics.byCategory.set(result.bestMatch.category, categoryStats);
  }

  totalProcessingMs += result.processingTimeMs;

  // Update averages
  semanticAnalytics.averageSemanticScore = totalSemanticScore / matchCount;
  semanticAnalytics.averagePatternScore = totalPatternScore / matchCount;
  semanticAnalytics.averageProcessingMs = totalProcessingMs / matchCount;
}

/**
 * Get semantic matching analytics
 */
export function getSemanticAnalytics(): SemanticAnalytics & {
  byCategoryArray: Array<{ category: TriggerCategory; count: number; avgScore: number }>;
} {
  return {
    ...semanticAnalytics,
    byCategoryArray: Array.from(semanticAnalytics.byCategory.entries()).map(
      ([category, stats]) => ({ category, ...stats })
    ),
  };
}

/**
 * Reset analytics
 */
export function resetSemanticAnalytics(): void {
  semanticAnalytics.totalHybridMatches = 0;
  semanticAnalytics.totalSemanticOnly = 0;
  semanticAnalytics.totalPatternOnly = 0;
  semanticAnalytics.averageSemanticScore = 0;
  semanticAnalytics.averagePatternScore = 0;
  semanticAnalytics.averageProcessingMs = 0;
  semanticAnalytics.byCategory.clear();
  matchCount = 0;
  totalSemanticScore = 0;
  totalPatternScore = 0;
  totalProcessingMs = 0;
}

export default {
  matchTriggersHybrid,
  getSemanticSimilarity,
  shouldSkipTriggers,
  getTriggerProbabilityBoost,
  recordSemanticMatch,
  getSemanticAnalytics,
  resetSemanticAnalytics,
};
