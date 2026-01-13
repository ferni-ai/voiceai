/**
 * Quant Tools Firestore Persistence
 *
 * Stores and retrieves user financial data for Peter's quant tools.
 *
 * Schema:
 * - bogle_users/{userId}/financial_profile/current    → FinancialProfile
 * - bogle_users/{userId}/portfolio/holdings           → PortfolioHoldings
 * - bogle_users/{userId}/behavioral_finance/tracking  → BehavioralTracking
 * - bogle_users/{userId}/fire_progress/snapshots      → FIRESnapshot[]
 * - bogle_users/{userId}/quant_insights/history       → QuantInsight[]
 *
 * @module tools/domains/research/quant-firestore
 */
import { getLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
const log = getLogger();
// ============================================================================
// QUANT FIRESTORE SERVICE
// ============================================================================
export class QuantFirestoreService {
    db = null;
    initPromise = null;
    USERS_COLLECTION = 'bogle_users';
    constructor() {
        // Lazy initialization
    }
    /**
     * Initialize Firestore connection
     */
    async initialize() {
        if (this.db)
            return;
        if (this.initPromise)
            return this.initPromise;
        this.initPromise = this.doInitialize();
        return this.initPromise;
    }
    async doInitialize() {
        try {
            const { Firestore } = await import('@google-cloud/firestore');
            this.db = new Firestore({
                projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
                databaseId: process.env.FIRESTORE_DATABASE || '(default)',
            });
            log.info('Quant Firestore service initialized');
        }
        catch (error) {
            log.error({ error: String(error) }, 'Failed to initialize Firestore for quant tools');
            this.db = null;
        }
    }
    // ============================================================================
    // FINANCIAL PROFILE
    // ============================================================================
    /**
     * Save or update user's financial profile
     */
    async saveFinancialProfile(profile) {
        await this.initialize();
        if (!this.db)
            return;
        try {
            const docRef = this.db
                .collection(this.USERS_COLLECTION)
                .doc(profile.userId)
                .collection('financial_profile')
                .doc('current');
            await docRef.set(cleanForFirestore(this.serializeProfile(profile)), { merge: true });
            log.info({ userId: profile.userId }, 'Financial profile saved');
        }
        catch (error) {
            log.error({ error: String(error), userId: profile.userId }, 'Failed to save financial profile');
        }
    }
    /**
     * Load user's financial profile
     */
    async loadFinancialProfile(userId) {
        await this.initialize();
        if (!this.db)
            return null;
        try {
            const docRef = this.db
                .collection(this.USERS_COLLECTION)
                .doc(userId)
                .collection('financial_profile')
                .doc('current');
            const doc = await docRef.get();
            if (!doc.exists)
                return null;
            return this.deserializeProfile(doc.data(), userId);
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to load financial profile');
            return null;
        }
    }
    /**
     * Update specific financial profile fields
     */
    async updateFinancialProfile(userId, updates) {
        await this.initialize();
        if (!this.db)
            return;
        try {
            const docRef = this.db
                .collection(this.USERS_COLLECTION)
                .doc(userId)
                .collection('financial_profile')
                .doc('current');
            await docRef.update(cleanForFirestore({
                ...updates,
                updatedAt: new Date().toISOString(),
            }));
            log.debug({ userId, fields: Object.keys(updates) }, 'Financial profile updated');
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to update financial profile');
        }
    }
    // ============================================================================
    // PORTFOLIO HOLDINGS
    // ============================================================================
    /**
     * Save user's portfolio holdings
     */
    async savePortfolio(portfolio) {
        await this.initialize();
        if (!this.db)
            return;
        try {
            const docRef = this.db
                .collection(this.USERS_COLLECTION)
                .doc(portfolio.userId)
                .collection('portfolio')
                .doc('holdings');
            await docRef.set(cleanForFirestore(this.serializePortfolio(portfolio)), { merge: true });
            log.info({ userId: portfolio.userId, holdingCount: portfolio.holdings.length }, 'Portfolio saved');
        }
        catch (error) {
            log.error({ error: String(error), userId: portfolio.userId }, 'Failed to save portfolio');
        }
    }
    /**
     * Load user's portfolio
     */
    async loadPortfolio(userId) {
        await this.initialize();
        if (!this.db)
            return null;
        try {
            const docRef = this.db
                .collection(this.USERS_COLLECTION)
                .doc(userId)
                .collection('portfolio')
                .doc('holdings');
            const doc = await docRef.get();
            if (!doc.exists)
                return null;
            return this.deserializePortfolio(doc.data(), userId);
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to load portfolio');
            return null;
        }
    }
    /**
     * Add a holding to the portfolio
     */
    async addHolding(userId, holding) {
        const portfolio = await this.loadPortfolio(userId);
        const holdings = portfolio?.holdings || [];
        holdings.push(holding);
        await this.savePortfolio({
            userId,
            holdings,
            lastUpdated: new Date(),
        });
    }
    /**
     * Update a specific holding
     */
    async updateHolding(userId, symbol, updates) {
        const portfolio = await this.loadPortfolio(userId);
        if (!portfolio)
            return;
        const holdingIndex = portfolio.holdings.findIndex((h) => h.symbol === symbol);
        if (holdingIndex === -1)
            return;
        portfolio.holdings[holdingIndex] = { ...portfolio.holdings[holdingIndex], ...updates };
        portfolio.lastUpdated = new Date();
        await this.savePortfolio(portfolio);
    }
    /**
     * Remove a holding from the portfolio
     */
    async removeHolding(userId, symbol) {
        const portfolio = await this.loadPortfolio(userId);
        if (!portfolio)
            return;
        portfolio.holdings = portfolio.holdings.filter((h) => h.symbol !== symbol);
        portfolio.lastUpdated = new Date();
        await this.savePortfolio(portfolio);
    }
    // ============================================================================
    // BEHAVIORAL TRACKING
    // ============================================================================
    /**
     * Save behavioral tracking data
     */
    async saveBehavioralTracking(tracking) {
        await this.initialize();
        if (!this.db)
            return;
        try {
            const docRef = this.db
                .collection(this.USERS_COLLECTION)
                .doc(tracking.userId)
                .collection('behavioral_finance')
                .doc('tracking');
            await docRef.set(cleanForFirestore(this.serializeBehavioral(tracking)), { merge: true });
            log.info({ userId: tracking.userId }, 'Behavioral tracking saved');
        }
        catch (error) {
            log.error({ error: String(error), userId: tracking.userId }, 'Failed to save behavioral tracking');
        }
    }
    /**
     * Load behavioral tracking data
     */
    async loadBehavioralTracking(userId) {
        await this.initialize();
        if (!this.db)
            return null;
        try {
            const docRef = this.db
                .collection(this.USERS_COLLECTION)
                .doc(userId)
                .collection('behavioral_finance')
                .doc('tracking');
            const doc = await docRef.get();
            if (!doc.exists)
                return null;
            return this.deserializeBehavioral(doc.data(), userId);
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to load behavioral tracking');
            return null;
        }
    }
    /**
     * Record a behavioral event (panic sell, timing attempt, etc.)
     */
    async recordBehaviorEvent(userId, eventType, event) {
        const tracking = (await this.loadBehavioralTracking(userId)) || this.createEmptyTracking(userId);
        const newEvent = {
            ...event,
            date: new Date(),
        };
        switch (eventType) {
            case 'panicSell':
                tracking.panicSells.push(newEvent);
                break;
            case 'timingAttempt':
                tracking.timingAttempts.push(newEvent);
                break;
            case 'impulsePurchase':
                tracking.impulsePurchases.push(newEvent);
                break;
        }
        // Recalculate scores
        tracking.currentEmotionalControlScore = this.calculateEmotionalControl(tracking);
        tracking.currentDisciplineScore = this.calculateDiscipline(tracking);
        tracking.lastCalculated = new Date();
        await this.saveBehavioralTracking(tracking);
    }
    /**
     * Record monthly metric (budget adherence, savings consistency, etc.)
     */
    async recordMonthlyMetric(userId, metricType, value) {
        const tracking = (await this.loadBehavioralTracking(userId)) || this.createEmptyTracking(userId);
        const month = new Date().toISOString().slice(0, 7); // YYYY-MM
        const metric = { month, value };
        const existingIndex = tracking[metricType].findIndex((m) => m.month === month);
        if (existingIndex >= 0) {
            tracking[metricType][existingIndex] = metric;
        }
        else {
            tracking[metricType].push(metric);
        }
        // Recalculate scores
        tracking.currentDisciplineScore = this.calculateDiscipline(tracking);
        tracking.lastCalculated = new Date();
        await this.saveBehavioralTracking(tracking);
    }
    // ============================================================================
    // FIRE PROGRESS
    // ============================================================================
    /**
     * Save a FIRE progress snapshot
     */
    async saveFIRESnapshot(userId, snapshot) {
        await this.initialize();
        if (!this.db)
            return;
        try {
            const colRef = this.db
                .collection(this.USERS_COLLECTION)
                .doc(userId)
                .collection('fire_progress');
            await colRef.add(cleanForFirestore(this.serializeFIRESnapshot(snapshot)));
            log.info({ userId, percentToFire: snapshot.percentToFire }, 'FIRE snapshot saved');
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to save FIRE snapshot');
        }
    }
    /**
     * Load FIRE progress history
     */
    async loadFIREHistory(userId, limit = 12) {
        await this.initialize();
        if (!this.db)
            return [];
        try {
            const colRef = this.db
                .collection(this.USERS_COLLECTION)
                .doc(userId)
                .collection('fire_progress');
            const querySnapshot = await colRef.orderBy('date', 'desc').limit(limit).get();
            return querySnapshot.docs.map((doc) => this.deserializeFIRESnapshot(doc.data()));
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to load FIRE history');
            return [];
        }
    }
    /**
     * Get latest FIRE snapshot
     */
    async getLatestFIRESnapshot(userId) {
        const history = await this.loadFIREHistory(userId, 1);
        return history[0] || null;
    }
    // ============================================================================
    // QUANT INSIGHTS
    // ============================================================================
    /**
     * Save a quant insight
     */
    async saveInsight(userId, insight) {
        await this.initialize();
        if (!this.db)
            return;
        try {
            const colRef = this.db
                .collection(this.USERS_COLLECTION)
                .doc(userId)
                .collection('quant_insights');
            await colRef.doc(insight.id).set(cleanForFirestore(this.serializeInsight(insight)));
            log.debug({ userId, insightId: insight.id, type: insight.type }, 'Quant insight saved');
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to save quant insight');
        }
    }
    /**
     * Load recent insights
     */
    async loadRecentInsights(userId, limit = 10) {
        await this.initialize();
        if (!this.db)
            return [];
        try {
            const colRef = this.db
                .collection(this.USERS_COLLECTION)
                .doc(userId)
                .collection('quant_insights');
            const querySnapshot = await colRef.orderBy('date', 'desc').limit(limit).get();
            return querySnapshot.docs.map((doc) => this.deserializeInsight(doc.data()));
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to load recent insights');
            return [];
        }
    }
    /**
     * Get unacknowledged high-priority insights
     */
    async getActionableInsights(userId) {
        await this.initialize();
        if (!this.db)
            return [];
        try {
            const colRef = this.db
                .collection(this.USERS_COLLECTION)
                .doc(userId)
                .collection('quant_insights');
            // Note: Firestore doesn't support multiple inequality filters,
            // so we filter in memory for complex queries
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query = colRef;
            query = query.where('acknowledged', '==', false);
            query = query.where('actionable', '==', true);
            query = query.orderBy('date', 'desc');
            query = query.limit(20);
            const querySnapshot = await query.get();
            return querySnapshot.docs
                .map((doc) => this.deserializeInsight(doc.data()))
                .filter((i) => i.priority === 'high' || i.priority === 'medium');
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to load actionable insights');
            return [];
        }
    }
    /**
     * Mark an insight as acknowledged
     */
    async acknowledgeInsight(userId, insightId) {
        await this.initialize();
        if (!this.db)
            return;
        try {
            const docRef = this.db
                .collection(this.USERS_COLLECTION)
                .doc(userId)
                .collection('quant_insights')
                .doc(insightId);
            await docRef.update(cleanForFirestore({ acknowledged: true }));
        }
        catch (error) {
            log.error({ error: String(error), userId, insightId }, 'Failed to acknowledge insight');
        }
    }
    // ============================================================================
    // HELPER METHODS
    // ============================================================================
    createEmptyTracking(userId) {
        return {
            userId,
            panicSells: [],
            timingAttempts: [],
            impulsePurchases: [],
            budgetAdherence: [],
            savingsConsistency: [],
            debtPaymentConsistency: [],
            currentEmotionalControlScore: 100,
            currentDisciplineScore: 100,
            currentPatienceScore: 100,
            lastCalculated: new Date(),
        };
    }
    calculateEmotionalControl(tracking) {
        // Fewer panic sells and timing attempts = higher score
        const recentPanicSells = tracking.panicSells.filter((e) => new Date(e.date) > new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)).length;
        const recentTimingAttempts = tracking.timingAttempts.filter((e) => new Date(e.date) > new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)).length;
        // Start at 100, deduct for each negative event
        let score = 100;
        score -= recentPanicSells * 15;
        score -= recentTimingAttempts * 10;
        return Math.max(0, Math.min(100, score));
    }
    calculateDiscipline(tracking) {
        // Average of recent monthly metrics
        const recentMonths = 6;
        const getRecentAverage = (metrics) => {
            const recent = metrics.slice(-recentMonths);
            if (recent.length === 0)
                return 100;
            return recent.reduce((sum, m) => sum + m.value, 0) / recent.length;
        };
        const budgetScore = getRecentAverage(tracking.budgetAdherence);
        const savingsScore = getRecentAverage(tracking.savingsConsistency);
        const debtScore = getRecentAverage(tracking.debtPaymentConsistency);
        // Deduct for impulse purchases
        const recentImpulse = tracking.impulsePurchases.filter((e) => new Date(e.date) > new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)).length;
        const impulseDeduction = recentImpulse * 5;
        return Math.max(0, Math.min(100, (budgetScore + savingsScore + debtScore) / 3 - impulseDeduction));
    }
    // ============================================================================
    // SERIALIZATION
    // ============================================================================
    serializeProfile(profile) {
        return {
            ...profile,
            createdAt: profile.createdAt.toISOString(),
            updatedAt: profile.updatedAt.toISOString(),
        };
    }
    deserializeProfile(data, userId) {
        return {
            userId,
            monthlyIncome: data.monthlyIncome || 0,
            monthlyExpenses: data.monthlyExpenses || 0,
            monthlyDebtPayments: data.monthlyDebtPayments || 0,
            emergencyFundMonths: data.emergencyFundMonths || 0,
            retirementContribution: data.retirementContribution || 0,
            currentAge: data.currentAge || 30,
            targetRetirementAge: data.targetRetirementAge || 65,
            currentRetirementSavings: data.currentRetirementSavings || 0,
            riskTolerance: (data.riskTolerance ||
                'moderate'),
            createdAt: new Date(data.createdAt || Date.now()),
            updatedAt: new Date(data.updatedAt || Date.now()),
        };
    }
    serializePortfolio(portfolio) {
        return {
            ...portfolio,
            holdings: portfolio.holdings.map((h) => ({
                ...h,
                purchaseDate: h.purchaseDate.toISOString(),
            })),
            lastUpdated: portfolio.lastUpdated.toISOString(),
        };
    }
    deserializePortfolio(data, userId) {
        const holdings = data.holdings || [];
        return {
            userId,
            holdings: holdings.map((h) => ({
                symbol: h.symbol,
                shares: h.shares,
                costBasis: h.costBasis,
                purchaseDate: new Date(h.purchaseDate),
                accountType: (h.accountType || 'taxable'),
                notes: h.notes,
            })),
            lastUpdated: new Date(data.lastUpdated || Date.now()),
            totalValue: data.totalValue,
            totalCostBasis: data.totalCostBasis,
        };
    }
    serializeBehavioral(tracking) {
        const serializeEvents = (events) => events.map((e) => ({ ...e, date: e.date.toISOString() }));
        return {
            ...tracking,
            panicSells: serializeEvents(tracking.panicSells),
            timingAttempts: serializeEvents(tracking.timingAttempts),
            impulsePurchases: serializeEvents(tracking.impulsePurchases),
            lastCalculated: tracking.lastCalculated.toISOString(),
        };
    }
    deserializeBehavioral(data, userId) {
        const deserializeEvents = (events) => events.map((e) => ({ ...e, date: new Date(e.date) }));
        return {
            userId,
            panicSells: deserializeEvents(data.panicSells || []),
            timingAttempts: deserializeEvents(data.timingAttempts || []),
            impulsePurchases: deserializeEvents(data.impulsePurchases || []),
            budgetAdherence: data.budgetAdherence || [],
            savingsConsistency: data.savingsConsistency || [],
            debtPaymentConsistency: data.debtPaymentConsistency || [],
            currentEmotionalControlScore: data.currentEmotionalControlScore || 100,
            currentDisciplineScore: data.currentDisciplineScore || 100,
            currentPatienceScore: data.currentPatienceScore || 100,
            lastCalculated: new Date(data.lastCalculated || Date.now()),
        };
    }
    serializeFIRESnapshot(snapshot) {
        return {
            ...snapshot,
            date: snapshot.date.toISOString(),
            projectedFireDate: snapshot.projectedFireDate?.toISOString() || null,
        };
    }
    deserializeFIRESnapshot(data) {
        return {
            date: new Date(data.date),
            netWorth: data.netWorth,
            fireNumber: data.fireNumber,
            percentToFire: data.percentToFire,
            projectedFireDate: data.projectedFireDate ? new Date(data.projectedFireDate) : null,
            savingsRate: data.savingsRate,
            monthlyPassiveIncome: data.monthlyPassiveIncome,
        };
    }
    serializeInsight(insight) {
        return {
            ...insight,
            date: insight.date.toISOString(),
        };
    }
    deserializeInsight(data) {
        return {
            id: data.id,
            date: new Date(data.date),
            type: data.type,
            title: data.title,
            summary: data.summary,
            details: data.details,
            actionable: data.actionable,
            priority: data.priority,
            symbols: data.symbols,
            metrics: data.metrics,
            acknowledged: data.acknowledged,
        };
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
let quantFirestoreInstance = null;
export function getQuantFirestore() {
    if (!quantFirestoreInstance) {
        quantFirestoreInstance = new QuantFirestoreService();
    }
    return quantFirestoreInstance;
}
export default getQuantFirestore;
//# sourceMappingURL=quant-firestore.js.map