/**
 * Music Memory Integration
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Remembers what music helped in what situations, enabling responses like:
 * - "Last time you were stressed, that jazz really seemed to help..."
 * - "You mentioned before that lo-fi helps you focus..."
 * - "Remember when we played that Debussy piece? You seemed more at peace after."
 *
 * This integrates with the existing memory system to store music-related memories
 * that persist across sessions.
 *
 * Philosophy: Music is deeply personal. The same song can bring joy to one person
 * and sadness to another. We track what works for EACH user.
 */
import type { MusicSessionContext } from './music-session-context.js';
import type { TransitionType } from './intelligent-music-transitions.js';
/**
 * A memory of music that helped the user
 */
export interface MusicHelpedMemory {
    /** Unique memory ID */
    id: string;
    /** User ID */
    userId: string;
    /** When this memory was created */
    createdAt: number;
    /** What emotional state the user was in */
    emotionalContext: {
        state: 'stressed' | 'sad' | 'anxious' | 'overwhelmed' | 'tired' | 'frustrated' | 'celebrating' | 'thinking' | 'general';
        intensity?: number;
        topic?: string;
    };
    /** The music that helped */
    music: {
        trackName?: string;
        artist?: string;
        genre?: string;
        mood?: string;
        wasAmbient: boolean;
    };
    /** How did we know it helped? */
    evidence: {
        /** User's first words after music ended */
        userResponse?: string;
        /** Detected emotional shift */
        emotionalShift?: 'positive' | 'neutral' | 'negative';
        /** Did they continue the session happily? */
        continuedSession: boolean;
        /** Did they explicitly thank or praise the music? */
        explicitPositive: boolean;
        /** Voice tone analysis */
        voiceTone?: 'warmer' | 'calmer' | 'energized' | 'neutral';
    };
    /** What transition worked after the music? */
    effectiveTransition: TransitionType;
    /** Confidence that this was actually helpful (0-1) */
    confidence: number;
    /** Tags for retrieval */
    tags: string[];
}
/**
 * A music preference learned from history
 */
export interface MusicPreference {
    /** Context this preference applies to */
    context: {
        emotionalState?: string;
        timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'lateNight';
        activity?: string;
    };
    /** Preferred music attributes */
    preference: {
        genre?: string;
        mood?: string;
        artist?: string;
        ambientPreferred: boolean;
    };
    /** Strength of this preference (0-1) */
    strength: number;
    /** Number of times this preference was validated */
    validationCount: number;
}
/**
 * Callback phrase when referencing music memories
 */
export interface MusicCallbackPhrase {
    /** The phrase to say */
    phrase: string;
    /** What memory this references */
    memoryId: string;
    /** How confident we are this is appropriate */
    confidence: number;
}
/**
 * Detect emotional context from music session
 */
export declare function detectEmotionalContext(musicContext: MusicSessionContext | null, userMessage?: string): MusicHelpedMemory['emotionalContext'];
/**
 * Detect if music helped based on user response
 */
export declare function detectMusicHelped(userResponse?: string, voiceTone?: 'warmer' | 'calmer' | 'energized' | 'neutral', sessionContinued?: boolean): {
    helped: boolean;
    confidence: number;
    explicitPositive: boolean;
};
/**
 * Store a memory that music helped
 */
export declare function storeMusicHelpedMemory(userId: string, musicContext: MusicSessionContext | null, effectiveTransition: TransitionType, evidence: {
    userResponse?: string;
    voiceTone?: 'warmer' | 'calmer' | 'energized' | 'neutral';
    continuedSession?: boolean;
}): MusicHelpedMemory | null;
/**
 * Find relevant music memories for a context
 */
export declare function findRelevantMemories(userId: string, context: {
    emotionalState?: string;
    topic?: string;
    mood?: string;
}): MusicHelpedMemory[];
/**
 * Get user's music preferences for a context
 */
export declare function getMusicPreferences(userId: string, context?: {
    emotionalState?: string;
}): MusicPreference | null;
/**
 * Generate a callback phrase referencing music memory
 *
 * These phrases make Ferni feel more human by remembering past music moments.
 * Use sparingly - maybe once per session when relevant.
 */
export declare function generateMusicCallback(userId: string, personaId: string, currentContext: {
    emotionalState?: string;
    topic?: string;
}): MusicCallbackPhrase | null;
/**
 * Check if we should mention a music memory (don't do it too often)
 */
export declare function shouldMentionMusicMemory(userId: string, lastMentionTimestamp?: number): boolean;
/**
 * Export user's music memories (for persistence)
 */
export declare function exportUserMusicMemories(userId: string): {
    memories: MusicHelpedMemory[];
    preferences: MusicPreference[];
};
/**
 * Import user's music memories (from persistence)
 */
export declare function importUserMusicMemories(userId: string, data: {
    memories: MusicHelpedMemory[];
    preferences: MusicPreference[];
}): void;
/**
 * Clear all data (for testing)
 */
export declare function clearAllMusicMemories(): void;
/**
 * Get memory stats for a user
 */
export declare function getUserMusicMemoryStats(userId: string): {
    totalMemories: number;
    oldestMemory?: number;
    mostCommonEmotionalState?: string;
    preferredMood?: string;
    hasStrongPreferences: boolean;
};
declare const _default: {
    storeMusicHelpedMemory: typeof storeMusicHelpedMemory;
    findRelevantMemories: typeof findRelevantMemories;
    getMusicPreferences: typeof getMusicPreferences;
    generateMusicCallback: typeof generateMusicCallback;
    shouldMentionMusicMemory: typeof shouldMentionMusicMemory;
    exportUserMusicMemories: typeof exportUserMusicMemories;
    importUserMusicMemories: typeof importUserMusicMemories;
    clearAllMusicMemories: typeof clearAllMusicMemories;
    getUserMusicMemoryStats: typeof getUserMusicMemoryStats;
    detectEmotionalContext: typeof detectEmotionalContext;
    detectMusicHelped: typeof detectMusicHelped;
};
export default _default;
//# sourceMappingURL=music-memory-integration.d.ts.map