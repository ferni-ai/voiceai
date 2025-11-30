/**
 * User Identification Service
 * 
 * Enables cross-platform user recognition - Jack remembers you whether 
 * you call from a phone or use the web app.
 * 
 * Features:
 * - Phone number normalization (E.164 format)
 * - Phone-to-user profile linking
 * - Web session authentication
 * - Cross-platform profile resolution
 */

import { log } from '@livekit/agents';
import type { UserProfile } from '../types/user-profile.js';
import { getDefaultStore } from '../memory/index.js';

const getLogger = () => log();

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
  type: 'phone' | 'web_auth' | 'device' | 'anonymous';
  identifier: string;
  metadata?: Record<string, string>;
}

export interface IdentificationResult {
  userId: string;
  isNew: boolean;
  isReturning: boolean;
  profile: UserProfile | null;
  source: IdentificationSource;
  linkedIdentifiers: string[];  // Other identifiers linked to this user
}

/**
 * Phone number to user ID mapping (stored in profile or separate lookup)
 */
const phoneToUserCache = new Map<string, string>();

/**
 * Identify user from phone number
 */
export async function identifyByPhone(
  phoneNumber: string
): Promise<IdentificationResult> {
  const normalized = normalizePhoneNumber(phoneNumber);
  const store = getDefaultStore();
  
  getLogger().info({ phone: normalized }, 'Identifying user by phone number');
  
  // Check cache first
  const cachedUserId = phoneToUserCache.get(normalized);
  if (cachedUserId) {
    const profile = await store.getProfile(cachedUserId);
    if (profile) {
      return {
        userId: cachedUserId,
        isNew: false,
        isReturning: profile.totalConversations > 0,
        profile,
        source: { type: 'phone', identifier: normalized },
        linkedIdentifiers: getLinkedIdentifiers(profile),
      };
    }
  }
  
  // Search for existing profile with this phone number
  const existingProfile = await findProfileByPhone(normalized);
  
  if (existingProfile) {
    // Cache the mapping
    phoneToUserCache.set(normalized, existingProfile.id);
    
    return {
      userId: existingProfile.id,
      isNew: false,
      isReturning: existingProfile.totalConversations > 0,
      profile: existingProfile,
      source: { type: 'phone', identifier: normalized },
      linkedIdentifiers: getLinkedIdentifiers(existingProfile),
    };
  }
  
  // New user - create ID from phone number
  const newUserId = `phone:${normalized}`;
  phoneToUserCache.set(normalized, newUserId);
  
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
  authProvider: string = 'default'
): Promise<IdentificationResult> {
  const store = getDefaultStore();
  const userId = `auth:${authProvider}:${authId}`;
  
  getLogger().info({ authId, authProvider }, 'Identifying user by web auth');
  
  const profile = await store.getProfile(userId);
  
  if (profile) {
    return {
      userId,
      isNew: false,
      isReturning: profile.totalConversations > 0,
      profile,
      source: { type: 'web_auth', identifier: authId, metadata: { provider: authProvider } },
      linkedIdentifiers: getLinkedIdentifiers(profile),
    };
  }
  
  return {
    userId,
    isNew: true,
    isReturning: false,
    profile: null,
    source: { type: 'web_auth', identifier: authId, metadata: { provider: authProvider } },
    linkedIdentifiers: [],
  };
}

/**
 * Identify user from job metadata (flexible - works with phone or auth)
 */
export async function identifyFromMetadata(
  metadata: Record<string, unknown>
): Promise<IdentificationResult> {
  // Priority 1: Explicit user ID
  const explicitUserId = metadata.user_id || metadata.userId;
  if (explicitUserId && typeof explicitUserId === 'string') {
    const store = getDefaultStore();
    const profile = await store.getProfile(explicitUserId);
    
    return {
      userId: explicitUserId,
      isNew: !profile,
      isReturning: profile ? profile.totalConversations > 0 : false,
      profile,
      source: { type: 'web_auth', identifier: explicitUserId },
      linkedIdentifiers: profile ? getLinkedIdentifiers(profile) : [],
    };
  }
  
  // Priority 2: Phone number (from SIP/telephony)
  const phoneNumber = metadata.caller_id || metadata.phone || metadata.from;
  if (phoneNumber && typeof phoneNumber === 'string' && isValidPhoneNumber(phoneNumber)) {
    return identifyByPhone(phoneNumber);
  }
  
  // Priority 3: Auth token
  const authToken = metadata.auth_token || metadata.token;
  if (authToken && typeof authToken === 'string') {
    return identifyByWebAuth(authToken, 'token');
  }
  
  // Priority 4: Device ID (for anonymous but persistent identification)
  const deviceId = metadata.device_id || metadata.deviceId;
  if (deviceId && typeof deviceId === 'string') {
    const userId = `device:${deviceId}`;
    const store = getDefaultStore();
    const profile = await store.getProfile(userId);
    
    return {
      userId,
      isNew: !profile,
      isReturning: profile ? profile.totalConversations > 0 : false,
      profile,
      source: { type: 'device', identifier: deviceId },
      linkedIdentifiers: profile ? getLinkedIdentifiers(profile) : [],
    };
  }
  
  // Fallback: Anonymous session
  const sessionId = metadata.session_id || `anon:${Date.now()}`;
  
  return {
    userId: sessionId as string,
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
export async function linkPhoneToProfile(
  userId: string,
  phoneNumber: string
): Promise<boolean> {
  const normalized = normalizePhoneNumber(phoneNumber);
  const store = getDefaultStore();
  
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
    
    // Update cache
    phoneToUserCache.set(normalized, userId);
    
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
  authProvider: string = 'default'
): Promise<boolean> {
  const normalized = normalizePhoneNumber(phoneNumber);
  const store = getDefaultStore();
  
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
  const store = getDefaultStore();
  
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
      if (linked.includes(`phone:${normalizedPhone}`) || 
          linked.includes(normalizedPhone)) {
        getLogger().debug({ userId: profile.id, phone: normalizedPhone }, 'Found profile via linked identifier');
        return profile;
      }
    }
  } catch (error) {
    getLogger().warn({ error, phone: normalizedPhone }, 'Error searching profiles by linked identifier');
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
// EXPORTS
// ============================================================================

export default {
  normalizePhoneNumber,
  isValidPhoneNumber,
  formatPhoneForDisplay,
  identifyByPhone,
  identifyByWebAuth,
  identifyFromMetadata,
  linkPhoneToProfile,
  linkWebAuthToPhone,
  areUsersSame,
};

