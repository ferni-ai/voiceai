/**
 * Agent ID Type Definitions
 *
 * Canonical agent/persona IDs used throughout the system.
 * This file is at Level 10 (types layer) and can be imported by any layer.
 *
 * @module types/agent-ids
 */
/**
 * Maps short IDs to canonical IDs
 */
export const SHORT_TO_CANONICAL = {
    ferni: 'ferni',
    maya: 'maya-santos',
    alex: 'alex-chen',
    jordan: 'jordan-taylor',
    peter: 'peter-john',
    nayan: 'nayan-patel',
};
/**
 * Get canonical ID from any agent ID format
 */
export function getCanonicalAgentId(agentId) {
    switch (agentId) {
        case 'ferni':
        case 'jack-b':
            return 'ferni';
        case 'maya':
        case 'maya-santos':
        case 'spend-save':
            return 'maya-santos';
        case 'alex':
        case 'alex-chen':
        case 'comm-specialist':
            return 'alex-chen';
        case 'jordan':
        case 'jordan-taylor':
        case 'event-planner':
            return 'jordan-taylor';
        case 'peter':
        case 'peter-john':
            return 'peter-john';
        case 'nayan':
        case 'nayan-patel':
            return 'nayan-patel';
        default:
            return null;
    }
}
//# sourceMappingURL=agent-ids.js.map