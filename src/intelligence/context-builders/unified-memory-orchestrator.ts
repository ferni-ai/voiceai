/**
 * Unified Memory Orchestrator Context Builder
 *
 * This is the central memory context builder that coordinates ALL memory subsystems
 * through the MemoryOrchestrator. It provides:
 *
 * 1. Semantic memory retrieval (RAG-style)
 * 2. Associative memory triggers (human-like recall)
 * 3. Emotional threading across sessions
 * 4. Behavioral pattern awareness
 * 5. Communication preferences
 * 6. Natural reference generation
 *
 * Philosophy: Instead of multiple memory builders each injecting their own context,
 * this single builder coordinates all memory to provide coherent, deduplicated context.
 *
 * @module intelligence/context-builders/unified-memory-orchestrator
 */

import { getMemoryOrchestrator, type RecallContext } from '../../memory/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { BuilderCategory } from './categories.js';
import { createHintInjection, createStandardInjection, registerContextBuilder } from './index.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from './types.js';

const log = createLogger({ module: 'context:unified-memory-orchestrator' });

// ============================================================================
// CONFIGURATION
// ============================================================================

interface UnifiedMemoryConfig {
  /** Maximum context length before truncation */
  maxContextLength: number;
  /** Enable behavioral pattern injection */
  enableBehavioralPatterns: boolean;
  /** Enable approach guidance injection */
  enableApproachGuidance: boolean;
  /** Minimum turn count before injecting callback suggestions */
  minTurnForCallbacks: number;
}

const DEFAULT_CONFIG: UnifiedMemoryConfig = {
  maxContextLength: 2000,
  enableBehavioralPatterns: true,
  enableApproachGuidance: true,
  minTurnForCallbacks: 3,
};

let config = { ...DEFAULT_CONFIG };

/**
 * Configure the unified memory orchestrator
 */
function configureUnifiedMemoryOrchestrator(newConfig: Partial<UnifiedMemoryConfig>): void {
  config = { ...config, ...newConfig };
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build unified memory context through the orchestrator
 */
async function buildUnifiedMemoryContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, services, userData, userProfile, persona, analysis } = input;
  const injections: ContextInjection[] = [];

  const userId = services?.userId;
  const turnCount = userData?.turnCount || 0;
  const isSessionStart = turnCount === 0;

  // Skip if no user identification
  if (!userId) {
    return [];
  }

  try {
    const orchestrator = getMemoryOrchestrator();

    // Build recall context from builder input
    // Note: profile is required by RecallContext, so we need a valid UserProfile
    if (!userProfile) {
      log.debug({ userId }, 'No user profile available, skipping memory orchestration');
      return [];
    }

    const recallContext: RecallContext = {
      userId,
      profile: userProfile,
      query: userText,
      currentTopic: analysis.topics.primary || analysis.topics.detected[0],
      currentEmotion: analysis.emotion.primary,
      personaId: persona?.id || 'ferni',
      conversationTurn: turnCount,
      isSessionStart,
      sessionCount: userProfile?.totalConversations || 0,
      recentSummaries: [], // Could be populated from session history
    };

    // Get orchestrated memories
    const memory = await orchestrator.recall(recallContext);

    // If we got formatted context, inject it
    if (memory.formattedContext && memory.formattedContext.trim().length > 0) {
      // Truncate if needed
      let contextContent = memory.formattedContext;
      if (contextContent.length > config.maxContextLength) {
        contextContent = `${contextContent.slice(0, config.maxContextLength)}\n[...truncated]`;
      }

      // Main memory injection - high priority
      injections.push(
        createStandardInjection('unified_memory', contextContent, {
          category: 'memory',
          confidence: 0.9,
        })
      );

      log.debug(
        {
          userId,
          turnCount,
          primaryMemories: memory.primaryMemories.length,
          callbacks: memory.callbacks.length,
          hasEmotional: memory.emotional.threads.length > 0,
          patterns: memory.activePatterns.length,
        },
        'Injected unified memory context'
      );
    }

    // Inject callback suggestions separately (as hints, not critical)
    if (turnCount >= config.minTurnForCallbacks && memory.callbacks.length > 0) {
      const callbackHints = memory.callbacks
        .slice(0, 2)
        .map((c) => `💭 ${c.suggestedReference}`)
        .join('\n');

      injections.push(
        createHintInjection(
          'memory_callback_hints',
          `[MEMORY CALLBACKS - Weave in naturally if appropriate]\n${callbackHints}`,
          { category: 'memory', confidence: 0.7 }
        )
      );
    }

    // Inject behavioral pattern awareness (if enabled and patterns found)
    if (config.enableBehavioralPatterns && memory.activePatterns.length > 0) {
      const patternContext = memory.activePatterns
        .slice(0, 2)
        .map((p) => {
          return `🔍 "${p.description}"\n   → Suggested: ${p.suggestedResponse}`;
        })
        .join('\n');

      injections.push(
        createHintInjection(
          'behavioral_patterns',
          `[BEHAVIORAL AWARENESS - Patterns you've noticed]\n${patternContext}`,
          { category: 'cognitive', confidence: memory.activePatterns[0]?.confidence || 0.5 }
        )
      );
    }

    // Inject approach guidance (if enabled)
    if (config.enableApproachGuidance && memory.emotional.approachGuidance) {
      const guidance = memory.emotional.approachGuidance;
      const guidanceParts: string[] = [];

      // Add overall approach
      guidanceParts.push(`Approach: ${guidance.approach}`);

      if (guidance.embrace.length > 0) {
        guidanceParts.push(`✓ ${guidance.embrace.slice(0, 2).join(' • ')}`);
      }
      if (guidance.avoid.length > 0) {
        guidanceParts.push(`✗ Avoid: ${guidance.avoid.slice(0, 2).join(' • ')}`);
      }

      if (guidanceParts.length > 0) {
        injections.push(
          createHintInjection(
            'approach_guidance',
            `[HOW TO APPROACH - Based on past interactions]\n${guidanceParts.join('\n')}`,
            { category: 'personalization', confidence: 0.6 }
          )
        );
      }
    }

    // Inject emotional threading for continuity
    if (memory.emotional.threads.length > 0) {
      const activeThread = memory.emotional.threads[0];
      const threadContext = `[EMOTIONAL CONTINUITY]\nLast time we talked about "${activeThread.topic}" - they seemed ${activeThread.emotion}. ${activeThread.status === 'resolved' ? 'This was resolved.' : 'This may still be on their mind.'}`;

      injections.push(
        createHintInjection('emotional_thread', threadContext, {
          category: 'emotional',
          confidence: 0.7,
        })
      );
    }

    // Inject session priming for first turn
    if (isSessionStart && memory.priming) {
      const { priming } = memory;

      // Suggested opener
      if (priming.suggestedOpener) {
        injections.push(
          createHintInjection('session_opener', `[SUGGESTED OPENER]\n${priming.suggestedOpener}`, {
            category: 'engagement',
            confidence: 0.8,
          })
        );
      }

      // Sensitive topics warning
      if (priming.sensitiveTopics.length > 0) {
        injections.push(
          createHintInjection(
            'sensitive_topics',
            `[SENSITIVE TOPICS - Be gentle with these]\n${priming.sensitiveTopics.join(', ')}`,
            { category: 'emotional', confidence: 0.9 }
          )
        );
      }
    }

    return injections;
  } catch (error) {
    log.warn(
      { error: error instanceof Error ? error.message : String(error), userId },
      'Unified memory orchestrator failed'
    );
    return [];
  }
}

// ============================================================================
// BUILDER REGISTRATION
// ============================================================================

/**
 * The unified memory orchestrator context builder.
 *
 * This replaces the fragmented memory builder approach with a single,
 * coordinated memory system that:
 * - Deduplicates across all memory sources
 * - Ranks by relevance
 * - Generates natural references
 * - Tracks emotional continuity
 * - Learns communication preferences
 * - Detects behavioral patterns
 */
export const unifiedMemoryOrchestratorBuilder: ContextBuilder = {
  name: 'unified-memory-orchestrator',
  description: 'Coordinates all memory subsystems to provide coherent, human-like memory context',
  priority: 30, // Run early in the memory category (25-45 range)
  category: BuilderCategory.MEMORY,
  build: buildUnifiedMemoryContext,
};

// Register the builder
registerContextBuilder(unifiedMemoryOrchestratorBuilder);

// ============================================================================
// EXPORTS
// ============================================================================

export { buildUnifiedMemoryContext, configureUnifiedMemoryOrchestrator, type UnifiedMemoryConfig };

export default unifiedMemoryOrchestratorBuilder;
