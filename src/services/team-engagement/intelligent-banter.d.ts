/**
 * Intelligent Banter Service
 *
 * Generates contextually-aware handoff banter based on:
 * - Current conversation topic
 * - User emotional state
 * - Handoff count (shorter for repeat transfers)
 * - Relationship depth (warmer for long-time users)
 * - Time of day (energy level adjustment)
 * - Handoff reason (why we're transferring)
 *
 * NOW LLM-DRIVEN: Instead of template-based generation, we provide
 * instructions to the LLM to generate natural, contextual banter.
 * This makes handoffs feel more genuine and responsive to the moment.
 *
 * @module team-engagement/intelligent-banter
 */
export interface BanterContext {
    /** Current conversation topic if detected */
    currentTopic?: string;
    /** User's detected emotional state */
    userEmotion?: 'positive' | 'neutral' | 'negative' | 'stressed' | 'excited';
    /** Number of handoffs in this session (use for brevity) */
    handoffCountThisSession?: number;
    /** Is this a first-time user? */
    isFirstTimeUser?: boolean;
    /** Time of day */
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    /** User's name if known */
    userName?: string;
    /** Reason for handoff if known */
    handoffReason?: string;
    /** Total sessions with this user (relationship depth) */
    totalSessions?: number;
    /** Relationship stage */
    relationshipStage?: 'new' | 'building' | 'established' | 'deep';
}
export interface IntelligentBanterResult {
    /** Banter for departing persona (soft open) */
    softOpenBanter: string;
    /** Banter for arriving persona */
    arrivingBanter: string;
    /** Whether intelligent banter was used (vs fallback) */
    wasIntelligent: boolean;
    /** Debug info about what context was used */
    contextUsed?: {
        topic?: string;
        emotion?: string;
        timeOfDay?: string;
        relationshipDepth?: string;
        handoffReason?: string;
    };
}
/**
 * Detect time of day from current hour
 */
export declare function detectTimeOfDay(hour?: number): 'morning' | 'afternoon' | 'evening' | 'night';
/**
 * Get intelligent, context-aware banter for handoffs
 *
 * Now includes:
 * - Topic detection from conversation
 * - Emotion-aware responses
 * - Time-of-day energy adjustment
 * - Relationship depth warmth
 * - Handoff reason acknowledgment
 * - Brevity for repeat transfers
 *
 * Falls back to static banter if context unavailable or generation fails.
 *
 * @example
 * const banter = getIntelligentBanter('ferni', 'alex-chen', {
 *   currentTopic: 'scheduling a meeting',
 *   userEmotion: 'stressed',
 *   handoffCountThisSession: 1,
 *   timeOfDay: 'morning',
 *   totalSessions: 15,
 *   handoffReason: 'calendar help',
 * });
 */
export declare function getIntelligentBanter(fromPersonaId: string, toPersonaId: string, context?: BanterContext): IntelligentBanterResult;
/**
 * Build banter context from session services
 *
 * Helper to extract relevant context from SessionServices for intelligent banter.
 */
export declare function buildBanterContext(options: {
    historyTopics?: string[];
    detectedEmotion?: string;
    handoffCount?: number;
    isFirstTimeUser?: boolean;
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    userName?: string;
    handoffReason?: string;
    totalSessions?: number;
    relationshipStage?: string;
}): BanterContext;
/**
 * Instructions for LLM to generate soft open banter (departing persona)
 */
export interface LLMBanterInstructions {
    /** Instructions for generateReply() */
    instructions: string;
    /** Whether to allow interruptions */
    allowInterruptions: boolean;
    /** Fallback text if LLM generation fails or times out */
    fallback: string;
    /** Type of banter */
    type: 'soft_open' | 'arriving';
}
/**
 * Build LLM instructions for soft open banter (departing persona introduces arriving)
 */
export declare function buildLLMSoftOpenInstructions(fromPersonaId: string, toPersonaId: string, context: BanterContext): LLMBanterInstructions;
/**
 * Build LLM instructions for arriving banter (new persona greets user)
 */
export declare function buildLLMArrivingInstructions(toPersonaId: string, fromPersonaId: string, context: BanterContext): LLMBanterInstructions;
/**
 * Get LLM-driven banter instructions for a handoff
 *
 * This returns instructions that can be passed to `session.generateReply()`
 * for natural, contextual handoff banter.
 *
 * @example
 * const { softOpen, arriving } = getLLMDrivenBanter('ferni', 'alex-chen', context);
 *
 * // Departing persona says soft open
 * await session.generateReply({ instructions: softOpen.instructions });
 *
 * // [Voice switches]
 *
 * // Arriving persona greets
 * await session.generateReply({ instructions: arriving.instructions });
 */
export declare function getLLMDrivenBanter(fromPersonaId: string, toPersonaId: string, context?: BanterContext): {
    softOpen: LLMBanterInstructions;
    arriving: LLMBanterInstructions;
};
//# sourceMappingURL=intelligent-banter.d.ts.map