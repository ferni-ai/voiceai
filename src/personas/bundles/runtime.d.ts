/**
 * Bundle Runtime Engine
 *
 * Provides runtime access to bundle content with intelligent selection,
 * relationship-aware behavior, and contextual response generation.
 */
import type { LoadedPersonaBundle, PersonaMode, RelationshipStage, VoiceExpression } from './types.js';
/**
 * Bundle runtime state - tracks session and persona state.
 *
 * Required fields are those needed by the BundleRuntimeEngine.
 * For partial state storage (e.g., UserData), use Partial<BundleRuntimeState>
 * or the UserBundleState type alias.
 */
export interface BundleRuntimeState {
    personaId: string;
    relationshipTurns: number;
    sessionCount: number;
    currentMode: string;
    lastStoryTurn: number;
    storiesToldThisSession: string[];
    /** Tracks the last mode transition (e.g., "listening_to_coaching") */
    lastModeTransition?: string;
    userName?: string;
    timeOfDay?: string;
    dayOfWeek?: string;
    detectedEmotion?: string;
    moodState?: Record<string, unknown>;
}
/**
 * Subset of BundleRuntimeState for UserData storage.
 * Contains only the fields typically stored on the session.
 */
export type UserBundleState = Pick<BundleRuntimeState, 'relationshipTurns' | 'currentMode' | 'storiesToldThisSession' | 'lastModeTransition'>;
export declare class BundleRuntimeEngine {
    private bundle;
    private state;
    private voiceExpressions;
    private situationalResponses;
    private relationshipStages;
    private memoryPatterns;
    private personaModes;
    private storyGraph;
    private microExpressions;
    private contextualNuances;
    private conflictHandling;
    private innerWorld;
    private sensoryWorld;
    private quirks;
    private cachedSortedStages;
    constructor(bundle: LoadedPersonaBundle, initialState?: Partial<BundleRuntimeState>);
    /** FIX BUG #bundle-7: Timeout for content loading operations */
    private static readonly CONTENT_LOAD_TIMEOUT_MS;
    /**
     * Initialize all extended content (lazy load on first use)
     * FIX BUG #bundle-7: Added timeout to prevent hanging on slow/stuck file operations
     */
    initialize(): Promise<void>;
    /**
     * Update time context for the current session
     *
     * @param userTimezoneOffset - Offset in minutes from UTC (e.g., -480 for PST, +60 for CET)
     *                            Positive = ahead of UTC, Negative = behind UTC
     */
    updateTimeContext(userTimezoneOffset?: number): void;
    /**
     * Set user's timezone offset for time-aware responses
     */
    setUserTimezone(offsetMinutes: number): void;
    /**
     * Get sorted stages with caching for performance.
     * Stages are sorted by turn_threshold descending (highest first).
     */
    private getSortedStages;
    getCurrentRelationshipStage(): RelationshipStage | null;
    getRelationshipStageName(): string;
    applyProgressionTrigger(triggerName: string): void;
    getCurrentMode(): PersonaMode | null;
    /**
     * Detect and set persona mode based on user text or emotional signals
     * FIX BUG #bundle-11: Validate mode exists before setting
     */
    detectAndSetMode(userText: string, emotionalSignal?: string): string;
    getModeTransitionPhrase(fromMode: string, toMode: string): string | null;
    getVoiceExpression(emotionType: string): VoiceExpression | null;
    /**
     * Get a random expression phrase for an emotion
     * FIX BUG #bundle-12: Validate SSML wrapper format before applying
     */
    getRandomExpressionPhrase(emotionType: string): string | null;
    getBreathingPattern(context: string): string | null;
    /**
     * Get situational response for a specific category and situation
     * FIX BUG #bundle-18: Added proper type validation instead of unsafe coercion
     */
    getSituationalResponse(category: 'celebrations' | 'condolences' | 'difficult_moments', situation: string): {
        immediate: string;
        followUp?: string;
        dontSay?: string[];
    } | null;
    getNameUsagePhrase(context: 'opening' | 'mid_sentence' | 'emphasis' | 'warmth'): string | null;
    getCallbackPhrase(type: 'callback_to_earlier' | 'callback_to_previous_session' | 'long_term_memory'): string | null;
    getDetailCallback(category: string): string | null;
    shouldTellStory(currentTurn: number): {
        should: boolean;
        reason?: string;
        confidence?: number;
    };
    getRecommendedStories(context: string): string[];
    /**
     * Get the persona ID from the bundle
     */
    getPersonaId(): string;
    /**
     * Get recommended stories enhanced with evolution engine insights
     * This combines bundle context triggers with community-learned effectiveness
     */
    getRecommendedStoriesWithEvolution(context: {
        topic: string;
        userEmotion: string;
        relationshipStage?: string;
    }, limit?: number): Promise<Array<{
        storyId: string;
        score: number;
        reason: string;
    }>>;
    recordStoryTold(storyId: string, turn: number): void;
    /**
     * Record story usage with feedback for evolution learning
     */
    recordStoryUsage(storyId: string, turn: number, userReaction?: {
        engagement: 'positive' | 'neutral' | 'negative';
        continued: boolean;
        emotionalShift?: string;
    }): Promise<void>;
    getStoryIntroPhrase(): string | null;
    getListeningSound(emotion: 'neutral' | 'concerned' | 'interested' | 'surprised' | 'delighted' | 'sympathetic'): string | null;
    getVocalTexture(type: 'laughter' | 'thinking' | 'acknowledgment' | 'surprise' | 'concern', variant: string): string | null;
    getPacingVariation(context: string): {
        speed: number;
        ssmlPrefix?: string;
    } | null;
    getTimeOfDayGreeting(): string | null;
    getTimeOfDayModifiers(): {
        energyMultiplier: number;
        paceMultiplier: number;
        volume?: string;
    };
    getDayOfWeekAcknowledgment(): string | null;
    detectPushback(userText: string): {
        type: string;
        response: string;
    } | null;
    getPushBackPhrase(context: 'gentle' | 'direct'): string | null;
    getRepairPhrase(type: 'check_in' | 'acknowledge_rupture' | 'rebuild_connection'): string | null;
    /**
     * Load inner world content (called after initialization)
     * FIX BUG #bundle-4: Log specific file errors for debugging
     */
    loadInnerWorld(): Promise<void>;
    /**
     * Get a self-talk phrase for when the persona is struggling
     */
    getSelfTalk(context: 'struggling' | 'critic' | 'champion' | 'mantra'): string | null;
    /**
     * Get a random self-talk pattern
     */
    getRandomSelfTalk(): string | null;
    /**
     * Get a contradiction (belief vs behavior) to make the persona feel more human
     */
    getContradiction(): {
        belief: string;
        but: string;
    } | null;
    /**
     * Get public vs private self for moments of vulnerability
     */
    getPublicPrivateSelf(): {
        public_self: string;
        private_self: string;
    } | null;
    /**
     * Get a sensory memory triggered by something in the conversation
     */
    getSensoryMemory(trigger: string): {
        trigger: string;
        memory: string;
        emotion: string;
    } | null;
    /**
     * Get a random sensory memory for storytelling
     */
    getRandomSensoryMemory(): {
        trigger: string;
        memory: string;
        emotion: string;
    } | null;
    /**
     * Check if user message triggers an emotional flashpoint
     */
    detectEmotionalFlashpoint(userText: string): {
        type: 'tears' | 'anger' | 'joy' | 'shutdown';
        trigger: string;
    } | null;
    /**
     * Get an unfinished business item (regret, unresolved question)
     */
    getRegret(): string | null;
    /**
     * Get what keeps them up at night
     */
    getWhatKeepsThemUp(): string | null;
    /**
     * Get legacy hope
     */
    getLegacyHope(): string | null;
    /**
     * Get a secret fear
     */
    getSecretFear(): string | null;
    /**
     * Get a guilty admission (for moments of vulnerability)
     */
    getGuiltyAdmission(): string | null;
    /**
     * Get their line they won't cross
     */
    getLineWontCross(): string | null;
    /**
     * Get value hierarchy
     */
    getValueHierarchy(): string[] | null;
    /**
     * Get a phrase they uniquely use (voice fingerprint)
     */
    getSignaturePhrase(): string | null;
    /**
     * Get a word only they use
     */
    getUniqueWord(): string | null;
    /**
     * Get a verbal tic
     */
    getVerbalTic(): string | null;
    /**
     * Get a mentor quote
     */
    getMentorQuote(): {
        mentor: string;
        quote: string;
        lesson: string;
    } | null;
    /**
     * Get music for mood
     */
    getMusicForMood(mood: string): string | null;
    /**
     * Get what fills their soul (sounds)
     */
    getSoulFillingSounds(): string[] | null;
    /**
     * Get their growth edge (something they're working on)
     */
    getGrowthEdge(): string | null;
    /**
     * Get their recharge method
     */
    getRechargeMethod(): string | null;
    /**
     * Get how the persona moves/carries themselves
     */
    getPhysicalPresence(): {
        howTheyMove?: string;
        signatureGestures?: string[];
        posture?: string;
        eyeContact?: string;
        energyInRoom?: string;
        physicalQuirks?: string[];
    } | null;
    /**
     * Get a random signature gesture
     */
    getSignatureGesture(): string | null;
    /**
     * Get a random physical quirk
     */
    getPhysicalQuirk(): string | null;
    /**
     * Get their energy in a room description
     */
    getEnergyInRoom(): string | null;
    /**
     * Get daily rhythms
     */
    getDailyRhythms(): {
        morningRitual?: string;
        whatTheyDoFirst?: string;
        endOfDayRitual?: string;
        sacredWeeklyTime?: string;
        exerciseRelationship?: string;
        howTheyRecharge?: string;
    } | null;
    /**
     * Get environment where they thrive
     */
    getEnvironmentWhereThrives(): string | null;
    /**
     * Get environment that drains them
     */
    getEnvironmentThatDrains(): string | null;
    /**
     * Get team dynamics for a specific team member
     */
    getTeamDynamic(teamMemberId: string): {
        howWeInteract?: string;
        whatTheyGiveMe?: string;
        whatIGiveThem?: string;
        whatIAdmire?: string;
    } | null;
    /**
     * Get all team member IDs this persona has dynamics for
     */
    getTeamMemberIds(): string[];
    /**
     * Get what this persona admires about a team member
     */
    getWhatIAdmire(teamMemberId: string): string | null;
    /**
     * Get how this persona interacts with a team member
     */
    getHowWeInteract(teamMemberId: string): string | null;
    /**
     * Get a random habit the persona has
     * Uses variety tracking when sessionId provided to prevent repetition
     */
    getHabit(sessionId?: string): string | null;
    /**
     * Get a guilty pleasure to share in vulnerable moments
     * Uses variety tracking when sessionId provided to prevent repetition
     */
    getGuiltyPleasure(sessionId?: string): string | null;
    /**
     * Get a strong opinion the persona holds
     * Uses variety tracking when sessionId provided to prevent repetition
     */
    getStrongOpinion(sessionId?: string): string | null;
    /**
     * Get something the persona is not good at (makes them relatable)
     * Uses variety tracking when sessionId provided to prevent repetition
     */
    getWeakness(sessionId?: string): string | null;
    /**
     * Get something the persona might be "caught doing" when you arrive
     * Makes introductions feel alive - they were in the middle of something
     * Uses variety tracking when sessionId provided to prevent repetition
     */
    getCaughtDoing(sessionId?: string): string | null;
    /**
     * Get all quirks for a specific category
     */
    getQuirksCategory(category: 'habits' | 'guilty_pleasures' | 'strong_opinions' | 'not_good_at'): string[];
    /**
     * Check if quirks are loaded
     */
    hasQuirks(): boolean;
    /**
     * Check if inner world content is loaded
     */
    hasInnerWorld(): boolean;
    /**
     * Get a "humanizing moment" - something that makes the persona feel real
     */
    getHumanizingMoment(): {
        type: string;
        content: string;
    } | null;
    incrementTurn(): void;
    incrementSession(): void;
    /**
     * Set the user's name
     * FIX BUG #bundle-17: Validate input to prevent empty/invalid names
     */
    setUserName(name: string): void;
    /**
     * Set the detected user emotion
     */
    setDetectedEmotion(emotion: string): void;
    getState(): Readonly<BundleRuntimeState>;
    /**
     * Get serializable state for persistence across reconnects
     * FIX BUG #bundle-9 & #bundle-16: Enable persistence of session-specific state
     */
    getSerializableState(): {
        storiesToldThisSession: string[];
        sessionCount: number;
        relationshipTurns: number;
        lastStoryTurn: number;
        currentMode: string;
        userName?: string;
    };
    /**
     * Restore state from persisted data
     * FIX BUG #bundle-9 & #bundle-16: Restore session state on reconnect
     */
    restoreFromPersistedState(persisted: {
        storiesToldThisSession?: string[];
        sessionCount?: number;
        relationshipTurns?: number;
        lastStoryTurn?: number;
        currentMode?: string;
        userName?: string;
    }): void;
    /**
     * Update state with validation
     * FIX BUG #65: Validate incoming data to prevent state corruption
     */
    updateState(updates: Partial<BundleRuntimeState>): void;
}
/**
 * Session-scoped runtime engine manager.
 * FIX BUG #bundle-1: Prevents cross-session contamination by keying engines
 * by both sessionId AND personaId.
 */
export declare class SessionBundleRuntimeManager {
    private engines;
    private sessionId;
    constructor(sessionId: string);
    /**
     * Get or create a runtime engine for a persona in this session
     */
    getOrCreateRuntime(bundle: LoadedPersonaBundle, initialState?: Partial<BundleRuntimeState>): Promise<BundleRuntimeEngine>;
    /**
     * Get an existing runtime for a persona (if it exists)
     */
    getRuntime(personaId: string): BundleRuntimeEngine | null;
    /**
     * Clear all runtimes for this session
     */
    clear(): void;
    /**
     * Get count of runtimes in this session
     */
    get size(): number;
}
/**
 * Create a bundle runtime (backward-compatible global version)
 * @deprecated Use SessionBundleRuntimeManager for session isolation
 */
export declare function createBundleRuntime(bundle: LoadedPersonaBundle, initialState?: Partial<BundleRuntimeState>): Promise<BundleRuntimeEngine>;
//# sourceMappingURL=runtime.d.ts.map