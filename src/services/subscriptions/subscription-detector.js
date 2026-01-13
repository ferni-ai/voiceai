/**
 * Subscription Detector
 *
 * Detects recurring subscriptions from bank transaction data.
 * Uses Plaid integration to analyze transaction patterns.
 *
 * @module services/subscriptions/subscription-detector
 */
import { createLogger } from '../../utils/safe-logger.js';
import { addSubscription, } from '../stores/subscription-store.js';
const log = createLogger({ module: 'subscription-detector' });
// ============================================================================
// KNOWN SUBSCRIPTION MERCHANTS
// ============================================================================
const KNOWN_SUBSCRIPTIONS = {
    // Streaming
    'netflix': { category: 'streaming', name: 'Netflix' },
    'hulu': { category: 'streaming', name: 'Hulu' },
    'disney+': { category: 'streaming', name: 'Disney+' },
    'hbo max': { category: 'streaming', name: 'HBO Max' },
    'paramount+': { category: 'streaming', name: 'Paramount+' },
    'peacock': { category: 'streaming', name: 'Peacock' },
    'apple tv': { category: 'streaming', name: 'Apple TV+' },
    'prime video': { category: 'streaming', name: 'Prime Video' },
    'youtube premium': { category: 'streaming', name: 'YouTube Premium' },
    'spotify': { category: 'streaming', name: 'Spotify' },
    'apple music': { category: 'streaming', name: 'Apple Music' },
    'pandora': { category: 'streaming', name: 'Pandora' },
    'audible': { category: 'streaming', name: 'Audible' },
    // Software
    'adobe': { category: 'software', name: 'Adobe Creative Cloud' },
    'microsoft 365': { category: 'software', name: 'Microsoft 365' },
    'office 365': { category: 'software', name: 'Microsoft 365' },
    'dropbox': { category: 'software', name: 'Dropbox' },
    'google one': { category: 'storage', name: 'Google One' },
    'icloud': { category: 'storage', name: 'iCloud+' },
    'notion': { category: 'software', name: 'Notion' },
    'evernote': { category: 'software', name: 'Evernote' },
    '1password': { category: 'software', name: '1Password' },
    'lastpass': { category: 'software', name: 'LastPass' },
    'nordvpn': { category: 'software', name: 'NordVPN' },
    'expressvpn': { category: 'software', name: 'ExpressVPN' },
    // Gaming
    'xbox': { category: 'gaming', name: 'Xbox Game Pass' },
    'playstation': { category: 'gaming', name: 'PlayStation Plus' },
    'nintendo': { category: 'gaming', name: 'Nintendo Switch Online' },
    'ea play': { category: 'gaming', name: 'EA Play' },
    // News
    'new york times': { category: 'news', name: 'New York Times' },
    'washington post': { category: 'news', name: 'Washington Post' },
    'wall street journal': { category: 'news', name: 'Wall Street Journal' },
    'the atlantic': { category: 'news', name: 'The Atlantic' },
    'economist': { category: 'news', name: 'The Economist' },
    // Fitness
    'peloton': { category: 'fitness', name: 'Peloton' },
    'planet fitness': { category: 'fitness', name: 'Planet Fitness' },
    'la fitness': { category: 'fitness', name: 'LA Fitness' },
    'equinox': { category: 'fitness', name: 'Equinox' },
    'orange theory': { category: 'fitness', name: 'Orangetheory' },
    'classpass': { category: 'fitness', name: 'ClassPass' },
    'strava': { category: 'fitness', name: 'Strava' },
    'headspace': { category: 'fitness', name: 'Headspace' },
    'calm': { category: 'fitness', name: 'Calm' },
    // Food
    'doordash': { category: 'food', name: 'DoorDash DashPass' },
    'uber eats': { category: 'food', name: 'Uber One' },
    'grubhub': { category: 'food', name: 'Grubhub+' },
    'instacart': { category: 'food', name: 'Instacart+' },
    'hello fresh': { category: 'food', name: 'HelloFresh' },
    'blue apron': { category: 'food', name: 'Blue Apron' },
    // Shopping
    'amazon prime': { category: 'shopping', name: 'Amazon Prime' },
    'walmart+': { category: 'shopping', name: 'Walmart+' },
    'costco': { category: 'membership', name: 'Costco' },
    'sams club': { category: 'membership', name: "Sam's Club" },
    // Finance
    'ynab': { category: 'finance', name: 'YNAB' },
    'mint': { category: 'finance', name: 'Mint' },
    'turbotax': { category: 'finance', name: 'TurboTax' },
    // Education
    'coursera': { category: 'education', name: 'Coursera' },
    'udemy': { category: 'education', name: 'Udemy' },
    'linkedin learning': { category: 'education', name: 'LinkedIn Learning' },
    'masterclass': { category: 'education', name: 'MasterClass' },
    'duolingo': { category: 'education', name: 'Duolingo Plus' },
};
// ============================================================================
// SUBSCRIPTION DETECTOR CLASS
// ============================================================================
export class SubscriptionDetector {
    userId;
    constructor(userId) {
        this.userId = userId;
    }
    // ==========================================================================
    // DETECTION
    // ==========================================================================
    /**
     * Detect subscriptions from transaction history
     */
    async detectSubscriptions(transactions) {
        // Group transactions by merchant
        const merchantGroups = this.groupByMerchant(transactions);
        // Analyze each merchant for recurring patterns
        const detected = [];
        for (const [merchantKey, merchantTransactions] of Object.entries(merchantGroups)) {
            const subscription = this.analyzeRecurringPattern(merchantKey, merchantTransactions);
            if (subscription) {
                detected.push(subscription);
            }
        }
        // Sort by confidence
        detected.sort((a, b) => b.confidence - a.confidence);
        log.info({ userId: this.userId, detected: detected.length }, 'Subscriptions detected');
        return detected;
    }
    /**
     * Group transactions by normalized merchant name
     */
    groupByMerchant(transactions) {
        const groups = {};
        for (const tx of transactions) {
            // Skip pending and positive (refund) transactions
            if (tx.pending || tx.amount <= 0)
                continue;
            const normalizedMerchant = this.normalizeMerchantName(tx.merchantName || tx.name);
            if (!normalizedMerchant)
                continue;
            if (!groups[normalizedMerchant]) {
                groups[normalizedMerchant] = [];
            }
            groups[normalizedMerchant].push(tx);
        }
        return groups;
    }
    /**
     * Normalize merchant name for grouping
     */
    normalizeMerchantName(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '') // Remove special chars
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    }
    /**
     * Analyze transactions for recurring pattern
     */
    analyzeRecurringPattern(merchantName, transactions) {
        // Need at least 2 transactions to detect pattern
        if (transactions.length < 2)
            return null;
        // Sort by date
        const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        // Analyze intervals between transactions
        const intervals = [];
        for (let i = 1; i < sorted.length; i++) {
            const days = Math.round((new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) /
                (1000 * 60 * 60 * 24));
            intervals.push(days);
        }
        // Detect frequency
        const { frequency, confidence: intervalConfidence } = this.detectFrequency(intervals);
        if (!frequency || intervalConfidence < 0.5)
            return null;
        // Check amount consistency
        const amounts = sorted.map((t) => t.amount);
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const amountVariance = Math.max(...amounts) - Math.min(...amounts);
        const amountConfidence = amountVariance < avgAmount * 0.1 ? 1 : 0.7; // Allow 10% variance
        // Calculate overall confidence
        const confidence = (intervalConfidence + amountConfidence) / 2;
        if (confidence < 0.6)
            return null;
        // Get category
        const category = this.getCategory(merchantName);
        // Calculate next expected date
        const lastDate = new Date(sorted[sorted.length - 1].date);
        const nextExpectedDate = this.calculateNextDate(lastDate, frequency);
        return {
            merchantName: this.getDisplayName(merchantName),
            amount: Math.round(avgAmount * 100) / 100,
            frequency,
            category,
            transactions: sorted,
            confidence,
            firstSeenDate: sorted[0].date,
            lastSeenDate: sorted[sorted.length - 1].date,
            nextExpectedDate: nextExpectedDate?.toISOString().split('T')[0],
        };
    }
    /**
     * Detect frequency from intervals
     */
    detectFrequency(intervals) {
        if (intervals.length === 0) {
            return { frequency: null, confidence: 0 };
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = Math.sqrt(intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length);
        // Determine frequency based on average interval
        let frequency = null;
        let targetInterval = 0;
        if (avgInterval >= 5 && avgInterval <= 9) {
            frequency = 'weekly';
            targetInterval = 7;
        }
        else if (avgInterval >= 25 && avgInterval <= 35) {
            frequency = 'monthly';
            targetInterval = 30;
        }
        else if (avgInterval >= 80 && avgInterval <= 100) {
            frequency = 'quarterly';
            targetInterval = 90;
        }
        else if (avgInterval >= 350 && avgInterval <= 380) {
            frequency = 'annual';
            targetInterval = 365;
        }
        if (!frequency) {
            return { frequency: null, confidence: 0 };
        }
        // Calculate confidence based on variance from target
        const deviation = Math.abs(avgInterval - targetInterval) / targetInterval;
        const confidence = Math.max(0, 1 - deviation - (variance / targetInterval) * 0.5);
        return { frequency, confidence };
    }
    /**
     * Get category for merchant
     */
    getCategory(merchantName) {
        const normalized = this.normalizeMerchantName(merchantName);
        for (const [key, info] of Object.entries(KNOWN_SUBSCRIPTIONS)) {
            if (normalized.includes(key)) {
                return info.category;
            }
        }
        return 'other';
    }
    /**
     * Get display name for merchant
     */
    getDisplayName(merchantName) {
        const normalized = this.normalizeMerchantName(merchantName);
        for (const [key, info] of Object.entries(KNOWN_SUBSCRIPTIONS)) {
            if (normalized.includes(key) && info.name) {
                return info.name;
            }
        }
        // Capitalize first letter of each word
        return merchantName
            .split(' ')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }
    /**
     * Calculate next expected date
     */
    calculateNextDate(lastDate, frequency) {
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
        }
        return next;
    }
    // ==========================================================================
    // IMPORT TO STORE
    // ==========================================================================
    /**
     * Import detected subscriptions to the subscription store
     */
    async importDetectedSubscriptions(detected, minConfidence = 0.7) {
        const imported = [];
        for (const sub of detected) {
            if (sub.confidence < minConfidence)
                continue;
            try {
                const subscription = await addSubscription(this.userId, {
                    name: sub.merchantName,
                    category: sub.category,
                    status: 'active',
                    amount: sub.amount,
                    currency: 'USD',
                    frequency: sub.frequency,
                    startDate: sub.firstSeenDate,
                    nextBillingDate: sub.nextExpectedDate,
                    detectedFrom: 'plaid',
                    plaidTransactionId: sub.transactions[sub.transactions.length - 1].transactionId,
                    merchantName: sub.merchantName,
                    autoRenew: true,
                    tags: [],
                });
                imported.push(subscription);
            }
            catch (error) {
                log.error({ error: String(error), merchantName: sub.merchantName }, 'Failed to import subscription');
            }
        }
        log.info({ userId: this.userId, imported: imported.length }, 'Subscriptions imported');
        return imported;
    }
    // ==========================================================================
    // SUMMARY
    // ==========================================================================
    /**
     * Get subscription summary
     */
    getDetectionSummary(detected) {
        let monthlyTotal = 0;
        const byCategory = {};
        for (const sub of detected) {
            const monthly = this.toMonthlyAmount(sub.amount, sub.frequency);
            monthlyTotal += monthly;
            byCategory[sub.category] = (byCategory[sub.category] || 0) + monthly;
        }
        return {
            totalDetected: detected.length,
            highConfidence: detected.filter((d) => d.confidence >= 0.8).length,
            monthlyTotal: Math.round(monthlyTotal * 100) / 100,
            yearlyTotal: Math.round(monthlyTotal * 12 * 100) / 100,
            byCategory: byCategory,
        };
    }
    /**
     * Convert amount to monthly equivalent
     */
    toMonthlyAmount(amount, frequency) {
        switch (frequency) {
            case 'weekly':
                return amount * 4.33;
            case 'monthly':
                return amount;
            case 'quarterly':
                return amount / 3;
            case 'annual':
                return amount / 12;
            default:
                return amount;
        }
    }
}
// ============================================================================
// FACTORY
// ============================================================================
const instances = new Map();
export function getSubscriptionDetector(userId) {
    let instance = instances.get(userId);
    if (!instance) {
        instance = new SubscriptionDetector(userId);
        instances.set(userId, instance);
    }
    return instance;
}
export function resetSubscriptionDetector(userId) {
    instances.delete(userId);
}
//# sourceMappingURL=subscription-detector.js.map