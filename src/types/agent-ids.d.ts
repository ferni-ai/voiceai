/**
 * Agent ID Type Definitions
 *
 * Canonical agent/persona IDs used throughout the system.
 * This file is at Level 10 (types layer) and can be imported by any layer.
 *
 * @module types/agent-ids
 */
/**
 * Agent ID type - supports multiple ID formats for flexibility:
 * - Frontend IDs: jack-b, comm-specialist, spend-save, event-planner
 * - Canonical/Bundle IDs: ferni, alex-chen, maya-santos, jordan-taylor
 * - Short IDs: alex, maya, jordan
 */
export type AgentId = 'jordan' | 'jordan-taylor' | 'event-planner' | 'maya' | 'maya-santos' | 'spend-save' | 'alex' | 'alex-chen' | 'comm-specialist' | 'peter' | 'peter-john' | 'nayan' | 'nayan-patel' | 'ferni' | 'jack-b';
/**
 * Canonical persona IDs (the "official" ID for each persona)
 */
export type CanonicalPersonaId = 'ferni' | 'maya-santos' | 'alex-chen' | 'jordan-taylor' | 'peter-john' | 'nayan-patel';
/**
 * Short persona IDs (for convenience)
 */
export type ShortPersonaId = 'ferni' | 'maya' | 'alex' | 'jordan' | 'peter' | 'nayan';
/**
 * Maps short IDs to canonical IDs
 */
export declare const SHORT_TO_CANONICAL: Record<ShortPersonaId, CanonicalPersonaId>;
/**
 * Get canonical ID from any agent ID format
 */
export declare function getCanonicalAgentId(agentId: AgentId): CanonicalPersonaId | null;
//# sourceMappingURL=agent-ids.d.ts.map