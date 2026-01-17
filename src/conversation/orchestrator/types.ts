/**
 * Unified Conversation Orchestrator Types
 *
 * Type definitions for the layered orchestrator architecture that coordinates
 * all conversation humanization systems.
 *
 * Architecture Overview:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    ConversationOrchestrator                  │
 * ├─────────────────────────────────────────────────────────────┤
 * │  Phase 1: ANALYSIS                                          │
 * │  - Analyze user message (energy, engagement, topic weight)  │
 * │  - Detect signals (breakthrough, evidence, hesitation)      │
 * ├─────────────────────────────────────────────────────────────┤
 * │  Phase 2: INTELLIGENCE                                      │
 * │  - Session intelligence (concern, predictions)              │
 * │  - Better-than-human (relationship, emotional memory)       │
 * │  - Deep humanization (mood tracking)                        │
 * ├─────────────────────────────────────────────────────────────┤
 * │  Phase 3: HUMANIZATION                                      │
 * │  - Speech naturalization                                    │
 * │  - Advanced humanization (disfluencies, self-correction)    │
 * │  - Vocal humanization (energy matching, contractions)       │
 * │  - Content delivery pacing                                  │
 * ├─────────────────────────────────────────────────────────────┤
 * │  Phase 4: OUTPUT                                            │
 * │  - Apply modifications                                      │
 * │  - Generate SSML                                            │
 * │  - Compile features list                                    │
 * └─────────────────────────────────────────────────────────────┘
 *
 * @module @ferni/conversation/orchestrator
 */

import type {
  EnergyLevel,
  TopicWeight,
  EngagementLevel,
  MessageAnalysis,
} from '../utils/detection.js';
import type { SessionIntelligenceInsight } from '../session-intelligence.js';
import type { BetterThanHumanInsight } from '../superhuman/types.js';
import type { ConversationMood } from '../deep-humanization/types.js';
import type { EmotionalResponse } from '../emotional-arc.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Input context for the orchestrator
 */
export interface OrchestratorInput {
  // Identifiers
  personaId: string;
  sessionId: string;
  userId?: string;

  // Turn information
  turnNumber: number;
  sessionMinutes: number;
  sessionCount?: number;

  // User message
  userMessage: string;
  userEmotion?: string;
  topic?: string;

  // Response to humanize
  rawResponse: string;

  // Flags
  wasPersonalSharing?: boolean;
  isSeriousContext?: boolean;

  // Relationship
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

  // Session data (for cross-session features)
  sessionData?: Record<string, unknown>;
}

// ============================================================================
// PHASE 1: ANALYSIS RESULTS
// ============================================================================

/**
 * Result of the analysis phase
 */
export interface AnalysisPhaseResult {
  // Message analysis
  analysis: MessageAnalysis;

  // Detected signals
  signals: DetectedSignals;

  // Context for downstream phases
  context: AnalysisContext;
}

/**
 * Signals detected in the user message
 */
export interface DetectedSignals {
  hasEvidence: boolean;
  isBreakthrough: boolean;
  hasHesitation: boolean;
  isDisengaged: boolean;
  isHighlyEngaged: boolean;
  isEmotional: boolean;
  isHeavy: boolean;
  isFirstTurn: boolean;
}

/**
 * Context derived from analysis
 */
export interface AnalysisContext {
  energy: EnergyLevel;
  topicWeight: TopicWeight;
  engagement: EngagementLevel;
  conversationDepth: 'surface' | 'medium' | 'deep';
  needsSupport: boolean;
  confidence: number;
}

// ============================================================================
// PHASE 2: INTELLIGENCE RESULTS
// ============================================================================

/**
 * Result of the intelligence phase
 */
export interface IntelligencePhaseResult {
  // Session intelligence
  sessionInsight: SessionIntelligenceInsight | null;

  // Better-than-human insights
  superhumanInsight: BetterThanHumanInsight | null;

  // Mood state
  mood: ConversationMood;

  // Emotional guidance
  emotionalGuidance: EmotionalResponse | null;

  // Combined guidance
  guidance: IntelligenceGuidance;
}

/**
 * Combined guidance from intelligence systems
 */
export interface IntelligenceGuidance {
  approach: 'normal' | 'supportive' | 'celebratory' | 'cautious' | 'energetic';
  pacing: 'faster' | 'normal' | 'slower';
  energyTarget: EnergyLevel;
  avoid: string[];
  priorityActions: PriorityAction[];
}

/**
 * Action to prioritize in humanization
 */
export interface PriorityAction {
  type: string;
  content: string;
  placement: 'prefix' | 'inline' | 'suffix' | 'standalone';
  priority: number;
  reason: string;
}

// ============================================================================
// PHASE 3: HUMANIZATION RESULTS
// ============================================================================

/**
 * Result of the humanization phase
 */
export interface HumanizationPhaseResult {
  // Humanized text
  text: string;

  // SSML version
  ssml: string;

  // Applied features
  appliedFeatures: AppliedFeature[];

  // Skipped features (with reasons)
  skippedFeatures: SkippedFeature[];

  // Optional additions
  additions: ResponseAdditions;
}

/**
 * Feature that was applied
 */
export interface AppliedFeature {
  name: string;
  source: 'speech' | 'vocal' | 'advanced' | 'deep' | 'session' | 'superhuman' | 'effects';
  details?: Record<string, unknown>;
}

/**
 * Feature that was skipped
 */
export interface SkippedFeature {
  name: string;
  reason: string;
}

/**
 * Optional additions to the response
 */
export interface ResponseAdditions {
  memoryCallback?: { text: string; ssml: string };
  followUpQuestion?: { text: string; ssml: string };
  backchannel?: { text: string; ssml: string };
}

// ============================================================================
// PHASE 4: OUTPUT RESULTS
// ============================================================================

/**
 * Final orchestrator output
 */
export interface OrchestratorOutput {
  // Final response
  text: string;
  ssml: string;

  // All applied features
  appliedFeatures: string[];

  // Emotional guidance
  emotionalGuidance: EmotionalResponse | null;

  // Pacing recommendation
  pacing: 'faster' | 'normal' | 'slower';

  // Optional additions
  memoryCallback?: { text: string; ssml: string };
  followUpQuestion?: { text: string; ssml: string };
  backchannel?: { text: string; ssml: string };

  // Metadata
  metadata: OutputMetadata;
}

/**
 * Metadata about the orchestration
 */
export interface OutputMetadata {
  // Phase timing (ms)
  timing: {
    analysis: number;
    intelligence: number;
    humanization: number;
    output: number;
    total: number;
  };

  // Confidence scores
  confidence: {
    analysis: number;
    intelligence: number;
    overall: number;
  };

  // Debug info
  debug?: {
    analysisResult: AnalysisPhaseResult;
    intelligenceResult: IntelligencePhaseResult;
    humanizationResult: HumanizationPhaseResult;
  };
}

// ============================================================================
// ORCHESTRATOR CONFIGURATION
// ============================================================================

/**
 * Configuration for the orchestrator
 */
export interface OrchestratorConfig {
  // Enable/disable phases
  enableAnalysis: boolean;
  enableIntelligence: boolean;
  enableHumanization: boolean;

  // Feature toggles
  features: {
    speechNaturalization: boolean;
    vocalHumanization: boolean;
    advancedHumanization: boolean;
    deepHumanization: boolean;
    sessionIntelligence: boolean;
    betterThanHuman: boolean;
    contentDeliveryPacing: boolean;
    silencePresence: boolean;
    /** NEW: Composable effects system (clean architecture replacement for deep humanization) */
    composableEffects: boolean;
  };

  // Limits
  maxHumanizationsPerResponse: number;
  maxPriorityActions: number;

  // Debug mode
  debug: boolean;
}

/**
 * Default orchestrator configuration
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  enableAnalysis: true,
  enableIntelligence: true,
  enableHumanization: true,

  features: {
    speechNaturalization: true,
    vocalHumanization: true,
    advancedHumanization: true,
    deepHumanization: true,
    sessionIntelligence: true,
    betterThanHuman: true,
    contentDeliveryPacing: true,
    silencePresence: true,
    composableEffects: true, // NEW: Enabled by default - clean architecture effects system
  },

  maxHumanizationsPerResponse: 3,
  maxPriorityActions: 2,

  debug: false,
};
