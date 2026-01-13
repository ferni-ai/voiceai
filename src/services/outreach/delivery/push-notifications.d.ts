/**
 * Push Notifications Service
 *
 * Send push notifications via Firebase Cloud Messaging (FCM):
 * - Rich notifications with images and actions
 * - Persona-styled notifications
 * - Deep linking support
 * - Delivery tracking
 */
export interface PushNotificationConfig {
    firebaseProjectId: string;
    firebasePrivateKey: string;
    firebaseClientEmail: string;
    defaultIcon?: string;
    defaultBadge?: string;
}
export interface PushNotification {
    userId: string;
    outreachId: string;
    personaId: string;
    title: string;
    body: string;
    imageUrl?: string;
    icon?: string;
    badge?: string;
    actions?: PushAction[];
    clickAction?: string;
    data?: Record<string, string>;
    priority?: 'high' | 'normal';
    ttl?: number;
    collapseKey?: string;
    silent?: boolean;
}
export interface PushAction {
    action: string;
    title: string;
    icon?: string;
}
export interface PushDeliveryResult {
    success: boolean;
    messageId?: string;
    error?: string;
    failureReason?: 'invalid_token' | 'unregistered' | 'quota_exceeded' | 'unknown';
}
export interface UserPushToken {
    userId: string;
    token: string;
    platform: 'web' | 'ios' | 'android';
    createdAt: Date;
    lastUsedAt: Date;
    userAgent?: string;
}
export interface PushDeliveryRecord {
    messageId: string;
    userId: string;
    outreachId: string;
    personaId: string;
    title: string;
    status: 'sent' | 'delivered' | 'opened' | 'actioned' | 'failed';
    sentAt: Date;
    deliveredAt?: Date;
    openedAt?: Date;
    actionedAt?: Date;
    actionTaken?: string;
    errorReason?: string;
}
/**
 * Initialize push notification service
 */
export declare function initializePushNotifications(pushConfig: PushNotificationConfig): void;
/**
 * Check if push notifications are available
 */
export declare function isPushNotificationsAvailable(): boolean;
/**
 * Register a push token for a user
 */
export declare function registerPushToken(userId: string, token: string, platform: 'web' | 'ios' | 'android', userAgent?: string): void;
/**
 * Remove a push token
 */
export declare function removePushToken(userId: string, token: string): boolean;
/**
 * Get all tokens for a user
 */
export declare function getUserTokens(userId: string): UserPushToken[];
/**
 * Check if user has push enabled
 */
export declare function hasPushEnabled(userId: string): boolean;
/**
 * Send push notification to a user
 */
export declare function sendPushNotification(notification: PushNotification): Promise<PushDeliveryResult[]>;
/**
 * Send to multiple users
 */
export declare function sendBulkPushNotifications(notifications: PushNotification[]): Promise<Map<string, PushDeliveryResult[]>>;
/**
 * Generate persona-styled notification content
 */
export declare function generatePersonaNotification(personaId: string, type: 'commitment' | 'celebration' | 'thinking_of_you' | 'reminder', context: {
    userName?: string;
    topic?: string;
    details?: string;
}): {
    title: string;
    body: string;
};
/**
 * Handle push notification interaction (opened, actioned)
 */
export declare function handlePushInteraction(messageId: string, interaction: 'opened' | 'actioned', actionId?: string): void;
/**
 * Get delivery record
 */
export declare function getDeliveryRecord(messageId: string): PushDeliveryRecord | undefined;
/**
 * Get user's push delivery history
 */
export declare function getUserDeliveryRecords(userId: string, limit?: number): PushDeliveryRecord[];
/**
 * Clear old delivery records
 */
export declare function clearOldRecords(maxAgeDays?: number): number;
/**
 * Clear inactive tokens
 */
export declare function clearInactiveTokens(maxAgeDays?: number): number;
export declare const pushNotifications: {
    initialize: typeof initializePushNotifications;
    isAvailable: typeof isPushNotificationsAvailable;
    registerToken: typeof registerPushToken;
    removeToken: typeof removePushToken;
    getUserTokens: typeof getUserTokens;
    hasPushEnabled: typeof hasPushEnabled;
    send: typeof sendPushNotification;
    sendBulk: typeof sendBulkPushNotifications;
    generateNotification: typeof generatePersonaNotification;
    handleInteraction: typeof handlePushInteraction;
    getRecord: typeof getDeliveryRecord;
    getUserRecords: typeof getUserDeliveryRecords;
    clearOldRecords: typeof clearOldRecords;
    clearInactiveTokens: typeof clearInactiveTokens;
};
//# sourceMappingURL=push-notifications.d.ts.map