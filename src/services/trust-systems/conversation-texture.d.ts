/**
 * Conversation Texture - The "Feel" of Past Conversations
 *
 * "Our talks usually feel exploratory. Today felt heavier."
 *
 * Philosophy: Real friends remember not just what was said, but the
 * texture of conversations - were they playful? Heavy? Exploratory?
 * Fast-paced or contemplative? This creates a sense of shared history
 * and helps calibrate the current conversation.
 *
 * What we track:
 * - Conversation rhythm (rapid back-and-forth vs. long pauses)
 * - Emotional tone (playful, serious, vulnerable, analytical)
 * - Depth level (surface chat vs. deep exploration)
 * - Energy pattern (building, steady, winding down)
 * - Topics and how they were approached
 *
 * When to reference:
 * - When current conversation differs from usual pattern
 * - When returning to similar topics
 * - At session start for context
 *
 * @module services/trust-systems/conversation-texture
 */
/** How was the emotional tone of the conversation? */
export type ConversationTone = 'playful' | 'serious' | 'vulnerable' | 'analytical' | 'exploratory' | 'supportive' | 'celebratory' | 'reflective' | 'mixed';
/** How deep did the conversation go? */
export type DepthLevel = 'surface' | 'moderate' | 'deep' | 'profound';
/** What was the conversation rhythm? */
export type ConversationRhythm = 'rapid' | 'flowing' | 'contemplative' | 'variable';
/** What was the energy pattern? */
export type EnergyPattern = 'building' | 'steady' | 'winding_down' | 'peaks_and_valleys';
/** A single conversation texture snapshot */
export interface ConversationTextureSnapshot {
    id: string;
    userId: string;
    personaId: string;
    sessionId: string;
    /** Primary tone of the conversation */
    primaryTone: ConversationTone;
    /** Secondary tones if mixed */
    secondaryTones?: ConversationTone[];
    /** How deep did we go? */
    depth: DepthLevel;
    /** What was the rhythm? */
    rhythm: ConversationRhythm;
    /** Energy pattern */
    energy: EnergyPattern;
    /** Key topics discussed */
    topics: string[];
    /** Brief summary of what made this conversation unique */
    signature?: string;
    /** Turn count */
    turnCount: number;
    /** Duration in minutes */
    durationMinutes: number;
    /** Timestamp */
    createdAt: Date;
    /** Any memorable moments */
    memorableMoments?: string[];
}
/** User's conversation texture profile */
export interface ConversationTextureProfile {
    userId: string;
    personaId: string;
    /** All conversation textures with this persona */
    snapshots: ConversationTextureSnapshot[];
    /** Computed patterns */
    patterns: {
        /** Most common tone with this persona */
        usualTone: ConversationTone;
        /** Typical depth */
        usualDepth: DepthLevel;
        /** Typical rhythm */
        usualRhythm: ConversationRhythm;
        /** Topics we frequently explore together */
        frequentTopics: string[];
        /** Total conversations */
        conversationCount: number;
    };
    /** Last updated */
    lastUpdated: Date;
}
/**
 * Start tracking texture for a new session
 */
export declare function startSessionTexture(userId: string, personaId: string, sessionId: string): void;
/**
 * Record a tone signal from the current turn
 */
export declare function recordToneSignal(userId: string, tone: ConversationTone, confidence?: number): void;
/**
 * Record depth level for the current turn
 */
export declare function recordDepthSignal(userId: string, depth: DepthLevel): void;
/**
 * Record topics discussed
 */
export declare function recordTopics(userId: string, topics: string[]): void;
/**
 * Record a memorable moment
 */
export declare function recordMemorableMoment(userId: string, moment: string): void;
/**
 * Detect tone from user message content and emotion
 */
export declare function detectTone(params: {
    userText: string;
    emotion?: string;
    isVulnerable?: boolean;
    isBreakthrough?: boolean;
    hasProblemSolving?: boolean;
}): ConversationTone;
/**
 * Detect depth level from message content
 */
export declare function detectDepth(params: {
    userText: string;
    isVulnerable?: boolean;
    isPersonal?: boolean;
    turnCount?: number;
}): DepthLevel;
/**
 * Finalize the session and create a texture snapshot
 */
export declare function finalizeSessionTexture(userId: string): ConversationTextureSnapshot | null;
export interface TextureComparison {
    /** Is current session different from usual? */
    isDifferent: boolean;
    /** What's different */
    differences: string[];
    /** Natural phrase to reference the difference */
    phrase?: string;
    /** Should we mention this? */
    shouldMention: boolean;
}
/**
 * Compare current session to usual patterns
 */
export declare function compareToUsual(userId: string, personaId: string, currentTone?: ConversationTone, currentDepth?: DepthLevel): TextureComparison;
/**
 * Get a summary of usual conversation texture with a persona
 */
export declare function getUsualTextureSummary(userId: string, personaId: string): string | null;
/**
 * Get the most recent conversation summary for context
 */
export declare function getRecentTextureSummary(userId: string, personaId: string): string | null;
/**
 * Load texture profile from persistence
 */
export declare function loadTextureProfile(userId: string, personaId: string, data: ConversationTextureProfile): void;
/**
 * Get texture profile for persistence
 */
export declare function getTextureProfileForPersistence(userId: string, personaId: string): ConversationTextureProfile | null;
/**
 * Clear texture data for a user (for testing)
 */
export declare function clearUserTexture(userId: string, personaId: string): void;
declare const _default: {
    startSessionTexture: typeof startSessionTexture;
    recordToneSignal: typeof recordToneSignal;
    recordDepthSignal: typeof recordDepthSignal;
    recordTopics: typeof recordTopics;
    recordMemorableMoment: typeof recordMemorableMoment;
    detectTone: typeof detectTone;
    detectDepth: typeof detectDepth;
    finalizeSessionTexture: typeof finalizeSessionTexture;
    compareToUsual: typeof compareToUsual;
    getUsualTextureSummary: typeof getUsualTextureSummary;
    getRecentTextureSummary: typeof getRecentTextureSummary;
    loadTextureProfile: typeof loadTextureProfile;
    getTextureProfileForPersistence: typeof getTextureProfileForPersistence;
    clearUserTexture: typeof clearUserTexture;
};
export default _default;
//# sourceMappingURL=conversation-texture.d.ts.map