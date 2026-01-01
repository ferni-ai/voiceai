/**
 * Crisis & Support Domain Hooks
 *
 * Auto-indexing hooks for crisis episodes and support received.
 * Critical for learning how to best support the user in future crises.
 * "What helped last time?" becomes answerable.
 *
 * @module services/data-layer/hooks/crisis-hooks
 */

import { createDomainHook, formatField, joinNonEmpty } from '../hook-generator.js';
import type { CrisisEpisodeEntity, SupportReceivedEntity } from '../types.js';

// ============================================================================
// CRISIS EPISODE HOOKS
// ============================================================================

/**
 * Called when a crisis episode is recorded
 * This is sensitive data - we remember it to provide better future support
 */
export const onCrisisEpisodeChange = createDomainHook<CrisisEpisodeEntity>({
  entityType: 'crisis_episode',
  storeType: 'superhuman',
  contentBuilder: (entity: CrisisEpisodeEntity) =>
    joinNonEmpty([
      `Crisis episode: ${entity.description} [${entity.type}] (${entity.severity})`,
      formatField('Resolution', entity.resolution),
      entity.whatHelped?.length ? `What helped: ${entity.whatHelped.join(', ')}` : undefined,
      entity.lessonsLearned?.length ? `Lessons: ${entity.lessonsLearned.join(', ')}` : undefined,
    ]),
});

// ============================================================================
// SUPPORT RECEIVED HOOKS
// ============================================================================

/**
 * Called when user mentions support they received from others
 * Helps us understand their support network
 */
export const onSupportReceivedChange = createDomainHook<SupportReceivedEntity>({
  entityType: 'support_received',
  storeType: 'contacts',
  contentBuilder: (entity: SupportReceivedEntity) =>
    joinNonEmpty([
      `Support received from ${entity.from} (${entity.type}): ${entity.description}`,
      formatField('Impact', entity.impact),
    ]),
});
