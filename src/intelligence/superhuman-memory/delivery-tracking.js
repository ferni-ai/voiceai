/**
 * Delivery Tracking
 *
 * Track which insights have been delivered to avoid repetition.
 *
 * @module superhuman-memory/delivery-tracking
 */
/**
 * Delivered insights tracker
 */
const deliveredInsights = new Map();
/**
 * Mark an insight as delivered
 */
export function markInsightDelivered(insightId) {
    deliveredInsights.set(insightId, new Date());
}
/**
 * Check if an insight was recently delivered
 */
export function wasRecentlyDelivered(insightId, cooldownHours = 24) {
    const deliveredAt = deliveredInsights.get(insightId);
    if (!deliveredAt)
        return false;
    const hoursSinceDelivery = (Date.now() - deliveredAt.getTime()) / (1000 * 60 * 60);
    return hoursSinceDelivery < cooldownHours;
}
/**
 * Clear old delivery records
 */
export function cleanupDeliveryRecords() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    for (const [id, deliveredAt] of deliveredInsights) {
        if (deliveredAt < oneDayAgo) {
            deliveredInsights.delete(id);
        }
    }
}
/**
 * Get count of tracked deliveries (for testing/debugging)
 */
export function getDeliveryCount() {
    return deliveredInsights.size;
}
/**
 * Clear all delivery records (for testing)
 */
export function clearAllDeliveryRecords() {
    deliveredInsights.clear();
}
//# sourceMappingURL=delivery-tracking.js.map