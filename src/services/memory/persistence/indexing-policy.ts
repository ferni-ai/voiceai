/**
 * Indexing Policy Helpers
 *
 * Functions for querying and evaluating entity indexing policies.
 * Policy data declarations live in entity-policies.ts.
 *
 * @module services/memory/persistence/indexing-policy
 */

import type { EntityIndexingPolicy, EntityType, IndexingPolicy } from '../../data-layer/types.js';
import { DEFAULT_INDEXING_POLICY, getPoliciesByDomain as getDomainPolicies } from './entity-policies.js';

// ============================================================================
// POLICY STATE
// ============================================================================

let currentPolicy: IndexingPolicy = DEFAULT_INDEXING_POLICY;

/**
 * Get the current indexing policy
 */
export function getIndexingPolicy(): IndexingPolicy {
  return currentPolicy;
}

/**
 * Update the indexing policy
 */
export function setIndexingPolicy(policy: Partial<IndexingPolicy>): void {
  currentPolicy = { ...currentPolicy, ...policy };
}

/**
 * Get policy for a specific entity type
 */
export function getEntityPolicy(entityType: EntityType): EntityIndexingPolicy | undefined {
  return currentPolicy.entities.find((e) => e.entityType === entityType);
}

/**
 * Check if an entity should be indexed based on policy
 */
export function shouldIndex(
  entityType: EntityType,
  entity: Record<string, unknown>
): { shouldIndex: boolean; reason: string } {
  const policy = getEntityPolicy(entityType);

  if (!policy) {
    return { shouldIndex: false, reason: 'No policy defined for entity type' };
  }

  if (policy.priority === 'never') {
    return { shouldIndex: false, reason: 'Policy priority is never' };
  }

  const conditions = policy.conditions || {};

  // Check active condition
  if (conditions.activeOnly) {
    const isActive =
      entity.isActive === true ||
      entity.status === 'active' ||
      entity.status === 'planning' ||
      entity.status === 'in-progress' ||
      entity.status === 'exploring' ||
      entity.status === 'upcoming' ||
      entity.status === 'pending' ||
      entity.completed === false ||
      entity.isPaid === false ||
      entity.delivered === false ||
      entity.resolved === false;

    if (!isActive) {
      return { shouldIndex: false, reason: 'Entity is not active' };
    }
  }

  // Check important condition
  if (conditions.importantOnly) {
    const isImportant =
      entity.priority === 'high' ||
      entity.priority === 'urgent' ||
      entity.priority === 'critical' ||
      entity.importance === 'high';

    if (!isImportant) {
      return { shouldIndex: false, reason: 'Entity is not important' };
    }
  }

  // Check minimum value
  if (conditions.minValue !== undefined) {
    const value = (entity.amount as number) || (entity.targetAmount as number) || 0;
    if (value < conditions.minValue) {
      return { shouldIndex: false, reason: `Value ${value} below minimum ${conditions.minValue}` };
    }
  }

  return { shouldIndex: true, reason: 'Passes all policy conditions' };
}

/**
 * Build indexable content from entity based on policy
 */
export function buildIndexContent(entityType: EntityType, entity: Record<string, unknown>): string {
  const policy = getEntityPolicy(entityType);
  if (!policy) return '';

  const parts: string[] = [];

  // Add entity type label
  parts.push(`${entityType.replace(/_/g, ' ')}:`);

  // Add configured fields
  for (const field of policy.contentFields) {
    const value = entity[field];
    if (value !== undefined && value !== null && value !== '') {
      if (Array.isArray(value)) {
        parts.push(`${field}: ${value.join(', ')}`);
      } else if (typeof value === 'object') {
        parts.push(`${field}: ${JSON.stringify(value)}`);
      } else {
        parts.push(`${value}`);
      }
    }
  }

  return parts.join(' ').trim();
}

/**
 * Get all policies as a record keyed by entity type
 */
export function getAllPolicies(): Record<EntityType, EntityIndexingPolicy> {
  const policies: Partial<Record<EntityType, EntityIndexingPolicy>> = {};
  for (const entityPolicy of currentPolicy.entities) {
    policies[entityPolicy.entityType] = entityPolicy;
  }
  return policies as Record<EntityType, EntityIndexingPolicy>;
}

/**
 * Get all policies grouped by domain
 */
export function getPoliciesByDomain(): Record<string, EntityIndexingPolicy[]> {
  return getDomainPolicies();
}
