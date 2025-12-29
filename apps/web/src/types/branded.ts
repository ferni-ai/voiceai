/**
 * Branded Types - Type-Safe Identifiers
 *
 * Branded types (also called nominal types or newtype) prevent
 * accidentally mixing up values that have the same underlying type
 * but different semantic meanings.
 *
 * Without branded types:
 *   function getUser(userId: string): User { ... }
 *   function getSession(sessionId: string): Session { ... }
 *
 *   const sessionId = 'sess_123';
 *   getUser(sessionId); // No error! But this is a bug.
 *
 * With branded types:
 *   function getUser(userId: UserId): User { ... }
 *   function getSession(sessionId: SessionId): Session { ... }
 *
 *   const sessionId = 'sess_123' as SessionId;
 *   getUser(sessionId); // Type error! Cannot assign SessionId to UserId
 *
 * @example
 * // Define branded types
 * type UserId = Brand<string, 'UserId'>;
 * type SessionId = Brand<string, 'SessionId'>;
 *
 * // Create branded values
 * const userId = createUserId('user_123');
 * const sessionId = 'sess_456' as SessionId;
 *
 * // Type-safe function calls
 * getUser(userId);       // OK
 * getUser(sessionId);    // Type error!
 */

// ============================================================================
// CORE BRAND TYPE
// ============================================================================

/**
 * Brand symbol - used to create unique type brands
 */
declare const __brand: unique symbol;

/**
 * Brand type - creates a nominal type from a base type
 *
 * @template T - The underlying type (string, number, etc.)
 * @template B - The brand identifier (unique string literal)
 *
 * @example
 * type UserId = Brand<string, 'UserId'>;
 * type Amount = Brand<number, 'Amount'>;
 */
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ============================================================================
// COMMON BRANDED TYPES
// ============================================================================

/**
 * User identifier - Firebase UID or legacy device ID
 */
export type UserId = Brand<string, 'UserId'>;

/**
 * Session identifier - LiveKit room session
 */
export type SessionId = Brand<string, 'SessionId'>;

// Note: PersonaId is a string literal union defined in persona.ts
// We don't use a branded type here because the specific values matter.

/**
 * Device identifier - unique device fingerprint
 */
export type DeviceId = Brand<string, 'DeviceId'>;

/**
 * Subscription identifier
 */
export type SubscriptionId = Brand<string, 'SubscriptionId'>;

/**
 * Transaction identifier - purchases, refunds
 */
export type TransactionId = Brand<string, 'TransactionId'>;

/**
 * Calendar event identifier
 */
export type CalendarEventId = Brand<string, 'CalendarEventId'>;

/**
 * Contact identifier
 */
export type ContactId = Brand<string, 'ContactId'>;

/**
 * Memory/conversation identifier
 */
export type MemoryId = Brand<string, 'MemoryId'>;

/**
 * Token (JWT, API key, etc.)
 */
export type AuthToken = Brand<string, 'AuthToken'>;

// ============================================================================
// NUMERIC BRANDED TYPES
// ============================================================================

/**
 * Unix timestamp in milliseconds
 */
export type Timestamp = Brand<number, 'Timestamp'>;

/**
 * Duration in milliseconds
 */
export type DurationMs = Brand<number, 'DurationMs'>;

/**
 * Percentage (0-100)
 */
export type Percentage = Brand<number, 'Percentage'>;

/**
 * Currency amount in cents
 */
export type CentsAmount = Brand<number, 'CentsAmount'>;

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a UserId from a string
 *
 * @example
 * const userId = createUserId(firebaseUid);
 */
export function createUserId(id: string): UserId {
  return id as UserId;
}

/**
 * Create a SessionId from a string
 *
 * @example
 * const sessionId = createSessionId(room.name);
 */
export function createSessionId(id: string): SessionId {
  return id as SessionId;
}

// Note: For persona IDs, use normalizePersonaId() from persona.ts instead
// since PersonaId is a string literal union, not a branded type.

/**
 * Create a DeviceId from a string
 *
 * @example
 * const deviceId = createDeviceId(fingerprint);
 */
export function createDeviceId(id: string): DeviceId {
  return id as DeviceId;
}

/**
 * Create a Timestamp from current time
 *
 * @example
 * const now = createTimestamp();
 */
export function createTimestamp(ms: number = Date.now()): Timestamp {
  return ms as Timestamp;
}

/**
 * Create a DurationMs from a number
 *
 * @example
 * const timeout = createDurationMs(5000);
 */
export function createDurationMs(ms: number): DurationMs {
  return ms as DurationMs;
}

/**
 * Create a Percentage from a number (clamped to 0-100)
 *
 * @example
 * const progress = createPercentage(75);
 */
export function createPercentage(value: number): Percentage {
  const clamped = Math.max(0, Math.min(100, value));
  return clamped as Percentage;
}

/**
 * Create a CentsAmount from a number
 *
 * @example
 * const price = createCentsAmount(999); // $9.99
 */
export function createCentsAmount(cents: number): CentsAmount {
  return Math.round(cents) as CentsAmount;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if a string looks like a valid user ID
 */
export function isValidUserId(value: string): value is UserId {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check if a string looks like a valid session ID
 */
export function isValidSessionId(value: string): value is SessionId {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check if a number is a valid percentage (0-100)
 */
export function isValidPercentage(value: number): value is Percentage {
  return typeof value === 'number' && value >= 0 && value <= 100;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Extract the base type from a branded type
 *
 * @example
 * type Base = Unbrand<UserId>; // string
 */
export type Unbrand<T> = T extends Brand<infer U, string> ? U : T;

/**
 * Make all branded types in an object optional
 */
export type PartialBranded<T> = {
  [K in keyof T]?: T[K];
};
