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
import { createLogger } from '../../utils/safe-logger.js';
import { getLifeAutomationData, saveLifeAutomationData, isFirestoreAvailable, } from './firestore-life-adapter.js';
const log = createLogger({ module: 'subscription-store' });
// In-memory fallback when Firestore is unavailable
const subscriptionStorage = new Map();
// ============================================================================
// DEFAULT DATA
// ============================================================================
function createDefaultSubscriptionData(userId) {
    return {
        userId,
        lastUpdated: new Date(),
        subscriptions: [],
        payments: [],
        alerts: [],
        monthlySpend: 0,
        yearlySpend: 0,
        settings: {
            defaultReminderDays: 3,
            emailAlertsEnabled: true,
            pushAlertsEnabled: true,
        },
    };
}
// ============================================================================
// STORE OPERATIONS
// ============================================================================
/**
 * Get subscription data for a user
 * Uses Firestore if available, falls back to in-memory
 */
export async function getSubscriptionData(userId) {
    try {
        // Try Firestore first
        if (isFirestoreAvailable()) {
            const firestoreData = await getLifeAutomationData(userId, 'subscriptions');
            if (firestoreData) {
                // Ensure lastUpdated is a Date object
                return {
                    ...createDefaultSubscriptionData(userId),
                    ...firestoreData,
                    lastUpdated: typeof firestoreData.lastUpdated === 'string'
                        ? new Date(firestoreData.lastUpdated)
                        : firestoreData.lastUpdated || new Date(),
                };
            }
        }
        // Fall back to in-memory
        const data = subscriptionStorage.get(userId);
        if (!data) {
            return createDefaultSubscriptionData(userId);
        }
        return {
            ...createDefaultSubscriptionData(userId),
            ...data,
            lastUpdated: typeof data.lastUpdated === 'string'
                ? new Date(data.lastUpdated)
                : data.lastUpdated || new Date(),
        };
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get subscription data');
        return createDefaultSubscriptionData(userId);
    }
}
/**
 * Save subscription data for a user
 * Saves to Firestore if available, always saves to in-memory as fallback
 */
export async function saveSubscriptionData(userId, data) {
    try {
        const existing = await getSubscriptionData(userId);
        const updated = {
            ...existing,
            ...data,
            lastUpdated: new Date(),
        };
        // Recalculate monthly/yearly spend
        updated.monthlySpend = calculateMonthlySpend(updated.subscriptions);
        updated.yearlySpend = calculateYearlySpend(updated.subscriptions);
        // Always save to in-memory for fast access
        subscriptionStorage.set(userId, updated);
        // Save to Firestore if available
        if (isFirestoreAvailable()) {
            // Convert Date to string for Firestore
            const firestoreData = {
                ...updated,
                lastUpdated: updated.lastUpdated.toISOString(),
            };
            const result = await saveLifeAutomationData(userId, 'subscriptions', firestoreData);
            if (!result.success) {
                log.warn({ userId, error: result.error }, 'Failed to save to Firestore, data in memory only');
            }
        }
        log.debug({ userId }, 'Subscription data saved');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to save subscription data');
        throw error;
    }
}
// ============================================================================
// SUBSCRIPTION CRUD
// ============================================================================
/**
 * Add a new subscription
 */
export async function addSubscription(userId, subscription) {
    const data = await getSubscriptionData(userId);
    const now = new Date().toISOString();
    const newSubscription = {
        ...subscription,
        id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId,
        createdAt: now,
        updatedAt: now,
    };
    data.subscriptions.push(newSubscription);
    await saveSubscriptionData(userId, data);
    log.info({ userId, subscriptionId: newSubscription.id, name: newSubscription.name }, 'Subscription added');
    return newSubscription;
}
/**
 * Update a subscription
 */
export async function updateSubscription(userId, subscriptionId, updates) {
    const data = await getSubscriptionData(userId);
    const index = data.subscriptions.findIndex((s) => s.id === subscriptionId);
    if (index === -1) {
        return null;
    }
    data.subscriptions[index] = {
        ...data.subscriptions[index],
        ...updates,
        updatedAt: new Date().toISOString(),
    };
    await saveSubscriptionData(userId, data);
    return data.subscriptions[index];
}
/**
 * Cancel a subscription
 */
export async function cancelSubscription(userId, subscriptionId, notes) {
    return updateSubscription(userId, subscriptionId, {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancellationNotes: notes,
        autoRenew: false,
    });
}
/**
 * Get active subscriptions
 */
export async function getActiveSubscriptions(userId) {
    const data = await getSubscriptionData(userId);
    return data.subscriptions.filter((s) => s.status === 'active' || s.status === 'trial');
}
/**
 * Get subscriptions by category
 */
export async function getSubscriptionsByCategory(userId, category) {
    const data = await getSubscriptionData(userId);
    return data.subscriptions.filter((s) => s.category === category);
}
/**
 * Get upcoming renewals
 */
export async function getUpcomingRenewals(userId, daysAhead = 7) {
    const data = await getSubscriptionData(userId);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysAhead);
    return data.subscriptions.filter((s) => {
        if (s.status !== 'active' || !s.nextBillingDate)
            return false;
        const billingDate = new Date(s.nextBillingDate);
        return billingDate <= cutoff && billingDate >= new Date();
    });
}
// ============================================================================
// PAYMENT TRACKING
// ============================================================================
/**
 * Record a subscription payment
 */
export async function recordPayment(userId, payment) {
    const data = await getSubscriptionData(userId);
    const newPayment = {
        ...payment,
        id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId,
        createdAt: new Date().toISOString(),
    };
    data.payments.push(newPayment);
    // Update next billing date for the subscription
    const subscription = data.subscriptions.find((s) => s.id === payment.subscriptionId);
    if (subscription) {
        subscription.nextBillingDate = calculateNextBillingDate(new Date(payment.paymentDate), subscription.frequency, subscription.customFrequencyDays).toISOString();
    }
    await saveSubscriptionData(userId, data);
    return newPayment;
}
/**
 * Get payment history for a subscription
 */
export async function getPaymentHistory(userId, subscriptionId) {
    const data = await getSubscriptionData(userId);
    return data.payments
        .filter((p) => p.subscriptionId === subscriptionId)
        .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
}
// ============================================================================
// ALERTS
// ============================================================================
/**
 * Create an alert
 */
export async function createAlert(userId, alert) {
    const data = await getSubscriptionData(userId);
    const newAlert = {
        ...alert,
        id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId,
        acknowledged: false,
        createdAt: new Date().toISOString(),
    };
    data.alerts.push(newAlert);
    await saveSubscriptionData(userId, data);
    return newAlert;
}
/**
 * Get unacknowledged alerts
 */
export async function getUnacknowledgedAlerts(userId) {
    const data = await getSubscriptionData(userId);
    return data.alerts.filter((a) => !a.acknowledged);
}
/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(userId, alertId) {
    const data = await getSubscriptionData(userId);
    const alert = data.alerts.find((a) => a.id === alertId);
    if (!alert)
        return false;
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    await saveSubscriptionData(userId, data);
    return true;
}
// ============================================================================
// SPEND CALCULATIONS
// ============================================================================
/**
 * Calculate monthly spend from subscriptions
 */
function calculateMonthlySpend(subscriptions) {
    return subscriptions
        .filter((s) => s.status === 'active')
        .reduce((total, s) => {
        switch (s.frequency) {
            case 'weekly':
                return total + s.amount * 4.33;
            case 'monthly':
                return total + s.amount;
            case 'quarterly':
                return total + s.amount / 3;
            case 'annual':
                return total + s.amount / 12;
            case 'custom':
                return total + (s.amount / (s.customFrequencyDays || 30)) * 30;
            default:
                return total;
        }
    }, 0);
}
/**
 * Calculate yearly spend from subscriptions
 */
function calculateYearlySpend(subscriptions) {
    return calculateMonthlySpend(subscriptions) * 12;
}
/**
 * Calculate next billing date
 */
function calculateNextBillingDate(lastDate, frequency, customDays) {
    const next = new Date(lastDate);
    switch (frequency) {
        case 'weekly':
            next.setDate(next.getDate() + 7);
            break;
        case 'monthly':
            next.setMonth(next.getMonth() + 1);
            break;
        case 'quarterly':
            next.setMonth(next.getMonth() + 3);
            break;
        case 'annual':
            next.setFullYear(next.getFullYear() + 1);
            break;
        case 'custom':
            next.setDate(next.getDate() + (customDays || 30));
            break;
    }
    return next;
}
/**
 * Get subscription summary
 */
export async function getSubscriptionSummary(userId) {
    const data = await getSubscriptionData(userId);
    const active = data.subscriptions.filter((s) => s.status === 'active');
    const byCategory = {};
    for (const sub of active) {
        if (!byCategory[sub.category]) {
            byCategory[sub.category] = { count: 0, monthlySpend: 0 };
        }
        byCategory[sub.category].count++;
        byCategory[sub.category].monthlySpend += sub.amount;
    }
    const upcoming = await getUpcomingRenewals(userId);
    const alerts = data.alerts.filter((a) => !a.acknowledged);
    return {
        totalActive: active.length,
        monthlySpend: data.monthlySpend,
        yearlySpend: data.yearlySpend,
        byCategory,
        upcomingRenewals: upcoming.length,
        pendingAlerts: alerts.length,
    };
}
// ============================================================================
// MIGRATION HELPER
// ============================================================================
/**
 * Migrate in-memory data to Firestore (for existing users)
 */
export async function migrateUserToFirestore(userId) {
    const inMemoryData = subscriptionStorage.get(userId);
    if (!inMemoryData) {
        return false; // No data to migrate
    }
    if (!isFirestoreAvailable()) {
        log.warn({ userId }, 'Cannot migrate: Firestore unavailable');
        return false;
    }
    // Save to Firestore
    const firestoreData = {
        ...inMemoryData,
        lastUpdated: inMemoryData.lastUpdated instanceof Date
            ? inMemoryData.lastUpdated.toISOString()
            : inMemoryData.lastUpdated,
    };
    const result = await saveLifeAutomationData(userId, 'subscriptions', firestoreData);
    if (result.success) {
        log.info({ userId }, 'Successfully migrated subscription data to Firestore');
    }
    return result.success;
}
//# sourceMappingURL=subscription-store.js.map