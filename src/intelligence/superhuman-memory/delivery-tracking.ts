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
const deliveredInsights = new Map<string, Date>();

/**
 * Mark an insight as delivered
 */
export function markInsightDelivered(insightId: string): void {
  deliveredInsights.set(insightId, new Date());
}

/**
 * Check if an insight was recently delivered
 */
export function wasRecentlyDelivered(insightId: string, cooldownHours = 24): boolean {
  const deliveredAt = deliveredInsights.get(insightId);
  if (!deliveredAt) return false;

  const hoursSinceDelivery = (Date.now() - deliveredAt.getTime()) / (1000 * 60 * 60);
  return hoursSinceDelivery < cooldownHours;
}

/**
 * Clear old delivery records
 */
export function cleanupDeliveryRecords(): void {
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
export function getDeliveryCount(): number {
  return deliveredInsights.size;
}

/**
 * Clear all delivery records (for testing)
 */
export function clearAllDeliveryRecords(): void {
  deliveredInsights.clear();
}
