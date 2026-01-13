/**
 * Peter's User Data Service
 *
 * Manages all user-specific data for Peter's intelligence system.
 * Provides CRUD operations for investment theses, goals, life events, etc.
 *
 * @module tools/domains/research/user-data/user-data-service
 */
import { getLogger } from '../../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../../utils/firestore-utils.js';
const log = getLogger();
// ============================================================================
// FIRESTORE INITIALIZATION
// ============================================================================
let db = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise = null;
async function getFirestore() {
    if (db)
        return db;
    if (dbInitPromise)
        return dbInitPromise;
    dbInitPromise = initializeFirestore();
    return dbInitPromise;
}
async function initializeFirestore() {
    try {
        const { Firestore } = await import('@google-cloud/firestore');
        db = new Firestore({
            projectId: process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025',
        });
        log.info('User data Firestore initialized');
        return db;
    }
    catch (error) {
        log.error({ error: String(error) }, 'Failed to initialize Firestore');
        dbInitPromise = null; // Allow retry
        throw error;
    }
}
const USERS_COLLECTION = 'bogle_users';
// ============================================================================
// INVESTMENT THESIS
// ============================================================================
export async function saveInvestmentThesis(userId, thesis) {
    try {
        const firestore = await getFirestore();
        const docRef = firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('investment_theses')
            .doc(thesis.symbol.toUpperCase());
        await docRef.set(cleanForFirestore({
            ...thesis,
            purchaseDate: thesis.purchaseDate.toISOString(),
            updates: thesis.updates.map((u) => ({ ...u, date: u.date.toISOString() })),
            lastReviewed: thesis.lastReviewed.toISOString(),
        }));
        log.debug({ userId, symbol: thesis.symbol }, 'Investment thesis saved');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to save investment thesis');
    }
}
export async function loadInvestmentThesis(userId, symbol) {
    try {
        const firestore = await getFirestore();
        const docRef = firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('investment_theses')
            .doc(symbol.toUpperCase());
        const doc = await docRef.get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        if (!data)
            return null;
        return {
            ...data,
            purchaseDate: new Date(data.purchaseDate),
            updates: data.updates?.map((u) => ({
                ...u,
                date: new Date(u.date),
            })) || [],
            lastReviewed: new Date(data.lastReviewed),
        };
    }
    catch (error) {
        log.error({ error: String(error), userId, symbol }, 'Failed to load investment thesis');
        return null;
    }
}
export async function loadAllTheses(userId) {
    try {
        const firestore = await getFirestore();
        const snapshot = await firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('investment_theses')
            .get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                purchaseDate: new Date(data.purchaseDate),
                updates: data.updates?.map((u) => ({
                    ...u,
                    date: new Date(u.date),
                })) || [],
                lastReviewed: new Date(data.lastReviewed),
            };
        });
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load all theses');
        return [];
    }
}
export async function updateThesis(userId, symbol, update) {
    try {
        const thesis = await loadInvestmentThesis(userId, symbol);
        if (!thesis) {
            log.warn({ userId, symbol }, 'Thesis not found for update');
            return;
        }
        thesis.updates.push(update);
        thesis.lastReviewed = new Date();
        await saveInvestmentThesis(userId, thesis);
        log.debug({ userId, symbol }, 'Thesis updated');
    }
    catch (error) {
        log.error({ error: String(error), userId, symbol }, 'Failed to update thesis');
    }
}
// ============================================================================
// FINANCIAL GOALS
// ============================================================================
export async function saveFinancialGoal(userId, goal) {
    try {
        const firestore = await getFirestore();
        const docRef = firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('financial_goals')
            .doc(goal.id);
        await docRef.set(cleanForFirestore({
            ...goal,
            target: {
                ...goal.target,
                date: goal.target.date?.toISOString(),
            },
            current: {
                ...goal.current,
                lastUpdated: goal.current.lastUpdated.toISOString(),
            },
            progress: {
                ...goal.progress,
                projectedCompletion: goal.progress.projectedCompletion?.toISOString(),
            },
            milestones: goal.milestones.map((m) => ({
                ...m,
                celebratedAt: m.celebratedAt?.toISOString(),
            })),
            createdAt: goal.createdAt.toISOString(),
        }));
        log.debug({ userId, goalId: goal.id, goalName: goal.name }, 'Financial goal saved');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to save financial goal');
    }
}
export async function loadFinancialGoals(userId) {
    try {
        const firestore = await getFirestore();
        const snapshot = await firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('financial_goals')
            .orderBy('priority')
            .get();
        return snapshot.docs.map((doc) => deserializeGoal(doc.data()));
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load financial goals');
        return [];
    }
}
export async function updateGoalProgress(userId, goalId, currentAmount) {
    try {
        const firestore = await getFirestore();
        const docRef = firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('financial_goals')
            .doc(goalId);
        const doc = await docRef.get();
        if (!doc.exists)
            return null;
        const goal = deserializeGoal(doc.data());
        const previousPercentage = goal.progress.percentage;
        // Update current amount
        goal.current.amount = currentAmount;
        goal.current.lastUpdated = new Date();
        // Recalculate progress
        goal.progress.percentage = (currentAmount / goal.target.amount) * 100;
        goal.progress.onTrack = calculateOnTrack(goal);
        // Check for new milestones
        const newMilestones = [];
        const milestoneThresholds = [10, 25, 50, 75, 90, 100];
        for (const threshold of milestoneThresholds) {
            if (previousPercentage < threshold && goal.progress.percentage >= threshold) {
                const milestone = goal.milestones.find((m) => m.percentage === threshold);
                if (milestone && !milestone.celebratedAt) {
                    milestone.celebratedAt = new Date();
                    newMilestones.push(milestone);
                }
            }
        }
        await saveFinancialGoal(userId, goal);
        return { goal, newMilestones };
    }
    catch (error) {
        log.error({ error: String(error), userId, goalId }, 'Failed to update goal progress');
        return null;
    }
}
function deserializeGoal(data) {
    const target = data.target;
    const current = data.current;
    const progress = data.progress;
    const milestones = data.milestones;
    return {
        ...data,
        target: {
            amount: target.amount,
            date: target.date ? new Date(target.date) : undefined,
        },
        current: {
            amount: current.amount,
            lastUpdated: new Date(current.lastUpdated),
        },
        progress: {
            percentage: progress.percentage,
            projectedCompletion: progress.projectedCompletion
                ? new Date(progress.projectedCompletion)
                : undefined,
            onTrack: progress.onTrack,
            monthlyRequired: progress.monthlyRequired,
        },
        milestones: milestones.map((m) => ({
            percentage: m.percentage,
            celebratedAt: m.celebratedAt ? new Date(m.celebratedAt) : undefined,
            celebrationMessage: m.celebrationMessage,
        })),
        createdAt: new Date(data.createdAt),
    };
}
function calculateOnTrack(goal) {
    if (!goal.target.date)
        return true;
    const now = new Date();
    const totalDays = goal.target.date.getTime() - goal.createdAt.getTime();
    const elapsedDays = now.getTime() - goal.createdAt.getTime();
    const expectedProgress = (elapsedDays / totalDays) * 100;
    return goal.progress.percentage >= expectedProgress * 0.9; // 10% buffer
}
// ============================================================================
// LIFE EVENTS
// ============================================================================
export async function saveLifeEvent(userId, event) {
    try {
        const firestore = await getFirestore();
        const docRef = firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('life_events')
            .doc(event.id);
        await docRef.set(cleanForFirestore({
            ...event,
            date: event.date.toISOString(),
        }));
        log.debug({ userId, eventId: event.id, eventType: event.type }, 'Life event saved');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to save life event');
    }
}
export async function loadLifeEvents(userId, limit = 50) {
    try {
        const firestore = await getFirestore();
        const snapshot = await firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('life_events')
            .orderBy('date', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                date: new Date(data.date),
            };
        });
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load life events');
        return [];
    }
}
export async function getRecentLifeEvents(userId, daysBack = 90) {
    try {
        const firestore = await getFirestore();
        const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
        const snapshot = await firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('life_events')
            .where('date', '>=', cutoffDate.toISOString())
            .orderBy('date', 'desc')
            .get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                date: new Date(data.date),
            };
        });
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load recent life events');
        return [];
    }
}
// ============================================================================
// QUESTION HISTORY
// ============================================================================
export async function saveQuestion(userId, record) {
    try {
        const firestore = await getFirestore();
        const docRef = firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('question_history')
            .doc(record.id);
        await docRef.set(cleanForFirestore({
            ...record,
            timestamp: record.timestamp.toISOString(),
        }));
        log.debug({ userId, questionId: record.id }, 'Question recorded');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to save question');
    }
}
export async function loadQuestionHistory(userId, limit = 100) {
    try {
        const firestore = await getFirestore();
        const snapshot = await firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('question_history')
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                timestamp: new Date(data.timestamp),
            };
        });
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load question history');
        return [];
    }
}
export async function hasAskedAbout(userId, topic) {
    try {
        const firestore = await getFirestore();
        const snapshot = await firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('question_history')
            .where('topics', 'array-contains', topic.toLowerCase())
            .where('shouldNotRepeat', '==', true)
            .limit(1)
            .get();
        return !snapshot.empty;
    }
    catch (error) {
        log.error({ error: String(error), userId, topic }, 'Failed to check question history');
        return false;
    }
}
export async function getConceptsExplained(userId) {
    try {
        const questions = await loadQuestionHistory(userId, 500);
        const concepts = new Set();
        for (const q of questions) {
            if (q.shouldNotRepeat && q.conceptsExplained) {
                for (const concept of q.conceptsExplained) {
                    concepts.add(concept.toLowerCase());
                }
            }
        }
        return Array.from(concepts);
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get concepts explained');
        return [];
    }
}
// ============================================================================
// LEARNING PREFERENCES
// ============================================================================
export async function saveLearningPreferences(userId, prefs) {
    try {
        const firestore = await getFirestore();
        const docRef = firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('profile')
            .doc('learning_preferences');
        await docRef.set(cleanForFirestore({
            ...prefs,
            effectiveExplanations: prefs.effectiveExplanations.map((e) => ({
                ...e,
                timestamp: e.timestamp.toISOString(),
            })),
            lastUpdated: new Date().toISOString(),
        }));
        log.debug({ userId }, 'Learning preferences saved');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to save learning preferences');
    }
}
export async function loadLearningPreferences(userId) {
    try {
        const firestore = await getFirestore();
        const docRef = firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('profile')
            .doc('learning_preferences');
        const doc = await docRef.get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        if (!data)
            return null;
        return {
            ...data,
            effectiveExplanations: (data.effectiveExplanations || []).map((e) => ({
                ...e,
                timestamp: new Date(e.timestamp),
            })),
            lastUpdated: new Date(data.lastUpdated),
        };
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load learning preferences');
        return null;
    }
}
export async function recordEffectiveExplanation(userId, topic, approachUsed, comprehensionScore) {
    try {
        const prefs = (await loadLearningPreferences(userId)) || createDefaultLearningPreferences(userId);
        prefs.effectiveExplanations.push({
            topic,
            approachUsed,
            comprehensionScore,
            timestamp: new Date(),
        });
        // Keep only last 100 explanations
        if (prefs.effectiveExplanations.length > 100) {
            prefs.effectiveExplanations = prefs.effectiveExplanations.slice(-100);
        }
        await saveLearningPreferences(userId, prefs);
    }
    catch (error) {
        log.error({ error: String(error), userId, topic }, 'Failed to record effective explanation');
    }
}
function createDefaultLearningPreferences(userId) {
    return {
        userId,
        explanationStyle: 'simple',
        preferredAnalogies: ['general'],
        attentionSpan: 'moderate',
        visualLearner: false,
        numbersComfort: 'comfortable',
        jargonLevel: 'some',
        responseLength: 'moderate',
        effectiveExplanations: [],
        confusionSignals: [],
        engagementSignals: [],
        lastUpdated: new Date(),
    };
}
// ============================================================================
// RISK EVENTS
// ============================================================================
export async function saveRiskEvent(userId, event) {
    try {
        const firestore = await getFirestore();
        const docRef = firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('risk_events')
            .doc(event.id);
        await docRef.set(cleanForFirestore({
            ...event,
            date: event.date.toISOString(),
            userReaction: {
                ...event.userReaction,
                reflectionDate: event.userReaction.reflectionDate?.toISOString(),
            },
        }));
        log.debug({ userId, eventId: event.id }, 'Risk event saved');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to save risk event');
    }
}
export async function loadRiskEvents(userId) {
    try {
        const firestore = await getFirestore();
        const snapshot = await firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('risk_events')
            .orderBy('date', 'desc')
            .get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                date: new Date(data.date),
                userReaction: {
                    ...data.userReaction,
                    reflectionDate: data.userReaction.reflectionDate
                        ? new Date(data.userReaction.reflectionDate)
                        : undefined,
                },
            };
        });
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load risk events');
        return [];
    }
}
export async function getUserCrisisHistory(userId) {
    try {
        const events = await loadRiskEvents(userId);
        const panicSellCount = events.filter((e) => e.userReaction.action === 'panic_sold').length;
        const heldCount = events.filter((e) => e.userReaction.action === 'held').length;
        const boughtMoreCount = events.filter((e) => e.userReaction.action === 'bought_more').length;
        const recoveryTimes = events
            .filter((e) => e.outcome.recoveryTime)
            .map((e) => e.outcome.recoveryTime);
        const averageRecoveryTime = recoveryTimes.length > 0
            ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
            : 0;
        const lessonsLearned = events
            .filter((e) => e.userReaction.lessonLearned)
            .map((e) => e.userReaction.lessonLearned);
        return {
            totalEvents: events.length,
            panicSellCount,
            heldCount,
            boughtMoreCount,
            averageRecoveryTime,
            lessonsLearned,
        };
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get crisis history');
        return {
            totalEvents: 0,
            panicSellCount: 0,
            heldCount: 0,
            boughtMoreCount: 0,
            averageRecoveryTime: 0,
            lessonsLearned: [],
        };
    }
}
// ============================================================================
// TRUSTED SOURCES
// ============================================================================
export async function saveTrustedSources(userId, sources) {
    try {
        const firestore = await getFirestore();
        const docRef = firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('profile')
            .doc('trusted_sources');
        await docRef.set(cleanForFirestore({
            ...sources,
            lastUpdated: new Date().toISOString(),
        }));
        log.debug({ userId }, 'Trusted sources saved');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to save trusted sources');
    }
}
export async function loadTrustedSources(userId) {
    try {
        const firestore = await getFirestore();
        const docRef = firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('profile')
            .doc('trusted_sources');
        const doc = await docRef.get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        if (!data)
            return null;
        return {
            ...data,
            lastUpdated: new Date(data.lastUpdated),
        };
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load trusted sources');
        return null;
    }
}
// ============================================================================
// KNOWLEDGE GAPS
// ============================================================================
export async function saveKnowledgeProfile(userId, profile) {
    try {
        const firestore = await getFirestore();
        const docRef = firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('profile')
            .doc('knowledge');
        await docRef.set(cleanForFirestore({
            ...profile,
            gaps: profile.gaps.map((g) => ({
                ...g,
                identifiedAt: g.identifiedAt.toISOString(),
                addressedAt: g.addressedAt?.toISOString(),
            })),
            lastAssessed: profile.lastAssessed.toISOString(),
        }));
        log.debug({ userId }, 'Knowledge profile saved');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to save knowledge profile');
    }
}
export async function loadKnowledgeProfile(userId) {
    try {
        const firestore = await getFirestore();
        const docRef = firestore
            .collection(USERS_COLLECTION)
            .doc(userId)
            .collection('profile')
            .doc('knowledge');
        const doc = await docRef.get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        if (!data)
            return null;
        return {
            ...data,
            gaps: (data.gaps || []).map((g) => ({
                ...g,
                identifiedAt: new Date(g.identifiedAt),
                addressedAt: g.addressedAt ? new Date(g.addressedAt) : undefined,
            })),
            lastAssessed: new Date(data.lastAssessed),
        };
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load knowledge profile');
        return null;
    }
}
export async function identifyKnowledgeGap(userId, gap) {
    try {
        const profile = (await loadKnowledgeProfile(userId)) || {
            userId,
            gaps: [],
            strengths: [],
            educationQueue: [],
            lastAssessed: new Date(),
        };
        // Don't add duplicate gaps
        if (profile.gaps.some((g) => g.topic.toLowerCase() === gap.topic.toLowerCase())) {
            return;
        }
        profile.gaps.push(gap);
        profile.lastAssessed = new Date();
        await saveKnowledgeProfile(userId, profile);
        log.debug({ userId, topic: gap.topic }, 'Knowledge gap identified');
    }
    catch (error) {
        log.error({ error: String(error), userId, topic: gap.topic }, 'Failed to identify knowledge gap');
    }
}
export async function markGapAddressed(userId, topic) {
    try {
        const profile = await loadKnowledgeProfile(userId);
        if (!profile)
            return;
        const gap = profile.gaps.find((g) => g.topic.toLowerCase() === topic.toLowerCase());
        if (gap) {
            gap.addressed = true;
            gap.addressedAt = new Date();
            await saveKnowledgeProfile(userId, profile);
            log.debug({ userId, topic }, 'Knowledge gap addressed');
        }
    }
    catch (error) {
        log.error({ error: String(error), userId, topic }, 'Failed to mark gap addressed');
    }
}
export async function getNextLearningTopic(userId) {
    try {
        const profile = await loadKnowledgeProfile(userId);
        if (!profile)
            return null;
        // Find unaddressed gaps sorted by severity
        const unaddressedGaps = profile.gaps
            .filter((g) => !g.addressed)
            .sort((a, b) => {
            const severityOrder = { critical: 0, moderate: 1, minor: 2 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        });
        if (unaddressedGaps.length > 0) {
            return unaddressedGaps[0].topic;
        }
        // Fall back to education queue
        const nextInQueue = profile.educationQueue
            .filter((e) => e.prerequisitesMet)
            .sort((a, b) => b.priority - a.priority)[0];
        return nextInQueue?.topic || null;
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get next learning topic');
        return null;
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export const UserDataService = {
    // Investment Thesis
    saveInvestmentThesis,
    loadInvestmentThesis,
    loadAllTheses,
    updateThesis,
    // Financial Goals
    saveFinancialGoal,
    loadFinancialGoals,
    updateGoalProgress,
    // Life Events
    saveLifeEvent,
    loadLifeEvents,
    getRecentLifeEvents,
    // Question History
    saveQuestion,
    loadQuestionHistory,
    hasAskedAbout,
    getConceptsExplained,
    // Learning Preferences
    saveLearningPreferences,
    loadLearningPreferences,
    recordEffectiveExplanation,
    // Risk Events
    saveRiskEvent,
    loadRiskEvents,
    getUserCrisisHistory,
    // Trusted Sources
    saveTrustedSources,
    loadTrustedSources,
    // Knowledge Gaps
    saveKnowledgeProfile,
    loadKnowledgeProfile,
    identifyKnowledgeGap,
    markGapAddressed,
    getNextLearningTopic,
};
export default UserDataService;
//# sourceMappingURL=user-data-service.js.map