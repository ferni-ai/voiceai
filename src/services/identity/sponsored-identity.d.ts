/**
 * Sponsored Identity Service
 *
 * Enables users to create and manage identities for family members and friends
 * who call Ferni via phone. This allows phone callers to be recognized and
 * have their own conversation history without needing a web account.
 *
 * Features:
 * - Sponsor creates identity for family member (e.g., "Mom")
 * - Phone number linked to identity for automatic recognition
 * - Optional voice enrollment for additional verification
 * - Access controls per sponsored identity
 * - Call history tracking
 *
 * @module services/identity/sponsored-identity
 */
/**
 * Relationship types for sponsored identities
 */
export type RelationshipType = 'mother' | 'father' | 'parent' | 'grandmother' | 'grandfather' | 'grandparent' | 'sibling' | 'child' | 'spouse' | 'partner' | 'friend' | 'other';
/**
 * Access level for sponsored identities
 */
export type AccessLevel = 'full' | 'limited' | 'supervised';
/**
 * Status of a sponsored identity
 */
export type SponsoredIdentityStatus = 'active' | 'pending' | 'suspended' | 'revoked';
/**
 * Sponsored identity - represents a family member or friend who calls via phone
 */
export interface SponsoredIdentity {
    /** Unique identifier */
    id: string;
    /** Firebase UID of the sponsor (the person who created this identity) */
    sponsorUserId: string;
    /**
     * Family member's own user ID for memory storage.
     * This allows the family member to have their own conversation history,
     * preferences, and relationship with Ferni independent of the sponsor.
     * Format: "family_{sponsored_identity_id}"
     */
    familyUserId: string;
    /** Display name for this person */
    displayName: string;
    /** How Ferni should address them (may differ from displayName) */
    preferredName?: string;
    /** Relationship to sponsor */
    relationship: RelationshipType;
    /** Phone number in E.164 format */
    phoneNumber: string;
    /** Voice enrollment status */
    voiceEnrolled: boolean;
    /** Voice profile ID if enrolled */
    voiceProfileId?: string;
    /** Access level */
    accessLevel: AccessLevel;
    /** Allowed persona IDs, or ['*'] for all */
    allowedPersonas: string[];
    /** Status of this identity */
    status: SponsoredIdentityStatus;
    /** Notes for Ferni (e.g., "She prefers to be called Barbara, not Mom") */
    notes?: string;
    /** Timestamps */
    createdAt: Date;
    updatedAt: Date;
    lastCallAt?: Date;
    /** Usage stats */
    totalCalls: number;
    totalMinutes: number;
    /** Self-registration metadata (if applicable) */
    selfRegistered?: boolean;
    selfRegisteredName?: string;
    selfRegisteredAt?: Date;
}
/**
 * Data for creating a new sponsored identity
 */
export interface CreateSponsoredIdentityData {
    displayName: string;
    preferredName?: string;
    relationship: RelationshipType;
    phoneNumber: string;
    accessLevel?: AccessLevel;
    allowedPersonas?: string[];
    notes?: string;
}
/**
 * Data for updating a sponsored identity
 */
export interface UpdateSponsoredIdentityData {
    displayName?: string;
    preferredName?: string;
    relationship?: RelationshipType;
    phoneNumber?: string;
    accessLevel?: AccessLevel;
    allowedPersonas?: string[];
    notes?: string;
    status?: SponsoredIdentityStatus;
}
/**
 * Result of a phone lookup
 */
export interface PhoneLookupResult {
    found: boolean;
    identity?: SponsoredIdentity;
    sponsorProfile?: {
        userId: string;
        name?: string;
    };
}
/**
 * Create a new sponsored identity for a family member or friend.
 */
export declare function createSponsoredIdentity(sponsorUserId: string, data: CreateSponsoredIdentityData): Promise<SponsoredIdentity>;
/**
 * Get a sponsored identity by ID.
 */
export declare function getSponsoredIdentity(id: string): Promise<SponsoredIdentity | null>;
/**
 * Get all sponsored identities for a sponsor.
 */
export declare function getSponsoredIdentities(sponsorUserId: string): Promise<SponsoredIdentity[]>;
/**
 * Update a sponsored identity.
 */
export declare function updateSponsoredIdentity(id: string, sponsorUserId: string, updates: UpdateSponsoredIdentityData): Promise<SponsoredIdentity | null>;
/**
 * Revoke a sponsored identity (permanently disable).
 */
export declare function revokeSponsoredIdentity(id: string, sponsorUserId: string): Promise<boolean>;
/**
 * Delete a sponsored identity completely.
 */
export declare function deleteSponsoredIdentity(id: string, sponsorUserId: string): Promise<boolean>;
/**
 * Look up a sponsored identity by phone number.
 * This is the primary lookup method for incoming calls.
 */
export declare function lookupByPhone(phoneNumber: string): Promise<PhoneLookupResult>;
/**
 * Record a call for a sponsored identity.
 */
export declare function recordCall(identityId: string, durationMinutes: number): Promise<void>;
/**
 * Mark a sponsored identity as voice enrolled.
 */
export declare function markVoiceEnrolled(identityId: string, voiceProfileId: string): Promise<void>;
/**
 * Remove voice enrollment from a sponsored identity.
 */
export declare function removeVoiceEnrollment(identityId: string): Promise<void>;
/**
 * Create a pending sponsored identity from self-registration.
 * Requires sponsor approval before becoming active.
 */
export declare function createSelfRegisteredIdentity(phoneNumber: string, name: string, claimedRelationship?: string, claimedSponsorName?: string): Promise<SponsoredIdentity>;
/**
 * Approve a self-registered identity and assign to sponsor.
 */
export declare function approveSelfRegisteredIdentity(identityId: string, sponsorUserId: string, updates?: Partial<Pick<SponsoredIdentity, 'displayName' | 'relationship' | 'accessLevel' | 'allowedPersonas' | 'notes'>>): Promise<SponsoredIdentity | null>;
/**
 * Get pending self-registered identities (for sponsor notification).
 */
export declare function getPendingIdentities(): Promise<SponsoredIdentity[]>;
/**
 * Clear caches (for testing).
 */
export declare function clearCaches(): void;
/**
 * Start voice enrollment for a sponsored identity during a phone call.
 * Returns prompts the agent should use to collect voice samples.
 */
export declare function startPhoneVoiceEnrollment(identityId: string): Promise<{
    success: boolean;
    prompts: string[];
    error?: string;
}>;
/**
 * Record a voice sample during phone enrollment.
 * The agent captures audio during natural conversation.
 */
export declare function recordPhoneVoiceSample(identityId: string, audio: Float32Array): Promise<{
    success: boolean;
    complete: boolean;
    feedback: string;
    remainingSamples: number;
}>;
/**
 * Cancel an active phone voice enrollment session.
 */
export declare function cancelPhoneVoiceEnrollment(identityId: string): void;
/**
 * Check if there's an active voice enrollment session for an identity.
 */
export declare function hasActiveEnrollment(identityId: string): boolean;
//# sourceMappingURL=sponsored-identity.d.ts.map