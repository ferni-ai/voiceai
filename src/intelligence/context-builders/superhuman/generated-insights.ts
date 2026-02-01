/**
 * Generated Insights Context Builder
 *
 * Injects superhuman-generated insights into the LLM context.
 * These are the "Better Than Human" insights that humans miss:
 *
 * - Cross-domain correlations
 * - What they're NOT saying
 * - Voice-content mismatches
 * - Growth trajectories
 * - Relationship patterns
 * - Commitment patterns
 * - Temporal rhythms
 * - Dream decay
 * - Anticipatory awareness
 * - First-time celebrations
 *
 * @module intelligence/context-builders/superhuman/generated-insights
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
import { createStandardInjection, registerContextBuilder } from '../index.js';

const log = createLogger({ module: 'context:generated-insights' });

// ============================================================================
// CONFIGURATION
// ============================================================================

// Minimum turn count before surfacing proactive insights
// Lowered from 2→1: allow insights on first real turn (session_start insights
// were permanently blocked because isSessionStart=false by the time turn≥2)
const MIN_TURN_FOR_PROACTIVE = 1;

// Maximum insights to inject per turn
const MAX_INSIGHTS_PER_TURN = 2;

// Cache for preventing duplicate surfacing
const recentlySurfaced = new Map<string, number>();
const SURFACING_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes (reduced from 5min for more frequent BTH insights)

// ============================================================================
// BUILDER
// ============================================================================

export const generatedInsightsBuilder: ContextBuilder = {
  name: 'generated-insights',
  description: 'Injects superhuman-generated insights (10 categories) into LLM context',
  priority: 35, // After semantic intelligence (45), before humanizing
  category: BuilderCategory.MEMORY,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, userData, analysis, userText, voiceEmotion } = input;
    const userId = services?.userId;

    if (!userId) {
      return [];
    }

    const turnCount = userData?.turnCount || 0;

    // Skip on very early turns (let relationship build first)
    if (turnCount < MIN_TURN_FOR_PROACTIVE) {
      return [];
    }

    try {
      // Dynamic import to avoid circular dependencies
      const { getInsightsToSurface, formatInsightsForPrompt, markInsightSurfaced } =
        await import('../../../services/superhuman/insight-generation/index.js');

      // Build context for insight retrieval
      const context = {
        userId,
        currentEmotion: analysis?.emotion?.primary || voiceEmotion?.emotion,
        currentTopic: analysis?.topics?.primary || analysis?.topics?.detected?.[0],
        currentPerson: extractPersonMention(userText || ''),
        isSessionStart: turnCount <= 1,
        hourOfDay: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        recentTopics: analysis?.topics?.detected,
        voiceMetrics: voiceEmotion
          ? {
              energy: voiceEmotion.arousal,
              stress: voiceEmotion.stressLevel,
              pace: voiceEmotion.speechRate,
            }
          : undefined,
      };

      // Get insights to surface
      const insights = await getInsightsToSurface(userId, context);

      if (insights.length === 0) {
        return [];
      }

      // Filter out recently surfaced insights
      const now = Date.now();
      const filteredInsights = insights.filter((insight) => {
        const key = `${userId}:${insight.id}`;
        const lastSurfaced = recentlySurfaced.get(key);
        if (lastSurfaced && now - lastSurfaced < SURFACING_COOLDOWN_MS) {
          return false;
        }
        return true;
      });

      if (filteredInsights.length === 0) {
        return [];
      }

      // Take top insights
      const toSurface = filteredInsights.slice(0, MAX_INSIGHTS_PER_TURN);

      // Mark as surfaced
      for (const insight of toSurface) {
        const key = `${userId}:${insight.id}`;
        recentlySurfaced.set(key, now);
        markInsightSurfaced(userId, insight.id);
      }

      // Format for LLM
      const formatted = formatInsightsForPrompt(toSurface);

      if (!formatted || formatted.length < 40) {
        return [];
      }

      log.debug(
        {
          userId,
          insightCount: toSurface.length,
          categories: toSurface.map((i) => i.category),
          turnCount,
        },
        '🧠 Injecting superhuman insights'
      );

      return [
        createStandardInjection('generated_insights', formatted, {
          category: 'superhuman',
          confidence: 0.85,
        }),
      ];
    } catch (error) {
      log.debug({ error: String(error), userId }, 'Insight generation failed (non-fatal)');
      return [];
    }
  },
};

// ============================================================================
// HELPERS
// ============================================================================

function extractPersonMention(text: string): string | undefined {
  const personPatterns = [
    /my (mom|dad|mother|father|sister|brother|wife|husband|partner|friend|boss|colleague|son|daughter)/i,
    /(?:my friend |my coworker |my partner )(\w+)/i,
    /(\b[A-Z][a-z]+\b)(?:\s+(?:said|told|asked|mentioned))/,
  ];

  for (const pattern of personPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear the surfacing cooldown cache
 */
export function clearSurfacingCache(): void {
  recentlySurfaced.clear();
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder(generatedInsightsBuilder);

export default generatedInsightsBuilder;
