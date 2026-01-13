/**
 * Humanization Persistence Layer
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Persists humanization state across sessions:
 * - Voice print (user's unique vocal characteristics)
 * - Cross-session voice memory (track changes over time)
 * - Comfort progression (relationship depth)
 *
 * Storage Schema:
 * ```
 * bogle_users/{userId}/
 *   humanization/
 *     voice_print (document)
 *       - baseline: { avgPitchHz, avgWordsPerMinute, avgEnergyLevel, ... }
 *       - emotionalSignatures: Map<emotion, VoiceSignature>
 *       - temporalPatterns: { morningEnergy, eveningEnergy, weekdayVariance }
 *       - updatedAt: timestamp
 *       - version: number
 *
 *     cross_session (document)
 *       - userId: string
 *       - totalSessions: number
 *       - sessionHistory: SessionSnapshot[]
 *       - detectedChanges: VoiceChange[]
 *       - longTermTrends: { energyTrend, valenceTrend, stressTrend }
 *       - updatedAt: timestamp
 *       - version: number
 *
 *     comfort (document)
 *       - comfortLevel: number
 *       - unlockedBehaviors: string[]
 *       - comfortEvents: ComfortEvent[]
 *       - relationshipStage: string
 *       - updatedAt: timestamp
 * ```
 *
 * @module @ferni/humanization/persistence
 */
import { type CrossSessionVoiceMemory } from './cross-session-voice.js';
import { type VoicePrint } from './voice-print.js';
export interface HumanizationPersistenceBundle {
    userId: string;
    voicePrint?: VoicePrint;
    crossSessionMemory?: CrossSessionVoiceMemory;
    comfortState?: {
        comfortLevel: number;
        unlockedBehaviors: string[];
        relationshipStage: string;
    };
    lastSynced: Date;
    version: number;
}
/**
 * Save voice print to Firestore
 */
export declare function saveVoicePrint(userId: string, voicePrint: VoicePrint): Promise<boolean>;
/**
 * Save cross-session memory to Firestore
 */
export declare function saveCrossSessionMemory(userId: string, memory: CrossSessionVoiceMemory): Promise<boolean>;
/**
 * Save comfort progression state to Firestore
 */
export declare function saveComfortState(userId: string, state: {
    comfortLevel: number;
    unlockedBehaviors: string[];
    relationshipStage: string;
}): Promise<boolean>;
/**
 * Save all humanization data at once (for session end)
 */
export declare function saveAllHumanizationData(userId: string): Promise<{
    success: boolean;
    saved: string[];
    failed: string[];
}>;
/**
 * Load voice print from Firestore
 */
export declare function loadVoicePrint(userId: string): Promise<VoicePrint | null>;
/**
 * Load cross-session memory from Firestore
 */
export declare function loadCrossSessionMemory(userId: string): Promise<CrossSessionVoiceMemory | null>;
/**
 * Load comfort state from Firestore
 */
export declare function loadComfortState(userId: string): Promise<{
    comfortLevel: number;
    unlockedBehaviors: string[];
    relationshipStage: string;
} | null>;
/**
 * Load all humanization data at once (for session start)
 */
export declare function loadAllHumanizationData(userId: string): Promise<HumanizationPersistenceBundle | null>;
/**
 * Initialize humanization engines with persisted data
 *
 * Call this at session start to restore previous state.
 */
export declare function initializeFromPersistence(userId: string, sessionId: string): Promise<{
    loaded: boolean;
    voicePrintRestored: boolean;
    crossSessionRestored: boolean;
    comfortRestored: boolean;
}>;
/**
 * Persist all humanization state at session end
 *
 * Call this when the session ends to save progress.
 */
export declare function persistOnSessionEnd(userId: string, sessionId: string): Promise<{
    saved: boolean;
    items: string[];
}>;
/**
 * Clear all humanization data for a user (for testing/reset)
 */
export declare function clearHumanizationData(userId: string): Promise<boolean>;
//# sourceMappingURL=persistence.d.ts.map