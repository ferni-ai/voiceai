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
/**
 * Unique symbol for branding types.
 * This makes branded types truly nominal (not just structural).
 */
declare const brand: unique symbol;
/**
 * Brand type utility - adds a compile-time brand to a base type.
 * The brand exists only at compile time, not at runtime.
 */
export type Brand<T, B extends string> = T & {
    readonly [brand]: B;
};
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
/**
 * Create a new UserId
 * @param id - Optional ID string. If not provided, generates a new one.
 */
export declare function createUserId(id?: string): UserId;
/**
 * Create a new SessionId
 */
export declare function createSessionId(id?: string): SessionId;
/**
 * Create a new RoomId
 */
export declare function createRoomId(id?: string): RoomId;
/**
 * Create a new TurnId
 */
export declare function createTurnId(turnNumber?: number): TurnId;
/**
 * Create a new GoalId
 */
export declare function createGoalId(id?: string): GoalId;
/**
 * Create a new MemoryId
 */
export declare function createMemoryId(id?: string): MemoryId;
/**
 * Create a new EventId
 */
export declare function createEventId(id?: string): EventId;
/**
 * Create a PersonaId (validates against known personas)
 */
export declare function createPersonaId(name: string): PersonaId;
/**
 * Create a ToolId
 */
export declare function createToolId(name: string): ToolId;
/**
 * Create an OrganizationId
 */
export declare function createOrganizationId(id?: string): OrganizationId;
/**
 * Check if a string looks like a UserId
 * Note: This is a runtime check, not a compile-time guarantee
 */
export declare function isUserIdLike(value: unknown): value is UserId;
/**
 * Check if a string looks like a SessionId
 */
export declare function isSessionIdLike(value: unknown): value is SessionId;
/**
 * Check if a string is a valid PersonaId
 */
export declare function isValidPersonaId(value: unknown): value is PersonaId;
/**
 * Unsafely cast a string to UserId.
 * Use only at system boundaries (e.g., reading from database).
 * Prefer the factory functions when possible.
 *
 * @example
 * // In a database read function:
 * const userId = unsafeAsUserId(doc.data().userId);
 */
export declare function unsafeAsUserId(value: string): UserId;
/**
 * Unsafely cast a string to SessionId.
 */
export declare function unsafeAsSessionId(value: string): SessionId;
/**
 * Unsafely cast a string to PersonaId.
 */
export declare function unsafeAsPersonaId(value: string): PersonaId;
/**
 * Unsafely cast a string to RoomId.
 */
export declare function unsafeAsRoomId(value: string): RoomId;
/**
 * Unsafely cast a string to GoalId.
 */
export declare function unsafeAsGoalId(value: string): GoalId;
/**
 * Unsafely cast a string to MemoryId.
 */
export declare function unsafeAsMemoryId(value: string): MemoryId;
/**
 * Unsafely cast a string to EventId.
 */
export declare function unsafeAsEventId(value: string): EventId;
/**
 * Unsafely cast a string to ToolId.
 */
export declare function unsafeAsToolId(value: string): ToolId;
/**
 * Unsafely cast a string to OrganizationId.
 */
export declare function unsafeAsOrganizationId(value: string): OrganizationId;
/**
 * Unsafely cast a string to StripeCustomerId.
 */
export declare function unsafeAsStripeCustomerId(value: string): StripeCustomerId;
/**
 * Unsafely cast a string to StripeSubscriptionId.
 */
export declare function unsafeAsStripeSubscriptionId(value: string): StripeSubscriptionId;
export {};
//# sourceMappingURL=branded.d.ts.map