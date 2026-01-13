/**
 * LinkedIn Integration Service
 *
 * Provides OAuth integration and profile data fetching for LinkedIn.
 * "Better than Human" - know about career milestones and opportunities.
 *
 * Superhuman Capabilities:
 * - "Your 5-year work anniversary at Acme is next week!"
 * - "I noticed your connection Sarah just started a new role - might be worth reaching out"
 * - "Based on your profile, you might be interested in this industry trend"
 *
 * LinkedIn API Scopes Used:
 * - r_liteprofile: Basic profile data
 * - r_emailaddress: Email address
 * - w_member_social: Post on behalf (optional)
 *
 * @module services/linkedin
 */
import type { CareerMilestone, LinkedInInsight, LinkedInPosition, LinkedInProfile } from './types.js';
export type { CareerMilestone, ConnectionUpdate, LinkedInInsight, LinkedInPosition, LinkedInProfile, LinkedInTokens, LinkedInUserData, } from './types.js';
/**
 * Check if user has LinkedIn connected
 */
export declare function hasLinkedInConnected(userId: string): boolean;
/**
 * Initialize LinkedIn connection from persisted tokens
 */
export declare function initializeLinkedIn(userId: string): Promise<boolean>;
/**
 * Connect LinkedIn with OAuth tokens
 */
export declare function connectLinkedIn(userId: string, accessToken: string, refreshToken: string | undefined, expiresIn: number, scope: string[]): Promise<boolean>;
/**
 * Disconnect LinkedIn
 */
export declare function disconnectLinkedIn(userId: string): Promise<void>;
/**
 * Sync LinkedIn profile and career data
 */
export declare function syncLinkedInData(userId: string): Promise<void>;
/**
 * Get LinkedIn profile for user
 */
export declare function getLinkedInProfile(userId: string): LinkedInProfile | null;
/**
 * Get upcoming career milestones
 */
export declare function getUpcomingMilestones(userId: string): CareerMilestone[];
/**
 * Get current position
 */
export declare function getCurrentPosition(userId: string): LinkedInPosition | null;
/**
 * Generate LinkedIn insight for context injection
 */
export declare function generateLinkedInInsight(userId: string): LinkedInInsight | null;
/**
 * Generate OAuth URL for LinkedIn authorization
 */
export declare function getLinkedInAuthUrl(redirectUri: string, state: string): string;
/**
 * Exchange authorization code for tokens
 */
export declare function exchangeLinkedInCode(code: string, redirectUri: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    scope: string[];
} | null>;
//# sourceMappingURL=index.d.ts.map