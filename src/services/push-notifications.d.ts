/**
 * Push Notifications Backend Service
 *
 * Handles sending push notifications to users via Web Push and APNs/FCM.
 * Supports scheduled notifications, ritual reminders, and engagement triggers.
 *
 * PERSISTENCE: Subscriptions and scheduled notifications are persisted to Firestore
 * via the unified persistence layer to survive server restarts.
 */
export type NotificationType = 'ritual_reminder' | 'streak_milestone' | 'prediction_result' | 'team_huddle' | 'ferni_checkin' | 'engagement' | 'calendar_reminder' | 'calendar_digest' | 'general';
export interface PushSubscription {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
    platform: 'web' | 'ios' | 'android';
    userId: string;
    createdAt: string;
}
export interface PushNotificationPayload {
    title: string;
    body: string;
    type: NotificationType;
    data?: Record<string, unknown>;
    icon?: string;
    badge?: number;
    sound?: boolean;
    personaId?: string;
}
export interface ScheduledNotification {
    id: string;
    userId: string;
    payload: PushNotificationPayload;
    scheduledFor: Date;
    status: 'pending' | 'sent' | 'failed' | 'cancelled';
    createdAt: string;
}
declare class PushNotificationsBackendService {
    private subscriptions;
    private scheduledNotifications;
    private initialized;
    private subscriptionStore;
    private scheduledStore;
    /**
     * Initialize the service with VAPID keys and persistence
     */
    initialize(): Promise<void>;
    /**
     * Rehydrate scheduled notifications from Firestore
     */
    private rehydrateScheduledNotifications;
    /**
     * Register a push subscription for a user
     */
    registerSubscription(subscription: PushSubscription): Promise<void>;
    /**
     * Remove a push subscription
     */
    removeSubscription(userId: string, endpoint: string): Promise<void>;
    /**
     * Send a push notification to a user
     */
    sendNotification(userId: string, payload: PushNotificationPayload): Promise<boolean>;
    /**
     * Send notification to multiple users
     */
    sendBulkNotification(userIds: string[], payload: PushNotificationPayload): Promise<number>;
    /**
     * Schedule a notification for later
     */
    scheduleNotification(userId: string, payload: PushNotificationPayload, scheduledFor: Date): Promise<string>;
    /**
     * Persist all scheduled notifications to Firestore
     */
    private persistScheduledNotifications;
    /**
     * Cancel a scheduled notification
     */
    cancelScheduledNotification(id: string): Promise<boolean>;
    /**
     * Process scheduled notifications (call this periodically)
     */
    processScheduledNotifications(): Promise<void>;
    /**
     * Send a ritual reminder notification
     */
    sendRitualReminder(userId: string, personaId: string, ritualName: string): Promise<boolean>;
    /**
     * Send a streak milestone notification
     */
    sendStreakMilestone(userId: string, streak: number, ritualName: string): Promise<boolean>;
    /**
     * Send a prediction result notification
     */
    sendPredictionResult(userId: string, predictionTitle: string, accuracy: number): Promise<boolean>;
    /**
     * Send a team huddle invitation
     */
    sendTeamHuddleInvite(userId: string, topic: string, personaIds: string[]): Promise<boolean>;
    /**
     * Send a proactive Ferni check-in
     */
    sendFerniCheckin(userId: string, message: string): Promise<boolean>;
    private sendWebPush;
    private sendNativePush;
    private isSubscriptionExpired;
    /**
     * Clear all data for a specific user.
     * Call when user is deleted or session ends.
     */
    clearUserData(userId: string): Promise<void>;
    /**
     * Clear all subscriptions and scheduled notifications.
     * Useful for testing or system reset.
     */
    clearAll(): Promise<void>;
    /**
     * Get memory usage statistics for monitoring.
     */
    getStats(): {
        subscriptions: number;
        scheduledNotifications: number;
        totalUsers: number;
    };
    /**
     * Shutdown the service (flush all pending data)
     */
    shutdown(): Promise<void>;
}
export declare function getPushNotificationsService(): PushNotificationsBackendService;
/**
 * Reset the singleton instance (for testing)
 */
export declare function resetPushNotificationsService(): Promise<void>;
/**
 * Shutdown the push notifications service (call on app shutdown)
 */
export declare function shutdownPushNotificationsService(): Promise<void>;
export default PushNotificationsBackendService;
//# sourceMappingURL=push-notifications.d.ts.map