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

import { getDefaultStore, type MemoryStore } from '../../memory/index.js';
import { createUserId, type UserId } from '../../types/branded.js';
import type { UserProfile, VoiceSketch } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  authenticateNaturally,
  generateContextForLLM,
  getNaturalGreeting,
  type AuthContext,
} from './natural-auth.js';

// ============================================================================
// STORE ACCESS - Use global services store if available, otherwise fallback
// ============================================================================

// This is set by services/index.ts after memory system initialization
let _globalStore: MemoryStore | null = null;

/**
 * Set the global store instance (called by services/index.ts during initialization)
 * This ensures user identification uses the same store as the rest of the system.
 */
export function setGlobalStore(store: MemoryStore): void {
  _globalStore = store;
  getLogger().info('User identification store configured');
}

/**
 * Get the appropriate store - uses global store if available (Firestore in production),
 * falls back to in-memory store if not yet initialized.
 */
function getStore(): MemoryStore {
  if (_globalStore) {
    return _globalStore;
  }
  // Fallback to in-memory store (only happens during early startup)
  getLogger().debug('Using fallback in-memory store for user identification');
  return getDefaultStore();
}

// ============================================================================
// PHONE NUMBER UTILITIES
// ============================================================================

/**
 * Normalize phone number to E.164 format for consistent lookup
 * Examples:
 *   +1 (555) 123-4567 → +15551234567
 *   555-123-4567 → +15551234567 (assumes US)
 *   +44 20 7946 0958 → +442079460958
 */
export function normalizePhoneNumber(phone: string, defaultCountry = 'US'): string {
  // Remove all non-digit characters except leading +
  let normalized = phone.replace(/[^\d+]/g, '');

  // If starts with +, it's already international
  if (normalized.startsWith('+')) {
    return normalized;
  }

  // Handle US numbers (default)
  if (defaultCountry === 'US') {
    // Remove leading 1 if present
    if (normalized.length === 11 && normalized.startsWith('1')) {
      normalized = normalized.substring(1);
    }

    // Add US country code
    if (normalized.length === 10) {
      return `+1${normalized}`;
    }
  }

  // For other formats, just add + prefix if missing
  return normalized.startsWith('+') ? normalized : `+${normalized}`;
}

/**
 * Validate phone number format
 */
export function isValidPhoneNumber(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  // E.164 format: + followed by 7-15 digits
  return /^\+\d{7,15}$/.test(normalized);
}

/**
 * Format phone number for display
 */
export function formatPhoneForDisplay(phone: string): string {
  const normalized = normalizePhoneNumber(phone);

  // US format
  if (normalized.startsWith('+1') && normalized.length === 12) {
    const area = normalized.substring(2, 5);
    const prefix = normalized.substring(5, 8);
    const line = normalized.substring(8, 12);
    return `(${area}) ${prefix}-${line}`;
  }

  return normalized;
}

// ============================================================================
// USER IDENTIFICATION
// ============================================================================

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
  linkedIdentifiers: string[]; // Other identifiers linked to this user
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
export async function identifyByPhone(phoneNumber: string): Promise<IdentificationResult> {
  const normalized = normalizePhoneNumber(phoneNumber);
  const store = getStore();

  getLogger().info({ phone: normalized }, 'Identifying user by phone number');

  // Priority 1: Check sponsored identities first (family members)
  try {
    const { lookupByPhone } = await import('./sponsored-identity.js');
    const sponsoredLookup = await lookupByPhone(normalized);

    if (sponsoredLookup.found && sponsoredLookup.identity) {
      const identity = sponsoredLookup.identity;

      getLogger().info(
        {
          phone: normalized,
          identityId: identity.id,
          displayName: identity.displayName,
          sponsorUserId: identity.sponsorUserId,
        },
        '🎉 Identified sponsored identity by phone'
      );

      // For sponsored identities, we use the identity ID as the user ID
      // This gives them their own profile and conversation history
      const sponsoredUserId = identity.id;
      const profile = await store.getProfile(sponsoredUserId);

      return {
        userId: createUserId(sponsoredUserId),
        isNew: !profile,
        isReturning: profile ? profile.totalConversations > 0 : false,
        profile,
        source: {
          type: 'sponsored',
          identifier: normalized,
          metadata: {
            displayName: identity.displayName,
            relationship: identity.relationship,
          },
        },
        linkedIdentifiers: [],
        sponsorUserId: identity.sponsorUserId,
        sponsoredIdentityId: identity.id,
        voiceEnrolled: identity.voiceEnrolled,
      };
    }
  } catch (error) {
    getLogger().debug(
      { error: String(error), phone: normalized },
      'Error checking sponsored identities (continuing with regular lookup)'
    );
  }

  // Priority 2: Check linked phone numbers (web users)
  // Import memory management for persistent phone cache
  const { getCachedPhoneMapping, savePhoneMapping } =
    await import('../memory/memory-management.js');

  // Check persistent cache first (O(1) lookup)
  const cachedUserId = getCachedPhoneMapping(normalized);
  if (cachedUserId) {
    const profile = await store.getProfile(cachedUserId);
    if (profile) {
      return {
        userId: createUserId(cachedUserId),
        isNew: false,
        isReturning: profile.totalConversations > 0,
        profile,
        source: { type: 'phone', identifier: normalized },
        linkedIdentifiers: getLinkedIdentifiers(profile),
      };
    }
  }

  // Search for existing profile with this phone number as primary ID (O(n) fallback)
  const existingProfile = await findProfileByPhone(normalized);

  if (existingProfile) {
    // Persist the mapping for fast future lookups
    await savePhoneMapping(normalized, existingProfile.id);

    return {
      userId: createUserId(existingProfile.id),
      isNew: false,
      isReturning: existingProfile.totalConversations > 0,
      profile: existingProfile,
      source: { type: 'phone', identifier: normalized },
      linkedIdentifiers: getLinkedIdentifiers(existingProfile),
    };
  }

  // Priority 2.5: Check linkedIdentifiers for multi-phone users
  // This catches users who have added additional phones to their profile
  const linkedProfile = await findProfileByLinkedPhone(normalized);

  if (linkedProfile) {
    // Persist the mapping for fast future lookups
    await savePhoneMapping(normalized, linkedProfile.id);

    getLogger().info(
      { userId: linkedProfile.id, phone: normalized },
      '📱 Found user via linked phone number (multi-phone support)'
    );

    return {
      userId: createUserId(linkedProfile.id),
      isNew: false,
      isReturning: linkedProfile.totalConversations > 0,
      profile: linkedProfile,
      source: { type: 'phone', identifier: normalized },
      linkedIdentifiers: getLinkedIdentifiers(linkedProfile),
    };
  }

  // Priority 3: New user - create ID from phone number
  const newUserId = createUserId(`phone:${normalized}`);
  await savePhoneMapping(normalized, newUserId);

  getLogger().info({ userId: newUserId, phone: normalized }, 'New user identified by phone');

  return {
    userId: newUserId,
    isNew: true,
    isReturning: false,
    profile: null,
    source: { type: 'phone', identifier: normalized },
    linkedIdentifiers: [],
  };
}

/**
 * Identify user from web authentication (OAuth, session, etc.)
 */
export async function identifyByWebAuth(
  authId: string,
  authProvider = 'default'
): Promise<IdentificationResult> {
  const store = getStore();
  const userIdStr = `auth:${authProvider}:${authId}`;

  getLogger().info({ authId, authProvider }, 'Identifying user by web auth');

  const profile = await store.getProfile(userIdStr);

  if (profile) {
    return {
      userId: createUserId(userIdStr),
      isNew: false,
      isReturning: profile.totalConversations > 0,
      profile,
      source: { type: 'web_auth', identifier: authId, metadata: { provider: authProvider } },
      linkedIdentifiers: getLinkedIdentifiers(profile),
    };
  }

  return {
    userId: createUserId(userIdStr),
    isNew: true,
    isReturning: false,
    profile: null,
    source: { type: 'web_auth', identifier: authId, metadata: { provider: authProvider } },
    linkedIdentifiers: [],
  };
}

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
export async function identifyFromMetadata(
  metadata: Record<string, unknown>
): Promise<IdentificationResult> {
  // Priority 1: Explicit user ID
  const explicitUserId = metadata.user_id || metadata.userId;
  if (explicitUserId && typeof explicitUserId === 'string') {
    const store = getStore();
    const profile = await store.getProfile(explicitUserId);

    return {
      userId: createUserId(explicitUserId),
      isNew: !profile,
      isReturning: profile ? profile.totalConversations > 0 : false,
      profile,
      source: { type: 'web_auth', identifier: explicitUserId },
      linkedIdentifiers: profile ? getLinkedIdentifiers(profile) : [],
    };
  }

  // Priority 2: Firebase UID (primary identifier for web users)
  // This is the cryptographically secure Firebase User ID
  const firebaseUid = metadata.firebase_uid || metadata.firebaseUid;
  if (firebaseUid && typeof firebaseUid === 'string') {
    const store = getStore();
    let profile = await store.getProfile(firebaseUid);

    // AUTO-MIGRATION: If Firebase UID has no profile but device ID exists,
    // migrate the device profile to Firebase UID for seamless continuity
    const deviceId = metadata.device_id || metadata.deviceId;
    if (!profile && deviceId && typeof deviceId === 'string') {
      const deviceUserId = `device:${deviceId}`;
      const deviceProfile = await store.getProfile(deviceUserId);

      if (deviceProfile && deviceProfile.totalConversations > 0) {
        // Found a legacy device profile - migrate it!
        getLogger().info(
          {
            firebaseUid: `${firebaseUid.slice(0, 8)}...`,
            deviceId: `${deviceId.slice(0, 12)}...`,
            conversations: deviceProfile.totalConversations,
            name: deviceProfile.name || '(none)',
          },
          '🔄 AUTO-MIGRATION: Migrating device profile to Firebase UID'
        );

        try {
          const { migrateUserData } = await import('../user-migration.js');
          const result = await migrateUserData({
            deviceId: deviceUserId,
            firebaseUid,
            displayName: deviceProfile.name,
            email: deviceProfile.contactInfo?.email,
          });

          if (result.success) {
            // Re-fetch the newly migrated profile
            profile = await store.getProfile(firebaseUid);
            getLogger().info(
              {
                firebaseUid: `${firebaseUid.slice(0, 8)}...`,
                conversations: result.conversationsMigrated,
                memories: result.memoriesMigrated,
                action: result.profileAction,
              },
              '✅ AUTO-MIGRATION: Successfully migrated device profile'
            );

            // Also run comprehensive subcollection linking (catches any collections the old migration missed)
            try {
              const { autoLinkOnAuth } = await import('./identity-linking.js');
              await autoLinkOnAuth(deviceId, firebaseUid);
            } catch (linkError) {
              // Non-fatal - old migration already handled the critical data
              getLogger().debug(
                { error: String(linkError) },
                'Comprehensive identity linking failed (non-fatal)'
              );
            }
          } else {
            getLogger().warn(
              { firebaseUid: `${firebaseUid.slice(0, 8)}...`, error: result.error },
              '⚠️ AUTO-MIGRATION: Migration failed, continuing with new profile'
            );
          }
        } catch (migrationError) {
          getLogger().error(
            { error: String(migrationError), firebaseUid: `${firebaseUid.slice(0, 8)}...` },
            '❌ AUTO-MIGRATION: Error during migration (continuing with new profile)'
          );
        }
      }
    }

    return {
      userId: createUserId(firebaseUid),
      isNew: !profile,
      isReturning: profile ? profile.totalConversations > 0 : false,
      profile,
      source: { type: 'firebase', identifier: firebaseUid },
      linkedIdentifiers: profile ? getLinkedIdentifiers(profile) : [],
    };
  }

  // Priority 3: Phone number (from SIP/telephony)
  const phoneNumber = metadata.caller_id || metadata.phone || metadata.from;
  if (phoneNumber && typeof phoneNumber === 'string' && isValidPhoneNumber(phoneNumber)) {
    return identifyByPhone(phoneNumber);
  }

  // Priority 4: Auth token (legacy)
  const authToken = metadata.auth_token || metadata.token;
  if (authToken && typeof authToken === 'string') {
    return identifyByWebAuth(authToken, 'token');
  }

  // Priority 5: Device ID (for anonymous but persistent identification)
  // This is the fallback during the Firebase migration period
  const deviceId = metadata.device_id || metadata.deviceId;
  if (deviceId && typeof deviceId === 'string') {
    const userIdStr = `device:${deviceId}`;
    const store = getStore();
    const profile = await store.getProfile(userIdStr);

    return {
      userId: createUserId(userIdStr),
      isNew: !profile,
      isReturning: profile ? profile.totalConversations > 0 : false,
      profile,
      source: { type: 'device', identifier: deviceId },
      linkedIdentifiers: profile ? getLinkedIdentifiers(profile) : [],
    };
  }

  // Priority 6: Anonymous session (truly unknown users)
  const sessionId = (metadata.session_id as string) || `anon:${Date.now()}`;

  return {
    userId: createUserId(sessionId),
    isNew: true,
    isReturning: false,
    profile: null,
    source: { type: 'anonymous', identifier: sessionId as string },
    linkedIdentifiers: [],
  };
}

// ============================================================================
// PROFILE LINKING
// ============================================================================

/**
 * Link a phone number to an existing user profile
 * Allows Jack to recognize you whether you call or use web
 */
export async function linkPhoneToProfile(userId: string, phoneNumber: string): Promise<boolean> {
  const normalized = normalizePhoneNumber(phoneNumber);
  const store = getStore();

  const profile = await store.getProfile(userId);
  if (!profile) {
    getLogger().warn({ userId }, 'Cannot link phone - profile not found');
    return false;
  }

  // Add phone to profile's linked identifiers
  if (!profile.linkedIdentifiers) {
    (profile as UserProfileWithLinks).linkedIdentifiers = [];
  }

  const links = (profile as UserProfileWithLinks).linkedIdentifiers!;
  if (!links.includes(`phone:${normalized}`)) {
    links.push(`phone:${normalized}`);
    await store.saveProfile(profile);

    // Persist the mapping for fast lookups
    const { savePhoneMapping } = await import('../memory/memory-management.js');
    await savePhoneMapping(normalized, userId);

    getLogger().info({ userId, phone: normalized }, 'Phone number linked to profile');
  }

  return true;
}

/**
 * Link a web auth identity to an existing phone-based profile
 */
export async function linkWebAuthToPhone(
  phoneNumber: string,
  authId: string,
  authProvider = 'default'
): Promise<boolean> {
  const normalized = normalizePhoneNumber(phoneNumber);
  const store = getStore();

  // Find profile by phone
  const profile = await findProfileByPhone(normalized);
  if (!profile) {
    getLogger().warn({ phone: normalized }, 'Cannot link auth - phone profile not found');
    return false;
  }

  // Add auth identifier
  if (!profile.linkedIdentifiers) {
    (profile as UserProfileWithLinks).linkedIdentifiers = [];
  }

  const links = (profile as UserProfileWithLinks).linkedIdentifiers!;
  const authIdentifier = `auth:${authProvider}:${authId}`;

  if (!links.includes(authIdentifier)) {
    links.push(authIdentifier);
    await store.saveProfile(profile);

    getLogger().info({ userId: profile.id, authId }, 'Web auth linked to phone profile');
  }

  return true;
}

// ============================================================================
// ACCOUNT LINKING - Find potential linked accounts
// ============================================================================

export interface PotentialLinkResult {
  profile: UserProfile;
  matchType: 'email' | 'name' | 'phone';
  confidence: number;
  identityId: string;
}

/**
 * Find potential linked accounts for a phone caller.
 * Used when account linking signals are detected (email mention, app mention).
 *
 * @param phoneUserId - Current phone user ID
 * @param hints - Hints extracted from conversation (email, name)
 * @returns Array of potential matches, sorted by confidence
 */
export async function findPotentialLinkedAccounts(
  phoneUserId: string,
  hints: { email?: string; name?: string }
): Promise<PotentialLinkResult[]> {
  const store = getStore();
  const results: PotentialLinkResult[] = [];

  // Search by email (high confidence)
  if (hints.email) {
    const emailLower = hints.email.toLowerCase();
    try {
      const profiles = await store.listProfiles({ limit: 500 });

      for (const profile of profiles) {
        // Skip if same user
        if (profile.id === phoneUserId) continue;

        // Check email in profile
        const profileEmail = profile.contactInfo?.email?.toLowerCase();
        if (profileEmail && profileEmail === emailLower) {
          results.push({
            profile,
            matchType: 'email',
            confidence: 0.95,
            identityId: profile.id,
          });
          getLogger().info(
            { phoneUserId, matchedUserId: profile.id, email: hints.email },
            '🔗 Found email match for account linking'
          );
        }
      }
    } catch (error) {
      getLogger().warn(
        { error: String(error), email: hints.email },
        'Error searching profiles by email'
      );
    }
  }

  // Search by exact name match (moderate confidence)
  if (hints.name && hints.name.length > 2) {
    const nameLower = hints.name.toLowerCase();
    try {
      const profiles = await store.listProfiles({ limit: 500 });

      for (const profile of profiles) {
        // Skip if same user or already matched
        if (profile.id === phoneUserId) continue;
        if (results.some((r) => r.identityId === profile.id)) continue;

        // Check name match
        const profileName = (profile.name || profile.preferredName || '').toLowerCase();
        if (profileName && profileName === nameLower) {
          results.push({
            profile,
            matchType: 'name',
            confidence: 0.6,
            identityId: profile.id,
          });
          getLogger().info(
            { phoneUserId, matchedUserId: profile.id, name: hints.name },
            '🔗 Found name match for account linking'
          );
        }
      }
    } catch (error) {
      getLogger().warn(
        { error: String(error), name: hints.name },
        'Error searching profiles by name'
      );
    }
  }

  // Sort by confidence (highest first)
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}

/**
 * Find a profile by phone number in linkedIdentifiers array.
 * Used for multi-phone support.
 */
export async function findProfileByLinkedPhone(
  normalizedPhone: string
): Promise<UserProfile | null> {
  const store = getStore();

  try {
    const profiles = await store.listProfiles({ limit: 1000 });

    for (const profile of profiles) {
      const linked = (profile as UserProfileWithLinks).linkedIdentifiers || [];

      // Check all phone formats
      const phoneVariants = [
        `phone:${normalizedPhone}`,
        normalizedPhone,
        // Also check without country code for US numbers
        normalizedPhone.startsWith('+1') ? normalizedPhone.slice(2) : null,
      ].filter(Boolean);

      for (const variant of phoneVariants) {
        if (linked.includes(variant!)) {
          getLogger().debug(
            { userId: profile.id, phone: normalizedPhone },
            'Found profile via linkedIdentifiers phone'
          );
          return profile;
        }
      }
    }
  } catch (error) {
    getLogger().warn(
      { error: String(error), phone: normalizedPhone },
      'Error searching profiles by linked phone'
    );
  }

  return null;
}

/**
 * Merge a phone user into an existing web account.
 * Transfers conversation history and memories.
 */
export async function mergePhoneToWebAccount(
  phoneUserId: string,
  webAccountId: string
): Promise<{ success: boolean; error?: string; merged?: boolean }> {
  const store = getStore();

  // Validate both profiles exist
  const phoneProfile = await store.getProfile(phoneUserId);
  const webProfile = await store.getProfile(webAccountId);

  if (!phoneProfile) {
    return { success: false, error: 'Phone profile not found' };
  }
  if (!webProfile) {
    return { success: false, error: 'Web account not found' };
  }

  getLogger().info(
    {
      phoneUserId,
      webAccountId,
      phoneConversations: phoneProfile.totalConversations,
      webConversations: webProfile.totalConversations,
    },
    '🔗 Merging phone user into web account'
  );

  try {
    const { migrateUserData } = await import('../user-migration.js');
    const result = await migrateUserData({
      deviceId: phoneUserId,
      firebaseUid: webAccountId,
      displayName: phoneProfile.name,
      email: phoneProfile.contactInfo?.email,
    });

    if (result.success) {
      // Also add any phone numbers to the web profile's linked identifiers
      if (phoneProfile.contactInfo?.phone) {
        await linkPhoneToProfile(webAccountId, phoneProfile.contactInfo.phone);
      }

      getLogger().info(
        {
          webAccountId,
          conversationsMigrated: result.conversationsMigrated,
          memoriesMigrated: result.memoriesMigrated,
        },
        '✅ Account merge complete'
      );

      return { success: true, merged: true };
    }

    return { success: false, error: result.error || 'Migration failed' };
  } catch (error) {
    getLogger().error({ error: String(error) }, 'Account merge failed');
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface UserProfileWithLinks extends UserProfile {
  linkedIdentifiers?: string[];
}

/**
 * Find profile by phone number
 * Searches direct phone-based IDs and linked identifiers
 */
async function findProfileByPhone(normalizedPhone: string): Promise<UserProfile | null> {
  const store = getStore();

  // Try direct phone-based user ID first
  const directProfile = await store.getProfile(`phone:${normalizedPhone}`);
  if (directProfile) {
    return directProfile;
  }

  // Search across profiles with linked identifiers
  // For production, this should use a database index on linkedIdentifiers
  try {
    const profiles = await store.listProfiles({ limit: 1000 });

    for (const profile of profiles) {
      const linked = (profile as UserProfileWithLinks).linkedIdentifiers || [];

      // Check if this phone is linked to this profile
      if (linked.includes(`phone:${normalizedPhone}`) || linked.includes(normalizedPhone)) {
        getLogger().debug(
          { userId: profile.id, phone: normalizedPhone },
          'Found profile via linked identifier'
        );
        return profile;
      }
    }
  } catch (error) {
    getLogger().warn(
      { error, phone: normalizedPhone },
      'Error searching profiles by linked identifier'
    );
  }

  return null;
}

/**
 * Get all linked identifiers from a profile
 */
function getLinkedIdentifiers(profile: UserProfile): string[] {
  const links = (profile as UserProfileWithLinks).linkedIdentifiers || [];

  // Always include the profile ID
  if (!links.includes(profile.id)) {
    return [profile.id, ...links];
  }

  return links;
}

/**
 * Check if two users are the same person (by linked identifiers)
 */
export function areUsersSame(userId1: string, userId2: string): boolean {
  if (userId1 === userId2) return true;

  // Check if one is contained in the other's links
  // This is a simple implementation - production would check the database
  return false;
}

// ============================================================================
// NATURAL AUTHENTICATION INTEGRATION
// ============================================================================

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
export async function identifyWithNaturalAuth(
  metadata: Record<string, unknown>,
  voiceSketch?: VoiceSketch
): Promise<{ identification: IdentificationResult; authContext: AuthContext }> {
  // First, do traditional identification
  const identification = await identifyFromMetadata(metadata);

  // Perform natural authentication with metadata
  const authContext = await authenticateNaturally({
    metadata,
    voiceSketch: voiceSketch || null,
  });

  // Log the authentication result
  getLogger().info(
    {
      userId: authContext.userId,
      userName: authContext.userName,
      confidence: authContext.confidence,
      action: authContext.action,
    },
    '🎤 Natural authentication complete'
  );

  // Check if we have a returning user
  const store = getStore();
  const profile =
    authContext.userId !== 'unknown' ? await store.getProfile(authContext.userId) : null;

  return {
    identification: {
      ...identification,
      // Use the natural auth userId if it found a known user
      userId: profile ? createUserId(authContext.userId) : identification.userId,
      profile: profile || identification.profile,
      isReturning: authContext.isReturningUser,
    },
    authContext,
  };
}

/**
 * Get a natural greeting based on auth context
 */
export function getGreeting(authContext: AuthContext): string {
  return getNaturalGreeting(authContext);
}

/**
 * Get context string for the LLM to understand who they're talking to
 */
export function getLLMAuthContext(authContext: AuthContext): string {
  return generateContextForLLM(authContext);
}

// Re-export natural auth types
export type { AuthAction, AuthContext, ConfidenceLevel } from './natural-auth.js';

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  normalizePhoneNumber,
  isValidPhoneNumber,
  formatPhoneForDisplay,
  identifyByPhone,
  identifyByWebAuth,
  identifyFromMetadata,
  identifyWithNaturalAuth,
  linkPhoneToProfile,
  linkWebAuthToPhone,
  areUsersSame,
  getGreeting,
  getLLMAuthContext,
  findPotentialLinkedAccounts,
  findProfileByLinkedPhone,
  mergePhoneToWebAccount,
};
