/**
 * Humanizer Integration
 *
 * Provides a bridge between the new ConversationOrchestrator and the
 * existing ConversationHumanizer API. This allows gradual migration
 * while maintaining backward compatibility.
 *
 * Usage:
 *   import { createOrchestratedHumanizer } from './orchestrator/humanizer-integration.js';
 *
 *   const humanizer = createOrchestratedHumanizer(sessionId, personaId);
 *   const result = await humanizer.humanizeResponseAsync(response, context);
 *
 * @module @ferni/conversation/orchestrator/humanizer-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { HumanizedResponse, HumanizationContext as LegacyContext } from '../humanizer/index.js';
import { orchestratorConfig } from './config-adapter.js';
import {
  getConversationOrchestrator,
  resetConversationOrchestrator,
} from './conversation-orchestrator.js';
import { logMetricsSummary } from './metrics.js';
import type { OrchestratorInput, OrchestratorOutput } from './types.js';

const log = createLogger({ module: 'HumanizerIntegration' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Extended context that includes orchestrator-specific fields
 */
export interface ExtendedHumanizationContext extends LegacyContext {
  // Additional fields for orchestrator
  sessionId?: string;
  userId?: string;
  sessionCount?: number;
  rawResponse?: string;
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  sessionData?: Record<string, unknown>;
}

/**
 * Extended response with orchestrator metadata
 */
export interface ExtendedHumanizedResponse extends HumanizedResponse {
  // Orchestrator metadata
  orchestratorMetadata?: {
    timing: Record<string, number>;
    confidence: Record<string, number>;
    appliedFeatures: string[];
    skippedFeatures?: Array<{ name: string; reason: string }>;
  };
}

/**
 * Orchestrated humanizer interface (drop-in replacement for ConversationHumanizer)
 */
export interface OrchestratedHumanizer {
  /**
   * Humanize a response (async, uses full orchestrator)
   */
  humanizeResponseAsync(
    response: string,
    context: ExtendedHumanizationContext
  ): Promise<ExtendedHumanizedResponse>;

  /**
   * Set persona for persona-specific config
   */
  setPersona(personaId: string): void;

  /**
   * Set session context
   */
  setSessionContext(sessionId: string, userId?: string): void;

  /**
   * Get session minutes
   */
  getSessionMinutes(): number;

  /**
   * Reset the humanizer
   */
  reset(): void;

  /**
   * Log metrics summary
   */
  logMetrics(): void;

  /**
   * Get the underlying orchestrator
   */
  getOrchestrator(): ReturnType<typeof getConversationOrchestrator>;
}

// ============================================================================
// ORCHESTRATED HUMANIZER FACTORY
// ============================================================================

/**
 * Create an orchestrated humanizer that uses the new ConversationOrchestrator
 * but provides the same API as ConversationHumanizer.
 *
 * This enables gradual migration by allowing you to swap implementations.
 */
export function createOrchestratedHumanizer(
  sessionId: string,
  personaId: string,
  userId?: string
): OrchestratedHumanizer {
  // Get orchestrator
  const orchestrator = getConversationOrchestrator(sessionId);
  orchestrator.setPersona(personaId);

  // Apply recommended preset for persona
  const recommendedPreset = orchestratorConfig.getRecommendedPreset(personaId);
  orchestratorConfig.applyPreset(recommendedPreset);

  // Track context
  let currentUserId = userId;

  const humanizer: OrchestratedHumanizer = {
    async humanizeResponseAsync(
      response: string,
      context: ExtendedHumanizationContext
    ): Promise<ExtendedHumanizedResponse> {
      // Map legacy context to orchestrator input
      const input: OrchestratorInput = {
        personaId: context.personaId,
        sessionId: context.sessionId || sessionId,
        userId: context.userId || currentUserId,
        turnNumber: context.turnNumber,
        sessionMinutes: orchestrator.getSessionMinutes(),
        sessionCount: context.sessionCount,
        userMessage: context.userMessage,
        userEmotion: context.userEmotion,
        topic: context.topic,
        rawResponse: context.rawResponse || response,
        wasPersonalSharing: context.wasPersonalSharing,
        isSeriousContext: context.isSeriousContext,
        relationshipStage: context.relationshipStage,
        sessionData: context.sessionData,
      };

      // Run orchestration
      const result = await orchestrator.orchestrate(input);

      // Map orchestrator output to legacy response format
      return mapToLegacyResponse(result);
    },

    setPersona(newPersonaId: string): void {
      orchestrator.setPersona(newPersonaId);
      const preset = orchestratorConfig.getRecommendedPreset(newPersonaId);
      orchestratorConfig.applyPreset(preset);
    },

    setSessionContext(newSessionId: string, newUserId?: string): void {
      currentUserId = newUserId;
      // Note: sessionId is fixed for this orchestrator instance
      log.debug({ sessionId: newSessionId, userId: newUserId }, 'Session context updated');
    },

    getSessionMinutes(): number {
      return orchestrator.getSessionMinutes();
    },

    reset(): void {
      resetConversationOrchestrator(sessionId);
      orchestratorConfig.reset();
    },

    logMetrics(): void {
      logMetricsSummary(sessionId);
    },

    getOrchestrator() {
      return orchestrator;
    },
  };

  return humanizer;
}

// ============================================================================
// RESPONSE MAPPING
// ============================================================================

/**
 * Map orchestrator output to legacy HumanizedResponse format
 */
function mapToLegacyResponse(output: OrchestratorOutput): ExtendedHumanizedResponse {
  // Determine pacing
  const pacing = output.pacing;

  // Build legacy response
  const response: ExtendedHumanizedResponse = {
    text: output.text,
    ssml: output.ssml,
    appliedFeatures: output.appliedFeatures,
    pacing,

    // Emotional guidance - pass through as-is (already typed correctly)
    emotionalGuidance: output.emotionalGuidance,

    // Memory callback
    memoryCallback: output.memoryCallback,

    // Follow-up question
    followUpQuestion: output.followUpQuestion,

    // Orchestrator metadata
    orchestratorMetadata: {
      timing: output.metadata.timing,
      confidence: output.metadata.confidence,
      appliedFeatures: output.appliedFeatures,
      skippedFeatures: output.metadata.debug?.humanizationResult.skippedFeatures,
    },
  };

  return response;
}

// ============================================================================
// DROP-IN REPLACEMENT HELPER
// ============================================================================

/**
 * Create a humanizer that can be used as a drop-in replacement.
 * Automatically determines whether to use orchestrator based on feature flag.
 */
export function createHumanizer(
  sessionId: string,
  personaId: string,
  userId?: string,
  options?: {
    useOrchestrator?: boolean;
    preset?: Parameters<typeof orchestratorConfig.applyPreset>[0];
  }
): OrchestratedHumanizer {
  const useOrchestrator = options?.useOrchestrator ?? true;

  if (useOrchestrator) {
    const humanizer = createOrchestratedHumanizer(sessionId, personaId, userId);

    if (options?.preset) {
      orchestratorConfig.applyPreset(options.preset);
    }

    return humanizer;
  }

  // Could return legacy humanizer here for A/B testing
  // For now, always return orchestrated version
  return createOrchestratedHumanizer(sessionId, personaId, userId);
}

// ============================================================================
// SINGLETON HELPERS
// ============================================================================

const humanizers = new Map<string, OrchestratedHumanizer>();

/**
 * Get or create an orchestrated humanizer (singleton per session)
 */
export function getOrchestratedHumanizer(
  sessionId: string,
  personaId: string,
  userId?: string
): OrchestratedHumanizer {
  const key = `${sessionId}:${personaId}`;

  if (!humanizers.has(key)) {
    humanizers.set(key, createOrchestratedHumanizer(sessionId, personaId, userId));
  }

  return humanizers.get(key)!;
}

/**
 * Reset orchestrated humanizer for a session
 */
export function resetOrchestratedHumanizer(sessionId: string, personaId?: string): void {
  if (personaId) {
    const key = `${sessionId}:${personaId}`;
    const humanizer = humanizers.get(key);
    if (humanizer) {
      humanizer.reset();
      humanizers.delete(key);
    }
  } else {
    // Reset all humanizers for this session
    for (const [key, humanizer] of humanizers) {
      if (key.startsWith(`${sessionId}:`)) {
        humanizer.reset();
        humanizers.delete(key);
      }
    }
  }
}

/**
 * Reset all orchestrated humanizers
 */
export function resetAllOrchestratedHumanizers(): void {
  for (const humanizer of humanizers.values()) {
    humanizer.reset();
  }
  humanizers.clear();
}
