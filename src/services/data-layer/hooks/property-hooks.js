/**
 * Property & Vehicles Domain Hooks
 *
 * Auto-indexing hooks for major assets - vehicles, homes, property.
 * Helps with "when was my last oil change?" type queries.
 *
 * @module services/data-layer/hooks/property-hooks
 */
import { createDomainHook, formatField, joinNonEmpty } from '../hook-generator.js';
// ============================================================================
// VEHICLE HOOKS
// ============================================================================
/**
 * Called when vehicle information is added or updated
 */
export const onVehicleChange = createDomainHook({
    entityType: 'vehicle',
    storeType: 'life-data',
    contentBuilder: (entity) => joinNonEmpty([
        `Vehicle: ${entity.year} ${entity.make} ${entity.model}`,
        formatField('Nickname', entity.nickname),
        entity.mileage ? `(${entity.mileage.toLocaleString()} miles)` : undefined,
        formatField('Insurance expires', entity.insuranceExpiry),
        formatField('Registration expires', entity.registrationExpiry),
    ]),
});
// ============================================================================
// HOME MAINTENANCE HOOKS
// ============================================================================
/**
 * Called when home maintenance tasks are recorded
 */
export const onHomeMaintenanceChange = createDomainHook({
    entityType: 'home_maintenance',
    storeType: 'productivity',
    contentBuilder: (entity) => joinNonEmpty([
        `Home maintenance: ${entity.task} (${entity.category})`,
        formatField('Frequency', entity.frequency),
        formatField('Last done', entity.lastDone),
        formatField('Next due', entity.nextDue),
        formatField('Vendor', entity.vendor),
    ]),
    shouldSkip: (entity) => {
        // Skip if task is complete and more than 30 days old
        if (entity.lastDone && !entity.nextDue) {
            const lastDone = new Date(entity.lastDone);
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            return lastDone < thirtyDaysAgo;
        }
        return false;
    },
});
// ============================================================================
// PROPERTY ASSET HOOKS
// ============================================================================
/**
 * Called when property/real estate information is added or updated
 */
export const onPropertyAssetChange = createDomainHook({
    entityType: 'property_asset',
    storeType: 'financial',
    contentBuilder: (entity) => joinNonEmpty([
        `Property: ${entity.name} (${entity.type})`,
        formatField('Address', entity.address),
        entity.currentValue ? `Value: $${entity.currentValue.toLocaleString()}` : undefined,
        entity.mortgageBalance ? `Mortgage: $${entity.mortgageBalance.toLocaleString()}` : undefined,
    ]),
});
//# sourceMappingURL=property-hooks.js.map