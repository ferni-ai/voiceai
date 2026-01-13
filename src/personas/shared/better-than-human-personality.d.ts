/**
 * Shared "Better Than Human" Dynamic Personality System
 *
 * Generalizes Ferni's personality system to work with ALL personas.
 * Each persona gets the same "superhuman" capabilities:
 * - 8-dimensional context sensing
 * - Real-time noticing (pauses, energy shifts, topic deflection)
 * - Cross-session resonance learning
 * - Dynamic expression composition
 *
 * Each persona has unique building blocks (passions, opinions, quirks, locations)
 * that make their expressions authentic to their character.
 *
 * @module personas/shared/better-than-human-personality
 */
import type { ThemeCategory } from '../../services/session-variety-tracker.js';
import { type PersonaBuildingBlocks } from './persona-building-blocks.js';
export interface PersonalityContext {
    personaId: string;
    sessionId: string;
    userId?: string;
    turnCount: number;
    timeOfDay: 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night' | 'late_night';
    dayOfWeek: number;
    isWeekend: boolean;
    season?: 'spring' | 'summer' | 'fall' | 'winter';
    currentEmotion?: string;
    emotionalIntensity: number;
    emotionalTrajectory: 'rising' | 'falling' | 'stable' | 'volatile';
    distressLevel: number;
    conversationMomentum: 'opening' | 'cruising' | 'peaking' | 'intimate' | 'closing' | 'stalled';
    lastTopic?: string;
    currentTopic?: string;
    topicShiftDetected: boolean;
    userSpeechPace: 'fast' | 'normal' | 'slow' | 'hesitant';
    pauseBeforeUserSpoke: number;
    voiceEnergyLevel: 'high' | 'medium' | 'low' | 'subdued';
    relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    sharedVulnerabilityCount: number;
    conversationsTotal: number;
    userResonance?: UserResonanceProfile;
    userJustShared?: 'win' | 'struggle' | 'question' | 'story' | 'feeling' | 'request';
    wasPersonalSharing: boolean;
    isHeavyTopic: boolean;
    relevantDomain?: string;
}
/**
 * What resonates with THIS specific user (learned cross-session)
 */
export interface UserResonanceProfile {
    /** Themes that got positive reactions */
    resonantThemes: ThemeCategory[];
    /** Themes that fell flat or felt off */
    avoidThemes: ThemeCategory[];
    /** Personal details user responded warmly to */
    connectionPoints: string[];
    /** User's preferred intimacy level */
    comfortWithVulnerability: 'low' | 'medium' | 'high';
    /** Response lengths user engages with */
    preferredExpressionLength: 'brief' | 'medium' | 'detailed';
    /** Topics user has mentioned (for natural callbacks) */
    userMentionedTopics: string[];
}
export interface ComposedExpression {
    content: string;
    theme: ThemeCategory;
    intimacyLevel: number;
    compositionReason: string;
    shouldBeSubtle: boolean;
    timing: 'immediate' | 'after_pause' | 'mid_response' | 'at_end';
    personaId: string;
}
/**
 * Real-time noticing - what's happening RIGHT NOW
 * This is the "better than human" moment detection
 */
export declare function composeRealtimeNoticing(ctx: PersonalityContext, blocks: PersonaBuildingBlocks): ComposedExpression | null;
export declare function composeTemporalExpression(ctx: PersonalityContext, blocks: PersonaBuildingBlocks): ComposedExpression | null;
export declare function composeConnectionCallback(ctx: PersonalityContext, blocks: PersonaBuildingBlocks): ComposedExpression | null;
export declare function composePassionExpression(ctx: PersonalityContext, blocks: PersonaBuildingBlocks): ComposedExpression | null;
export declare function composeQuirkyExpression(ctx: PersonalityContext, blocks: PersonaBuildingBlocks): ComposedExpression | null;
export declare function composeLocationExpression(ctx: PersonalityContext, blocks: PersonaBuildingBlocks): ComposedExpression | null;
export declare function composeVulnerabilityExpression(ctx: PersonalityContext, blocks: PersonaBuildingBlocks): ComposedExpression | null;
/**
 * Compose personality expression based on full context
 * This is the main composition engine - works for ALL personas
 */
export declare function composeExpression(ctx: PersonalityContext): ComposedExpression | null;
export declare const sharedBetterThanHumanPersonality: {
    composeExpression: typeof composeExpression;
    composeRealtimeNoticing: typeof composeRealtimeNoticing;
    composeTemporalExpression: typeof composeTemporalExpression;
    composeConnectionCallback: typeof composeConnectionCallback;
    composePassionExpression: typeof composePassionExpression;
    composeQuirkyExpression: typeof composeQuirkyExpression;
    composeVulnerabilityExpression: typeof composeVulnerabilityExpression;
};
export default sharedBetterThanHumanPersonality;
//# sourceMappingURL=better-than-human-personality.d.ts.map