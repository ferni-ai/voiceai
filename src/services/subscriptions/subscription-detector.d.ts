/**
 * Subscription Detector
 *
 * Detects recurring subscriptions from bank transaction data.
 * Uses Plaid integration to analyze transaction patterns.
 *
 * @module services/subscriptions/subscription-detector
 */
import { type Subscription, type SubscriptionCategory, type SubscriptionFrequency } from '../stores/subscription-store.js';
export interface PlaidTransaction {
    transactionId: string;
    accountId: string;
    amount: number;
    date: string;
    name: string;
    merchantName?: string;
    category?: string[];
    pending: boolean;
}
export interface DetectedSubscription {
    merchantName: string;
    amount: number;
    frequency: SubscriptionFrequency;
    category: SubscriptionCategory;
    transactions: PlaidTransaction[];
    confidence: number;
    firstSeenDate: string;
    lastSeenDate: string;
    nextExpectedDate?: string;
}
export declare class SubscriptionDetector {
    private userId;
    constructor(userId: string);
    /**
     * Detect subscriptions from transaction history
     */
    detectSubscriptions(transactions: PlaidTransaction[]): Promise<DetectedSubscription[]>;
    /**
     * Group transactions by normalized merchant name
     */
    private groupByMerchant;
    /**
     * Normalize merchant name for grouping
     */
    private normalizeMerchantName;
    /**
     * Analyze transactions for recurring pattern
     */
    private analyzeRecurringPattern;
    /**
     * Detect frequency from intervals
     */
    private detectFrequency;
    /**
     * Get category for merchant
     */
    private getCategory;
    /**
     * Get display name for merchant
     */
    private getDisplayName;
    /**
     * Calculate next expected date
     */
    private calculateNextDate;
    /**
     * Import detected subscriptions to the subscription store
     */
    importDetectedSubscriptions(detected: DetectedSubscription[], minConfidence?: number): Promise<Subscription[]>;
    /**
     * Get subscription summary
     */
    getDetectionSummary(detected: DetectedSubscription[]): {
        totalDetected: number;
        highConfidence: number;
        monthlyTotal: number;
        yearlyTotal: number;
        byCategory: Record<SubscriptionCategory, number>;
    };
    /**
     * Convert amount to monthly equivalent
     */
    private toMonthlyAmount;
}
export declare function getSubscriptionDetector(userId: string): SubscriptionDetector;
export declare function resetSubscriptionDetector(userId: string): void;
//# sourceMappingURL=subscription-detector.d.ts.map