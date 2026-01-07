/**
 * Unified Intelligence Context Builder
 *
 * Integrates the full Unified Intelligence system (Levels 2-5)
 * into the context builder pipeline:
 * - Context Assembly (Level 2) - What matters RIGHT NOW
 * - Cross-Domain Correlation (Level 4) - Patterns humans miss
 * - Proactive Intelligence (Level 5) - WHEN to surface insights
 *
 * This builder surfaces cross-domain correlations and proactive
 * insights at the right moments in conversation.
 *
 * @module intelligence/context-builders/unified-intelligence-context
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getIntelligenceForTurn,
  getRelevantCorrelations,
  checkProactiveTriggers,
  assembleContext,
  type ContextWindow,
  type CrossDomainCorrelation,
  type ProactiveIntelligenceInsight,
  type SurfaceMoment,
} from '../index.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from './index.js';

const log = createLogger({ module: 'unified-intelligence-context' });

// ============================================================================
// TYPES
// ============================================================================

interface UnifiedIntelligenceData {
  context: ContextWindow;
  correlations: CrossDomainCorrelation[];
  proactiveInsights: ProactiveIntelligenceInsight[];
  activeInsight?: ProactiveIntelligenceInsight;
}

// ============================================================================
// BUILDER
// ============================================================================

/**
 * Unified Intelligence Context Builder
 *
 * Priority: standard (50)
 * Category: intelligence
 *
 * This builder is called on every turn to inject unified intelligence
 * context into the LLM prompt.
 */
export const unifiedIntelligenceBuilder: ContextBuilder = {
  name: 'unified-intelligence',
  priority: 50, // Standard priority - run after critical builders
  category: 'intelligence',
  description: 'Injects cross-domain correlations and proactive insights',

  async build(input: ContextBuilderInput): Promise<ContextInjection[]> {
    const { userId, sessionId, turnCount = 0, emotion, topics } = input;

    if (!userId) {
      return [];
    }

    const injections: ContextInjection[] = [];

    try {
      // Determine surface moment
      const moment: SurfaceMoment =
        turnCount === 1 ? 'session_start' : turnCount <= 3 ? 'natural_pause' : 'topic_relevant';

      // Get full intelligence
      const intelligence = await getIntelligenceForTurn(userId, {
        moment,
        voiceEmotion: emotion
          ? {
              primary: emotion.primary || emotion.detected || 'neutral',
              valence: emotion.valence,
              energy: emotion.arousal,
            }
          : undefined,
        recentTopics: topics,
        forceRefresh: turnCount === 1,
      });

      // Inject context awareness
      if (intelligence.context.immediate.isLateNight) {
        injections.push({
          type: 'hint',
          content:
            "[AWARENESS] It's late night. Be extra gentle and present. Ask if they're okay.",
          source: 'unified-intelligence',
          priority: 85,
        });
      }

      if (intelligence.context.capacity.bandwidth === 'low') {
        injections.push({
          type: 'hint',
          content:
            '[CAPACITY] Low bandwidth detected. Keep responses focused and avoid overwhelming.',
          source: 'unified-intelligence',
          priority: 80,
        });
      }

      // Inject cross-domain correlations
      for (const corr of intelligence.correlations.slice(0, 2)) {
        if (corr.confidence !== 'suspected') {
          injections.push({
            type: 'standard',
            content: `[PATTERN INSIGHT] ${corr.insight}${corr.suggestion ? ` Consider: ${corr.suggestion}` : ''}`,
            source: 'unified-intelligence',
            priority: 60,
            metadata: {
              correlationId: corr.id,
              confidence: corr.confidence,
              domains: [corr.domainA.domain, corr.domainB.domain],
            },
          });
        }
      }

      // Inject proactive insight if ready
      if (intelligence.proactiveInsights.length > 0 && turnCount >= 2) {
        const insight = intelligence.proactiveInsights[0];

        // Only inject high-priority insights, or any insight at session start
        if (insight.priority <= 5 || moment === 'session_start') {
          injections.push({
            type: 'critical',
            content: `[PROACTIVE INSIGHT - ${insight.category.toUpperCase()}] Ready to share: "${insight.message}"${insight.followUp ? ` Follow-up: "${insight.followUp}"` : ''}`,
            source: 'unified-intelligence',
            priority: 90 - insight.priority, // Higher priority insights get higher injection priority
            metadata: {
              insightId: insight.id,
              category: insight.category,
              priority: insight.priority,
              surfaceMoment: insight.surfaceMoment,
            },
          });
        }
      }

      // Inject active domains for guidance
      if (intelligence.context.activeDomains.length > 0) {
        const domainDescriptions: Record<string, string> = {
          late_night_support: 'late night - be gentle',
          emotional_support: 'emotional support needed',
          burnout_prevention: 'watch for burnout signs',
          commitment_follow_up: 'check on commitments',
          deep_conversation: 'ready for deeper topics',
          habits: 'habit discussion relevant',
          relationships: 'relationships on mind',
          work: 'work/career related',
        };

        const relevantDomains = intelligence.context.activeDomains
          .filter((d) => domainDescriptions[d])
          .map((d) => domainDescriptions[d]);

        if (relevantDomains.length > 0) {
          injections.push({
            type: 'hint',
            content: `[CONTEXT] Active domains: ${relevantDomains.join(', ')}`,
            source: 'unified-intelligence',
            priority: 40,
          });
        }
      }

      log.debug(
        {
          userId,
          turnCount,
          correlationsCount: intelligence.correlations.length,
          proactiveCount: intelligence.proactiveInsights.length,
          injectionsCount: injections.length,
        },
        '🧠 Unified intelligence injections built'
      );
    } catch (error) {
      log.debug({ error: String(error), userId }, 'Failed to build unified intelligence context');
    }

    return injections;
  },
};

// ============================================================================
// STANDALONE FUNCTIONS
// ============================================================================

/**
 * Get unified intelligence data without injection formatting
 * Useful for direct integration in turn handler
 */
export async function getUnifiedIntelligenceData(
  userId: string,
  options: {
    moment?: SurfaceMoment;
    voiceEmotion?: { primary?: string; valence?: string; energy?: number };
    recentTopics?: string[];
    forceRefresh?: boolean;
  } = {}
): Promise<UnifiedIntelligenceData> {
  const moment = options.moment || 'natural_pause';

  const intelligence = await getIntelligenceForTurn(userId, {
    moment,
    voiceEmotion: options.voiceEmotion,
    recentTopics: options.recentTopics,
    forceRefresh: options.forceRefresh,
  });

  return {
    context: intelligence.context,
    correlations: intelligence.correlations,
    proactiveInsights: intelligence.proactiveInsights,
    activeInsight: intelligence.proactiveInsights[0],
  };
}

/**
 * Format unified intelligence for direct prompt injection
 */
export function formatUnifiedIntelligenceForPrompt(data: UnifiedIntelligenceData): string {
  const sections: string[] = [];

  // Context summary
  const ctx = data.context;
  sections.push(
    `[UNIFIED INTELLIGENCE]`,
    `Time: ${ctx.immediate.timeOfDay} ${ctx.immediate.dayOfWeek}${ctx.immediate.isLateNight ? ' (late night)' : ''}`
  );

  if (ctx.capacity.bandwidth !== 'high') {
    sections.push(`Bandwidth: ${ctx.capacity.bandwidth}`);
  }

  if (ctx.capacity.burnoutRisk !== 'low') {
    sections.push(`Burnout Risk: ${ctx.capacity.burnoutRisk}`);
  }

  // Correlations
  if (data.correlations.length > 0) {
    sections.push('', '[PATTERNS DETECTED]');
    for (const corr of data.correlations.slice(0, 3)) {
      sections.push(`• ${corr.insight} (${corr.confidence})`);
    }
  }

  // Active insight
  if (data.activeInsight) {
    sections.push('', `[INSIGHT TO SHARE] ${data.activeInsight.message}`);
  }

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default unifiedIntelligenceBuilder;
