/**
 * Session Validation Utilities
 *
 * Validates user IDs and session parameters.
 *
 * @module session-manager/validation
 */

import { isEphemeralUserId } from '../../utils/ephemeral-identity.js';
import { getLogger } from '../../utils/safe-logger.js';
import { MAX_USER_ID_LENGTH, MIN_USER_ID_LENGTH, USER_ID_PATTERN } from './constants.js';

/**
 * Validate userId format before profile operations
 * Returns the validated userId or undefined if invalid
 */
export function validateUserId(id: string | undefined): string | undefined {
  if (!id) return undefined;

  // Must be non-empty string
  if (typeof id !== 'string' || id.trim().length === 0) return undefined;

  // Reasonable length (typical UUIDs are 36 chars, Firebase UIDs are ~28)
  if (id.length > MAX_USER_ID_LENGTH || id.length < MIN_USER_ID_LENGTH) return undefined;

  // Only allow alphanumeric, dashes, underscores, and common ID characters
  if (!USER_ID_PATTERN.test(id)) {
    getLogger().warn({ userId: id.slice(0, 20) }, 'Invalid userId format');
    return undefined;
  }

  // Per-session and placeholder ids (ephemeral:, anon:, session-…, 'unknown')
  // must never key durable memory: no later call could find it again.
  if (isEphemeralUserId(id)) return undefined;

  return id;
}

/**
 * Type guard for valid user ID
 */
export function isValidUserId(id: string | undefined): id is string {
  return validateUserId(id) !== undefined;
}
