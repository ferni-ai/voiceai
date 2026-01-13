/**
 * Persona Intelligence - Unified Integration Layer
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module integrates all the advanced persona systems:
 * - Relationship Memory Engine (tracking relationship depth and history)
 * - Cognitive Differentiation (how each persona thinks differently)
 * - Team Chemistry (natural team dynamics and references)
 * - Predictive Intelligence (anticipating user needs)
 *
 * Together, these systems make Ferni "Better than Human" - a team that
 * truly knows you, thinks in distinct ways, and anticipates your needs.
 */
import { type RelationshipContext, type RelationshipMemory, type RelationshipStage, type SharedMomentType } from './relationship-memory/index.js';
import { type CognitiveDifferentiation } from './cognitive-differentiation.js';
import { type HandoffContext } from './shared/team-chemistry.js';
import type { CognitiveProfile } from './cognitive-types.js';
/**
 * Complete intelligence context for a persona-user pair
 */
export interface PersonaIntelligenceContext {
    personaId: string;
    userId: string;
    relationship: RelationshipContext;
    cognitive: {
        profile: CognitiveProfile;
        differentiation: CognitiveDifferentiation;
    };
    predictive: {
        patternsDetected: string[];
        proactiveFollowUps: string[];
        concerns: string[];
    };
    team: {
        referencesAvailable: boolean;
        pendingHandoffContext?: HandoffContext;
    };
}
/**
 * Prompt injection combining all intelligence systems
 */
export interface UnifiedPromptInjection {
    relationshipSection: string;
    cognitiveSection: string;
    predictiveSection: string;
    teamSection: string;
    combined: string;
}
/**
 * Configuration for the intelligence engine
 */
export interface PersonaIntelligenceConfig {
    enableRelationshipMemory: boolean;
    enableCognitiveDifferentiation: boolean;
    enableTeamChemistry: boolean;
    enablePredictiveIntelligence: boolean;
    teamReferenceFrequency: number;
    maxPredictiveInsightsPerSession: number;
}
/**
 * Unified intelligence engine for a persona-user pair.
 * Coordinates all four intelligence systems.
 */
export declare class PersonaIntelligenceEngine {
    private personaId;
    private userId;
    private config;
    private relationshipEngine;
    private cognitiveEngine;
    private cognitiveDiff;
    private cognitiveProfile;
    private sessionNumber;
    private lastTeamReferenceSession;
    private predictiveInsightsUsed;
    constructor(personaId: string, userId: string, existingRelationshipMemory?: RelationshipMemory, config?: Partial<PersonaIntelligenceConfig>);
    /**
     * Build TeamChemistryConfig from PersonaIntelligenceConfig
     * This provides proper typing instead of using `as any`
     */
    private buildTeamChemistryConfig;
    /**
     * Start a new session
     */
    startSession(): void;
    /**
     * End session with summary
     */
    endSession(sessionMood: 'positive' | 'neutral' | 'struggling' | 'crisis', sessionEnergy: 'high' | 'medium' | 'low', topics: string[]): void;
    /**
     * Get complete intelligence context
     */
    getContext(): PersonaIntelligenceContext;
    /**
     * Build unified prompt injection for LLM
     */
    buildPromptInjection(currentTopic?: string, userMessage?: string): UnifiedPromptInjection;
    /**
     * Record a shared moment
     */
    recordMoment(type: SharedMomentType, summary: string, options?: {
        topic?: string;
        userPhrase?: string;
        ourResponse?: string;
        significance?: number;
        tags?: string[];
    }): import("./relationship-memory/types.js").SharedMoment;
    /**
     * Record a callback attempt
     */
    recordCallbackAttempt(reference: string, type: 'moment' | 'topic' | 'joke' | 'goal' | 'person' | 'story', userResponse: 'positive' | 'engaged' | 'neutral' | 'confused' | 'ignored', threadContinued: boolean, context: string): void;
    /**
     * Record inside joke seed
     */
    recordInsideJokeSeed(phrase: string, context: string, engagement: 'high' | 'medium' | 'low'): void;
    /**
     * Get a persona-appropriate question
     */
    getQuestion(type?: 'starter' | 'deep_dive'): string | undefined;
    /**
     * Get a disagreement phrase based on intensity
     */
    getDisagreement(intensity?: 'mild' | 'moderate' | 'strong'): string | undefined;
    /**
     * Get an insight lead-in
     */
    getInsightIntro(): string | undefined;
    /**
     * Get silence response based on duration
     */
    getSilenceResponse(durationMs: number): string | undefined;
    /**
     * Get a team reference for another persona
     */
    getTeamRef(aboutPersona: string, type?: 'admiration' | 'playful_teasing'): string | undefined;
    /**
     * Check for team inside joke
     */
    checkTeamJoke(trigger: string): {
        reference: string;
    } | null;
    /**
     * Get team compliment for user
     */
    getCompliment(trait?: 'persistence' | 'growth' | 'vulnerability' | 'humor'): string;
    /**
     * Generate handoff note for another persona
     */
    generateHandoff(toPersona: string, topic: string, emotionalState: 'high_emotion' | 'excited' | 'struggling' | 'neutral'): string;
    /**
     * Get current relationship stage
     */
    getRelationshipStage(): RelationshipStage;
    /**
     * Get trust score
     */
    getTrustScore(): number;
    /**
     * Get full relationship memory
     */
    getRelationshipMemory(): RelationshipMemory;
    /**
     * Get cognitive differentiation profile
     */
    getCognitiveDifferentiation(): CognitiveDifferentiation | undefined;
    /**
     * Find an inside joke that's relevant to the current topic/message
     */
    private findRelevantInsideJoke;
    /**
     * Extract meaningful keywords from a joke for matching
     */
    private extractKeywords;
}
/**
 * Get or create a persona intelligence engine
 */
export declare function getPersonaIntelligence(personaId: string, userId: string, existingMemory?: RelationshipMemory, config?: Partial<PersonaIntelligenceConfig>): PersonaIntelligenceEngine;
/**
 * Clear an intelligence engine
 */
export declare function clearPersonaIntelligence(personaId: string, userId: string): void;
/**
 * Reset all intelligence engines
 */
export declare function resetAllPersonaIntelligence(): void;
export default PersonaIntelligenceEngine;
//# sourceMappingURL=persona-intelligence.d.ts.map