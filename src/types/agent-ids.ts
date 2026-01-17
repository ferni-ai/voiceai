/**
 * Agent ID Type Definitions
 *
 * Canonical agent/persona IDs used throughout the system.
 * This file is at Level 10 (types layer) and can be imported by any layer.
 *
 * @module types/agent-ids
 */

// ============================================================================
// AGENT IDS
// ============================================================================

/**
 * Agent ID type - supports multiple ID formats for flexibility:
 * - Frontend IDs: jack-b, comm-specialist, spend-save, event-planner
 * - Canonical/Bundle IDs: ferni, alex-chen, maya-santos, jordan-taylor
 * - Short IDs: alex, maya, jordan
 */
export type AgentId =
  // Jordan (Life Planning)
  | 'jordan'
  | 'jordan-taylor' // Canonical ID
  | 'event-planner' // Frontend ID
  // Maya (Financial Habits)
  | 'maya'
  | 'maya-santos' // Canonical ID
  | 'spend-save' // Frontend ID
  // Alex (Communication)
  | 'alex'
  | 'alex-chen' // Canonical ID
  | 'comm-specialist' // Frontend ID
  // Peter John (Research Coach)
  | 'peter'
  | 'peter-john' // Canonical ID
  // Nayan Patel (Wisdom & Philosophy)
  | 'nayan'
  | 'nayan-patel' // Canonical ID
  // Ferni (Main Life Coach)
  | 'ferni'
  | 'jack-b'; // Frontend ID (legacy)

/**
 * Canonical persona IDs (the "official" ID for each persona)
 */
export type CanonicalPersonaId =
  | 'ferni'
  | 'maya-santos'
  | 'alex-chen'
  | 'jordan-taylor'
  | 'peter-john'
  | 'nayan-patel';

/**
 * Short persona IDs (for convenience)
 */
export type ShortPersonaId = 'ferni' | 'maya' | 'alex' | 'jordan' | 'peter' | 'nayan';

/**
 * Maps short IDs to canonical IDs
 */
export const SHORT_TO_CANONICAL: Record<ShortPersonaId, CanonicalPersonaId> = {
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
export function getCanonicalAgentId(agentId: AgentId): CanonicalPersonaId | null {
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
