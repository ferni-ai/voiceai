/**
 * Pets & Animals Domain Hooks
 *
 * Auto-indexing hooks for pet family members.
 * Pets are family - we remember them with the same care as human relationships.
 *
 * @module services/data-layer/hooks/pets-hooks
 */
import type { PetEntity, PetHealthEntity, PetMilestoneEntity } from '../types.js';
/**
 * Called when pet information is added, updated, or removed
 */
export declare const onPetChange: import("../hook-generator.js").DomainHook<PetEntity>;
/**
 * Called when pet health records are updated
 */
export declare const onPetHealthChange: import("../hook-generator.js").DomainHook<PetHealthEntity>;
/**
 * Called when a pet milestone is recorded (birthdays, adoption days, etc.)
 */
export declare const onPetMilestoneChange: import("../hook-generator.js").DomainHook<PetMilestoneEntity>;
//# sourceMappingURL=pets-hooks.d.ts.map