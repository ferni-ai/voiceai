/**
 * Capability Throttling
 *
 * > "Better to under-impress than overwhelm."
 *
 * Controls how often we reveal capabilities to prevent feeling like
 * surveillance or an AI showing off.
 *
 * Philosophy:
 * - One perfect moment > multiple mediocre ones
 * - Space out revelations across sessions
 * - Earn the right to go deep
 * - Never do multiple "impressive" things in one session
 *
 * @module services/revelation-moments/throttling
 */
import type { CapabilityCategory, RevelationType } from './types.js';
/**
 * Check if a capability can be used in this session
 */
export declare function canUseCapability(userId: string, sessionId: string, category: CapabilityCategory, context: {
    sessionNumber: number;
    trustLevel?: number;
}): Promise<{
    allowed: boolean;
    reason?: string;
}>;
/**
 * Check if we should hold back on capabilities this session
 *
 * Returns true if we've already shown "impressive" capabilities
 * and should keep it simple for the rest of the session.
 */
export declare function shouldHoldBack(userId: string, sessionId: string, category: CapabilityCategory): Promise<boolean>;
/**
 * Record that we used a capability
 */
export declare function useCapability(userId: string, sessionId: string, category: CapabilityCategory): Promise<void>;
/**
 * Check if this would be a first revelation
 */
export declare function isFirstRevelation(userId: string, type: RevelationType): Promise<boolean>;
/**
 * Get which revelation types are still available
 */
export declare function getAvailableRevelations(userId: string, context: {
    sessionNumber: number;
    trustLevel?: number;
}): Promise<RevelationType[]>;
/**
 * Get summary of throttle state for debugging
 */
export declare function getThrottleState(userId: string, sessionId: string, context: {
    sessionNumber: number;
    trustLevel?: number;
}): Promise<{
    availableCategories: CapabilityCategory[];
    blockedCategories: Array<{
        category: CapabilityCategory;
        reason: string;
    }>;
    usedThisSession: CapabilityCategory[];
    shouldHoldBack: boolean;
}>;
//# sourceMappingURL=throttling.d.ts.map