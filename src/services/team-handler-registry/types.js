/**
 * Team Handler Registry Types
 *
 * Defines the types for a generic team handler system that allows
 * cross-agent communication without hard-coded agent names.
 *
 * DESIGN PRINCIPLES:
 * 1. Handlers are registered by capability, not by agent name
 * 2. Agents declare which capabilities they can handle in their manifest
 * 3. The registry routes requests to the appropriate handler
 * 4. Handlers can be shared across agents with similar capabilities
 */
/**
 * All handler capabilities
 */
export const ALL_HANDLER_CAPABILITIES = [
    'savings-goals',
    'budgets',
    'expense-tracking',
    'financial-status',
    'milestones',
    'goals',
    'retirement',
    'scheduling',
    'reminders',
    'notifications',
    'contacts',
    'team-status',
    'context-sharing',
    'escalation',
    'insights',
    'analysis',
];
// ============================================================================
// VALIDATION
// ============================================================================
/**
 * Validate a handler definition
 */
export function validateHandlerDefinition(def) {
    const errors = [];
    if (!def.id) {
        errors.push('Handler ID is required');
    }
    else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(def.id)) {
        errors.push('Handler ID must be alphanumeric and start with a letter');
    }
    if (!def.name) {
        errors.push('Handler name is required');
    }
    if (!def.capability) {
        errors.push('Handler capability is required');
    }
    else if (!ALL_HANDLER_CAPABILITIES.includes(def.capability)) {
        errors.push(`Invalid capability: ${def.capability}`);
    }
    if (!def.execute || typeof def.execute !== 'function') {
        errors.push('Handler execute function is required');
    }
    return errors;
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    ALL_HANDLER_CAPABILITIES,
    validateHandlerDefinition,
};
//# sourceMappingURL=types.js.map