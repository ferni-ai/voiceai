/**
 * User Identification Handler
 *
 * Identifies users from room metadata and manages user context.
 * Handles phone, web auth, and anonymous identification sources.
 */

import { log } from '@livekit/agents';
import { getLogger } from '../../utils/safe-logger.js';
import { identifyFromMetadata } from '../../services/user-identification.js';
import { diag as defaultDiag, type DiagnosticLogger } from '../../services/diagnostic-logger.js';

/**
 * Room metadata for user identification
 */
export interface RoomMetadata {
  user_id?: string;
  userId?: string;
  user_name?: string;
  userName?: string;
  phone?: string;
  auth_provider?: string;
  persona_id?: string;
  personaId?: string;
  requested_persona?: string;
  requestedPersona?: string;
}

/**
 * Result of user identification
 */
export interface UserIdentificationResult {
  userId: string;
  userName?: string;
  identificationSource: string;
  profile: {
    name?: string;
    totalConversations?: number;
  } | null;
}

/**
 * Check if a name is a real user name (not a placeholder)
 */
export function isRealName(name: string | undefined | null): boolean {
  if (!name) return false;

  // Filter out common placeholder patterns
  const placeholders = ['user', 'guest', 'anonymous', 'unknown', 'default', 'test', 'demo'];

  const lowerName = name.toLowerCase().trim();

  // Check for exact matches with placeholders
  if (placeholders.includes(lowerName)) return false;

  // Check for placeholder patterns (user123, guest_abc, etc.)
  if (/^(user|guest|anonymous|unknown)[_\-]?\d*$/i.test(name)) return false;

  // Name is too short to be real
  if (name.trim().length < 2) return false;

  // Likely a real name
  return true;
}

/**
 * Parse room metadata from different formats
 */
export function parseRoomMetadata(roomName: string): RoomMetadata {
  try {
    // Try to extract metadata from room name if it's JSON-encoded
    const metadataMatch = roomName.match(/\{.*\}/);
    if (metadataMatch) {
      return JSON.parse(metadataMatch[0]) as RoomMetadata;
    }
  } catch {
    // Not JSON, return empty metadata
  }
  return {};
}

/**
 * Identify a user from room metadata
 *
 * @param metadata - Room metadata
 * @param diag - Optional diagnostic logger
 * @returns User identification result
 */
export async function identifyUser(
  metadata: RoomMetadata,
  diag?: DiagnosticLogger
): Promise<UserIdentificationResult> {
  const logger = getLogger();
  const diagnostics = diag || defaultDiag;

  let userId = 'anonymous';
  let userName: string | undefined;
  let identificationSource = 'anonymous';
  let profile: UserIdentificationResult['profile'] = null;

  try {
    diagnostics.user('Identifying user from metadata', {
      hasUserId: !!(metadata.user_id || metadata.userId),
      hasPhone: !!metadata.phone,
      hasAuthProvider: !!metadata.auth_provider,
    });

    // Use the unified identification service
    const identification = await identifyFromMetadata(metadata as Record<string, unknown>);

    userId = identification.userId;
    profile = identification.profile;
    identificationSource = identification.source.type;

    // CRITICAL: Only use REAL names, never placeholders!
    // Priority: 1. Profile name (persistent), 2. Metadata name (if real)
    const metadataName = metadata.user_name || metadata.userName;
    const profileName = identification.profile?.name;

    if (isRealName(profileName)) {
      userName = profileName;
    } else if (isRealName(metadataName)) {
      userName = metadataName;
    }
    // If neither is a real name, userName stays undefined - agent should NOT guess!

    diagnostics.user('User identified', {
      userId,
      userName: userName || '(unknown - will ask)',
      source: identificationSource,
      metadataNameFiltered: metadataName && !isRealName(metadataName),
    });
  } catch (e) {
    diagnostics.warn('User identification failed', { error: String(e) });
    logger.warn({ error: String(e) }, 'User identification failed');
  }

  return {
    userId,
    userName,
    identificationSource,
    profile,
  };
}

/**
 * Determine if user is returning based on profile
 */
export function isReturningUser(profile: UserIdentificationResult['profile']): boolean {
  if (!profile) return false;
  return (profile.totalConversations || 0) > 0;
}

export default {
  isRealName,
  parseRoomMetadata,
  identifyUser,
  isReturningUser,
};
