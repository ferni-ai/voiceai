/**
 * Memory Management Service
 *
 * Advanced memory operations for the voice AI system:
 * - Phone→User cache persistence (fast lookups after restart)
 * - Memory consolidation (merge duplicate profiles)
 * - Voice sketch matching ("Your voice sounds familiar")
 * - Proactive memory retrieval (spontaneous recall)
 * - Memory pruning (cleanup old/low-value data)
 *
 * This service makes the AI feel genuinely human by remembering
 * users across sessions, devices, and even voice recognition.
 */
import { type MemoryStore } from '../../memory/index.js';
import type { UserProfile, VoiceSketch } from '../../types/user-profile.js';
/**
 * Load phone mappings from Firestore into memory cache
 * Called once on startup for fast subsequent lookups
 */
export declare function loadPhoneCache(): Promise<number>;
/**
 * Save a phone→user mapping to Firestore
 */
export declare function savePhoneMapping(phone: string, userId: string): Promise<void>;
/**
 * Get cached phone→user mapping (O(1) lookup)
 */
export declare function getCachedPhoneMapping(phone: string): string | undefined;
/**
 * Delete a phone mapping
 */
export declare function deletePhoneMapping(phone: string): Promise<void>;
export interface ConsolidationResult {
    primaryProfileId: string;
    mergedProfileIds: string[];
    mergedConversations: number;
    mergedKeyMoments: number;
    mergedGoals: number;
}
/**
 * Find potential duplicate profiles for a user
 * Based on: same phone, same email, similar voice sketch, overlapping linked identifiers
 */
export declare function findDuplicateProfiles(profile: UserProfile, store?: MemoryStore): Promise<UserProfile[]>;
/**
 * Merge multiple profiles into one primary profile
 * Combines conversation history, key moments, goals, and preferences
 */
export declare function consolidateProfiles(primaryProfile: UserProfile, profilesToMerge: UserProfile[], store?: MemoryStore): Promise<ConsolidationResult>;
/**
 * Compare two voice sketches and return similarity score (0-1)
 * Used for "Your voice sounds familiar" recognition
 */
export declare function compareVoiceSketches(sketch1: VoiceSketch, sketch2: VoiceSketch): number;
/**
 * Find profiles with similar voice sketches
 * Returns profiles sorted by similarity (highest first)
 */
export declare function findProfilesByVoice(voiceSketch: VoiceSketch, store?: MemoryStore, minSimilarity?: number): Promise<Array<{
    profile: UserProfile;
    similarity: number;
}>>;
/**
 * Generate a natural "voice recognition" greeting
 */
export declare function generateVoiceRecognitionGreeting(similarity: number, userName?: string): string | null;
export interface ProactiveMemory {
    type: 'key_moment' | 'goal_progress' | 'follow_up' | 'anniversary' | 'pattern';
    priority: 'high' | 'medium' | 'low';
    content: string;
    suggestedMention: string;
    relevanceScore: number;
    sourceId?: string;
}
/**
 * Get proactive memories to potentially bring up in conversation
 * These are things the agent "spontaneously" remembers about the user
 */
export declare function getProactiveMemories(profile: UserProfile, currentTopic?: string, turnCount?: number): Promise<ProactiveMemory[]>;
/**
 * Decide whether to surface a proactive memory in conversation
 * Based on turn count, conversation flow, and memory priority
 */
export declare function shouldSurfaceMemory(memory: ProactiveMemory, turnCount: number, lastMemorySurfacedTurn?: number): boolean;
export interface PruningResult {
    vectorsRemoved: number;
    summariesRemoved: number;
    oldMomentsArchived: number;
    spaceSavedEstimate: string;
}
export interface PruningConfig {
    /** Max age for conversation summaries (days) */
    maxSummaryAgeDays?: number;
    /** Max age for vector embeddings (days) */
    maxVectorAgeDays?: number;
    /** Minimum similarity score for vectors to keep */
    minVectorScore?: number;
    /** Max key moments per user */
    maxKeyMomentsPerUser?: number;
    /** Max conversation summaries per user */
    maxSummariesPerUser?: number;
    /** Whether to actually delete (false = dry run) */
    dryRun?: boolean;
}
/**
 * Prune old and low-value memory data
 * Should be run periodically (e.g., weekly cron job)
 */
export declare function pruneMemorySystem(config?: PruningConfig, store?: MemoryStore): Promise<PruningResult>;
/**
 * Initialize the memory management service
 * Should be called once on startup
 */
export declare function initializeMemoryManagement(): Promise<void>;
/**
 * Shutdown the memory management service
 */
export declare function shutdownMemoryManagement(): Promise<void>;
declare const _default: {
    loadPhoneCache: typeof loadPhoneCache;
    savePhoneMapping: typeof savePhoneMapping;
    getCachedPhoneMapping: typeof getCachedPhoneMapping;
    deletePhoneMapping: typeof deletePhoneMapping;
    findDuplicateProfiles: typeof findDuplicateProfiles;
    consolidateProfiles: typeof consolidateProfiles;
    compareVoiceSketches: typeof compareVoiceSketches;
    findProfilesByVoice: typeof findProfilesByVoice;
    generateVoiceRecognitionGreeting: typeof generateVoiceRecognitionGreeting;
    getProactiveMemories: typeof getProactiveMemories;
    shouldSurfaceMemory: typeof shouldSurfaceMemory;
    pruneMemorySystem: typeof pruneMemorySystem;
    initializeMemoryManagement: typeof initializeMemoryManagement;
    shutdownMemoryManagement: typeof shutdownMemoryManagement;
};
export default _default;
//# sourceMappingURL=memory-management.d.ts.map