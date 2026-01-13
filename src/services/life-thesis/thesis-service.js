/**
 * Life Thesis Service
 *
 * Manages the storage, retrieval, and reminding of life theses.
 * A thesis captures your "why" when you're motivated, so it can be recalled
 * when you're struggling.
 */
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { onLifeThesisComponentChange } from '../data-layer/hooks/wisdom-hooks.js';
const log = getLogger().child({ module: 'LifeThesisService' });
/**
 * Save a new thesis.
 */
export async function saveThesis(userId, domain, type, thesis, options) {
    const db = getFirestore();
    const thesesRef = db.collection('bogle_users').doc(userId).collection('life_theses');
    const now = new Date();
    const thesisDoc = {
        domain,
        type,
        createdAt: now,
        updatedAt: now,
        thesis,
        expectedOutcomes: options.expectedOutcomes,
        knownChallenges: options.knownChallenges ?? [],
        successIndicators: options.successIndicators ?? [],
        exitCriteria: options.exitCriteria,
        emotionalState: options.emotionalState ?? {
            atCreation: 'determined',
            confidenceLevel: 7,
            motivationSource: 'personal desire',
        },
        updates: [],
        reviewSchedule: options.reviewSchedule ?? 'on_struggle',
        domainData: options.domainData ?? {},
    };
    const docRef = await thesesRef.add(cleanForFirestore({
        ...thesisDoc,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    }));
    // Index to semantic memory for thesis search
    void onLifeThesisComponentChange(userId, docRef.id, {
        component: thesis,
        category: domain === 'investment' || domain === 'habit' || domain === 'goal'
            ? 'vision'
            : domain === 'career' || domain === 'learning'
                ? 'purpose'
                : domain === 'relationship' || domain === 'boundary'
                    ? 'values'
                    : 'principles',
        description: options.expectedOutcomes.join('. '),
        confidence: 'developing',
    }, 'create');
    log.info({ userId, domain, thesisId: docRef.id }, 'Thesis saved');
    return { ...thesisDoc, id: docRef.id };
}
/**
 * Get a specific thesis by ID.
 */
export async function getThesis(userId, thesisId) {
    const db = getFirestore();
    const doc = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('life_theses')
        .doc(thesisId)
        .get();
    if (!doc.exists)
        return null;
    const data = doc.data();
    return {
        ...data,
        id: doc.id,
        createdAt: data?.createdAt?.toDate() ?? new Date(),
        updatedAt: data?.updatedAt?.toDate() ?? new Date(),
        lastReviewed: data?.lastReviewed?.toDate(),
        updates: (data?.updates ?? []).map((u) => ({
            ...u,
            date: u.date?.toDate?.() ?? u.date,
        })),
    };
}
/**
 * Get all theses for a domain.
 */
export async function getThesesByDomain(userId, domain) {
    const db = getFirestore();
    const snapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('life_theses')
        .where('domain', '==', domain)
        .orderBy('createdAt', 'desc')
        .get();
    return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
            ...data,
            id: doc.id,
            createdAt: data?.createdAt?.toDate() ?? new Date(),
            updatedAt: data?.updatedAt?.toDate() ?? new Date(),
            lastReviewed: data?.lastReviewed?.toDate(),
            updates: (data?.updates ?? []).map((u) => ({
                ...u,
                date: u.date?.toDate?.() ?? u.date,
            })),
        };
    });
}
/**
 * Get all theses for a user.
 */
export async function getAllTheses(userId) {
    const db = getFirestore();
    const snapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('life_theses')
        .orderBy('createdAt', 'desc')
        .get();
    return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
            ...data,
            id: doc.id,
            createdAt: data?.createdAt?.toDate() ?? new Date(),
            updatedAt: data?.updatedAt?.toDate() ?? new Date(),
            lastReviewed: data?.lastReviewed?.toDate(),
            updates: (data?.updates ?? []).map((u) => ({
                ...u,
                date: u.date?.toDate?.() ?? u.date,
            })),
        };
    });
}
/**
 * Update a thesis with new information.
 */
export async function updateThesis(userId, thesisId, update) {
    const db = getFirestore();
    const thesisRef = db
        .collection('bogle_users')
        .doc(userId)
        .collection('life_theses')
        .doc(thesisId);
    const thesisUpdate = {
        date: new Date(),
        note: update.note,
        stillValid: update.stillValid,
        newConfidence: update.newConfidence,
        trigger: update.trigger ?? 'scheduled_review',
    };
    await thesisRef.update(cleanForFirestore({
        updates: FieldValue.arrayUnion({
            ...thesisUpdate,
            date: FieldValue.serverTimestamp(),
        }),
        updatedAt: FieldValue.serverTimestamp(),
        lastReviewed: FieldValue.serverTimestamp(),
    }));
    log.info({ userId, thesisId, stillValid: update.stillValid }, 'Thesis updated');
    return getThesis(userId, thesisId);
}
/**
 * Invalidate a thesis (mark as no longer valid).
 */
export async function invalidateThesis(userId, thesisId, reason) {
    await updateThesis(userId, thesisId, {
        note: `INVALIDATED: ${reason}`,
        stillValid: false,
        trigger: 'change_in_circumstances',
    });
}
/**
 * Generate a reminder for a thesis.
 * This is what gets shown when someone is struggling.
 */
export async function generateReminder(userId, domain, currentSituation, emotionalState) {
    const theses = await getThesesByDomain(userId, domain);
    // Find the most relevant active thesis
    const activeTheses = theses.filter((t) => {
        const lastUpdate = t.updates[t.updates.length - 1];
        return !lastUpdate || lastUpdate.stillValid;
    });
    if (activeTheses.length === 0)
        return null;
    // Use the most recent thesis (could be smarter with relevance scoring)
    const thesis = activeTheses[0];
    const daysSinceCreation = Math.floor((Date.now() - thesis.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    // Generate questions based on the thesis
    const questions = generateReminderQuestions(thesis, currentSituation);
    // Generate encouragement based on their original motivation
    const encouragement = generateEncouragement(thesis, daysSinceCreation);
    return {
        thesis,
        daysSinceCreation,
        context: {
            currentSituation,
            emotionalState,
        },
        questions,
        encouragement,
    };
}
/**
 * Generate questions to help someone reflect on their thesis.
 */
function generateReminderQuestions(thesis, situation) {
    const questions = [];
    // Reference their original motivation
    questions.push(`When you started this ${thesis.domain}, you felt ${thesis.emotionalState.atCreation}. What's changed?`);
    // Check against known challenges
    if (thesis.knownChallenges.length > 0) {
        questions.push(`You knew "${thesis.knownChallenges[0]}" might be challenging. Is that what you're facing now?`);
    }
    // Reference expected outcomes
    if (thesis.expectedOutcomes.length > 0) {
        questions.push(`You hoped for: "${thesis.expectedOutcomes[0]}". Are you still moving toward that?`);
    }
    // Check against success indicators
    if (thesis.successIndicators.length > 0) {
        questions.push(`Your success indicator was: "${thesis.successIndicators[0]}". How are you doing on that?`);
    }
    // Check exit criteria
    if (thesis.exitCriteria?.conditions.length) {
        questions.push(`You said you'd reconsider if: "${thesis.exitCriteria.conditions[0]}". Has that happened?`);
    }
    return questions;
}
/**
 * Generate encouragement based on their thesis and journey.
 */
function generateEncouragement(thesis, daysSinceCreation) {
    const timeContext = daysSinceCreation < 7
        ? "It's early - you're still finding your rhythm."
        : daysSinceCreation < 30
            ? `You've been at this for ${daysSinceCreation} days. That's real commitment.`
            : daysSinceCreation < 90
                ? `${daysSinceCreation} days. You're building something real here.`
                : `${Math.floor(daysSinceCreation / 30)} months in. Look how far you've come.`;
    const motivationContext = thesis.emotionalState.motivationSource
        ? `Remember why you started: ${thesis.emotionalState.motivationSource}.`
        : '';
    const confidenceContext = thesis.emotionalState.confidenceLevel >= 7
        ? `You believed strongly in this when you started.`
        : `Even with uncertainty, you decided this was worth trying.`;
    return `${timeContext} ${confidenceContext} ${motivationContext}`.trim();
}
// ============================================
// Domain-specific helper functions
// ============================================
/**
 * Save an investment thesis (Peter's domain).
 */
export async function saveInvestmentThesis(userId, symbol, thesis, options) {
    const domainData = {
        symbol,
        purchasePrice: options.purchasePrice,
        purchaseDate: new Date(),
        catalysts: options.catalysts,
        risks: options.risks,
        priceTarget: options.priceTarget,
        timeHorizon: options.timeHorizon,
    };
    return saveThesis(userId, 'investment', 'stock', thesis, {
        expectedOutcomes: options.catalysts.map((c) => `Catalyst: ${c}`),
        knownChallenges: options.risks,
        successIndicators: options.priceTarget ? [`Price reaches ${options.priceTarget}`] : [],
        emotionalState: {
            atCreation: 'determined',
            confidenceLevel: options.confidence,
            motivationSource: options.motivationSource,
        },
        reviewSchedule: 'quarterly',
        domainData: domainData,
    });
}
/**
 * Save a habit thesis (Maya's domain).
 */
export async function saveHabitThesis(userId, habitName, thesis, options) {
    const domainData = {
        habitName,
        habitDescription: options.description,
        cue: options.cue,
        routine: options.routine,
        reward: options.reward,
        relatedIdentity: options.identity,
    };
    return saveThesis(userId, 'habit', 'daily', thesis, {
        expectedOutcomes: [`Become: ${options.identity}`, `Reward: ${options.reward}`],
        knownChallenges: options.challenges,
        successIndicators: ['Completed 30 consecutive days', 'Feels automatic'],
        emotionalState: {
            atCreation: 'committed',
            confidenceLevel: options.confidence,
            motivationSource: options.motivationSource,
        },
        reviewSchedule: 'weekly',
        domainData: domainData,
    });
}
/**
 * Save a goal thesis (Jordan's domain).
 */
export async function saveGoalThesis(userId, goalName, thesis, options) {
    const domainData = {
        goalName,
        targetDate: options.targetDate,
        targetMetric: options.metric,
        milestones: options.milestones ?? [],
        stakeholders: options.stakeholders,
        sacrifices: options.sacrifices,
    };
    return saveThesis(userId, 'goal', 'personal', thesis, {
        expectedOutcomes: options.metric
            ? [
                `${options.metric.name}: ${options.metric.current} → ${options.metric.target} ${options.metric.unit}`,
            ]
            : [goalName],
        knownChallenges: options.challenges,
        successIndicators: options.metric
            ? [`Reach ${options.metric.target} ${options.metric.unit}`]
            : [],
        exitCriteria: options.targetDate
            ? { conditions: [`Target date passed: ${options.targetDate.toLocaleDateString()}`] }
            : undefined,
        emotionalState: {
            atCreation: 'determined',
            confidenceLevel: options.confidence,
            motivationSource: options.motivationSource,
        },
        reviewSchedule: 'monthly',
        domainData: domainData,
    });
}
/**
 * Save a career thesis.
 */
export async function saveCareerThesis(userId, thesis, options) {
    const domainData = {
        role: options.role,
        company: options.company,
        path: options.path,
        values: options.values,
        tradeoffs: options.tradeoffs,
        growthAreas: options.growthAreas,
        timeframe: options.timeframe,
    };
    return saveThesis(userId, 'career', options.path ?? 'role', thesis, {
        expectedOutcomes: [
            ...options.values.map((v) => `Honor: ${v}`),
            ...options.growthAreas.map((g) => `Grow in: ${g}`),
        ],
        knownChallenges: [...options.challenges, ...options.tradeoffs],
        successIndicators: options.growthAreas.map((g) => `Demonstrable growth in: ${g}`),
        emotionalState: {
            atCreation: 'hopeful',
            confidenceLevel: options.confidence,
            motivationSource: options.motivationSource,
        },
        reviewSchedule: 'quarterly',
        domainData: domainData,
    });
}
/**
 * Save a relationship thesis.
 */
export async function saveRelationshipThesis(userId, personName, thesis, options) {
    const domainData = {
        personName,
        relationshipType: options.relationshipType,
        whatYouLove: options.whatYouLove,
        whatsChallenging: options.whatsChallenging,
        howYouGrow: options.howYouGrow,
        boundariesSet: options.boundaries,
        commitments: options.commitments,
    };
    return saveThesis(userId, 'relationship', options.relationshipType, thesis, {
        expectedOutcomes: [
            ...options.whatYouLove.map((l) => `Appreciate: ${l}`),
            ...options.howYouGrow.map((g) => `Growth through: ${g}`),
        ],
        knownChallenges: options.whatsChallenging,
        successIndicators: ['Feel supported', 'Feel understood', 'Mutual growth'],
        emotionalState: {
            atCreation: 'committed',
            confidenceLevel: options.confidence,
            motivationSource: options.motivationSource,
        },
        reviewSchedule: 'quarterly',
        domainData: domainData,
    });
}
/**
 * Save a health thesis.
 */
export async function saveHealthThesis(userId, thesis, options) {
    const domainData = {
        area: options.area,
        currentState: options.currentState,
        targetState: options.targetState,
        approach: options.approach,
        doctorAdvised: options.doctorAdvised,
        measurables: options.measurables,
    };
    return saveThesis(userId, 'health', options.area, thesis, {
        expectedOutcomes: [`From: ${options.currentState}`, `To: ${options.targetState}`],
        knownChallenges: options.challenges,
        successIndicators: options.measurables
            ? options.measurables.map((m) => `${m.name}: ${m.target} ${m.unit}`)
            : [options.targetState],
        emotionalState: {
            atCreation: 'determined',
            confidenceLevel: options.confidence,
            motivationSource: options.motivationSource,
        },
        reviewSchedule: 'monthly',
        domainData: domainData,
    });
}
/**
 * Save a decision thesis.
 */
export async function saveDecisionThesis(userId, decision, thesis, options) {
    const domainData = {
        decision,
        alternatives: options.alternatives,
        pros: options.pros,
        cons: options.cons,
        dealBreakers: options.dealBreakers,
        stakeholders: options.stakeholders,
        reversible: options.reversible,
        confidenceAtDecision: options.confidence,
    };
    return saveThesis(userId, 'decision', 'major', thesis, {
        expectedOutcomes: options.pros,
        knownChallenges: options.cons,
        exitCriteria: options.dealBreakers.length > 0 ? { conditions: options.dealBreakers } : undefined,
        emotionalState: {
            atCreation: 'committed',
            confidenceLevel: options.confidence,
            motivationSource: options.motivationSource,
        },
        reviewSchedule: 'on_struggle',
        domainData: domainData,
    });
}
/**
 * Save a boundary thesis.
 */
export async function saveBoundaryThesis(userId, thesis, options) {
    const domainData = {
        boundary: options.boundary,
        withWhom: options.withWhom,
        triggerSituation: options.triggerSituation,
        whatYouNeed: options.whatYouNeed,
        whatYouWontAccept: options.whatYouWontAccept,
        consequences: options.consequences,
        howToEnforce: options.howToEnforce,
    };
    return saveThesis(userId, 'boundary', 'personal', thesis, {
        expectedOutcomes: [`Protected: ${options.whatYouNeed}`],
        knownChallenges: options.challenges,
        successIndicators: ['Boundary respected', 'Feel safe'],
        emotionalState: {
            atCreation: 'determined',
            confidenceLevel: options.confidence,
            motivationSource: options.motivationSource,
        },
        reviewSchedule: 'on_struggle',
        domainData: domainData,
    });
}
/**
 * Save a commitment thesis.
 */
export async function saveCommitmentThesis(userId, commitment, thesis, options) {
    const domainData = {
        commitment,
        toWhom: options.toWhom,
        duration: options.duration,
        conditions: options.conditions,
        whatItCosts: options.whatItCosts,
        whatYouGain: options.whatYouGain,
        renewalCriteria: options.renewalCriteria,
    };
    return saveThesis(userId, 'commitment', 'promise', thesis, {
        expectedOutcomes: [options.whatYouGain],
        knownChallenges: [options.whatItCosts, ...options.challenges],
        successIndicators: ['Commitment honored', options.whatYouGain],
        exitCriteria: options.renewalCriteria ? { conditions: [options.renewalCriteria] } : undefined,
        emotionalState: {
            atCreation: 'committed',
            confidenceLevel: options.confidence,
            motivationSource: options.motivationSource,
        },
        reviewSchedule: options.duration ? 'quarterly' : 'on_struggle',
        domainData: domainData,
    });
}
//# sourceMappingURL=thesis-service.js.map