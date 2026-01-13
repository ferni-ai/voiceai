/**
 * Humanizer Type Definitions
 *
 * Types for the conversation humanization system.
 *
 * @module @ferni/conversation/humanizer/types
 */
/**
 * Comfort level by relationship stage
 */
export const COMFORT_LEVELS = {
    stranger: 0.25,
    acquaintance: 0.45,
    friend: 0.65,
    trusted_advisor: 0.85,
};
/**
 * Map relationship stage to Better Than Human format
 */
export const RELATIONSHIP_STAGE_MAP = {
    stranger: 'new_acquaintance',
    acquaintance: 'getting_to_know',
    friend: 'trusted_advisor',
    trusted_advisor: 'old_friend',
};
//# sourceMappingURL=types.js.map