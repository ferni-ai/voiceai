/**
 * Property & Vehicles Domain Hooks
 *
 * Auto-indexing hooks for major assets - vehicles, homes, property.
 * Helps with "when was my last oil change?" type queries.
 *
 * @module services/data-layer/hooks/property-hooks
 */
import type { VehicleEntity, HomeMaintenanceEntity, PropertyAssetEntity } from '../types.js';
/**
 * Called when vehicle information is added or updated
 */
export declare const onVehicleChange: import("../hook-generator.js").DomainHook<VehicleEntity>;
/**
 * Called when home maintenance tasks are recorded
 */
export declare const onHomeMaintenanceChange: import("../hook-generator.js").DomainHook<HomeMaintenanceEntity>;
/**
 * Called when property/real estate information is added or updated
 */
export declare const onPropertyAssetChange: import("../hook-generator.js").DomainHook<PropertyAssetEntity>;
//# sourceMappingURL=property-hooks.d.ts.map