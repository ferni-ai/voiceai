/**
 * Music Session Context Tracker
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * When music plays, it's not just background noise — it's a MOMENT in the conversation.
 * This module tracks WHY music started so we can return to the conversation intelligently.
 *
 * Example scenarios:
 * - User shared something heavy → Ferni played calming music → Music ends
 *   → DON'T say "Ready to continue?" → DO stay quiet or say "I'm here."
 *
 * - User celebrated a win → Ferni played upbeat music → Music ends
 *   → DON'T say generic "That was nice" → DO say "That felt good! What's next?"
 *
 * - User asked for music while thinking → Music ends
 *   → Reference what they were thinking about → "So... that decision you mentioned?"
 */
/**
 * Why did music start playing?
 * This dramatically affects how we should transition back.
 */
export type MusicStartReason = 'emotional_processing' | 'celebration' | 'comfort' | 'thinking' | 'background' | 'user_request' | 'agent_offer' | 'game' | 'unknown';
/**
 * Full context about the music session
 */
export interface MusicSessionContext {
    /** Why music started playing */
    startReason: MusicStartReason;
    /** The track that was played */
    trackName?: string;
    trackArtist?: string;
    /** Conversation state BEFORE music started */
    topicBeforeMusic?: string;
    lastUserMessageBeforeMusic?: string;
    emotionalToneBeforeMusic?: 'heavy' | 'light' | 'neutral' | 'crisis';
    /** User state when music started */
    userEmotionBeforeMusic?: string;
    userEmotionIntensity?: number;
    /** Was the user in the middle of sharing something? */
    wasUserMidThought?: boolean;
    /** Key moments or context to potentially reference */
    memorableMomentsBeforeMusic?: string[];
    /** Relationship context */
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'close_friend';
    /** User's name if known */
    userName?: string;
    /** Timestamps */
    musicStartedAt: number;
    musicEndedAt?: number;
    /** How long did the music play? (affects transition) */
    durationMs?: number;
    /** Was this ambient music or user-requested? */
    wasAmbient: boolean;
}
/**
 * Input for starting music context tracking
 */
export interface MusicContextInput {
    startReason: MusicStartReason;
    trackName?: string;
    trackArtist?: string;
    topicBeforeMusic?: string;
    lastUserMessage?: string;
    emotionalTone?: 'heavy' | 'light' | 'neutral' | 'crisis';
    userEmotion?: string;
    userEmotionIntensity?: number;
    wasUserMidThought?: boolean;
    memorableMoments?: string[];
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'close_friend';
    userName?: string;
    wasAmbient?: boolean;
}
/**
 * Start tracking a music session
 *
 * Call this when music starts playing to capture the conversation context.
 * This context will be used when music ends to generate intelligent transitions.
 *
 * @param sessionId - The voice session ID
 * @param input - Context about why music is starting
 */
export declare function startMusicContext(sessionId: string, input: MusicContextInput): void;
/**
 * Get the current music session context
 *
 * @param sessionId - The voice session ID
 * @returns The music session context, or null if no music is playing
 */
export declare function getMusicContext(sessionId: string): MusicSessionContext | null;
/**
 * End the music session and calculate duration
 *
 * Call this when music stops to finalize the context.
 *
 * @param sessionId - The voice session ID
 * @returns The finalized music session context with duration
 */
export declare function endMusicContext(sessionId: string): MusicSessionContext | null;
/**
 * Clear the music session context
 *
 * Call this after the transition has been handled.
 *
 * @param sessionId - The voice session ID
 */
export declare function clearMusicContext(sessionId: string): void;
/**
 * Infer the music start reason from conversation context
 *
 * Use this when we don't have explicit reason but can infer from context.
 * Enhanced to detect user music requests from their actual words.
 *
 * @param emotionalTone - Recent emotional tone
 * @param lastMessage - Last user message
 * @param wasUserRequested - Did user request music?
 * @param isAmbient - Was this ambient/silence-filling music?
 * @returns Inferred start reason
 */
export declare function inferMusicStartReason(emotionalTone?: 'heavy' | 'light' | 'neutral' | 'crisis', lastMessage?: string, wasUserRequested?: boolean, isAmbient?: boolean): MusicStartReason;
/**
 * Detect if user was mid-thought when music started
 *
 * @param lastMessage - Last user message
 * @returns Whether user seemed to be mid-thought
 */
export declare function detectMidThought(lastMessage?: string): boolean;
declare const _default: {
    startMusicContext: typeof startMusicContext;
    getMusicContext: typeof getMusicContext;
    endMusicContext: typeof endMusicContext;
    clearMusicContext: typeof clearMusicContext;
    inferMusicStartReason: typeof inferMusicStartReason;
    detectMidThought: typeof detectMidThought;
};
export default _default;
//# sourceMappingURL=music-session-context.d.ts.map