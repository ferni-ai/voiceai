/**
 * Firestore Persistence for Outreach System
 *
 * Persists outreach data to Firestore for durability across restarts.
 * This replaces the in-memory Maps with database-backed storage.
 *
 * Collections:
 * - outreach_profiles/{userId} - User preferences and patterns
 * - outreach_triggers/{triggerId} - Pending triggers
 * - outreach_history/{userId}/records/{recordId} - Historical outreach
 * - outreach_context/{userId} - User life context
 */
import type { ChannelProfile } from './channel-selector.js';
import type { UserLifeContext } from './context-aggregator.js';
import type { OutreachDecision, OutreachTrigger, UserOutreachState } from './decision-engine.js';
import type { RelationshipProfile } from './relationship-adapter.js';
import type { TimingProfile } from './timing-intelligence.js';
export interface OutreachProfileDocument {
    userId: string;
    state: UserOutreachState;
    timing: Partial<TimingProfile>;
    channel: Partial<ChannelProfile>;
    relationship: Partial<RelationshipProfile>;
    updatedAt: Date;
    createdAt: Date;
}
export interface OutreachTriggerDocument {
    id: string;
    userId: string;
    trigger: OutreachTrigger;
    status: 'pending' | 'processing' | 'sent' | 'cancelled' | 'failed';
    scheduledFor?: Date;
    processedAt?: Date;
    createdAt: Date;
}
export interface OutreachHistoryDocument {
    id: string;
    userId: string;
    decision: OutreachDecision;
    createdAt: Date;
}
/**
 * Initialize Firestore for outreach persistence
 * FIX: Added connection validation to verify credentials actually work
 */
export declare function initializeFirestore(): Promise<boolean>;
/**
 * Check if Firestore is available
 */
export declare function isFirestoreAvailable(): boolean;
/**
 * Get the Firestore client instance
 */
export declare function getFirestoreClient(): FirebaseFirestore.Firestore | null;
/**
 * Save user outreach profile to Firestore
 */
export declare function saveOutreachProfile(userId: string, data: {
    state?: UserOutreachState;
    timing?: Partial<TimingProfile>;
    channel?: Partial<ChannelProfile>;
    relationship?: Partial<RelationshipProfile>;
}): Promise<void>;
/**
 * Load user outreach profile from Firestore
 */
export declare function loadOutreachProfile(userId: string): Promise<OutreachProfileDocument | null>;
/**
 * Delete user outreach profile (for GDPR)
 */
export declare function deleteOutreachProfile(userId: string): Promise<void>;
/**
 * Save a trigger to Firestore
 */
export declare function saveTrigger(trigger: OutreachTrigger, scheduledFor?: Date): Promise<void>;
/**
 * Update trigger status
 */
export declare function updateTriggerStatus(triggerId: string, status: OutreachTriggerDocument['status'], scheduledFor?: Date): Promise<void>;
/**
 * Load pending triggers for a user
 */
export declare function loadPendingTriggers(userId: string): Promise<OutreachTrigger[]>;
/**
 * Load all pending triggers (for startup recovery)
 * @deprecated Use loadPendingTriggersWithLimit for better performance
 */
export declare function loadAllPendingTriggers(): Promise<OutreachTriggerDocument[]>;
/**
 * Load pending triggers with limit (for worker processing)
 * PERF: Avoids loading 300k+ triggers into memory
 */
export declare function loadPendingTriggersWithLimit(limit: number): Promise<OutreachTriggerDocument[]>;
/**
 * Store a scheduled delivery for future processing
 */
export declare function storeScheduledDelivery(delivery: {
    triggerId: string;
    userId: string;
    deliverAt: Date;
    channel: string;
    message: string;
}): Promise<void>;
/**
 * Delete a trigger
 */
export declare function deleteTrigger(triggerId: string): Promise<void>;
/**
 * Clean up old processed triggers
 * FIX: Now handles batch limit properly and supports larger cleanups
 */
export declare function cleanupOldTriggers(maxAgeDays?: number): Promise<number>;
/**
 * Save outreach decision to history
 */
export declare function saveToHistory(userId: string, decision: OutreachDecision): Promise<void>;
/**
 * Load outreach history for a user
 */
export declare function loadHistory(userId: string, limit?: number): Promise<OutreachDecision[]>;
/**
 * Delete user history (for GDPR)
 * FIX: Now handles batch limit properly for users with large history
 */
export declare function deleteUserHistory(userId: string): Promise<void>;
/**
 * Save user life context
 */
export declare function saveContext(userId: string, context: UserLifeContext): Promise<void>;
/**
 * Load user life context
 */
export declare function loadContext(userId: string): Promise<UserLifeContext | null>;
/**
 * Delete user context (for GDPR)
 */
export declare function deleteUserContext(userId: string): Promise<void>;
/**
 * Delete all outreach data for a user
 * FIX: Now handles batch limit properly for users with many triggers
 */
export declare function deleteAllUserOutreachData(userId: string): Promise<void>;
/**
 * Get outreach statistics for analytics
 */
export declare function getOutreachStats(userId?: string, days?: number): Promise<{
    totalSent: number;
    byChannel: Record<string, number>;
    byTrigger: Record<string, number>;
    responseRate: number;
}>;
export interface DeliveryRecordDocument {
    id: string;
    outreachId: string;
    userId: string;
    personaId: string;
    channel: string;
    status: string;
    externalId?: string;
    to: string;
    subject?: string;
    queuedAt: Date;
    sentAt?: Date;
    deliveredAt?: Date;
    errorMessage?: string;
}
/**
 * Save a delivery record to Firestore
 */
export declare function saveDeliveryRecord(record: DeliveryRecordDocument): Promise<void>;
/**
 * Update delivery status
 */
export declare function updateDeliveryStatus(userId: string, deliveryId: string, status: string, details?: {
    deliveredAt?: Date;
    errorMessage?: string;
}): Promise<void>;
/**
 * Load delivery records for a user
 */
export declare function loadDeliveryRecords(userId: string, limit?: number): Promise<DeliveryRecordDocument[]>;
export interface ABTestDocument {
    id: string;
    name: string;
    type: string;
    status: string;
    variants: unknown[];
    controlVariantId: string;
    primaryMetric: string;
    minimumSamplePerVariant: number;
    significanceLevel: number;
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    results?: unknown;
}
export interface ABTestAssignmentDocument {
    testId: string;
    variantId: string;
    userId: string;
    assignedAt: Date;
    converted: boolean;
    conversionAt?: Date;
}
/**
 * Save an A/B test to Firestore
 */
export declare function saveABTest(test: ABTestDocument): Promise<void>;
/**
 * Update A/B test
 */
export declare function updateABTest(testId: string, updates: Partial<ABTestDocument>): Promise<void>;
/**
 * Load all active A/B tests
 */
export declare function loadActiveABTests(): Promise<ABTestDocument[]>;
/**
 * Save test assignment
 */
export declare function saveTestAssignment(assignment: ABTestAssignmentDocument): Promise<void>;
/**
 * Load user's test assignment
 */
export declare function loadTestAssignment(testId: string, userId: string): Promise<ABTestAssignmentDocument | null>;
/**
 * Record conversion for A/B test
 */
export declare function recordTestConversion(testId: string, userId: string): Promise<void>;
export interface PendingInAppMessageDocument {
    id: string;
    userId: string;
    message: string;
    type: string;
    personaId?: string;
    priority?: number;
    expiresAt?: Date;
    createdAt: Date;
}
/**
 * Save a pending in-app message for delivery on next session
 * This enables cross-server consistency for proactive outreach
 */
export declare function savePendingInAppMessage(userId: string, message: string, type: string, options?: {
    personaId?: string;
    priority?: number;
    expiresInHours?: number;
}): Promise<string | null>;
/**
 * Load pending in-app messages for a user (for session start)
 * Returns messages sorted by priority (highest first), then by creation time
 */
export declare function loadPendingInAppMessages(userId: string): Promise<PendingInAppMessageDocument[]>;
/**
 * Delete a pending in-app message (after delivery)
 */
export declare function deletePendingInAppMessage(messageId: string): Promise<void>;
/**
 * Delete all pending messages for a user (for GDPR)
 * FIX: Now handles batch limit properly for users with many pending messages
 */
export declare function deleteUserPendingMessages(userId: string): Promise<void>;
/**
 * Cleanup expired pending messages (run periodically)
 * FIX: Now handles batch limit properly and supports larger cleanups
 */
export declare function cleanupExpiredPendingMessages(): Promise<number>;
declare const _default: {
    initializeFirestore: typeof initializeFirestore;
    isFirestoreAvailable: typeof isFirestoreAvailable;
    saveOutreachProfile: typeof saveOutreachProfile;
    loadOutreachProfile: typeof loadOutreachProfile;
    deleteOutreachProfile: typeof deleteOutreachProfile;
    saveTrigger: typeof saveTrigger;
    updateTriggerStatus: typeof updateTriggerStatus;
    loadPendingTriggers: typeof loadPendingTriggers;
    loadAllPendingTriggers: typeof loadAllPendingTriggers;
    deleteTrigger: typeof deleteTrigger;
    cleanupOldTriggers: typeof cleanupOldTriggers;
    saveToHistory: typeof saveToHistory;
    loadHistory: typeof loadHistory;
    deleteUserHistory: typeof deleteUserHistory;
    saveContext: typeof saveContext;
    loadContext: typeof loadContext;
    deleteUserContext: typeof deleteUserContext;
    saveDeliveryRecord: typeof saveDeliveryRecord;
    updateDeliveryStatus: typeof updateDeliveryStatus;
    loadDeliveryRecords: typeof loadDeliveryRecords;
    saveABTest: typeof saveABTest;
    updateABTest: typeof updateABTest;
    loadActiveABTests: typeof loadActiveABTests;
    saveTestAssignment: typeof saveTestAssignment;
    loadTestAssignment: typeof loadTestAssignment;
    recordTestConversion: typeof recordTestConversion;
    savePendingInAppMessage: typeof savePendingInAppMessage;
    loadPendingInAppMessages: typeof loadPendingInAppMessages;
    deletePendingInAppMessage: typeof deletePendingInAppMessage;
    deleteUserPendingMessages: typeof deleteUserPendingMessages;
    cleanupExpiredPendingMessages: typeof cleanupExpiredPendingMessages;
    deleteAllUserOutreachData: typeof deleteAllUserOutreachData;
    getOutreachStats: typeof getOutreachStats;
};
export default _default;
//# sourceMappingURL=firestore-persistence.d.ts.map