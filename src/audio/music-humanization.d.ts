/**
 * 🎵 Music Humanization System
 *
 * Makes music interactions feel natural, fun, engaging, and deeply human.
 * This module adds the "soul" to our DJ system - the moments that make
 * users feel like they're hanging out with a friend who has great taste.
 *
 * Features:
 * - Music Discovery Conversations (asking about preferences, memories)
 * - Active Engagement Detection (vibing vs wanting to talk)
 * - Music as Emotional Mirror (reflecting feelings through music)
 * - Spontaneous Music Moments (proactive offers)
 * - Time-Aware Vibes (different moods for different times)
 * - Musical Humor & Personality (fun DJ moments)
 * - Post-Music Check-ins ("How was that?")
 * - Music as Conversation Bridge (transitions)
 */
/**
 * Pre-warm LLM interjection cache when music starts
 * Call this when you know what track is about to play
 */
export declare function prewarmMusicInterjection(context: TrackContext): Promise<void>;
/**
 * Clear the LLM interjection cache
 */
export declare function clearLLMInterjectionCache(): void;
export interface MusicHumanizationState {
    /** Last time we offered music */
    lastMusicOfferTime: number | null;
    /** Last time music was played */
    lastMusicPlayTime: number | null;
    /** How long user has been silent during music (ms) */
    silenceDuringMusicMs: number;
    /** Whether user seems to be vibing (enjoying quietly) */
    isVibing: boolean;
    /** Current conversation heaviness (0-1) */
    conversationHeaviness: number;
    /** Conversation duration without music (ms) */
    talkingWithoutMusicMs: number;
    /** Last post-music check-in time */
    lastCheckInTime: number | null;
    /** Number of tracks played this session */
    tracksPlayedThisSession: number;
    /** Topics that came up during music */
    musicMomentTopics: string[];
    /** Whether we've done a music discovery conversation */
    hasAskedAboutMusicTaste: boolean;
}
export interface MusicMoment {
    trackName: string;
    artistName: string;
    topic?: string;
    emotion?: string;
    userQuote?: string;
    timestamp: number;
}
export type TimeOfDay = 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'night' | 'late_night';
export interface MusicHumanizationConfig {
    /** Minimum time between music offers (ms) */
    minOfferInterval: number;
    /** Silence threshold to consider user "vibing" (ms) */
    vibingThreshold: number;
    /** Conversation duration before spontaneous offer (ms) */
    spontaneousOfferThreshold: number;
    /** Whether to do post-music check-ins */
    enableCheckIns: boolean;
    /** Probability of fun DJ interjections (0-1) */
    funInterjectionProbability: number;
}
/**
 * Get current time of day for music mood
 */
export declare function getTimeOfDay(): TimeOfDay;
/**
 * Get time-aware music suggestion
 */
export declare function getTimeAwareMusicSuggestion(): {
    searchQuery: string;
    offer: string;
    mood: string;
};
/**
 * Get a music discovery question based on context
 */
export declare function getMusicDiscoveryQuestion(context: 'general' | 'positive_emotion' | 'stressed' | 'nostalgic_moment' | 'deep_conversation' | 'playful_moment'): {
    question: string;
    followUp: string;
} | null;
/**
 * Analyze if user is vibing to the music
 * Returns confidence 0-1
 */
export declare function analyzeVibingBehavior(params: {
    silenceDurationMs: number;
    recentUtterance?: string;
    wasShortResponse: boolean;
}): {
    isVibing: boolean;
    confidence: number;
    reason: string;
};
/**
 * Decide whether to interrupt music for conversation
 */
export declare function shouldInterruptMusic(params: {
    isVibing: boolean;
    userStartedTalking: boolean;
    userAskedQuestion: boolean;
    urgentTopic: boolean;
}): {
    shouldInterrupt: boolean;
    action: 'duck' | 'stop' | 'none';
};
/**
 * Get an emotional mirroring music offer
 */
export declare function getEmotionalMirrorOffer(emotion: string): string | null;
/**
 * Triggers for spontaneous music offers
 */
export interface SpontaneousTrigger {
    type: 'heavy_conversation' | 'long_session' | 'energy_shift' | 'awkward_silence' | 'celebration';
    offer: string;
    searchQuery?: string;
}
/**
 * Check if it's time for a spontaneous music offer
 */
export declare function checkSpontaneousMusicMoment(params: {
    conversationDurationMs: number;
    timeSinceLastMusicMs: number;
    recentTopics: string[];
    emotionalIntensity: number;
    isAwkwardSilence: boolean;
    recentAchievement: boolean;
}): SpontaneousTrigger | null;
/**
 * Track context for generating contextual interjections
 */
export interface TrackContext {
    name?: string;
    artist?: string;
    era?: string;
    genre?: string;
    fact?: string;
}
/**
 * Build a TrackContext from track metadata, enriched with facts from our knowledge base
 *
 * This bridges the music-commentary system with the interjection system,
 * making interjections contextual and educational.
 *
 * @example
 * const context = buildTrackContext('My Way', 'Frank Sinatra');
 * // Returns: { name: 'My Way', artist: 'Frank Sinatra', fact: 'He actually wasn\'t too fond of that song at first.' }
 */
export declare function buildTrackContext(trackName: string, artistName: string, personaId?: string): TrackContext;
/**
 * Get a fun DJ interjection - now LLM-powered with fallbacks!
 *
 * Priority chain:
 * 1. LLM-generated (if cached from prewarm or previous call)
 * 2. Template-based with track context
 * 3. Generic templates
 *
 * @param moment - When in the track lifecycle
 * @param probability - Chance to trigger (0-1, default 0.15)
 * @param trackContext - Optional track metadata for contextual responses
 * @param useLLM - Whether to try LLM generation (default: true)
 */
export declare function getFunInterjection(moment: 'track_start' | 'mid_song' | 'track_end' | 'user_liked' | 'user_skipped', probability?: number, trackContext?: TrackContext, useLLM?: boolean): string | null;
/**
 * Get a fun DJ interjection - async version that waits for LLM
 *
 * Use this when you can afford to wait (e.g., during the 3-second delay before speaking)
 */
export declare function getFunInterjectionAsync(moment: 'track_start' | 'mid_song' | 'track_end' | 'user_liked' | 'user_skipped', probability?: number, trackContext?: TrackContext): Promise<string | null>;
/**
 * Get persona-specific fun moment
 */
export declare function getPersonaFunMoment(personaId: string | undefined | null): string | null;
/**
 * Get a post-music check-in phrase
 * Now LLM-powered with template fallback!
 */
export declare function getPostMusicCheckIn(personaId?: string, wasRequested?: boolean, trackContext?: TrackContext): string;
/**
 * Get a post-music check-in phrase asynchronously
 * Use when you can wait for LLM generation
 */
export declare function getPostMusicCheckInAsync(personaId?: string, wasRequested?: boolean, trackContext?: TrackContext): Promise<string>;
/**
 * Get a conversation bridge phrase
 */
export declare function getConversationBridge(bridgeType: 'heavy_to_light' | 'light_to_deep' | 'closure' | 'opening'): string;
/**
 * Get a music-triggered conversation starter
 */
export declare function getMusicConversationStarter(): string;
/**
 * Main controller for music humanization
 */
export declare class MusicHumanizationController {
    private state;
    private config;
    private personaId;
    private musicMoments;
    constructor(config?: Partial<MusicHumanizationConfig>);
    /**
     * Set persona for personalized interactions
     */
    setPersona(personaId: string | undefined | null): void;
    /**
     * Record that music started playing
     */
    onMusicStarted(trackName: string, artistName: string): void;
    /**
     * Record that music stopped
     */
    onMusicStopped(trackName: string, artistName: string, topic?: string): void;
    /**
     * Update silence duration during music
     */
    updateSilenceDuringMusic(durationMs: number): void;
    /**
     * Check if we should offer music
     */
    shouldOfferMusic(params: {
        conversationDurationMs: number;
        recentTopics: string[];
        emotionalIntensity: number;
        isAwkwardSilence: boolean;
        recentAchievement: boolean;
    }): SpontaneousTrigger | null;
    /**
     * Get time-aware music suggestion
     */
    getTimeAwareSuggestion(): {
        searchQuery: string;
        offer: string;
        mood: string;
    };
    /**
     * Get emotional mirror offer
     */
    getEmotionalOffer(emotion: string): string | null;
    /**
     * Get music discovery question
     */
    getMusicDiscoveryQuestion(context: 'general' | 'positive_emotion' | 'stressed' | 'nostalgic_moment' | 'deep_conversation' | 'playful_moment'): {
        question: string;
        followUp: string;
    } | null;
    /**
     * Get post-music check-in
     */
    getCheckIn(wasRequested: boolean): string;
    /**
     * Get fun interjection (if lucky!)
     * Pass trackContext for contextual, knowledge-based responses
     */
    getFunInterjection(moment: 'track_start' | 'mid_song' | 'track_end' | 'user_liked' | 'user_skipped', trackContext?: TrackContext): string | null;
    /**
     * Get persona-specific fun moment
     */
    getPersonaFunMoment(): string | null;
    /**
     * Get conversation bridge
     */
    getConversationBridge(bridgeType: 'heavy_to_light' | 'light_to_deep' | 'closure' | 'opening'): string;
    /**
     * Check if user is vibing
     */
    isUserVibing(): boolean;
    /**
     * Get recent music moments for callbacks
     */
    getRecentMoments(): MusicMoment[];
    /**
     * Get session stats
     */
    getSessionStats(): {
        tracksPlayed: number;
        hasAskedAboutMusic: boolean;
        recentMoments: number;
    };
    /**
     * Reset for new session
     */
    reset(): void;
}
export declare function getMusicHumanization(): MusicHumanizationController;
export declare function resetMusicHumanization(): void;
declare const _default: {
    MusicHumanizationController: typeof MusicHumanizationController;
    getMusicHumanization: typeof getMusicHumanization;
    resetMusicHumanization: typeof resetMusicHumanization;
    getTimeAwareMusicSuggestion: typeof getTimeAwareMusicSuggestion;
    getMusicDiscoveryQuestion: typeof getMusicDiscoveryQuestion;
    analyzeVibingBehavior: typeof analyzeVibingBehavior;
    shouldInterruptMusic: typeof shouldInterruptMusic;
    getEmotionalMirrorOffer: typeof getEmotionalMirrorOffer;
    checkSpontaneousMusicMoment: typeof checkSpontaneousMusicMoment;
    getFunInterjection: typeof getFunInterjection;
    getFunInterjectionAsync: typeof getFunInterjectionAsync;
    getPersonaFunMoment: typeof getPersonaFunMoment;
    getPostMusicCheckIn: typeof getPostMusicCheckIn;
    getPostMusicCheckInAsync: typeof getPostMusicCheckInAsync;
    getConversationBridge: typeof getConversationBridge;
    getMusicConversationStarter: typeof getMusicConversationStarter;
    getTimeOfDay: typeof getTimeOfDay;
    buildTrackContext: typeof buildTrackContext;
    prewarmMusicInterjection: typeof prewarmMusicInterjection;
    clearLLMInterjectionCache: typeof clearLLMInterjectionCache;
};
export default _default;
//# sourceMappingURL=music-humanization.d.ts.map