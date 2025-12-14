/**
 * Unified Emotional Memory System
 *
 * Coordinates two complementary emotional memory systems:
 *
 * 1. User Emotion Tracking (from intelligence/emotional-memory.ts)
 *    - What emotions the USER has expressed
 *    - Patterns in their emotional state over time
 *    - Check-in suggestions based on past emotions
 *
 * 2. Persona Bonding (from conversation/superhuman/emotional-memory.ts)
 *    - How the PERSONA feels about this user
 *    - Warmth, trust, protectiveness, admiration levels
 *    - Relationship stage progression
 *
 * This module provides a single entry point for all emotional memory operations.
 *
 * @module memory/emotional-memory-unified
 */

import { createLogger } from '../utils/safe-logger.js';

// Import from the two source systems
import {
  EmotionalMemoryEngine as UserEmotionEngine,
  getEmotionalMemory as getUserEmotionMemory,
  removeEmotionalMemory as removeUserEmotionMemory,
  type EmotionalCheckIn,
  type EmotionalContext,
  type EmotionalMoment,
  type EmotionalPattern,
} from '../intelligence/emotional-memory.js';

import {
  EmotionalMemoryEngine as BondingEngine,
  clearEmotionalMemory as clearBondingMemory,
  getEmotionalMemory as getBondingMemory,
} from '../conversation/superhuman/emotional-memory.js';

import type { EmotionalBond, RelationshipStage } from '../conversation/superhuman/types.js';

// Re-export aliases for clarity
export type UserEmotionalContext = EmotionalContext;
export type UserEmotionalMoment = EmotionalMoment;

const log = createLogger({ module: 'UnifiedEmotionalMemory' });

// ============================================================================
// TYPES
// ============================================================================

export interface UnifiedEmotionalState {
  // User's emotional state
  user: {
    recentEmotions: string[];
    unresolvedConcerns: string[];
    celebratableWins: string[];
    checkInSuggestions: EmotionalCheckIn[];
    patterns: EmotionalPattern[];
  };

  // Persona's feelings toward user
  bond: {
    warmth: number;
    trust: number;
    protectiveness: number;
    admiration: number;
    concern: number;
    sessionCount: number;
    stage: RelationshipStage;
  };

  // Combined insights
  insights: {
    suggestedApproach: 'supportive' | 'celebratory' | 'curious' | 'protective' | 'standard';
    topCheckIn: EmotionalCheckIn | null;
    bondPhrase: string | null;
    emotionalTrend: 'improving' | 'stable' | 'worsening' | 'unknown';
  };
}

export interface EmotionalMemoryConfig {
  userId: string;
  personaId?: string;
  existingBond?: EmotionalBond;
}

// ============================================================================
// UNIFIED EMOTIONAL MEMORY ENGINE
// ============================================================================

/**
 * Unified interface for all emotional memory operations
 */
export class UnifiedEmotionalMemory {
  private userId: string;
  private personaId: string;
  private userEmotions: UserEmotionEngine;
  private bonding: BondingEngine;

  constructor(config: EmotionalMemoryConfig) {
    this.userId = config.userId;
    this.personaId = config.personaId || 'ferni';

    // Get or create the underlying engines
    this.userEmotions = getUserEmotionMemory(config.userId);
    this.bonding = getBondingMemory(config.userId, config.existingBond);

    if (config.personaId) {
      this.bonding.setPersonaId(config.personaId);
    }

    log.debug(
      { userId: config.userId, personaId: this.personaId },
      'UnifiedEmotionalMemory created'
    );
  }

  // ============================================================================
  // SESSION LIFECYCLE
  // ============================================================================

  /**
   * Start a new session
   */
  startSession(sessionId: string): void {
    this.userEmotions.startSession(sessionId);
    log.debug({ sessionId }, 'Emotional memory session started');
  }

  /**
   * End current session
   */
  endSession(): void {
    this.bonding.recordSessionEnd();
    log.debug('Emotional memory session ended');
  }

  // ============================================================================
  // USER EMOTION TRACKING
  // ============================================================================

  /**
   * Record a user's emotional moment
   */
  recordUserEmotion(
    emotion: string,
    topic: string,
    trigger: string,
    userStatement: string,
    intensity: 'mild' | 'moderate' | 'strong' = 'moderate'
  ): string {
    // Record in user emotion system
    const momentId = this.userEmotions.recordMoment(
      emotion as Parameters<UserEmotionEngine['recordMoment']>[0],
      topic,
      trigger,
      userStatement,
      intensity
    );

    // Update bonding system based on emotion type
    if (['fear', 'anxiety', 'sadness'].includes(emotion)) {
      this.bonding.recordEvent('struggle_shared', { topic, description: trigger });
    } else if (['joy', 'anticipation'].includes(emotion)) {
      if (intensity === 'strong') {
        this.bonding.recordEvent('growth_shown', { topic, description: trigger });
      }
    }

    return momentId;
  }

  /**
   * Mark an emotional concern as resolved
   */
  resolveEmotion(momentId: string, note?: string): void {
    this.userEmotions.resolveEmotion(momentId, note);
  }

  /**
   * Mark that we followed up on an emotion
   */
  markFollowedUp(momentId: string): void {
    this.userEmotions.markFollowedUp(momentId);
  }

  // ============================================================================
  // BONDING EVENTS
  // ============================================================================

  /**
   * Record a bonding event (vulnerability, breakthrough, laughter, etc.)
   */
  recordBondEvent(
    event:
      | 'vulnerability_shared'
      | 'breakthrough_moment'
      | 'laughter_shared'
      | 'struggle_shared'
      | 'growth_shown'
      | 'trust_demonstrated'
      | 'gratitude_expressed'
      | 'deep_conversation',
    context?: { topic?: string; description?: string; intensity?: number }
  ): void {
    this.bonding.recordEvent(event, context);
  }

  /**
   * Update concern level based on detected user state
   */
  updateConcern(concernLevel: number): void {
    this.bonding.updateConcern(concernLevel);
  }

  // ============================================================================
  // STATE ACCESS
  // ============================================================================

  /**
   * Get complete unified emotional state
   */
  getState(): UnifiedEmotionalState {
    const userContext = this.userEmotions.buildEmotionalContext();
    const patterns = this.userEmotions.detectPatterns();
    const bondMetrics = this.bonding.getBondMetrics();
    const checkIns = this.userEmotions.getCheckInSuggestions();

    // Determine suggested approach based on combined state
    let suggestedApproach: UnifiedEmotionalState['insights']['suggestedApproach'] = 'standard';

    if (bondMetrics.concern > 0.5 || userContext.unresolvedConcerns.length > 0) {
      suggestedApproach = 'supportive';
    } else if (bondMetrics.protectiveness > 0.5) {
      suggestedApproach = 'protective';
    } else if (userContext.celebratableWins.length > 0) {
      suggestedApproach = 'celebratory';
    } else if (patterns.some((p) => p.trend === 'improving')) {
      suggestedApproach = 'celebratory';
    } else if (checkIns.length > 0) {
      suggestedApproach = 'curious';
    }

    // Determine emotional trend
    let emotionalTrend: UnifiedEmotionalState['insights']['emotionalTrend'] = 'unknown';
    const topPattern = patterns[0];
    if (topPattern) {
      emotionalTrend = topPattern.trend;
    }

    return {
      user: {
        recentEmotions: userContext.recentEmotions,
        unresolvedConcerns: userContext.unresolvedConcerns,
        celebratableWins: userContext.celebratableWins,
        checkInSuggestions: checkIns,
        patterns,
      },
      bond: {
        warmth: bondMetrics.warmth,
        trust: bondMetrics.trust,
        protectiveness: bondMetrics.protectiveness,
        admiration: bondMetrics.admiration,
        concern: bondMetrics.concern,
        sessionCount: this.bonding.getBond().sessionCount,
        stage: bondMetrics.stage,
      },
      insights: {
        suggestedApproach,
        topCheckIn: checkIns[0] || null,
        bondPhrase: this.bonding.getBondPhrase({ turnCount: 10 })?.phrase || null,
        emotionalTrend,
      },
    };
  }

  /**
   * Get formatted context for LLM prompt
   */
  formatForPrompt(turnCount: number): string {
    const lines: string[] = [];

    // User emotion context
    const userPrompt = this.userEmotions.formatForPrompt();
    if (userPrompt) {
      lines.push(userPrompt);
    }

    // Bond-aware greeting/phrase
    const greetingMod = this.bonding.getGreetingModifier();
    if (greetingMod && turnCount <= 2) {
      lines.push(`[WARMTH] ${greetingMod}`);
    }

    // Emotional memory callback
    const memoryCallback = this.bonding.getEmotionalMemoryCallback();
    if (memoryCallback && turnCount > 5) {
      lines.push(`[MEMORY] Consider: "${memoryCallback}"`);
    }

    // Bond phrase
    const bondPhrase = this.bonding.getBondPhrase({ turnCount });
    if (bondPhrase) {
      lines.push(`[BOND] ${bondPhrase.phrase}`);
    }

    return lines.join('\n');
  }

  /**
   * Get relationship stage
   */
  getRelationshipStage(): RelationshipStage {
    return this.bonding.getRelationshipStage();
  }

  /**
   * Get check-in suggestions
   */
  getCheckInSuggestions(): EmotionalCheckIn[] {
    return this.userEmotions.getCheckInSuggestions();
  }

  /**
   * Get emotional patterns
   */
  getPatterns(): EmotionalPattern[] {
    return this.userEmotions.detectPatterns();
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  /**
   * Export all emotional memory data for persistence
   */
  export(): { userMoments: UserEmotionalMoment[]; bond: EmotionalBond } {
    return {
      userMoments: this.userEmotions.exportMoments(),
      bond: this.bonding.export(),
    };
  }

  /**
   * Import emotional memory data from storage
   */
  import(data: { userMoments?: UserEmotionalMoment[]; bond?: EmotionalBond }): void {
    if (data.userMoments) {
      this.userEmotions.importMoments(data.userMoments);
    }
    if (data.bond) {
      this.bonding.import(data.bond);
    }
  }

  /**
   * Get stats for debugging
   */
  getStats() {
    return {
      user: this.userEmotions.getStats(),
      bond: this.bonding.getBondMetrics(),
    };
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const unifiedEngines = new Map<string, UnifiedEmotionalMemory>();

/**
 * Get or create a unified emotional memory for a user
 */
export function getUnifiedEmotionalMemory(config: EmotionalMemoryConfig): UnifiedEmotionalMemory {
  const key = `${config.userId}:${config.personaId || 'ferni'}`;

  if (!unifiedEngines.has(key)) {
    unifiedEngines.set(key, new UnifiedEmotionalMemory(config));
  }

  return unifiedEngines.get(key)!;
}

/**
 * Clear unified emotional memory for a user
 */
export function clearUnifiedEmotionalMemory(userId: string, personaId?: string): void {
  const key = `${userId}:${personaId || 'ferni'}`;
  unifiedEngines.delete(key);
  removeUserEmotionMemory(userId);
  clearBondingMemory(userId);
}

/**
 * Clear all unified emotional memories
 */
export function clearAllUnifiedEmotionalMemories(): void {
  unifiedEngines.clear();
}

// ============================================================================
// RE-EXPORTS for backward compatibility
// ============================================================================

// Re-export types from source modules
export type {
  EmotionalCheckIn,
  EmotionalContext,
  EmotionalMoment,
  EmotionalPattern,
} from '../intelligence/emotional-memory.js';

export type { EmotionalBond, RelationshipStage } from '../conversation/superhuman/types.js';

export default {
  getUnifiedEmotionalMemory,
  clearUnifiedEmotionalMemory,
  clearAllUnifiedEmotionalMemories,
  UnifiedEmotionalMemory,
};
