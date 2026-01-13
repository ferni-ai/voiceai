/**
 * Delivery Tracker
 *
 * Centralized tracking of all outreach deliveries across channels:
 * - Unified status tracking
 * - Cross-channel analytics
 * - Retry coordination
 * - Delivery queue management
 */
export type DeliveryChannel = 'sms' | 'email' | 'call' | 'push' | 'voice_message';
export type DeliveryStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'responded' | 'failed' | 'bounced' | 'unsubscribed';
export interface UnifiedDeliveryRecord {
    id: string;
    outreachId: string;
    userId: string;
    personaId: string;
    channel: DeliveryChannel;
    status: DeliveryStatus;
    externalId?: string;
    queuedAt: Date;
    sentAt?: Date;
    deliveredAt?: Date;
    openedAt?: Date;
    clickedAt?: Date;
    respondedAt?: Date;
    to: string;
    subject?: string;
    bodyPreview?: string;
    triggerType: string;
    priority: 'urgent' | 'high' | 'medium' | 'low';
    retryCount: number;
    maxRetries: number;
    lastError?: string;
    errorCode?: string;
    segments?: number;
    clickedLinks?: string[];
}
export interface DeliveryQueueItem {
    id: string;
    outreachId: string;
    userId: string;
    personaId: string;
    channel: DeliveryChannel;
    priority: 'urgent' | 'high' | 'medium' | 'low';
    scheduledFor: Date;
    payload: {
        to: string;
        body: string;
        subject?: string;
        html?: string;
        mediaUrl?: string;
        title?: string;
        phone?: string;
        data?: Record<string, string>;
    };
    retryCount: number;
    maxRetries: number;
    createdAt: Date;
}
export interface DeliveryStats {
    total: number;
    byStatus: Record<DeliveryStatus, number>;
    byChannel: Record<DeliveryChannel, number>;
    successRate: number;
    avgDeliveryTimeMs: number;
    avgResponseTimeMs: number;
}
/**
 * Add item to delivery queue
 */
export declare function queueDelivery(item: Omit<DeliveryQueueItem, 'id' | 'createdAt'>): string;
/**
 * Start queue processor
 */
export declare function startQueueProcessor(intervalMs?: number): void;
/**
 * Stop queue processor
 */
export declare function stopQueueProcessor(): void;
/**
 * Update delivery status (from webhook)
 */
export declare function updateDeliveryStatus(idOrExternalId: string, status: DeliveryStatus, details?: {
    clickedUrl?: string;
    errorCode?: string;
    errorMessage?: string;
}): boolean;
/**
 * Mark delivery as responded
 */
export declare function markResponded(userId: string, channel: DeliveryChannel, responseTimeMs?: number): void;
/**
 * Get delivery record by ID
 */
export declare function getDeliveryRecord(id: string): UnifiedDeliveryRecord | undefined;
/**
 * Get delivery record by external ID
 */
export declare function getDeliveryByExternalId(externalId: string): UnifiedDeliveryRecord | undefined;
/**
 * Get all deliveries for a user
 */
export declare function getUserDeliveries(userId: string, limit?: number): UnifiedDeliveryRecord[];
/**
 * Get deliveries by outreach ID
 */
export declare function getOutreachDeliveries(outreachId: string): UnifiedDeliveryRecord[];
/**
 * Get pending queue items
 */
export declare function getQueueItems(userId?: string): DeliveryQueueItem[];
/**
 * Cancel queued delivery
 */
export declare function cancelQueuedDelivery(id: string): boolean;
/**
 * Calculate delivery statistics
 */
export declare function calculateDeliveryStats(userId?: string, sinceDate?: Date): DeliveryStats;
/**
 * Clear old delivery records
 */
export declare function clearOldRecords(maxAgeDays?: number): number;
/**
 * Shutdown tracker
 */
export declare function shutdownDeliveryTracker(): void;
export declare const deliveryTracker: {
    queue: typeof queueDelivery;
    startProcessor: typeof startQueueProcessor;
    stopProcessor: typeof stopQueueProcessor;
    updateStatus: typeof updateDeliveryStatus;
    markResponded: typeof markResponded;
    getRecord: typeof getDeliveryRecord;
    getByExternalId: typeof getDeliveryByExternalId;
    getUserDeliveries: typeof getUserDeliveries;
    getOutreachDeliveries: typeof getOutreachDeliveries;
    getQueueItems: typeof getQueueItems;
    cancelQueued: typeof cancelQueuedDelivery;
    calculateStats: typeof calculateDeliveryStats;
    clearOldRecords: typeof clearOldRecords;
    shutdown: typeof shutdownDeliveryTracker;
};
//# sourceMappingURL=delivery-tracker.d.ts.map