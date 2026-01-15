/**
 * Insight Generation Engine
 *
 * The orchestrator that runs all insight generators and produces
 * actionable, surfaceable insights that make Ferni "Better Than Human".
 *
 * @module services/superhuman/insight-generation/engine
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { LRUCache } from 'lru-cache';
import { v4 as uuid } from 'uuid';
import type {
  GeneratedInsight,
  InsightCategory,
  InsightGenerationResult,
  InsightGenerator,
  InsightGeneratorContext,
  InsightQueryOptions,
} from './types.js';

const log = createLogger({ module: 'insight-engine' });

// ============================================================================
// REGISTRY
// ============================================================================

const generators = new Map<InsightCategory, InsightGenerator>();

/**
 * Register an insight generator
 */
export function registerInsightGenerator(generator: InsightGenerator): void {
  generators.set(generator.category, generator);
  log.debug({ category: generator.category, name: generator.name }, 'Registered insight generator');
}

/**
 * Get all registered generators
 */
export function getRegisteredGenerators(): InsightGenerator[] {
  return Array.from(generators.values());
}

// ============================================================================
// CACHING
// ============================================================================

interface CachedInsights {
  insights: GeneratedInsight[];
  generatedAt: number;
}

const insightCache = new LRUCache<string, CachedInsights>({
  max: 1000,
  ttl: 1000 * 60 * 5, // 5 minute TTL
});

function getCacheKey(userId: string, category?: InsightCategory): string {
  return category ? `${userId}:${category}` : userId;
}

// ============================================================================
// MAIN ENGINE
// ============================================================================

/**
 * Run all insight generators for a user
 */
export async function generateAllInsights(
  userId: string,
  context: InsightGeneratorContext = {}
): Promise<InsightGenerationResult> {
  const startTime = performance.now();
  const result: InsightGenerationResult = {
    userId,
    generatedAt: new Date(),
    insights: [],
    byCategory: {} as Record<InsightCategory, number>,
    totalGenerated: 0,
    errors: [],
  };

  const fullContext: InsightGeneratorContext = {
    ...context,
    userId,
    hourOfDay: context.hourOfDay ?? new Date().getHours(),
    dayOfWeek: context.dayOfWeek ?? new Date().getDay(),
  };

  // Run all generators in parallel
  const generatorPromises = Array.from(generators.values()).map(async (generator) => {
    try {
      const hasData = await generator.hasEnoughData(userId);
      if (!hasData) {
        log.debug(
          { userId, category: generator.category },
          'Skipping generator - insufficient data'
        );
        return [];
      }

      const insights = await generator.generate(userId, fullContext);

      // Assign IDs and metadata
      return insights.map((insight) => ({
        ...insight,
        id: insight.id || uuid(),
        userId,
        generatedAt: new Date(),
      }));
    } catch (error) {
      const errorMsg = `${generator.category}: ${String(error)}`;
      result.errors.push(errorMsg);
      log.warn({ error: String(error), userId, category: generator.category }, 'Generator failed');
      return [];
    }
  });

  const allInsights = await Promise.all(generatorPromises);

  // Flatten and deduplicate
  const seenHeadlines = new Set<string>();
  for (const insights of allInsights) {
    for (const insight of insights) {
      // Dedupe by headline
      if (seenHeadlines.has(insight.headline)) continue;
      seenHeadlines.add(insight.headline);

      result.insights.push(insight);
      result.byCategory[insight.category] = (result.byCategory[insight.category] || 0) + 1;
    }
  }

  result.totalGenerated = result.insights.length;

  // Sort by priority
  const priorityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    background: 4,
  };
  result.insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Cache results
  insightCache.set(getCacheKey(userId), {
    insights: result.insights,
    generatedAt: Date.now(),
  });

  const elapsed = performance.now() - startTime;
  log.info(
    {
      userId,
      totalGenerated: result.totalGenerated,
      categories: Object.keys(result.byCategory).length,
      errors: result.errors.length,
      elapsedMs: Math.round(elapsed),
    },
    '🧠 Insight generation complete'
  );

  return result;
}

/**
 * Generate insights for a specific category
 */
export async function generateCategoryInsights(
  userId: string,
  category: InsightCategory,
  context: InsightGeneratorContext = {}
): Promise<GeneratedInsight[]> {
  const generator = generators.get(category);
  if (!generator) {
    log.warn({ category }, 'No generator registered for category');
    return [];
  }

  try {
    const hasData = await generator.hasEnoughData(userId);
    if (!hasData) {
      return [];
    }

    const insights = await generator.generate(userId, {
      ...context,
      userId,
      hourOfDay: context.hourOfDay ?? new Date().getHours(),
      dayOfWeek: context.dayOfWeek ?? new Date().getDay(),
    });

    return insights.map((insight) => ({
      ...insight,
      id: insight.id || uuid(),
      userId,
      generatedAt: new Date(),
    }));
  } catch (error) {
    log.warn({ error: String(error), userId, category }, 'Category insight generation failed');
    return [];
  }
}

/**
 * Query cached insights with filters
 */
export function queryCachedInsights(
  userId: string,
  options: InsightQueryOptions = {}
): GeneratedInsight[] {
  const cached = insightCache.get(getCacheKey(userId));
  if (!cached) return [];

  let insights = [...cached.insights];

  // Apply filters
  if (options.categories?.length) {
    insights = insights.filter((i) => options.categories!.includes(i.category));
  }

  if (options.minPriority) {
    const priorityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      background: 4,
    };
    const minOrder = priorityOrder[options.minPriority];
    insights = insights.filter((i) => priorityOrder[i.priority] <= minOrder);
  }

  if (options.surfacingMoments?.length) {
    insights = insights.filter((i) => options.surfacingMoments!.includes(i.surfacingMoment));
  }

  if (options.triggerTopic) {
    const topic = options.triggerTopic.toLowerCase();
    insights = insights.filter(
      (i) => i.triggerTopics?.some((t) => t.toLowerCase().includes(topic)) ?? false
    );
  }

  if (options.triggerEmotion) {
    insights = insights.filter(
      (i) => i.triggerEmotions?.includes(options.triggerEmotion!) ?? false
    );
  }

  if (options.triggerPerson) {
    const person = options.triggerPerson.toLowerCase();
    insights = insights.filter((i) => i.triggerPerson?.toLowerCase() === person);
  }

  if (!options.includeExpired) {
    const now = new Date();
    insights = insights.filter((i) => !i.expiresAt || i.expiresAt > now);
  }

  if (!options.includeSurfaced) {
    insights = insights.filter((i) => !i.surfaced);
  }

  if (!options.includeDismissed) {
    insights = insights.filter((i) => !i.dismissed);
  }

  if (options.limit) {
    insights = insights.slice(0, options.limit);
  }

  return insights;
}

/**
 * Get insights to surface based on current context
 */
export async function getInsightsToSurface(
  userId: string,
  context: InsightGeneratorContext
): Promise<GeneratedInsight[]> {
  // First check cache
  let insights = queryCachedInsights(userId, {
    minPriority: 'medium',
    includeSurfaced: false,
    includeDismissed: false,
  });

  // If cache is stale or empty, regenerate
  const cached = insightCache.get(getCacheKey(userId));
  const isStale = !cached || Date.now() - cached.generatedAt > 5 * 60 * 1000;

  if (insights.length === 0 || isStale) {
    const result = await generateAllInsights(userId, context);
    insights = result.insights.filter((i) => !i.surfaced && !i.dismissed);
  }

  // Filter by surfacing moment
  const relevantMoments: string[] = [];
  if (context.isSessionStart) {
    relevantMoments.push('session_start');
  } else {
    relevantMoments.push('natural_pause', 'topic_relevant', 'check_in');
  }

  insights = insights.filter((i) => relevantMoments.includes(i.surfacingMoment));

  // Filter by trigger context
  if (context.currentTopic) {
    const topicLower = context.currentTopic.toLowerCase();
    insights = insights.filter(
      (i) =>
        !i.triggerTopics ||
        i.triggerTopics.length === 0 ||
        i.triggerTopics.some((t) => t.toLowerCase().includes(topicLower))
    );
  }

  if (context.currentEmotion) {
    insights = insights.filter(
      (i) =>
        !i.triggerEmotions ||
        i.triggerEmotions.length === 0 ||
        i.triggerEmotions.includes(context.currentEmotion!)
    );
  }

  if (context.currentPerson) {
    const personLower = context.currentPerson.toLowerCase();
    insights = insights.filter(
      (i) => !i.triggerPerson || i.triggerPerson.toLowerCase() === personLower
    );
  }

  // Limit to top 2 most relevant
  return insights.slice(0, 2);
}

/**
 * Mark an insight as surfaced
 */
export function markInsightSurfaced(
  userId: string,
  insightId: string,
  reaction?: GeneratedInsight['userReaction']
): void {
  const cached = insightCache.get(getCacheKey(userId));
  if (!cached) return;

  const insight = cached.insights.find((i) => i.id === insightId);
  if (insight) {
    insight.surfaced = true;
    insight.surfacedAt = new Date();
    if (reaction) {
      insight.userReaction = reaction;
    }
  }
}

/**
 * Dismiss an insight
 */
export function dismissInsight(userId: string, insightId: string): void {
  const cached = insightCache.get(getCacheKey(userId));
  if (!cached) return;

  const insight = cached.insights.find((i) => i.id === insightId);
  if (insight) {
    insight.dismissed = true;
  }
}

/**
 * Clear insight cache for a user
 */
export function clearInsightCache(userId?: string): void {
  if (userId) {
    insightCache.delete(getCacheKey(userId));
  } else {
    insightCache.clear();
  }
}

/**
 * Format insights for LLM prompt injection
 */
export function formatInsightsForPrompt(insights: GeneratedInsight[]): string {
  if (insights.length === 0) return '';

  const sections: string[] = [];

  sections.push('');
  sections.push('╔═══════════════════════════════════════════════════════════╗');
  sections.push('║  SUPERHUMAN INSIGHTS - "Better Than Human" Awareness      ║');
  sections.push('║  Surface these naturally when the moment is right         ║');
  sections.push('╚═══════════════════════════════════════════════════════════╝');
  sections.push('');

  for (const insight of insights) {
    const toneEmoji = {
      warm_observation: '👀',
      gentle_curiosity: '🤔',
      celebratory: '🎉',
      protective_care: '💛',
      reflective: '🪞',
      playful: '😊',
      direct_but_kind: '💬',
    }[insight.tone];

    sections.push(`${toneEmoji} [${insight.category.toUpperCase().replace(/_/g, ' ')}]`);
    sections.push(`Headline: ${insight.headline}`);
    sections.push(`Message: "${insight.message}"`);
    sections.push(`Tone: ${insight.tone.replace(/_/g, ' ')}`);
    sections.push(`Confidence: ${Math.round(insight.confidence * 100)}%`);

    if (insight.evidence.length > 0) {
      sections.push(`Evidence: ${insight.evidence.slice(0, 2).join('; ')}`);
    }

    sections.push('');
  }

  sections.push('─────────────────────────────────────────────────────────────');
  sections.push("NOTE: Don't force these. Weave in naturally when relevant.");
  sections.push('      The goal is connection, not showing off what we know.');
  sections.push('─────────────────────────────────────────────────────────────');

  return sections.join('\n');
}

// ============================================================================
// ENGINE STATS
// ============================================================================

/**
 * Get engine statistics
 */
export function getEngineStats(): {
  registeredGenerators: number;
  categories: InsightCategory[];
  cacheSize: number;
} {
  return {
    registeredGenerators: generators.size,
    categories: Array.from(generators.keys()),
    cacheSize: insightCache.size,
  };
}
