/**
 * Memory Service Internal Engines
 *
 * Helper classes used internally by the UnifiedMemoryService:
 * - TimingEngine: decides IF and WHEN to surface memories
 * - PhrasingEngine: suggests how to phrase memory references naturally
 * - FeedbackCollector: collects feedback on memory surfacing
 *
 * @module services/memory/memory-service-engines
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { TimingDecision, PhrasingSuggestion, MemoryFeedback } from './memory-service-types.js';

const log = createLogger({ module: 'memory-service-engines' });

// ============================================================================
// TIMING ENGINE (MVP)
// ============================================================================

/**
 * MVP Timing Engine - decides IF and WHEN to surface memories
 *
 * This is the genuinely new component our audit identified as missing.
 * It prevents awkward, mechanical memory surfacing.
 */
export class TimingEngine {
  private surfacingHistory = new Map<string, Date[]>(); // userId -> timestamps
  private cooldownMs = 60_000; // 1 minute between surfaces
  private maxSurfacesPerSession = 3;

  /**
   * Decide if now is a good time to surface this memory
   */
  decide(
    userId: string,
    context: {
      emotionalState?: string;
      conversationPhase?: 'opening' | 'exploring' | 'deep' | 'closing';
      turnCount: number;
      memoryStrength: number;
    }
  ): TimingDecision {
    const { emotionalState, conversationPhase, turnCount, memoryStrength } = context;

    // Check cooldown
    const history = this.surfacingHistory.get(userId) || [];
    const recentSurfaces = history.filter((t) => Date.now() - t.getTime() < this.cooldownMs);

    if (recentSurfaces.length >= this.maxSurfacesPerSession) {
      return {
        shouldSurface: false,
        reason: 'cooldown',
        confidence: 0.9,
        delay: 'session_end',
      };
    }

    // Don't surface on very first turns (let conversation breathe)
    if (turnCount < 2) {
      return {
        shouldSurface: false,
        reason: 'conversation_flow',
        confidence: 0.8,
        delay: 'next_pause',
      };
    }

    // High emotional states: be more careful
    const sensitiveEmotions = ['sad', 'anxious', 'angry', 'overwhelmed', 'grief'];
    if (emotionalState && sensitiveEmotions.includes(emotionalState.toLowerCase())) {
      // Only surface very relevant, strong memories
      if (memoryStrength < 0.8) {
        return {
          shouldSurface: false,
          reason: 'emotional_state',
          confidence: 0.7,
          delay: 'next_pause',
        };
      }
    }

    // During deep conversation: surface strong memories only
    if (conversationPhase === 'deep' && memoryStrength < 0.6) {
      return {
        shouldSurface: false,
        reason: 'conversation_flow',
        confidence: 0.6,
        delay: 'next_pause',
      };
    }

    // During closing: good time for callbacks
    if (conversationPhase === 'closing') {
      return {
        shouldSurface: true,
        reason: 'conversation_flow',
        confidence: 0.8,
        delay: 'immediate',
      };
    }

    // Low confidence memories: skip
    if (memoryStrength < 0.4) {
      return {
        shouldSurface: false,
        reason: 'low_confidence',
        confidence: 0.9,
      };
    }

    // Default: surface it
    return {
      shouldSurface: true,
      reason: 'always',
      confidence: memoryStrength,
      delay: 'immediate',
    };
  }

  /**
   * Record that we surfaced a memory
   */
  recordSurfacing(userId: string): void {
    const history = this.surfacingHistory.get(userId) || [];
    history.push(new Date());
    this.surfacingHistory.set(userId, history);
  }

  /**
   * Reset for new session
   */
  resetSession(userId: string): void {
    this.surfacingHistory.delete(userId);
  }
}

// ============================================================================
// PHRASING ENGINE
// ============================================================================

/**
 * Suggests how to phrase memory references naturally
 */
export class PhrasingEngine {
  suggest(
    context: {
      connectionType?: string;
      emotionalState?: string;
      personaId?: string;
    },
    memory: { content: string; suggestedReference?: string }
  ): PhrasingSuggestion {
    const { connectionType } = context;

    // Use existing suggested reference if available
    if (memory.suggestedReference) {
      return {
        style: 'natural_weave',
        template: memory.suggestedReference,
        personaVoice: true,
      };
    }

    // Emotional echoes: gentle callbacks
    if (connectionType === 'emotional_echo') {
      return {
        style: 'callback',
        template: `That reminds me of when you mentioned...`,
        personaVoice: true,
      };
    }

    // Commitments: anticipatory
    if (connectionType === 'commitment') {
      return {
        style: 'anticipatory',
        template: `I remember you wanted to...`,
        personaVoice: true,
      };
    }

    // Default: natural weave
    return {
      style: 'natural_weave',
      personaVoice: true,
    };
  }
}

// ============================================================================
// FEEDBACK COLLECTOR
// ============================================================================

/**
 * Collects feedback on memory surfacing for learning
 */
export class FeedbackCollector {
  private feedback: MemoryFeedback[] = [];
  private maxStoredFeedback = 1000;

  record(feedback: MemoryFeedback): void {
    this.feedback.push(feedback);

    // Prune old feedback
    if (this.feedback.length > this.maxStoredFeedback) {
      this.feedback = this.feedback.slice(-this.maxStoredFeedback);
    }

    log.debug(
      { userId: feedback.userId, action: feedback.action, memoryId: feedback.memoryId },
      'Memory feedback recorded'
    );
  }

  /**
   * Get feedback stats for a user
   */
  getStats(userId: string): {
    total: number;
    engaged: number;
    dismissed: number;
    engagementRate: number;
  } {
    const userFeedback = this.feedback.filter((f) => f.userId === userId);
    const engaged = userFeedback.filter((f) => f.action === 'engaged').length;
    const dismissed = userFeedback.filter((f) => f.action === 'dismissed').length;

    return {
      total: userFeedback.length,
      engaged,
      dismissed,
      engagementRate: userFeedback.length > 0 ? engaged / userFeedback.length : 0,
    };
  }
}
