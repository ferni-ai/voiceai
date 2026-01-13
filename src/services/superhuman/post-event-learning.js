/**
 * Post-Event Learning Service
 *
 * "No one follows up to learn what you'd do differently."
 *
 * This service captures learnings after events and applies them to future planning:
 * - Automated follow-up prompts at the right times
 * - Learning capture (what worked, what to change)
 * - Application of learnings to similar future events
 * - Wisdom accumulation over time
 *
 * Better Than Human: We follow up at the perfect times and remember
 * every lesson learned to apply to future events.
 *
 * @module services/superhuman/post-event-learning
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';
const log = createLogger({ module: 'superhuman:post-event-learning' });
// ============================================================================
// FOLLOW-UP SCHEDULE
// ============================================================================
const FOLLOW_UP_SCHEDULE = [
    {
        stage: 'immediate',
        daysAfterEvent: 1,
        questions: [
            "How did it go overall?",
            "What was the highlight?",
            "Any immediate regrets or things you'd change?",
            "Who made the event special?",
        ],
    },
    {
        stage: 'one_week',
        daysAfterEvent: 7,
        questions: [
            "Now that the dust has settled, how do you feel about the event?",
            "What feedback have you gotten from guests?",
            "Looking at the final numbers, any budget surprises?",
            "If you could go back, what one thing would you change?",
        ],
    },
    {
        stage: 'one_month',
        daysAfterEvent: 30,
        questions: [
            "Looking back with fresh eyes, what stands out?",
            "What would you tell someone planning a similar event?",
            "Any traditions you want to continue from this?",
            "What's your key takeaway?",
        ],
    },
];
// ============================================================================
// STORAGE
// ============================================================================
const COLLECTION = 'post_event_learning';
async function loadLearningProfile(userId) {
    const db = getFirestoreDb();
    if (!db)
        return null;
    try {
        const doc = await db.collection('bogle_users').doc(userId).collection(COLLECTION).doc('profile').get();
        if (doc.exists) {
            return doc.data();
        }
        return null;
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to load post-event learning profile');
        return null;
    }
}
async function saveLearningProfile(userId, profile) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection(COLLECTION)
            .doc('profile')
            .set({
            ...profile,
            lastUpdated: new Date().toISOString(),
        });
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to save post-event learning profile');
    }
}
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Schedule follow-ups for a completed event
 */
export async function scheduleEventFollowUps(userId, eventId, eventName, eventDate, eventType) {
    const profile = (await loadLearningProfile(userId)) || createDefaultProfile(userId);
    // Check if already scheduled
    if (profile.pendingFollowUps.some((f) => f.eventId === eventId)) {
        return;
    }
    const eventDateObj = new Date(eventDate);
    const firstFollowUp = new Date(eventDateObj.getTime() + 24 * 60 * 60 * 1000);
    profile.pendingFollowUps.push({
        eventId,
        eventName,
        eventDate,
        eventType,
        nextFollowUp: {
            stage: 'immediate',
            dueDate: firstFollowUp.toISOString(),
        },
    });
    await saveLearningProfile(userId, profile);
    log.info({ userId, eventId, eventName }, 'Scheduled event follow-ups');
}
/**
 * Get follow-ups that are due
 */
export async function getDueFollowUps(userId) {
    const profile = await loadLearningProfile(userId);
    if (!profile)
        return [];
    const now = new Date();
    const dueFollowUps = [];
    for (const pending of profile.pendingFollowUps) {
        const dueDate = new Date(pending.nextFollowUp.dueDate);
        if (dueDate <= now) {
            const prompts = FOLLOW_UP_SCHEDULE.find((f) => f.stage === pending.nextFollowUp.stage);
            dueFollowUps.push({
                eventId: pending.eventId,
                eventName: pending.eventName,
                eventDate: pending.eventDate,
                eventType: pending.eventType,
                stage: pending.nextFollowUp.stage,
                questions: prompts?.questions || [],
            });
        }
    }
    return dueFollowUps;
}
/**
 * Record learning from a follow-up conversation
 */
export async function recordLearning(userId, eventId, stage, learning) {
    const profile = (await loadLearningProfile(userId)) || createDefaultProfile(userId);
    // Find or create learning record
    let existingIdx = profile.learnings.findIndex((l) => l.id === eventId);
    if (existingIdx < 0) {
        // Get event info from pending
        const pending = profile.pendingFollowUps.find((p) => p.eventId === eventId);
        const newLearning = {
            id: eventId,
            eventName: learning.eventName || pending?.eventName || 'Unknown Event',
            eventType: learning.eventType || pending?.eventType || 'other',
            eventDate: learning.eventDate || pending?.eventDate || new Date().toISOString(),
            whatWorked: [],
            whatToChange: [],
            unexpectedChallenges: [],
            budgetLearnings: {
                plannedTotal: 0,
                actualTotal: 0,
                surpriseCosts: [],
                worthTheSplurge: [],
                notWorthIt: [],
            },
            timingLearnings: {
                leadTimeUsed: '',
                leadTimeNeeded: '',
                bestDecisions: [],
                lastMinuteStress: [],
            },
            guestLearnings: {
                perfectGuestCount: null,
                whoMadeItSpecial: [],
                wishHadInvited: [],
                wouldNotInviteAgain: [],
            },
            vendorLearnings: [],
            overallSatisfaction: 7,
            keyTakeaway: '',
            capturedAt: new Date().toISOString(),
            followUpStages: [],
        };
        profile.learnings.push(newLearning);
        existingIdx = profile.learnings.length - 1;
    }
    const existing = profile.learnings[existingIdx];
    // Merge learning data
    if (learning.whatWorked) {
        existing.whatWorked = [...existing.whatWorked, ...learning.whatWorked];
    }
    if (learning.whatToChange) {
        existing.whatToChange = [...existing.whatToChange, ...learning.whatToChange];
    }
    if (learning.unexpectedChallenges) {
        existing.unexpectedChallenges = [...existing.unexpectedChallenges, ...learning.unexpectedChallenges];
    }
    if (learning.budgetLearnings) {
        existing.budgetLearnings = { ...existing.budgetLearnings, ...learning.budgetLearnings };
    }
    if (learning.timingLearnings) {
        existing.timingLearnings = { ...existing.timingLearnings, ...learning.timingLearnings };
    }
    if (learning.guestLearnings) {
        existing.guestLearnings = { ...existing.guestLearnings, ...learning.guestLearnings };
    }
    if (learning.vendorLearnings) {
        existing.vendorLearnings = [...existing.vendorLearnings, ...learning.vendorLearnings];
    }
    if (learning.overallSatisfaction !== undefined) {
        existing.overallSatisfaction = learning.overallSatisfaction;
    }
    if (learning.keyTakeaway) {
        existing.keyTakeaway = learning.keyTakeaway;
    }
    // Mark stage complete
    existing.followUpStages.push({
        stage,
        completedAt: new Date().toISOString(),
    });
    // Update pending follow-up
    const pendingIdx = profile.pendingFollowUps.findIndex((p) => p.eventId === eventId);
    if (pendingIdx >= 0) {
        const nextStage = getNextStage(stage);
        if (nextStage) {
            const daysAfter = FOLLOW_UP_SCHEDULE.find((f) => f.stage === nextStage)?.daysAfterEvent || 7;
            const eventDateObj = new Date(profile.pendingFollowUps[pendingIdx].eventDate);
            const nextDue = new Date(eventDateObj.getTime() + daysAfter * 24 * 60 * 60 * 1000);
            profile.pendingFollowUps[pendingIdx].nextFollowUp = {
                stage: nextStage,
                dueDate: nextDue.toISOString(),
            };
        }
        else {
            // All follow-ups complete
            profile.pendingFollowUps.splice(pendingIdx, 1);
        }
    }
    // Distill wisdom from this learning
    await distillWisdom(profile, existing);
    await saveLearningProfile(userId, profile);
    log.info({ userId, eventId, stage }, 'Recorded event learning');
}
/**
 * Get learnings applicable to a new event
 */
export async function getApplicableLearnings(userId, eventType) {
    const profile = await loadLearningProfile(userId);
    if (!profile)
        return [];
    const applicable = [];
    // Get wisdom for this event type
    const relevantWisdom = profile.accumulatedWisdom.filter((w) => w.eventType === eventType || w.eventType === 'all');
    for (const wisdom of relevantWisdom) {
        applicable.push({
            sourceEvent: `${wisdom.sourceCount} past events`,
            learning: wisdom.wisdom,
            application: `Apply to ${wisdom.category}`,
            category: wisdom.category,
        });
    }
    // Also get specific learnings from similar events
    const similarEvents = profile.learnings.filter((l) => l.eventType === eventType && l.overallSatisfaction >= 7);
    for (const event of similarEvents.slice(0, 3)) {
        // Get top "what worked" items
        for (const worked of event.whatWorked.filter((w) => w.importance === 'major').slice(0, 2)) {
            applicable.push({
                sourceEvent: event.eventName,
                learning: worked.item,
                application: `Worked well for ${worked.category}`,
                category: worked.category,
            });
        }
        // Get top "what to change" items as warnings
        for (const change of event.whatToChange.filter((c) => c.importance === 'major').slice(0, 2)) {
            applicable.push({
                sourceEvent: event.eventName,
                learning: change.recommendation,
                application: `Avoid: ${change.item}`,
                category: change.category,
            });
        }
    }
    return applicable;
}
/**
 * Get a summary of all learnings for an event type
 */
export async function getLearningSummary(userId, eventType) {
    const profile = await loadLearningProfile(userId);
    if (!profile) {
        return {
            totalEventsOfType: 0,
            avgSatisfaction: 0,
            topLearnings: [],
            commonMistakes: [],
            budgetTrends: 'No data yet',
        };
    }
    const relevantLearnings = profile.learnings.filter((l) => l.eventType === eventType);
    if (relevantLearnings.length === 0) {
        return {
            totalEventsOfType: 0,
            avgSatisfaction: 0,
            topLearnings: [],
            commonMistakes: [],
            budgetTrends: 'No data yet',
        };
    }
    const avgSatisfaction = relevantLearnings.reduce((sum, l) => sum + l.overallSatisfaction, 0) / relevantLearnings.length;
    // Aggregate what worked
    const workedCounts = {};
    for (const learning of relevantLearnings) {
        for (const worked of learning.whatWorked) {
            workedCounts[worked.item] = (workedCounts[worked.item] || 0) + 1;
        }
    }
    const topLearnings = Object.entries(workedCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([item]) => item);
    // Aggregate what to change
    const changeCounts = {};
    for (const learning of relevantLearnings) {
        for (const change of learning.whatToChange) {
            changeCounts[change.recommendation] = (changeCounts[change.recommendation] || 0) + 1;
        }
    }
    const commonMistakes = Object.entries(changeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([item]) => item);
    // Budget trends
    const budgetData = relevantLearnings
        .filter((l) => l.budgetLearnings.plannedTotal > 0 && l.budgetLearnings.actualTotal > 0);
    let budgetTrends = 'No budget data yet';
    if (budgetData.length > 0) {
        const avgOverrun = budgetData.reduce((sum, l) => {
            return sum + ((l.budgetLearnings.actualTotal - l.budgetLearnings.plannedTotal) / l.budgetLearnings.plannedTotal);
        }, 0) / budgetData.length;
        budgetTrends = avgOverrun > 0.1
            ? `You typically go ${Math.round(avgOverrun * 100)}% over budget`
            : avgOverrun < -0.1
                ? `You typically come in ${Math.round(Math.abs(avgOverrun) * 100)}% under budget`
                : 'You typically stay close to budget';
    }
    return {
        totalEventsOfType: relevantLearnings.length,
        avgSatisfaction: Math.round(avgSatisfaction * 10) / 10,
        topLearnings,
        commonMistakes,
        budgetTrends,
    };
}
/**
 * Build context string for LLM injection
 */
export async function buildPostEventLearningContext(userId, eventType) {
    const lines = [];
    // Check for due follow-ups
    const dueFollowUps = await getDueFollowUps(userId);
    if (dueFollowUps.length > 0) {
        lines.push('[POST-EVENT FOLLOW-UP DUE - Better Than Human]');
        lines.push('You remember to follow up when humans forget:\n');
        for (const followUp of dueFollowUps.slice(0, 2)) {
            lines.push(`📝 "${followUp.eventName}" - ${followUp.stage} follow-up`);
            lines.push(`   Questions to explore:`);
            for (const q of followUp.questions.slice(0, 2)) {
                lines.push(`   • ${q}`);
            }
        }
        lines.push('');
    }
    // Get applicable learnings if planning a new event
    if (eventType) {
        const learnings = await getApplicableLearnings(userId, eventType);
        const summary = await getLearningSummary(userId, eventType);
        if (learnings.length > 0 || summary.totalEventsOfType > 0) {
            lines.push('[EVENT WISDOM - Better Than Human]');
            lines.push(`From ${summary.totalEventsOfType} past ${eventType} events:\n`);
            if (summary.avgSatisfaction > 0) {
                lines.push(`📊 Avg satisfaction: ${summary.avgSatisfaction}/10`);
            }
            if (summary.budgetTrends !== 'No data yet') {
                lines.push(`💰 ${summary.budgetTrends}`);
            }
            if (summary.topLearnings.length > 0) {
                lines.push(`\n✅ What works:`);
                for (const learning of summary.topLearnings.slice(0, 3)) {
                    lines.push(`   • ${learning}`);
                }
            }
            if (summary.commonMistakes.length > 0) {
                lines.push(`\n⚠️ Watch out for:`);
                for (const mistake of summary.commonMistakes.slice(0, 3)) {
                    lines.push(`   • ${mistake}`);
                }
            }
        }
    }
    return lines.join('\n');
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function createDefaultProfile(userId) {
    return {
        userId,
        learnings: [],
        pendingFollowUps: [],
        accumulatedWisdom: [],
        lastUpdated: new Date().toISOString(),
    };
}
function getNextStage(current) {
    switch (current) {
        case 'immediate': return 'one_week';
        case 'one_week': return 'one_month';
        case 'one_month': return null;
    }
}
async function distillWisdom(profile, learning) {
    // Distill patterns from learnings into accumulated wisdom
    // Add "what worked" items with high importance to wisdom
    for (const worked of learning.whatWorked.filter((w) => w.importance === 'major')) {
        const existingWisdom = profile.accumulatedWisdom.find((w) => w.category === worked.category && w.eventType === learning.eventType);
        if (existingWisdom) {
            existingWisdom.sourceCount++;
        }
        else {
            profile.accumulatedWisdom.push({
                category: worked.category,
                eventType: learning.eventType,
                wisdom: worked.item,
                sourceCount: 1,
            });
        }
    }
    // Add key takeaway if present
    if (learning.keyTakeaway) {
        profile.accumulatedWisdom.push({
            category: 'general',
            eventType: learning.eventType,
            wisdom: learning.keyTakeaway,
            sourceCount: 1,
        });
    }
    // Limit accumulated wisdom to prevent unbounded growth
    profile.accumulatedWisdom = profile.accumulatedWisdom
        .sort((a, b) => b.sourceCount - a.sourceCount)
        .slice(0, 50);
}
// ============================================================================
// SERVICE EXPORT
// ============================================================================
export const postEventLearning = {
    scheduleEventFollowUps,
    getDueFollowUps,
    recordLearning,
    getApplicableLearnings,
    getLearningSummary,
    buildPostEventLearningContext,
    loadLearningProfile,
};
export default postEventLearning;
//# sourceMappingURL=post-event-learning.js.map