/**
 * Alive Entrances - Making Handoff Transitions Feel Human
 *
 * This system generates entrances that feel like a real person being
 * called over to help, not a robot switching modes.
 *
 * Key principles:
 * 1. CONTEXT BLEEDING - User's emotional state affects entrance energy
 * 2. CAUGHT IN A MOMENT - They were doing something when called
 * 3. RELATIONSHIP MEMORY - Different for 1st vs 10th meeting
 * 4. TIME AWARENESS - Late night vs morning energy
 * 5. SELF-AWARE HUMOR - Acknowledge their own patterns after repeat visits
 * 6. IMPERFECTION - Sometimes trail off, restart, get distracted
 *
 * The goal: Make handoffs feel like a colleague walking over, not a mode switch.
 */
import type { BundleRuntimeEngine } from './bundles/runtime.js';
import { type VoiceEmotionEntranceContext } from './voice-emotion-entrances.js';
/** Clear the entrance config cache (useful for hot reload) */
export declare function clearEntranceConfigCache(): void;
export interface EntranceContext {
    personaId: string;
    personaName: string;
    userMood: 'stressed' | 'neutral' | 'excited' | 'sad' | 'confused' | 'unknown';
    precedingTopic?: string;
    meetingCount: number;
    lastTopicWithAgent?: string;
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    timeOfDay: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night';
    referringAgent?: string;
    userName?: string;
}
export interface AliveEntranceResult {
    entrance: string;
    style: 'caught_moment' | 'calm_support' | 'matched_energy' | 'self_aware' | 'time_appropriate' | 'memory_callback' | 'relationship_based' | 'static_fallback';
    components?: {
        caughtDoing?: string;
        moodAdaptation?: string;
        selfAwareElement?: string;
        memoryReference?: string;
        relationshipStage?: string;
        warmthLevel?: string;
    };
}
declare function getTimeOfDay(): EntranceContext['timeOfDay'];
interface PersonaEntranceConfig {
    acknowledgments: string[];
    selfAwareHumor: string[];
    calmSupport: string[];
    matchedExcitement: string[];
    quietModes: string[];
    caughtFramings: string[];
    memoryCallbacks: string[];
}
declare const HARDCODED_ENTRANCE_CONFIGS: Record<string, PersonaEntranceConfig>;
/**
 * Generate an "alive" entrance that adapts to context
 * Uses runtime quirks data and conversation context
 */
export declare function generateAliveEntrance(runtime: BundleRuntimeEngine | null, personaId: string, options?: {
    userMood?: EntranceContext['userMood'];
    precedingTopic?: string;
    meetingCount?: number;
    lastTopicWithAgent?: string;
    relationshipStage?: EntranceContext['relationshipStage'];
    referringAgent?: string;
    userName?: string;
    /** Session ID for variety tracking - prevents repetitive quirks */
    sessionId?: string;
    /** Voice emotion context for better-than-human entrance adaptation */
    voiceEmotion?: VoiceEmotionEntranceContext;
}): Promise<AliveEntranceResult | null>;
/**
 * Simple function to get an alive entrance with minimal context
 * Use this when you don't have full conversation context
 */
export declare function getAliveEntrance(personaId: string, runtime?: BundleRuntimeEngine | null, userMood?: EntranceContext['userMood']): Promise<string>;
/**
 * Get an alive entrance for a handoff event
 * This is the main entry point for the handoff system
 *
 * @param personaId - The persona being handed off to
 * @param options - Context about the handoff
 * @returns Entrance string or null if should fall back to static
 */
export declare function getAliveEntranceForHandoff(personaId: string, options?: {
    userMood?: EntranceContext['userMood'];
    precedingTopic?: string;
    meetingCount?: number;
    lastTopicWithAgent?: string;
    relationshipStage?: EntranceContext['relationshipStage'];
    referringAgent?: string;
    userName?: string;
    runtime?: BundleRuntimeEngine | null;
    voiceEmotion?: VoiceEmotionEntranceContext;
}): Promise<string | null>;
/**
 * Detect user mood from recent conversation context
 * This is a simplified version - could be enhanced with emotion detection
 */
export declare function detectUserMoodFromContext(lastUserMessage?: string, lastEmotionAnalysis?: {
    primary: string;
    intensity: number;
    distressLevel?: number;
}): EntranceContext['userMood'];
export { getTimeOfDay, HARDCODED_ENTRANCE_CONFIGS };
//# sourceMappingURL=alive-entrances.d.ts.map