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
 * Architecture Note: This module uses dependency injection for the emotional memory
 * engines to avoid architecture violations (memory layer importing from intelligence
 * and conversation layers). The engines are injected at runtime by the services layer.
 *
 * @module memory/emotional-memory-unified
 */
import { type EmotionalCheckIn, type EmotionalContext, type EmotionalMoment, type EmotionalPattern, type PrimaryEmotion } from '../types/emotion-types.js';
import { type EmotionalBond, type RelationshipStage } from '../types/relationship-stages.js';
export type UserEmotionalContext = EmotionalContext;
export type UserEmotionalMoment = EmotionalMoment;
/**
 * Interface for user emotion tracking engine
 */
export interface UserEmotionEngine {
    startSession: (sessionId: string) => void;
    recordMoment: (emotion: PrimaryEmotion, topic: string, trigger: string, userStatement: string, intensity?: 'mild' | 'moderate' | 'strong') => string;
    resolveEmotion: (momentId: string, note?: string) => void;
    markFollowedUp: (momentId: string) => void;
    buildEmotionalContext: () => EmotionalContext;
    detectPatterns: () => EmotionalPattern[];
    getCheckInSuggestions: () => EmotionalCheckIn[];
    formatForPrompt: () => string;
    exportMoments: () => EmotionalMoment[];
    importMoments: (moments: EmotionalMoment[]) => void;
    getStats: () => Record<string, unknown>;
}
/**
 * Interface for persona bonding engine
 */
export interface BondingEngine {
    setPersonaId: (personaId: string) => void;
    recordSessionEnd: () => void;
    recordEvent: (event: string, context?: {
        topic?: string;
        description?: string;
        intensity?: number;
    }) => void;
    updateConcern: (level: number) => void;
    getBondMetrics: () => {
        warmth: number;
        trust: number;
        protectiveness: number;
        admiration: number;
        concern: number;
        stage: string;
    };
    getBond: () => EmotionalBond;
    getGreetingModifier: () => string | null;
    getEmotionalMemoryCallback: () => string | null;
    getBondPhrase: (context: {
        turnCount: number;
    }) => {
        phrase: string;
    } | null;
    getRelationshipStage: () => string;
    export: () => EmotionalBond;
    import: (bond: EmotionalBond) => void;
}
/**
 * Factory functions for creating engines (injected at runtime)
 */
export interface EmotionalMemoryEngineFactories {
    getUserEmotionEngine: (userId: string) => UserEmotionEngine;
    getBondingEngine: (userId: string, existingBond?: EmotionalBond) => BondingEngine;
    removeUserEmotionEngine: (userId: string) => void;
    clearBondingEngine: (userId: string) => void;
}
/**
 * Configure the emotional memory engine factories.
 * This MUST be called by the services layer before using UnifiedEmotionalMemory.
 *
 * @example
 * // In services/index.ts or similar:
 * configureEmotionalMemoryEngines({
 *   getUserEmotionEngine: (userId) => getEmotionalMemory(userId),
 *   getBondingEngine: (userId, bond) => getEmotionalMemory(userId, bond),
 *   removeUserEmotionEngine: (userId) => removeEmotionalMemory(userId),
 *   clearBondingEngine: (userId) => clearEmotionalMemory(userId),
 * });
 */
export declare function configureEmotionalMemoryEngines(factories: EmotionalMemoryEngineFactories): void;
/**
 * Check if engines are configured
 */
export declare function areEmotionalMemoryEnginesConfigured(): boolean;
export interface UnifiedEmotionalState {
    user: {
        recentEmotions: string[];
        unresolvedConcerns: string[];
        celebratableWins: string[];
        checkInSuggestions: EmotionalCheckIn[];
        patterns: EmotionalPattern[];
    };
    bond: {
        warmth: number;
        trust: number;
        protectiveness: number;
        admiration: number;
        concern: number;
        sessionCount: number;
        stage: RelationshipStage;
    };
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
/**
 * Unified interface for all emotional memory operations
 */
export declare class UnifiedEmotionalMemory {
    private userId;
    private personaId;
    private userEmotions;
    private bonding;
    constructor(config: EmotionalMemoryConfig);
    /**
     * Start a new session
     */
    startSession(sessionId: string): void;
    /**
     * End current session
     */
    endSession(): void;
    /**
     * Record a user's emotional moment
     */
    recordUserEmotion(emotion: string, topic: string, trigger: string, userStatement: string, intensity?: 'mild' | 'moderate' | 'strong'): string;
    /**
     * Mark an emotional concern as resolved
     */
    resolveEmotion(momentId: string, note?: string): void;
    /**
     * Mark that we followed up on an emotion
     */
    markFollowedUp(momentId: string): void;
    /**
     * Record a bonding event (vulnerability, breakthrough, laughter, etc.)
     */
    recordBondEvent(event: 'vulnerability_shared' | 'breakthrough_moment' | 'laughter_shared' | 'struggle_shared' | 'growth_shown' | 'trust_demonstrated' | 'gratitude_expressed' | 'deep_conversation', context?: {
        topic?: string;
        description?: string;
        intensity?: number;
    }): void;
    /**
     * Update concern level based on detected user state
     */
    updateConcern(concernLevel: number): void;
    /**
     * Get complete unified emotional state
     */
    getState(): UnifiedEmotionalState;
    /**
     * Get formatted context for LLM prompt
     */
    formatForPrompt(turnCount: number): string;
    /**
     * Get relationship stage
     */
    getRelationshipStage(): RelationshipStage;
    /**
     * Get check-in suggestions
     */
    getCheckInSuggestions(): EmotionalCheckIn[];
    /**
     * Get emotional patterns
     */
    getPatterns(): EmotionalPattern[];
    /**
     * Export all emotional memory data for persistence
     */
    export(): {
        userMoments: UserEmotionalMoment[];
        bond: EmotionalBond;
    };
    /**
     * Import emotional memory data from storage
     */
    import(data: {
        userMoments?: UserEmotionalMoment[];
        bond?: EmotionalBond;
    }): void;
    /**
     * Get stats for debugging
     */
    getStats(): {
        user: Record<string, unknown>;
        bond: {
            warmth: number;
            trust: number;
            protectiveness: number;
            admiration: number;
            concern: number;
            stage: string;
        };
    };
}
/**
 * Get or create a unified emotional memory for a user
 */
export declare function getUnifiedEmotionalMemory(config: EmotionalMemoryConfig): UnifiedEmotionalMemory;
/**
 * Clear unified emotional memory for a user
 */
export declare function clearUnifiedEmotionalMemory(userId: string, personaId?: string): void;
/**
 * Clear all unified emotional memories
 */
export declare function clearAllUnifiedEmotionalMemories(): void;
export type { EmotionalCheckIn, EmotionalContext, EmotionalMoment, EmotionalPattern, } from '../types/emotion-types.js';
export type { EmotionalBond, RelationshipStage } from '../types/relationship-stages.js';
declare const _default: {
    getUnifiedEmotionalMemory: typeof getUnifiedEmotionalMemory;
    clearUnifiedEmotionalMemory: typeof clearUnifiedEmotionalMemory;
    clearAllUnifiedEmotionalMemories: typeof clearAllUnifiedEmotionalMemories;
    UnifiedEmotionalMemory: typeof UnifiedEmotionalMemory;
    configureEmotionalMemoryEngines: typeof configureEmotionalMemoryEngines;
    areEmotionalMemoryEnginesConfigured: typeof areEmotionalMemoryEnginesConfigured;
};
export default _default;
//# sourceMappingURL=emotional-memory-unified.d.ts.map