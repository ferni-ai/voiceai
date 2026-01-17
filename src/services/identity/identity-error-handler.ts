/**
 * Identity Error Handler
 *
 * Provides graceful degradation and comprehensive error handling
 * for all identity operations. "The show must go on" - even when
 * something fails, we maintain the best possible user experience.
 *
 * @module identity/identity-error-handler
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'IdentityErrorHandler' });

// ============================================================================
// ERROR TYPES
// ============================================================================

export enum IdentityErrorCode {
  // Profile errors
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',
  PROFILE_SAVE_FAILED = 'PROFILE_SAVE_FAILED',
  PROFILE_LOAD_FAILED = 'PROFILE_LOAD_FAILED',
  PROFILE_INVALID = 'PROFILE_INVALID',

  // Auth errors
  AUTH_FAILED = 'AUTH_FAILED',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',

  // Identity errors
  USER_ID_INVALID = 'USER_ID_INVALID',
  USER_ID_MISSING = 'USER_ID_MISSING',
  FIREBASE_UID_MISSING = 'FIREBASE_UID_MISSING',
  DEVICE_ID_MISSING = 'DEVICE_ID_MISSING',

  // Migration errors
  MIGRATION_FAILED = 'MIGRATION_FAILED',
  MIGRATION_CONFLICT = 'MIGRATION_CONFLICT',

  // Voice errors
  VOICE_ENROLLMENT_FAILED = 'VOICE_ENROLLMENT_FAILED',
  VOICE_RECOGNITION_FAILED = 'VOICE_RECOGNITION_FAILED',

  // General
  NETWORK_ERROR = 'NETWORK_ERROR',
  FIRESTORE_UNAVAILABLE = 'FIRESTORE_UNAVAILABLE',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface IdentityError {
  code: IdentityErrorCode;
  message: string;
  recoverable: boolean;
  fallbackAction?: string;
  context?: Record<string, unknown>;
}

// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================

/**
 * Classify an error and determine the appropriate response
 */
export function classifyError(error: unknown, context?: Record<string, unknown>): IdentityError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode = extractErrorCode(errorMessage);

  // Network/connectivity errors
  if (isNetworkError(errorMessage)) {
    return {
      code: IdentityErrorCode.NETWORK_ERROR,
      message: 'Network connectivity issue',
      recoverable: true,
      fallbackAction: 'continue_with_cached_data',
      context,
    };
  }

  // Firestore errors
  if (isFirestoreError(errorMessage)) {
    return {
      code: IdentityErrorCode.FIRESTORE_UNAVAILABLE,
      message: 'Firestore temporarily unavailable',
      recoverable: true,
      fallbackAction: 'use_memory_cache',
      context,
    };
  }

  // Auth errors
  if (isAuthError(errorMessage)) {
    return {
      code: IdentityErrorCode.AUTH_FAILED,
      message: 'Authentication failed',
      recoverable: true,
      fallbackAction: 'create_anonymous_session',
      context,
    };
  }

  // Profile errors
  if (errorMessage.includes('profile')) {
    return {
      code: IdentityErrorCode.PROFILE_LOAD_FAILED,
      message: 'Failed to load profile',
      recoverable: true,
      fallbackAction: 'create_new_profile',
      context,
    };
  }

  // Default unknown error
  return {
    code: errorCode || IdentityErrorCode.UNKNOWN_ERROR,
    message: errorMessage,
    recoverable: false,
    context,
  };
}

function extractErrorCode(message: string): IdentityErrorCode | undefined {
  for (const code of Object.values(IdentityErrorCode)) {
    if (message.includes(code)) {
      return code as IdentityErrorCode;
    }
  }
  return undefined;
}

function isNetworkError(message: string): boolean {
  const networkPatterns = [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENETUNREACH',
    'fetch failed',
    'network error',
    'connection refused',
    'timeout',
  ];
  return networkPatterns.some((p) => message.toLowerCase().includes(p.toLowerCase()));
}

function isFirestoreError(message: string): boolean {
  const firestorePatterns = ['firestore', 'UNAVAILABLE', 'DEADLINE_EXCEEDED', 'RESOURCE_EXHAUSTED'];
  return firestorePatterns.some((p) => message.toLowerCase().includes(p.toLowerCase()));
}

function isAuthError(message: string): boolean {
  const authPatterns = ['auth/', 'unauthorized', 'forbidden', 'token', 'credentials'];
  return authPatterns.some((p) => message.toLowerCase().includes(p.toLowerCase()));
}

// ============================================================================
// RECOVERY STRATEGIES
// ============================================================================

export interface RecoveryResult<T> {
  success: boolean;
  data?: T;
  error?: IdentityError;
  recoveryUsed?: string;
}

/**
 * Execute an identity operation with automatic recovery
 */
export async function withRecovery<T>(
  operation: () => Promise<T>,
  fallback: () => Promise<T> | T,
  context: string
): Promise<RecoveryResult<T>> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    const identityError = classifyError(error, { context });

    log.warn(
      {
        error: identityError.code,
        message: identityError.message,
        context,
        recoverable: identityError.recoverable,
        fallbackAction: identityError.fallbackAction,
      },
      `Identity operation failed: ${context}`
    );

    if (identityError.recoverable) {
      try {
        const fallbackData = await fallback();
        return {
          success: true,
          data: fallbackData,
          recoveryUsed: identityError.fallbackAction,
        };
      } catch (fallbackError) {
        log.error({ error: String(fallbackError), context }, `Fallback also failed: ${context}`);
        return {
          success: false,
          error: classifyError(fallbackError, { context, originalError: identityError }),
        };
      }
    }

    return {
      success: false,
      error: identityError,
    };
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate a user ID format
 * Returns the validated ID or null if invalid
 */
export function validateUserIdFormat(userId: string | undefined | null): string | null {
  if (!userId) {
    return null;
  }

  if (typeof userId !== 'string') {
    log.warn({ userId, type: typeof userId }, 'User ID is not a string');
    return null;
  }

  // Trim whitespace
  const trimmed = userId.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Check minimum length (Firebase UIDs are 28 chars, device IDs vary)
  if (trimmed.length < 6) {
    log.warn({ userId: trimmed }, 'User ID too short');
    return null;
  }

  // Check for invalid characters
  if (!/^[a-zA-Z0-9:_-]+$/.test(trimmed)) {
    log.warn({ userId: trimmed }, 'User ID contains invalid characters');
    return null;
  }

  // Skip metadata/placeholder IDs
  const invalidIds = ['anonymous', 'undefined', 'null', 'test', 'demo'];
  if (invalidIds.includes(trimmed.toLowerCase())) {
    log.warn({ userId: trimmed }, 'User ID is a reserved/invalid value');
    return null;
  }

  return trimmed;
}

/**
 * Check if a user ID is a device-based ID (for migration)
 */
export function isDeviceBasedId(userId: string): boolean {
  return userId.startsWith('device:');
}

/**
 * Check if a user ID is a Firebase UID
 */
export function isFirebaseUid(userId: string): boolean {
  // Firebase UIDs are typically 28 alphanumeric characters
  return /^[a-zA-Z0-9]{28}$/.test(userId);
}

// ============================================================================
// DIAGNOSTIC HELPERS
// ============================================================================

export interface IdentityDiagnostics {
  hasUserId: boolean;
  userIdFormat: 'firebase' | 'device' | 'phone' | 'unknown' | 'invalid';
  hasFirebaseUid: boolean;
  hasDeviceId: boolean;
  hasProfile: boolean;
  hasName: boolean;
  hasVoiceSketch: boolean;
  isReturningUser: boolean;
  totalConversations: number;
  lastContact: Date | null;
  onboardingComplete: boolean;
  issues: string[];
}

/**
 * Generate diagnostics for an identity context
 */
export function generateDiagnostics(
  userId: string | undefined,
  profile:
    | {
        name?: string;
        voiceSketch?: unknown;
        totalConversations?: number;
        lastContact?: Date;
        onboarding?: { completedAt?: string };
      }
    | null
    | undefined
): IdentityDiagnostics {
  const issues: string[] = [];

  const validUserId = validateUserIdFormat(userId);
  if (!validUserId && userId) {
    issues.push(`Invalid userId format: ${userId}`);
  }

  if (!profile && validUserId) {
    issues.push('No profile found for valid userId');
  }

  if (profile && !profile.name) {
    issues.push('Profile exists but name is missing');
  }

  if (!profile?.voiceSketch) {
    issues.push('No voice sketch (cross-device recognition disabled)');
  }

  let userIdFormat: IdentityDiagnostics['userIdFormat'] = 'unknown';
  if (!validUserId) {
    userIdFormat = 'invalid';
  } else if (isFirebaseUid(validUserId)) {
    userIdFormat = 'firebase';
  } else if (isDeviceBasedId(validUserId)) {
    userIdFormat = 'device';
  } else if (validUserId.startsWith('phone:')) {
    userIdFormat = 'phone';
  }

  return {
    hasUserId: !!validUserId,
    userIdFormat,
    hasFirebaseUid: validUserId ? isFirebaseUid(validUserId) : false,
    hasDeviceId: validUserId ? isDeviceBasedId(validUserId) : false,
    hasProfile: !!profile,
    hasName: !!profile?.name,
    hasVoiceSketch: !!profile?.voiceSketch,
    isReturningUser: (profile?.totalConversations ?? 0) > 0,
    totalConversations: profile?.totalConversations ?? 0,
    lastContact: profile?.lastContact ?? null,
    onboardingComplete: !!profile?.onboarding?.completedAt,
    issues,
  };
}

/**
 * Log identity diagnostics for debugging
 */
export function logDiagnostics(
  userId: string | undefined,
  profile: Parameters<typeof generateDiagnostics>[1],
  sessionId?: string
): void {
  const diagnostics = generateDiagnostics(userId, profile);

  log.info(
    {
      sessionId,
      ...diagnostics,
      issueCount: diagnostics.issues.length,
    },
    '🔍 Identity Diagnostics'
  );

  if (diagnostics.issues.length > 0) {
    log.warn({ sessionId, issues: diagnostics.issues }, '⚠️ Identity issues detected');
  }
}
