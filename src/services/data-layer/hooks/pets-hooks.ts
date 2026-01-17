/**
 * Pets & Animals Domain Hooks
 *
 * Auto-indexing hooks for pet family members.
 * Pets are family - we remember them with the same care as human relationships.
 *
 * @module services/data-layer/hooks/pets-hooks
 */

import { createDomainHook, formatField, joinNonEmpty } from '../hook-generator.js';
import type { PetEntity, PetHealthEntity, PetMilestoneEntity } from '../types.js';

// ============================================================================
// PET HOOKS
// ============================================================================

/**
 * Called when pet information is added, updated, or removed
 */
export const onPetChange = createDomainHook<PetEntity>({
  entityType: 'pet',
  storeType: 'contacts',
  contentBuilder: (entity: PetEntity) =>
    joinNonEmpty([
      `Pet: ${entity.name} (${entity.species})`,
      formatField('Breed', entity.breed),
      entity.personality?.length ? `Personality: ${entity.personality.join(', ')}` : undefined,
      entity.quirks?.length ? `Quirks: ${entity.quirks.join(', ')}` : undefined,
      entity.favorites?.food ? `Loves ${entity.favorites.food}` : undefined,
    ]),
});

// ============================================================================
// PET HEALTH HOOKS
// ============================================================================

/**
 * Called when pet health records are updated
 */
export const onPetHealthChange = createDomainHook<PetHealthEntity>({
  entityType: 'pet_health',
  storeType: 'health',
  contentBuilder: (entity: PetHealthEntity) =>
    joinNonEmpty([
      `Pet health (${entity.petName}): ${entity.recordType} - ${entity.description}`,
      formatField('Date', entity.date),
      formatField('Next due', entity.nextDue),
      formatField('Vet', entity.vetName),
    ]),
});

// ============================================================================
// PET MILESTONE HOOKS
// ============================================================================

/**
 * Called when a pet milestone is recorded (birthdays, adoption days, etc.)
 */
export const onPetMilestoneChange = createDomainHook<PetMilestoneEntity>({
  entityType: 'pet_milestone',
  storeType: 'life-data',
  contentBuilder: (entity: PetMilestoneEntity) =>
    joinNonEmpty([
      `Pet milestone (${entity.petName}): ${entity.milestone} [${entity.type}]`,
      formatField('Date', entity.date),
      formatField('Celebration', entity.celebration),
    ]),
});
