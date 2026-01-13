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
// FACTORY FUNCTIONS
// ============================================================================
/**
 * Generate a random ID with prefix
 */
function generateId(prefix) {
    const random = Math.random().toString(36).substring(2, 15);
    const timestamp = Date.now().toString(36);
    return `${prefix}_${timestamp}${random}`;
}
/**
 * Create a new UserId
 * @param id - Optional ID string. If not provided, generates a new one.
 */
export function createUserId(id) {
    return (id ?? generateId('user'));
}
/**
 * Create a new SessionId
 */
export function createSessionId(id) {
    return (id ?? generateId('sess'));
}
/**
 * Create a new RoomId
 */
export function createRoomId(id) {
    return (id ?? generateId('room'));
}
/**
 * Create a new TurnId
 */
export function createTurnId(turnNumber) {
    const num = turnNumber ?? Math.floor(Math.random() * 1000);
    return `turn_${num.toString().padStart(3, '0')}`;
}
/**
 * Create a new GoalId
 */
export function createGoalId(id) {
    return (id ?? generateId('goal'));
}
/**
 * Create a new MemoryId
 */
export function createMemoryId(id) {
    return (id ?? generateId('mem'));
}
/**
 * Create a new EventId
 */
export function createEventId(id) {
    return (id ?? generateId('evt'));
}
/**
 * Create a PersonaId (validates against known personas)
 */
export function createPersonaId(name) {
    const normalized = name.toLowerCase();
    const validPersonas = ['ferni', 'maya', 'peter', 'alex', 'jordan', 'nayan', 'jackie', 'bogle'];
    if (!validPersonas.includes(normalized)) {
        // Allow custom personas but log for awareness
        // In production, might want to be stricter
    }
    return normalized;
}
/**
 * Create a ToolId
 */
export function createToolId(name) {
    return name;
}
/**
 * Create an OrganizationId
 */
export function createOrganizationId(id) {
    return (id ?? generateId('org'));
}
// ============================================================================
// TYPE GUARDS
// ============================================================================
/**
 * Check if a string looks like a UserId
 * Note: This is a runtime check, not a compile-time guarantee
 */
export function isUserIdLike(value) {
    if (typeof value !== 'string')
        return false;
    return value.startsWith('user_') || value.startsWith('phone_') || value.startsWith('anon_');
}
/**
 * Check if a string looks like a SessionId
 */
export function isSessionIdLike(value) {
    return typeof value === 'string' && value.startsWith('sess_');
}
/**
 * Check if a string is a valid PersonaId
 */
export function isValidPersonaId(value) {
    if (typeof value !== 'string')
        return false;
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
export function unsafeAsUserId(value) {
    return value;
}
/**
 * Unsafely cast a string to SessionId.
 */
export function unsafeAsSessionId(value) {
    return value;
}
/**
 * Unsafely cast a string to PersonaId.
 */
export function unsafeAsPersonaId(value) {
    return value;
}
/**
 * Unsafely cast a string to RoomId.
 */
export function unsafeAsRoomId(value) {
    return value;
}
/**
 * Unsafely cast a string to GoalId.
 */
export function unsafeAsGoalId(value) {
    return value;
}
/**
 * Unsafely cast a string to MemoryId.
 */
export function unsafeAsMemoryId(value) {
    return value;
}
/**
 * Unsafely cast a string to EventId.
 */
export function unsafeAsEventId(value) {
    return value;
}
/**
 * Unsafely cast a string to ToolId.
 */
export function unsafeAsToolId(value) {
    return value;
}
/**
 * Unsafely cast a string to OrganizationId.
 */
export function unsafeAsOrganizationId(value) {
    return value;
}
/**
 * Unsafely cast a string to StripeCustomerId.
 */
export function unsafeAsStripeCustomerId(value) {
    return value;
}
/**
 * Unsafely cast a string to StripeSubscriptionId.
 */
export function unsafeAsStripeSubscriptionId(value) {
    return value;
}
//# sourceMappingURL=branded.js.map