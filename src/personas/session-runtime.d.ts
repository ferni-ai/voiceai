/**
 * Session Bundle Runtime Manager
 *
 * Wraps the BundleRuntimeEngine and integrates shared utilities:
 * - Life events (birthdays, anniversaries, milestones)
 * - Welcome back messaging (time-based greetings)
 * - Relationship building (deepening questions, callbacks)
 * - Team dynamics (handoff context, teammate mentions)
 *
 * This provides a unified API for all session-level persona content,
 * making it easy to wire up rich, relationship-aware interactions.
 */
import type { RelationshipStage, UserProfile } from '../types/user-profile.js';
import type { BundleRuntimeEngine, BundleRuntimeState } from './bundles/runtime.js';
import { type LifeEvent } from './shared/life-events.js';
import { type PersonaIntelligenceEngine, type UnifiedPromptInjection } from './persona-intelligence.js';
import type { RelationshipMemory, SharedMomentType } from './relationship-memory/index.js';
export interface SessionRuntimeConfig {
    personaId: string;
    userProfile?: UserProfile;
    lifeEvents?: LifeEvent[];
    initialState?: Partial<BundleRuntimeState>;
    /** Enable the unified persona intelligence engine */
    enableIntelligence?: boolean;
    /** Existing relationship memory to restore (for returning users) */
    existingRelationshipMemory?: RelationshipMemory;
}
export interface SessionContext {
    userName?: string;
    lastConversationDate?: Date;
    conversationCount?: number;
    relationshipStage?: RelationshipStage;
    currentTopic?: string;
    detectedEmotion?: string;
    /** Current emotional state for handoff context */
    emotionalState?: 'high_emotion' | 'excited' | 'struggling' | 'neutral';
}
export interface WelcomeBackResult {
    greeting: string;
    type: 'same_day' | 'next_day' | 'few_days' | 'week' | 'weeks' | 'month' | 'long_time' | 'new';
    hasMilestone: boolean;
    milestoneMessage?: string;
    lifeEventAcknowledgment?: string;
}
export interface SessionEnhancements {
    welcomeBack?: WelcomeBackResult;
    deepeningQuestion?: string;
    callback?: string;
    acknowledgment?: string;
    storyRecommended: boolean;
    teamMention?: string;
    /** Unified intelligence prompt injection */
    intelligenceInjection?: UnifiedPromptInjection;
}
export declare class SessionBundleRuntimeManager {
    private bundleRuntime;
    private personaId;
    private userProfile?;
    private lifeEvents;
    private initialized;
    private intelligenceEngine;
    private userId?;
    constructor(config: SessionRuntimeConfig);
    /**
     * Initialize the session runtime.
     * Loads the bundle and initializes the runtime engine.
     */
    initialize(options?: {
        enableIntelligence?: boolean;
        existingRelationshipMemory?: RelationshipMemory;
    }): Promise<boolean>;
    /**
     * Get the underlying BundleRuntimeEngine.
     */
    getBundleRuntime(): BundleRuntimeEngine | null;
    /**
     * Check if we have a bundle runtime available.
     */
    hasBundleRuntime(): boolean;
    /**
     * Generate a welcome back result with life event acknowledgments.
     */
    generateWelcomeBackEnhanced(context: SessionContext): WelcomeBackResult;
    /**
     * Get all session enhancements for the current context.
     */
    getSessionEnhancements(context: SessionContext): SessionEnhancements;
    /**
     * Map detected emotion to acknowledgment type.
     */
    private mapEmotionToAckType;
    /**
     * Determine story weight based on conversation count.
     */
    private getStoryWeight;
    /**
     * Set life events for the session.
     */
    setLifeEvents(events: LifeEvent[]): void;
    /**
     * Get events that should be acknowledged today.
     */
    getEventsToAcknowledge(): LifeEvent[];
    /**
     * Get upcoming events that could be mentioned.
     */
    getUpcomingEvents(daysAhead?: number): LifeEvent[];
    /**
     * Generate mention for an upcoming event.
     */
    getUpcomingEventMentionText(event: LifeEvent): string | null;
    /**
     * Get stage-appropriate greeting.
     */
    getStageGreetingText(): string;
    /**
     * Get stage-appropriate closing.
     */
    getStageClosingText(): string;
    /**
     * Get a deepening question for the current relationship stage.
     */
    getDeepeningQuestionText(): string;
    /**
     * Get opinion about another team member.
     */
    getOpinionAboutTeammate(teammateId: string): string | null;
    /**
     * Get handoff warmth phrase for handing off to another team member.
     */
    getHandoffWarmthPhrase(toPersonaId: string): string | null;
    /**
     * Get handoff warmth phrase for receiving from another team member.
     */
    getReceiveWarmthPhrase(fromPersonaId: string): string | null;
    /**
     * Get the intelligence engine (if initialized).
     */
    getIntelligenceEngine(): PersonaIntelligenceEngine | null;
    /**
     * Check if intelligence engine is available.
     */
    hasIntelligenceEngine(): boolean;
    /**
     * Start an intelligence session (tracks relationship progression).
     */
    startIntelligenceSession(): void;
    /**
     * End an intelligence session with summary.
     */
    endIntelligenceSession(sessionMood: 'positive' | 'neutral' | 'struggling' | 'crisis', sessionEnergy: 'high' | 'medium' | 'low', topics: string[]): void;
    /**
     * Build unified prompt injection for LLM.
     * Combines relationship, cognitive, predictive, and team context.
     */
    buildIntelligencePromptInjection(currentTopic?: string): UnifiedPromptInjection | null;
    /**
     * Record a significant moment in the relationship.
     */
    recordMoment(type: SharedMomentType, summary: string, options?: {
        topic?: string;
        userPhrase?: string;
        ourResponse?: string;
        significance?: number;
        tags?: string[];
    }): void;
    /**
     * Get a persona-appropriate question.
     */
    getPersonaQuestion(type?: 'starter' | 'deep_dive'): string | undefined;
    /**
     * Get a disagreement phrase.
     */
    getDisagreementPhrase(intensity?: 'mild' | 'moderate' | 'strong'): string | undefined;
    /**
     * Get silence response based on duration.
     */
    getSilenceResponse(durationMs: number): string | undefined;
    /**
     * Get team reference about another persona.
     */
    getTeamReference(aboutPersona: string, type?: 'admiration' | 'playful_teasing'): string | undefined;
    /**
     * Generate handoff note for another persona.
     */
    generateHandoffNote(toPersona: string, topic: string, emotionalState: 'high_emotion' | 'excited' | 'struggling' | 'neutral'): string | undefined;
    /**
     * Get current relationship stage.
     */
    getIntelligenceRelationshipStage(): string | undefined;
    /**
     * Get current trust score (0-1).
     */
    getTrustScore(): number | undefined;
    /**
     * Export relationship memory for persistence.
     */
    exportRelationshipMemory(): RelationshipMemory | undefined;
    /**
     * Get time-of-day modifiers from bundle runtime.
     */
    getTimeOfDayModifiers(): {
        volume?: string;
        energy?: string;
    };
    /**
     * Get relationship stage name.
     */
    getRelationshipStageName(): string;
    /**
     * Get quirk content from bundle.
     */
    getQuirk(context?: string): Promise<string | null>;
    /**
     * Get "caught doing" moment for alive greetings.
     */
    getCaughtDoing(): string | null;
    /**
     * Get physical moment for embodied presence.
     */
    getPhysicalMoment(): string | null;
    /**
     * Get backstory hint for alive greetings.
     */
    getBackstoryHint(): string | null;
    /**
     * Update runtime state.
     */
    updateState(state: Partial<BundleRuntimeState>): void;
    /**
     * Increment turn counter.
     */
    incrementTurn(): void;
    /**
     * Update user profile reference.
     */
    setUserProfile(profile: UserProfile): void;
}
/**
 * Create and initialize a SessionBundleRuntimeManager.
 *
 * @param config - Session configuration including persona, user profile, and options
 * @returns Initialized session runtime manager with optional intelligence engine
 *
 * @example
 * ```typescript
 * // Basic usage
 * const session = await createSessionRuntime({
 *   personaId: 'ferni',
 *   userProfile: user,
 * });
 *
 * // With intelligence engine for relationship tracking
 * const session = await createSessionRuntime({
 *   personaId: 'ferni',
 *   userProfile: user,
 *   enableIntelligence: true,
 *   existingRelationshipMemory: savedMemory, // Optional - restore from persistence
 * });
 *
 * // Start intelligence session
 * session.startIntelligenceSession();
 *
 * // Get prompt injection for LLM
 * const injection = session.buildIntelligencePromptInjection('career');
 * // Use injection.combined in system prompt
 *
 * // Record significant moment
 * session.recordMoment('breakthrough', 'User realized their fear pattern');
 *
 * // End session
 * session.endIntelligenceSession('positive', 'high', ['career', 'growth']);
 *
 * // Export memory for persistence
 * const memory = session.exportRelationshipMemory();
 * await saveToDatabase(memory);
 * ```
 */
export declare function createSessionRuntime(config: SessionRuntimeConfig): Promise<SessionBundleRuntimeManager>;
export default SessionBundleRuntimeManager;
//# sourceMappingURL=session-runtime.d.ts.map