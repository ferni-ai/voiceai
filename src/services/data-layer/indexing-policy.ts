/**
 * Indexing Policy Configuration (Re-export Shim)
 *
 * This module has been consolidated into services/memory/persistence/.
 * This shim preserves backward compatibility for existing importers.
 *
 * @module services/data-layer/indexing-policy
 * @deprecated Import from '../memory/persistence/indexing-policy.js' instead
 */

// Policy data declarations
export { DEFAULT_INDEXING_POLICY } from '../memory/persistence/entity-policies.js';

// Policy helper functions
export {
  getIndexingPolicy,
  setIndexingPolicy,
  getEntityPolicy,
  shouldIndex,
  buildIndexContent,
  getAllPolicies,
  getPoliciesByDomain,
} from '../memory/persistence/indexing-policy.js';
