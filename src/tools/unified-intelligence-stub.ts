/**
 * Unified Intelligence Stub
 *
 * Provides graceful degradation when the full intelligence layer is removed.
 * All methods are no-ops that return sensible defaults.
 *
 * This stub allows dependent modules to continue working without the
 * full FTIS intelligence system.
 *
 * @module tools/unified-intelligence-stub
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'unified-intelligence-stub' });

// ============================================================================
// TYPES (preserved for compatibility)
// ============================================================================

/** Voice emotion state for emotion-aware tool selection */
export interface VoiceEmotionState {
  primary: string;
  valence: number; // -1 to 1
  arousal: number; // 0 to 1
  stressLevel: number; // 0 to 1
  anxietyMarkers: boolean;
}

/** Cross-persona context for handoff intelligence */
export interface CrossPersonaContext {
  previousPersonaId: string;
  toolsUsedWithPreviousPersona: string[];
  effectiveToolChains: string[][];
  userPreferencesLearned: Record<string, unknown>;
  topicsDiscussed: string[];
  emotionalJourney: string[];
}

/** User intelligence profile */
export interface UserIntelligenceProfile {
  userId: string;
  timePatterns: {
    preferredToolsByHour: Map<number, string[]>;
    activeHours: number[];
    peakEngagementTimes: Array<{ hour: number; dayOfWeek: number }>;
  };
  vocabulary: Map<string, string>;
  toolAffinities: Map<string, number>;
  recentChains: Array<{
    sequence: string[];
    timestamp: Date;
    context?: string;
  }>;
  corrections: Array<{
    expected: string;
    actual: string;
    query: string;
    timestamp: Date;
  }>;
  suggestedTools: Array<{
    toolId: string;
    reason: string;
    confidence: number;
    suggested: boolean;
  }>;
  crossPersonaContext?: CrossPersonaContext;
  lastEmotionalState?: VoiceEmotionState;
  outreachPatterns: {
    habitCheckTime?: number;
    engagementPeaks: number[];
    lastOutreach?: Date;
    outreachResponsiveness: number;
  };
}

/** Tool selection enhancement from intelligence layer */
export interface IntelligenceEnhancement {
  prioritizeTools: string[];
  anticipatedTools: string[];
  proactiveSuggestions: Array<{
    toolId: string;
    reason: string;
    triggerPhrase?: string;
  }>;
  contextHints: {
    likelyIntent?: string;
    emotionalContext?: string;
    timeContext?: 'morning' | 'afternoon' | 'evening' | 'night';
    isReturningUser: boolean;
    preferredDomains: string[];
  };
  confidenceAdjustments: Map<string, number>;
  emotionAwareBoosts?: {
    boostedDomains: string[];
    reason: string;
    detectedEmotion?: string;
    stressLevel?: number;
  };
  crossPersonaContext?: {
    previousPersonaId: string;
    toolsToCarryForward: string[];
    topicsToRemember: string[];
    emotionalContinuity: string;
  };
  proactiveOutreach?: {
    shouldTrigger: boolean;
    type: 'habit_reminder' | 'check_in' | 'pattern_based';
    suggestedMessage?: string;
    optimalTime?: Date;
  };
}

/** Learning event from semantic router */
export interface LearningEvent {
  userId: string;
  sessionId: string;
  query: string;
  predictedTool: string;
  actualTool: string;
  confidence: number;
  wasCorrection: boolean;
  timestamp: Date;
  context?: {
    timeOfDay: string;
    personaId: string;
    emotionalState?: string;
    voiceEmotion?: VoiceEmotionState;
  };
}

/** Handoff event for cross-persona intelligence */
export interface PersonaHandoffEvent {
  userId: string;
  sessionId: string;
  fromPersonaId: string;
  toPersonaId: string;
  toolsUsed: string[];
  topicsDiscussed: string[];
  emotionalState?: VoiceEmotionState;
  timestamp: Date;
}

// ============================================================================
// STUB IMPLEMENTATION
// ============================================================================

/**
 * Stub implementation of UnifiedIntelligenceLayer.
 * All methods are no-ops that return sensible defaults.
 */
export class UnifiedIntelligenceLayer {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    log.info('🧠 Intelligence stub initialized (full intelligence layer removed)');
    this.initialized = true;
  }

  /**
   * Returns empty enhancement - lets LLM native function calling handle tool selection.
   */
  async enhanceToolSelection(
    _userId: string,
    currentContext: {
      personaId: string;
      timeOfDay?: Date;
      transcript?: string;
      sessionHistory?: string[];
      voiceEmotion?: VoiceEmotionState;
      previousPersonaId?: string;
    }
  ): Promise<IntelligenceEnhancement> {
    // Return minimal enhancement - trust LLM to select tools
    const hour = (currentContext.timeOfDay || new Date()).getHours();
    const timeContext =
      hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

    return {
      prioritizeTools: [],
      anticipatedTools: [],
      proactiveSuggestions: [],
      contextHints: {
        isReturningUser: false,
        preferredDomains: [],
        timeContext,
      },
      confidenceAdjustments: new Map(),
    };
  }

  /**
   * No-op - handoff context not tracked in stub mode.
   */
  async recordHandoff(_event: PersonaHandoffEvent): Promise<void> {
    // No-op in stub mode
  }

  /**
   * No-op - outreach patterns not tracked in stub mode.
   */
  recordOutreachResponse(_userId: string, _responded: boolean): void {
    // No-op in stub mode
  }

  /**
   * Returns empty metrics.
   */
  getMetrics(): {
    profileCount: number;
    totalCorrections: number;
    avgToolAffinities: number;
  } {
    return {
      profileCount: 0,
      totalCorrections: 0,
      avgToolAffinities: 0,
    };
  }

  /**
   * No-op - learning not tracked in stub mode.
   */
  async recordLearningEvent(_event: LearningEvent): Promise<void> {
    // No-op in stub mode
  }

  /**
   * Alias for recordLearningEvent (for backward compatibility).
   */
  async recordLearning(_event: LearningEvent): Promise<void> {
    // No-op in stub mode
  }

  /**
   * No-op - proactive outreach not triggered in stub mode.
   */
  triggerProactiveOutreach(
    _userId: string,
    _outreach?: unknown
  ): { triggered: boolean; messageId?: string; reason: string } {
    return {
      triggered: false,
      reason: 'Proactive outreach disabled in simplified routing mode',
    };
  }

  /**
   * Returns null - no profiles in stub mode.
   */
  getProfile(_userId: string): UserIntelligenceProfile | null {
    return null;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: UnifiedIntelligenceLayer | null = null;

/**
 * Get the singleton instance of the intelligence layer stub.
 */
export function getUnifiedIntelligence(): UnifiedIntelligenceLayer {
  if (!instance) {
    instance = new UnifiedIntelligenceLayer();
  }
  return instance;
}

/**
 * Initialize the intelligence layer (no-op in stub mode).
 */
export async function initializeUnifiedIntelligence(): Promise<void> {
  const intelligence = getUnifiedIntelligence();
  await intelligence.initialize();
}

/**
 * Reset for testing.
 */
export function resetUnifiedIntelligence(): void {
  instance = null;
}
