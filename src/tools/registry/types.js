/**
 * Tool Registry Types
 *
 * Core types for the domain-based tool registry system.
 * This enables agent-agnostic tool organization where tools are
 * registered by capability/domain rather than by persona.
 *
 * DESIGN PRINCIPLES:
 * 1. Tools are registered by WHAT they do, not WHO uses them
 * 2. Agents select tools by domain in their manifest
 * 3. No agent-specific code in tool implementations
 * 4. Tools are composable and reusable across agents
 */
/**
 * All available tool domains
 */
export const ALL_TOOL_DOMAINS = [
    'memory',
    'calendar',
    'communication',
    'habits',
    'finance',
    'research',
    'productivity',
    'life-planning',
    'wellness',
    'entertainment',
    'information',
    'wisdom',
    'handoff',
    'telephony',
    'grief',
    'meaning',
    'relationships',
    'stories',
    'curiosity',
    'vulnerability',
    'dreams',
    'play',
    'self-compassion',
    'presence',
    'proactive',
    'awareness',
    'engagement',
];
/**
 * Mapping from domains to categories
 */
export const DOMAIN_TO_CATEGORY = {
    memory: 'core',
    handoff: 'core',
    calendar: 'productivity',
    productivity: 'productivity',
    communication: 'communication',
    telephony: 'communication',
    habits: 'lifestyle',
    wellness: 'lifestyle',
    'life-planning': 'lifestyle',
    finance: 'financial',
    research: 'financial',
    information: 'information',
    wisdom: 'information',
    entertainment: 'entertainment',
    // Emotional/wisdom domains
    grief: 'lifestyle',
    meaning: 'lifestyle',
    relationships: 'lifestyle',
    stories: 'information',
    curiosity: 'information',
    vulnerability: 'lifestyle',
    dreams: 'lifestyle',
    play: 'entertainment',
    'self-compassion': 'lifestyle',
    presence: 'lifestyle',
    proactive: 'core',
    awareness: 'core',
    engagement: 'core',
};
// ============================================================================
// VALIDATION
// ============================================================================
/**
 * Validate a tool definition
 */
export function validateToolDefinition(def) {
    const errors = [];
    if (!def.id) {
        errors.push('Tool ID is required');
    }
    else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(def.id)) {
        errors.push('Tool ID must be alphanumeric and start with a letter');
    }
    if (!def.name) {
        errors.push('Tool name is required');
    }
    if (!def.domain) {
        errors.push('Tool domain is required');
    }
    else if (!ALL_TOOL_DOMAINS.includes(def.domain)) {
        errors.push(`Invalid domain: ${def.domain}`);
    }
    if (!def.create || typeof def.create !== 'function') {
        errors.push('Tool create function is required');
    }
    return errors;
}
/**
 * Validate a tool set specification
 */
export function validateToolSetSpec(spec) {
    const errors = [];
    if (spec.domains) {
        for (const domain of spec.domains) {
            if (!ALL_TOOL_DOMAINS.includes(domain)) {
                errors.push(`Invalid domain in spec: ${domain}`);
            }
        }
    }
    // Check for conflicts
    if (spec.required && spec.forbidden) {
        const conflicts = spec.required.filter((id) => spec.forbidden?.includes(id));
        if (conflicts.length > 0) {
            errors.push(`Tools cannot be both required and forbidden: ${conflicts.join(', ')}`);
        }
    }
    return errors;
}
/**
 * Default service registry implementation (no services)
 */
export class EmptyServiceRegistry {
    has() {
        return false;
    }
    get(service) {
        throw new Error(`Service not available: ${service}`);
    }
    getOptional() {
        return undefined;
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    ALL_TOOL_DOMAINS,
    DOMAIN_TO_CATEGORY,
    validateToolDefinition,
    validateToolSetSpec,
    EmptyServiceRegistry,
};
