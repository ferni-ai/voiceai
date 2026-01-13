/**
 * Voice Household Management
 *
 * Supports multiple voice-enrolled users per device/household.
 * Automatically identifies who's speaking at conversation start.
 *
 * FEATURES:
 * - Multiple voice profiles per device
 * - Automatic speaker identification
 * - User switching during sessions
 * - Household management (add/remove members)
 * - Per-user conversation history
 *
 * @module VoiceHousehold
 */
export interface HouseholdMember {
    userId: string;
    displayName: string;
    role: 'owner' | 'adult' | 'child' | 'guest';
    enrolledAt: Date;
    lastSeen?: Date;
    preferences?: {
        greeting?: string;
        persona?: string;
        voiceEnrolled?: boolean;
    };
}
export interface Household {
    id: string;
    name: string;
    deviceId: string;
    ownerId: string;
    members: HouseholdMember[];
    createdAt: Date;
    updatedAt: Date;
    settings: {
        autoIdentify: boolean;
        requireReIdentification: boolean;
        guestMode: boolean;
        childSafeMode: boolean;
    };
}
export interface SpeakerIdentificationResult {
    identified: boolean;
    member?: HouseholdMember;
    confidence: number;
    isNewSpeaker: boolean;
    suggestedAction?: 'enroll' | 'verify' | 'switch' | 'none';
}
/**
 * Create a new household.
 */
export declare function createHousehold(deviceId: string, ownerId: string, name?: string): Promise<Household>;
/**
 * Get household by device ID.
 */
export declare function getHousehold(deviceId: string): Promise<Household | null>;
/**
 * Add a member to a household.
 * Voice profile is optional - member can be added first, then enrolled later.
 * Members without voice profiles won't be automatically recognized during conversations.
 */
export declare function addHouseholdMember(deviceId: string, userId: string, displayName: string, role?: HouseholdMember['role']): Promise<HouseholdMember | null>;
/**
 * Remove a member from a household.
 */
export declare function removeHouseholdMember(deviceId: string, userId: string): Promise<boolean>;
/**
 * Get all members of a household.
 */
export declare function getHouseholdMembers(deviceId: string): Promise<HouseholdMember[]>;
/**
 * Update member's last seen timestamp.
 */
export declare function updateMemberLastSeen(deviceId: string, userId: string): Promise<void>;
/**
 * Identify who is speaking from household members.
 */
export declare function identifyHouseholdSpeaker(deviceId: string, audio: Float32Array): Promise<SpeakerIdentificationResult>;
interface ActiveSession {
    deviceId: string;
    currentUserId: string | null;
    startedAt: Date;
    lastActivity: Date;
    speakerChanges: Array<{
        fromUserId: string | null;
        toUserId: string | null;
        timestamp: Date;
        confidence: number;
    }>;
}
/**
 * Start a household session.
 */
export declare function startHouseholdSession(deviceId: string, initialUserId?: string | null): ActiveSession;
/**
 * Get active session for a device.
 */
export declare function getActiveSession(deviceId: string): ActiveSession | null;
/**
 * Update current speaker in session.
 */
export declare function updateSessionSpeaker(deviceId: string, newUserId: string | null, confidence: number): Promise<void>;
/**
 * End a household session.
 */
export declare function endHouseholdSession(deviceId: string): ActiveSession | null;
declare const _default: {
    createHousehold: typeof createHousehold;
    getHousehold: typeof getHousehold;
    addHouseholdMember: typeof addHouseholdMember;
    removeHouseholdMember: typeof removeHouseholdMember;
    getHouseholdMembers: typeof getHouseholdMembers;
    identifyHouseholdSpeaker: typeof identifyHouseholdSpeaker;
    startHouseholdSession: typeof startHouseholdSession;
    getActiveSession: typeof getActiveSession;
    updateSessionSpeaker: typeof updateSessionSpeaker;
    endHouseholdSession: typeof endHouseholdSession;
};
export default _default;
//# sourceMappingURL=voice-household.d.ts.map