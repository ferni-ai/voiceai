/**
 * Delivery Tracking
 *
 * Track which insights have been delivered to avoid repetition.
 *
 * @module superhuman-memory/delivery-tracking
 */
/**
 * Mark an insight as delivered
 */
export declare function markInsightDelivered(insightId: string): void;
/**
 * Check if an insight was recently delivered
 */
export declare function wasRecentlyDelivered(insightId: string, cooldownHours?: number): boolean;
/**
 * Clear old delivery records
 */
export declare function cleanupDeliveryRecords(): void;
/**
 * Get count of tracked deliveries (for testing/debugging)
 */
export declare function getDeliveryCount(): number;
/**
 * Clear all delivery records (for testing)
 */
export declare function clearAllDeliveryRecords(): void;
//# sourceMappingURL=delivery-tracking.d.ts.map