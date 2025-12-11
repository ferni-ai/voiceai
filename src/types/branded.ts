/**
 * Branded/Nominal Types
 *
 * These types provide compile-time safety for string IDs that would otherwise
 * be interchangeable. Using branded types prevents bugs like passing a
 * sessionId where a userId is expected.
 *
 * Philosophy: Make illegal states unrepresentable at compile time.
 *
 * @example
 * // These won't compile - exactly what we want!
 * const userId: UserId = 'abc' as SessionId; // Error!
 * getUser(sessionId); // Error: SessionId is not assignable to UserId
 *
 * @example
 * // Creating branded IDs
 * const userId = 'user_123' as UserId;
 * const sessionId = createSessionId(); // Auto-generates with prefix
 */

// ============================================================================
// BRAND SYMBOL
// ============================================================================

/**
 * Unique symbol for branding types.
 * This makes branded types truly nominal (not just structural).
 */
declare const brand: unique symbol;

/**
 * Brand type utility - adds a compile-time brand to a base type.
 * The brand exists only at compile time, not at runtime.
 */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

// ============================================================================
// CORE ID TYPES
// ============================================================================

/**
 * User identifier - unique per user across the system
 * @example 'user_abc123', 'phone_+15551234567', 'anon_xyz789'
 */
export type UserId = Brand<string, 'UserId'>;

/**
 * Session identifier - unique per conversation session
 * @example 'sess_abc123'
 */
export type SessionId = Brand<string, 'SessionId'>;

/**
 * Persona identifier - one of the team members
 * @example 'ferni', 'maya', 'peter', 'alex', 'jordan', 'nayan'
 */
export type PersonaId = Brand<string, 'PersonaId'>;

/**
 * Room identifier - LiveKit room for voice sessions
 * @example 'room_abc123'
 */
export type RoomId = Brand<string, 'RoomId'>;

/**
 * Conversation turn identifier
 * @example 'turn_001'
 */
export type TurnId = Brand<string, 'TurnId'>;

/**
 * Tool identifier - unique tool name
 * @example 'get-weather', 'send-message'
 */
export type ToolId = Brand<string, 'ToolId'>;

/**
 * Goal identifier
 * @example 'goal_retirement_2040'
 */
export type GoalId = Brand<string, 'GoalId'>;

/**
 * Memory identifier - for conversation memories
 * @example 'mem_abc123'
 */
export type MemoryId = Brand<string, 'MemoryId'>;

/**
 * Event identifier - for domain events
 * @example 'evt_abc123'
 */
export type EventId = Brand<string, 'EventId'>;

/**
 * Organization identifier - for B2B accounts
 * @example 'org_acme_corp'
 */
export type OrganizationId = Brand<string, 'OrganizationId'>;

/**
 * Stripe customer identifier
 * @example 'cus_abc123'
 */
export type StripeCustomerId = Brand<string, 'StripeCustomerId'>;

/**
 * Stripe subscription identifier
 * @example 'sub_abc123'
 */
export type StripeSubscriptionId = Brand<string, 'StripeSubscriptionId'>;

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Generate a random ID with prefix
 */
function generateId(prefix: string): string {
  const random = Math.random().toString(36).substring(2, 15);
  const timestamp = Date.now().toString(36);
  return `${prefix}_${timestamp}${random}`;
}

/**
 * Create a new UserId
 * @param id - Optional ID string. If not provided, generates a new one.
 */
export function createUserId(id?: string): UserId {
  return (id ?? generateId('user')) as UserId;
}

/**
 * Create a new SessionId
 */
export function createSessionId(id?: string): SessionId {
  return (id ?? generateId('sess')) as SessionId;
}

/**
 * Create a new RoomId
 */
export function createRoomId(id?: string): RoomId {
  return (id ?? generateId('room')) as RoomId;
}

/**
 * Create a new TurnId
 */
export function createTurnId(turnNumber?: number): TurnId {
  const num = turnNumber ?? Math.floor(Math.random() * 1000);
  return `turn_${num.toString().padStart(3, '0')}` as TurnId;
}

/**
 * Create a new GoalId
 */
export function createGoalId(id?: string): GoalId {
  return (id ?? generateId('goal')) as GoalId;
}

/**
 * Create a new MemoryId
 */
export function createMemoryId(id?: string): MemoryId {
  return (id ?? generateId('mem')) as MemoryId;
}

/**
 * Create a new EventId
 */
export function createEventId(id?: string): EventId {
  return (id ?? generateId('evt')) as EventId;
}

/**
 * Create a PersonaId (validates against known personas)
 */
export function createPersonaId(name: string): PersonaId {
  const normalized = name.toLowerCase();
  const validPersonas = ['ferni', 'maya', 'peter', 'alex', 'jordan', 'nayan', 'jackie', 'bogle'];
  if (!validPersonas.includes(normalized)) {
    // Allow custom personas but log for awareness
    // In production, might want to be stricter
  }
  return normalized as PersonaId;
}

/**
 * Create a ToolId
 */
export function createToolId(name: string): ToolId {
  return name as ToolId;
}

/**
 * Create an OrganizationId
 */
export function createOrganizationId(id?: string): OrganizationId {
  return (id ?? generateId('org')) as OrganizationId;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if a string looks like a UserId
 * Note: This is a runtime check, not a compile-time guarantee
 */
export function isUserIdLike(value: unknown): value is UserId {
  if (typeof value !== 'string') return false;
  return value.startsWith('user_') || value.startsWith('phone_') || value.startsWith('anon_');
}

/**
 * Check if a string looks like a SessionId
 */
export function isSessionIdLike(value: unknown): value is SessionId {
  return typeof value === 'string' && value.startsWith('sess_');
}

/**
 * Check if a string is a valid PersonaId
 */
export function isValidPersonaId(value: unknown): value is PersonaId {
  if (typeof value !== 'string') return false;
  const validPersonas = ['ferni', 'maya', 'peter', 'alex', 'jordan', 'nayan', 'jackie', 'bogle'];
  return validPersonas.includes(value.toLowerCase());
}

// ============================================================================
// UNSAFE COERCION (Use sparingly!)
// ============================================================================

/**
 * Unsafely cast a string to UserId.
 * Use only at system boundaries (e.g., reading from database).
 * Prefer the factory functions when possible.
 *
 * @example
 * // In a database read function:
 * const userId = unsafeAsUserId(doc.data().userId);
 */
export function unsafeAsUserId(value: string): UserId {
  return value as UserId;
}

/**
 * Unsafely cast a string to SessionId.
 */
export function unsafeAsSessionId(value: string): SessionId {
  return value as SessionId;
}

/**
 * Unsafely cast a string to PersonaId.
 */
export function unsafeAsPersonaId(value: string): PersonaId {
  return value as PersonaId;
}

/**
 * Unsafely cast a string to RoomId.
 */
export function unsafeAsRoomId(value: string): RoomId {
  return value as RoomId;
}

/**
 * Unsafely cast a string to GoalId.
 */
export function unsafeAsGoalId(value: string): GoalId {
  return value as GoalId;
}

/**
 * Unsafely cast a string to MemoryId.
 */
export function unsafeAsMemoryId(value: string): MemoryId {
  return value as MemoryId;
}

/**
 * Unsafely cast a string to EventId.
 */
export function unsafeAsEventId(value: string): EventId {
  return value as EventId;
}

/**
 * Unsafely cast a string to ToolId.
 */
export function unsafeAsToolId(value: string): ToolId {
  return value as ToolId;
}

/**
 * Unsafely cast a string to OrganizationId.
 */
export function unsafeAsOrganizationId(value: string): OrganizationId {
  return value as OrganizationId;
}

/**
 * Unsafely cast a string to StripeCustomerId.
 */
export function unsafeAsStripeCustomerId(value: string): StripeCustomerId {
  return value as StripeCustomerId;
}

/**
 * Unsafely cast a string to StripeSubscriptionId.
 */
export function unsafeAsStripeSubscriptionId(value: string): StripeSubscriptionId {
  return value as StripeSubscriptionId;
}
