/**
 * Subscription Data Store
 *
 * Persistent storage for tracking recurring subscriptions:
 * - Detected from bank transactions (Plaid)
 * - Manually added subscriptions
 * - Renewal tracking and alerts
 * - Cancellation history
 *
 * Storage: Firestore (primary) with in-memory fallback
 * Document: /users/{userId}/life_automation/subscriptions
 *
 * @module services/stores/subscription-store
 */
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'trial' | 'past_due';
export type SubscriptionFrequency = 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom';
export type SubscriptionCategory = 'streaming' | 'software' | 'gaming' | 'news' | 'fitness' | 'food' | 'shopping' | 'finance' | 'education' | 'productivity' | 'storage' | 'utilities' | 'insurance' | 'membership' | 'other';
export type DetectionSource = 'plaid' | 'manual' | 'email' | 'receipt';
export interface Subscription {
    id: string;
    userId: string;
    name: string;
    description?: string;
    category: SubscriptionCategory;
    status: SubscriptionStatus;
    amount: number;
    currency: string;
    frequency: SubscriptionFrequency;
    customFrequencyDays?: number;
    startDate: string;
    nextBillingDate?: string;
    trialEndDate?: string;
    cancelledAt?: string;
    detectedFrom: DetectionSource;
    plaidTransactionId?: string;
    merchantName?: string;
    cancellationUrl?: string;
    cancellationNotes?: string;
    autoRenew: boolean;
    reminderDaysBefore?: number;
    logoUrl?: string;
    websiteUrl?: string;
    accountEmail?: string;
    tags: string[];
    notes?: string;
    createdAt: string;
    updatedAt: string;
}
export interface SubscriptionPayment {
    id: string;
    subscriptionId: string;
    userId: string;
    amount: number;
    currency: string;
    paymentDate: string;
    plaidTransactionId?: string;
    status: 'pending' | 'completed' | 'failed' | 'refunded';
    notes?: string;
    createdAt: string;
}
export interface SubscriptionAlert {
    id: string;
    subscriptionId: string;
    userId: string;
    alertType: 'renewal' | 'trial_ending' | 'price_change' | 'payment_failed' | 'cancelled';
    message: string;
    alertDate: string;
    acknowledged: boolean;
    acknowledgedAt?: string;
    createdAt: string;
}
export interface UserSubscriptionData {
    userId: string;
    lastUpdated: Date | string;
    subscriptions: Subscription[];
    payments: SubscriptionPayment[];
    alerts: SubscriptionAlert[];
    monthlySpend: number;
    yearlySpend: number;
    settings: {
        defaultReminderDays: number;
        emailAlertsEnabled: boolean;
        pushAlertsEnabled: boolean;
    };
}
/**
 * Get subscription data for a user
 * Uses Firestore if available, falls back to in-memory
 */
export declare function getSubscriptionData(userId: string): Promise<UserSubscriptionData>;
/**
 * Save subscription data for a user
 * Saves to Firestore if available, always saves to in-memory as fallback
 */
export declare function saveSubscriptionData(userId: string, data: Partial<UserSubscriptionData>): Promise<void>;
/**
 * Add a new subscription
 */
export declare function addSubscription(userId: string, subscription: Omit<Subscription, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<Subscription>;
/**
 * Update a subscription
 */
export declare function updateSubscription(userId: string, subscriptionId: string, updates: Partial<Subscription>): Promise<Subscription | null>;
/**
 * Cancel a subscription
 */
export declare function cancelSubscription(userId: string, subscriptionId: string, notes?: string): Promise<Subscription | null>;
/**
 * Get active subscriptions
 */
export declare function getActiveSubscriptions(userId: string): Promise<Subscription[]>;
/**
 * Get subscriptions by category
 */
export declare function getSubscriptionsByCategory(userId: string, category: SubscriptionCategory): Promise<Subscription[]>;
/**
 * Get upcoming renewals
 */
export declare function getUpcomingRenewals(userId: string, daysAhead?: number): Promise<Subscription[]>;
/**
 * Record a subscription payment
 */
export declare function recordPayment(userId: string, payment: Omit<SubscriptionPayment, 'id' | 'userId' | 'createdAt'>): Promise<SubscriptionPayment>;
/**
 * Get payment history for a subscription
 */
export declare function getPaymentHistory(userId: string, subscriptionId: string): Promise<SubscriptionPayment[]>;
/**
 * Create an alert
 */
export declare function createAlert(userId: string, alert: Omit<SubscriptionAlert, 'id' | 'userId' | 'acknowledged' | 'createdAt'>): Promise<SubscriptionAlert>;
/**
 * Get unacknowledged alerts
 */
export declare function getUnacknowledgedAlerts(userId: string): Promise<SubscriptionAlert[]>;
/**
 * Acknowledge an alert
 */
export declare function acknowledgeAlert(userId: string, alertId: string): Promise<boolean>;
export interface SubscriptionSummary {
    totalActive: number;
    monthlySpend: number;
    yearlySpend: number;
    byCategory: Record<SubscriptionCategory, {
        count: number;
        monthlySpend: number;
    }>;
    upcomingRenewals: number;
    pendingAlerts: number;
}
/**
 * Get subscription summary
 */
export declare function getSubscriptionSummary(userId: string): Promise<SubscriptionSummary>;
/**
 * Migrate in-memory data to Firestore (for existing users)
 */
export declare function migrateUserToFirestore(userId: string): Promise<boolean>;
//# sourceMappingURL=subscription-store.d.ts.map