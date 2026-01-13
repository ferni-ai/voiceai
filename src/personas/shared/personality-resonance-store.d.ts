/**
 * Shared Personality Resonance Store
 *
 * Cross-session learning: What personality expressions resonate with THIS user?
 *
 * This is what makes ALL personas "better than human" - a real friend learns
 * what makes you laugh, what references land, what topics feel safe.
 * Most AI forgets every session. We remember and adapt.
 *
 * Storage: Firestore under bogle_users/{userId}/personality_resonance
 *
 * Generalized from: personas/bundles/ferni/personality-resonance-store.ts
 *
 * @module personas/shared/personality-resonance-store
 */
import type { ThemeCategory } from '../../services/session-variety-tracker.js';
import type { UserResonanceProfile } from './better-than-human-personality.js';
interface ResonanceEvent {
    theme: ThemeCategory;
    expressionId?: string;
    engagement: 'positive' | 'neutral' | 'negative';
    personaId: string;
    context: {
        turnCount: number;
        momentum: string;
        emotion?: string;
    };
    timestamp: Date;
}
/**
 * Load user's resonance profile from cache or Firestore
 */
export declare function loadResonanceProfile(userId: string): Promise<UserResonanceProfile | null>;
/**
 * Record a resonance event (called when we detect user reaction)
 */
export declare function recordResonanceEvent(userId: string, event: ResonanceEvent): Promise<void>;
/**
 * Record a user topic mention (for future callbacks)
 */
export declare function recordUserTopicMention(userId: string, topic: string): Promise<void>;
/**
 * Record vulnerability response
 */
export declare function recordVulnerabilityResponse(userId: string, responseType: 'reciprocated' | 'deflected' | 'ignored'): Promise<void>;
/**
 * Force immediate persist (call on session end)
 */
export declare function flushResonanceProfile(userId: string): Promise<void>;
/**
 * Get resonance profile from cache ONLY (synchronous, for hot path).
 */
export declare function getCachedResonance(userId: string): UserResonanceProfile | null;
/**
 * Pre-load resonance profile into cache (async, call at session start).
 */
export declare function prewarmResonanceCache(userId: string): Promise<void>;
/**
 * Analyze user's response to detect engagement
 */
export declare function detectEngagement(userResponse: string, previousExpression: {
    theme: ThemeCategory;
    content: string;
}): 'positive' | 'neutral' | 'negative';
export declare const sharedPersonalityResonanceStore: {
    load: typeof loadResonanceProfile;
    getCached: typeof getCachedResonance;
    prewarm: typeof prewarmResonanceCache;
    recordEvent: typeof recordResonanceEvent;
    recordTopicMention: typeof recordUserTopicMention;
    recordVulnerabilityResponse: typeof recordVulnerabilityResponse;
    detectEngagement: typeof detectEngagement;
    flush: typeof flushResonanceProfile;
};
export default sharedPersonalityResonanceStore;
//# sourceMappingURL=personality-resonance-store.d.ts.map