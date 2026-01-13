/**
 * User Identification Service
 *
 * Enables cross-platform user recognition - Ferni remembers you whether
 * you call from a phone or use the web app.
 *
 * Features:
 * - Phone number normalization (E.164 format)
 * - Phone-to-user profile linking
 * - Web session authentication
 * - Cross-platform profile resolution
 *
 * @module services/user-identification
 */
import { type MemoryStore } from '../../memory/index.js';
import { type UserId } from '../../types/branded.js';
import type { UserProfile, VoiceSketch } from '../../types/user-profile.js';
import { type AuthContext } from './natural-auth.js';
/**
 * Set the global store instance (called by services/index.ts during initialization)
 * This ensures user identification uses the same store as the rest of the system.
 */
export declare function setGlobalStore(store: MemoryStore): void;
/**
 * Normalize phone number to E.164 format for consistent lookup
 * Examples:
 *   +1 (555) 123-4567 → +15551234567
 *   555-123-4567 → +15551234567 (assumes US)
 *   +44 20 7946 0958 → +442079460958
 */
export declare function normalizePhoneNumber(phone: string, defaultCountry?: string): string;
/**
 * Validate phone number format
 */
export declare function isValidPhoneNumber(phone: string): boolean;
/**
 * Format phone number for display
 */
export declare function formatPhoneForDisplay(phone: string): string;
export interface IdentificationSource {
    type: 'phone' | 'web_auth' | 'firebase' | 'device' | 'anonymous' | 'sponsored';
    identifier: string;
    metadata?: Record<string, string>;
}
export interface IdentificationResult {
    /** Branded user ID for type safety */
    userId: UserId;
    isNew: boolean;
    isReturning: boolean;
    profile: UserProfile | null;
    source: IdentificationSource;
    linkedIdentifiers: string[];
    /** For sponsored identities: the sponsor's user ID */
    sponsorUserId?: string;
    /** For sponsored identities: the identity ID */
    sponsoredIdentityId?: string;
    /** For sponsored identities: whether voice is enrolled */
    voiceEnrolled?: boolean;
}
/**
 * Identify user from phone number
 * Uses persistent phone cache for O(1) lookups after restart
 *
 * Priority:
 * 1. Sponsored identities (family members created by sponsors)
 * 2. Linked phone numbers (web users who linked their phone)
 * 3. New user
 */
export declare function identifyByPhone(phoneNumber: string): Promise<IdentificationResult>;
/**
 * Identify user from web authentication (OAuth, session, etc.)
 */
export declare function identifyByWebAuth(authId: string, authProvider?: string): Promise<IdentificationResult>;
/**
 * Identify user from job metadata (flexible - works with Firebase, phone, or device)
 *
 * Priority Order:
 * 1. Explicit user ID (from authenticated context)
 * 2. Firebase UID (primary for web users)
 * 3. Phone number (from SIP/telephony)
 *    3a. First checks sponsored identities (family members)
 *    3b. Then checks linked phone numbers (web users)
 *    3c. Creates new user if unknown
 * 4. Auth token (legacy)
 * 5. Device ID (fallback, for migration)
 * 6. Anonymous session (truly unknown users)
 */
export declare function identifyFromMetadata(metadata: Record<string, unknown>): Promise<IdentificationResult>;
/**
 * Link a phone number to an existing user profile
 * Allows Jack to recognize you whether you call or use web
 */
export declare function linkPhoneToProfile(userId: string, phoneNumber: string): Promise<boolean>;
/**
 * Link a web auth identity to an existing phone-based profile
 */
export declare function linkWebAuthToPhone(phoneNumber: string, authId: string, authProvider?: string): Promise<boolean>;
/**
 * Check if two users are the same person (by linked identifiers)
 */
export declare function areUsersSame(userId1: string, userId2: string): boolean;
/**
 * Enhanced identification that includes natural voice authentication
 *
 * This combines:
 * 1. Traditional identification (phone, device, auth token)
 * 2. Voice biometrics (silent, automatic)
 * 3. Conversational context hints
 *
 * Returns an AuthContext that tells the agent how to greet the user
 * and what confidence level we have in their identity.
 */
export declare function identifyWithNaturalAuth(metadata: Record<string, unknown>, voiceSketch?: VoiceSketch): Promise<{
    identification: IdentificationResult;
    authContext: AuthContext;
}>;
/**
 * Get a natural greeting based on auth context
 */
export declare function getGreeting(authContext: AuthContext): string;
/**
 * Get context string for the LLM to understand who they're talking to
 */
export declare function getLLMAuthContext(authContext: AuthContext): string;
export type { AuthAction, AuthContext, ConfidenceLevel } from './natural-auth.js';
declare const _default: {
    normalizePhoneNumber: typeof normalizePhoneNumber;
    isValidPhoneNumber: typeof isValidPhoneNumber;
    formatPhoneForDisplay: typeof formatPhoneForDisplay;
    identifyByPhone: typeof identifyByPhone;
    identifyByWebAuth: typeof identifyByWebAuth;
    identifyFromMetadata: typeof identifyFromMetadata;
    identifyWithNaturalAuth: typeof identifyWithNaturalAuth;
    linkPhoneToProfile: typeof linkPhoneToProfile;
    linkWebAuthToPhone: typeof linkWebAuthToPhone;
    areUsersSame: typeof areUsersSame;
    getGreeting: typeof getGreeting;
    getLLMAuthContext: typeof getLLMAuthContext;
};
export default _default;
//# sourceMappingURL=user-identification.d.ts.map