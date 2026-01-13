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
import type { EnergyLevel, TopicWeight, EngagementLevel, MessageAnalysis } from '../utils/detection.js';
import type { SessionIntelligenceInsight } from '../session-intelligence.js';
import type { BetterThanHumanInsight } from '../superhuman/types.js';
import type { ConversationMood } from '../deep-humanization/types.js';
import type { EmotionalResponse } from '../emotional-arc.js';
/**
 * Input context for the orchestrator
 */
export interface OrchestratorInput {
    personaId: string;
    sessionId: string;
    userId?: string;
    turnNumber: number;
    sessionMinutes: number;
    sessionCount?: number;
    userMessage: string;
    userEmotion?: string;
    topic?: string;
    rawResponse: string;
    wasPersonalSharing?: boolean;
    isSeriousContext?: boolean;
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    sessionData?: Record<string, unknown>;
}
/**
 * Result of the analysis phase
 */
export interface AnalysisPhaseResult {
    analysis: MessageAnalysis;
    signals: DetectedSignals;
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
/**
 * Result of the intelligence phase
 */
export interface IntelligencePhaseResult {
    sessionInsight: SessionIntelligenceInsight | null;
    superhumanInsight: BetterThanHumanInsight | null;
    mood: ConversationMood;
    emotionalGuidance: EmotionalResponse | null;
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
/**
 * Result of the humanization phase
 */
export interface HumanizationPhaseResult {
    text: string;
    ssml: string;
    appliedFeatures: AppliedFeature[];
    skippedFeatures: SkippedFeature[];
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
    memoryCallback?: {
        text: string;
        ssml: string;
    };
    followUpQuestion?: {
        text: string;
        ssml: string;
    };
    backchannel?: {
        text: string;
        ssml: string;
    };
}
/**
 * Final orchestrator output
 */
export interface OrchestratorOutput {
    text: string;
    ssml: string;
    appliedFeatures: string[];
    emotionalGuidance: EmotionalResponse | null;
    pacing: 'faster' | 'normal' | 'slower';
    memoryCallback?: {
        text: string;
        ssml: string;
    };
    followUpQuestion?: {
        text: string;
        ssml: string;
    };
    backchannel?: {
        text: string;
        ssml: string;
    };
    metadata: OutputMetadata;
}
/**
 * Metadata about the orchestration
 */
export interface OutputMetadata {
    timing: {
        analysis: number;
        intelligence: number;
        humanization: number;
        output: number;
        total: number;
    };
    confidence: {
        analysis: number;
        intelligence: number;
        overall: number;
    };
    debug?: {
        analysisResult: AnalysisPhaseResult;
        intelligenceResult: IntelligencePhaseResult;
        humanizationResult: HumanizationPhaseResult;
    };
}
/**
 * Configuration for the orchestrator
 */
export interface OrchestratorConfig {
    enableAnalysis: boolean;
    enableIntelligence: boolean;
    enableHumanization: boolean;
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
    maxHumanizationsPerResponse: number;
    maxPriorityActions: number;
    debug: boolean;
}
/**
 * Default orchestrator configuration
 */
export declare const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig;
//# sourceMappingURL=types.d.ts.map