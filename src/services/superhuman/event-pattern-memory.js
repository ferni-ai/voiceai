/**
 * Event Pattern Memory Service
 *
 * "Your wedding planner doesn't remember your sister's graduation party 3 years ago."
 *
 * This service tracks patterns across ALL events over years:
 * - Budget tendencies (overruns, splurge categories, regret categories)
 * - Guest dynamics (chronic decliners, conflict pairs, reliability)
 * - Emotional patterns (pre-event anxiety, post-event letdown)
 * - Vendor preferences (loved vendors, vendors to avoid)
 *
 * Better Than Human: Perfect memory across all life events, forever.
 *
 * @module services/superhuman/event-pattern-memory
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';
const log = createLogger({ module: 'superhuman:event-pattern-memory' });
// ============================================================================
// DEFAULT VALUES
// ============================================================================
const DEFAULT_BUDGET_PATTERN = {
    averageOverrunPercent: 0,
    splurgeCategories: [],
    regretCategories: [],
    disciplinedCategories: [],
    eventsAnalyzed: 0,
};
const DEFAULT_GUEST_DYNAMICS = {
    chronicDecliners: [],
    lastMinuteCancelers: [],
    conflictPairs: [],
    dynamicDuos: [],
    regrettedOmissions: [],
    reliableStars: [],
};
const DEFAULT_EMOTIONAL_PATTERN = {
    twoWeeksOutAnxiety: false,
    postEventLetdown: false,
    energizingTasks: [],
    drainingTasks: [],
    stressPeakDaysBefore: 7,
    effectiveCopingStrategies: [],
};
// ============================================================================
// STORAGE
// ============================================================================
const COLLECTION = 'event_pattern_memory';
async function loadEventPatternProfile(userId) {
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
        log.debug({ error, userId }, 'Failed to load event pattern profile');
        return null;
    }
}
async function saveEventPatternProfile(userId, profile) {
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
        log.debug({ userId }, 'Saved event pattern profile');
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to save event pattern profile');
    }
}
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Record an event outcome for pattern learning
 */
export async function recordEventOutcome(userId, outcome) {
    const profile = (await loadEventPatternProfile(userId)) || createDefaultProfile(userId);
    // Add to event history
    profile.eventHistory.push(outcome);
    // Recompute patterns from all history
    profile.budgetPatterns = computeBudgetPatterns(profile.eventHistory);
    profile.guestDynamics = computeGuestDynamics(profile.eventHistory);
    // Update vendor preferences
    for (const vendor of outcome.vendors) {
        updateVendorPreference(profile, vendor);
    }
    // Update emotional patterns if timeline provided
    if (outcome.emotionalTimeline) {
        updateEmotionalPatterns(profile, outcome.emotionalTimeline);
    }
    await saveEventPatternProfile(userId, profile);
    log.info({ userId, eventId: outcome.eventId }, 'Recorded event outcome for pattern learning');
}
/**
 * Record a guest conflict observation
 */
export async function recordGuestConflict(userId, person1, person2, reason) {
    const profile = (await loadEventPatternProfile(userId)) || createDefaultProfile(userId);
    // Check if conflict already exists
    const existing = profile.guestDynamics.conflictPairs.find((c) => (c.person1 === person1 && c.person2 === person2) ||
        (c.person1 === person2 && c.person2 === person1));
    if (!existing) {
        profile.guestDynamics.conflictPairs.push({ person1, person2, reason });
        await saveEventPatternProfile(userId, profile);
        log.info({ userId, person1, person2 }, 'Recorded guest conflict');
    }
}
/**
 * Record a regretted omission (didn't invite someone, regretted it)
 */
export async function recordRegrettedOmission(userId, name, event, reason) {
    const profile = (await loadEventPatternProfile(userId)) || createDefaultProfile(userId);
    profile.guestDynamics.regrettedOmissions.push({ name, event, reason });
    await saveEventPatternProfile(userId, profile);
    log.info({ userId, name, event }, 'Recorded regretted guest omission');
}
/**
 * Record a vendor experience
 */
export async function recordVendorExperience(userId, vendor) {
    const profile = (await loadEventPatternProfile(userId)) || createDefaultProfile(userId);
    updateVendorPreference(profile, vendor);
    await saveEventPatternProfile(userId, profile);
    log.info({ userId, vendor: vendor.name, sentiment: vendor.sentiment }, 'Recorded vendor experience');
}
/**
 * Get event pattern insights for planning a new event
 */
export async function getEventPatternInsights(userId, eventType) {
    const profile = await loadEventPatternProfile(userId);
    if (!profile || profile.eventHistory.length === 0) {
        return {
            budgetWarnings: [],
            guestRecommendations: [],
            emotionalPrepTips: [],
            vendorRecommendations: [],
        };
    }
    const insights = {
        budgetWarnings: [],
        guestRecommendations: [],
        emotionalPrepTips: [],
        vendorRecommendations: [],
    };
    // Budget warnings
    const bp = profile.budgetPatterns;
    if (bp.averageOverrunPercent > 10) {
        insights.budgetWarnings.push(`Based on ${bp.eventsAnalyzed} past events, you typically go ${bp.averageOverrunPercent.toFixed(0)}% over budget. Consider building in a buffer.`);
    }
    if (bp.splurgeCategories.length > 0) {
        insights.budgetWarnings.push(`You tend to splurge on ${bp.splurgeCategories.join(', ')} - budget extra here if it matters to you.`);
    }
    if (bp.regretCategories.length > 0) {
        insights.budgetWarnings.push(`You've regretted skimping on ${bp.regretCategories.join(', ')} before - worth investing more here.`);
    }
    // Guest recommendations
    const gd = profile.guestDynamics;
    if (gd.chronicDecliners.length > 0) {
        const names = gd.chronicDecliners.slice(0, 3).map((d) => d.name);
        insights.guestRecommendations.push(`Heads up: ${names.join(', ')} rarely attend events. Invite them if you want to, but don't count on them.`);
    }
    if (gd.lastMinuteCancelers.length > 0) {
        const names = gd.lastMinuteCancelers.slice(0, 3).map((c) => c.name);
        insights.guestRecommendations.push(`${names.join(', ')} tend to cancel last-minute. Maybe have backup guests for head counts.`);
    }
    if (gd.conflictPairs.length > 0) {
        for (const conflict of gd.conflictPairs.slice(0, 3)) {
            insights.guestRecommendations.push(`Keep ${conflict.person1} and ${conflict.person2} apart (${conflict.reason}).`);
        }
    }
    if (gd.regrettedOmissions.length > 0) {
        const recentOmission = gd.regrettedOmissions[gd.regrettedOmissions.length - 1];
        insights.guestRecommendations.push(`Remember: you regretted not inviting ${recentOmission.name} to ${recentOmission.event}.`);
    }
    if (gd.reliableStars.length > 0) {
        const stars = gd.reliableStars.slice(0, 3);
        insights.guestRecommendations.push(`Your MVPs: ${stars.map((s) => `${s.name} (${s.strength})`).join(', ')}`);
    }
    // Emotional prep tips
    const ep = profile.emotionalPatterns;
    if (ep.twoWeeksOutAnxiety) {
        insights.emotionalPrepTips.push(`You typically get anxious about 2 weeks before events. This is normal for you - plan some self-care then.`);
    }
    if (ep.postEventLetdown) {
        insights.emotionalPrepTips.push(`You often feel a bit down after big events. Maybe schedule something gentle for the day after?`);
    }
    if (ep.energizingTasks.length > 0) {
        insights.emotionalPrepTips.push(`Tasks that energize you: ${ep.energizingTasks.join(', ')}. Start with these when you need momentum.`);
    }
    if (ep.drainingTasks.length > 0) {
        insights.emotionalPrepTips.push(`Tasks that drain you: ${ep.drainingTasks.join(', ')}. Consider delegating or scheduling when you're fresh.`);
    }
    // Vendor recommendations
    const lovedVendors = profile.vendorPreferences.filter((v) => v.sentiment === 'loved');
    const avoidVendors = profile.vendorPreferences.filter((v) => v.sentiment === 'avoid');
    if (lovedVendors.length > 0) {
        for (const vendor of lovedVendors.slice(0, 3)) {
            insights.vendorRecommendations.push(`Loved: ${vendor.name} (${vendor.category}) - ${vendor.reason}`);
        }
    }
    if (avoidVendors.length > 0) {
        for (const vendor of avoidVendors.slice(0, 3)) {
            insights.vendorRecommendations.push(`Avoid: ${vendor.name} (${vendor.category}) - ${vendor.reason}`);
        }
    }
    return insights;
}
/**
 * Build context string for LLM injection
 */
export async function buildEventPatternContext(userId) {
    const insights = await getEventPatternInsights(userId);
    const allInsights = [
        ...insights.budgetWarnings,
        ...insights.guestRecommendations,
        ...insights.emotionalPrepTips,
        ...insights.vendorRecommendations,
    ];
    if (allInsights.length === 0) {
        return '';
    }
    const lines = ['[EVENT PATTERN MEMORY - Better Than Human]'];
    lines.push('You remember patterns from ALL their past events:\n');
    if (insights.budgetWarnings.length > 0) {
        lines.push('💰 BUDGET PATTERNS:');
        insights.budgetWarnings.forEach((w) => lines.push(`  • ${w}`));
    }
    if (insights.guestRecommendations.length > 0) {
        lines.push('\n👥 GUEST DYNAMICS:');
        insights.guestRecommendations.forEach((r) => lines.push(`  • ${r}`));
    }
    if (insights.emotionalPrepTips.length > 0) {
        lines.push('\n💭 EMOTIONAL PATTERNS:');
        insights.emotionalPrepTips.forEach((t) => lines.push(`  • ${t}`));
    }
    if (insights.vendorRecommendations.length > 0) {
        lines.push('\n🏪 VENDOR MEMORY:');
        insights.vendorRecommendations.forEach((r) => lines.push(`  • ${r}`));
    }
    return lines.join('\n');
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function createDefaultProfile(userId) {
    return {
        userId,
        budgetPatterns: { ...DEFAULT_BUDGET_PATTERN },
        guestDynamics: { ...DEFAULT_GUEST_DYNAMICS },
        emotionalPatterns: { ...DEFAULT_EMOTIONAL_PATTERN },
        vendorPreferences: [],
        eventHistory: [],
        lastUpdated: new Date().toISOString(),
    };
}
function computeBudgetPatterns(events) {
    if (events.length === 0)
        return DEFAULT_BUDGET_PATTERN;
    const overruns = [];
    const categorySplurges = {};
    const categoryRegrets = {};
    for (const event of events) {
        // Calculate overrun percentage
        if (event.budget > 0) {
            const overrunPercent = ((event.actualSpent - event.budget) / event.budget) * 100;
            overruns.push(overrunPercent);
        }
        // Track category patterns
        for (const [category, spending] of Object.entries(event.categorySpending || {})) {
            const overPercent = spending.budgeted > 0
                ? ((spending.actual - spending.budgeted) / spending.budgeted) * 100
                : 0;
            if (overPercent > 20) {
                categorySplurges[category] = (categorySplurges[category] || 0) + 1;
            }
        }
        // Track regrets from reflections
        if (event.reflections?.whatWouldChange) {
            for (const change of event.reflections.whatWouldChange) {
                const match = change.match(/spend more on (\w+)/i);
                if (match) {
                    categoryRegrets[match[1].toLowerCase()] = (categoryRegrets[match[1].toLowerCase()] || 0) + 1;
                }
            }
        }
    }
    const avgOverrun = overruns.length > 0
        ? overruns.reduce((a, b) => a + b, 0) / overruns.length
        : 0;
    // Categories that appear in >30% of events
    const threshold = events.length * 0.3;
    const splurgeCategories = Object.entries(categorySplurges)
        .filter(([, count]) => count >= Math.max(1, threshold))
        .map(([cat]) => cat);
    const regretCategories = Object.entries(categoryRegrets)
        .filter(([, count]) => count >= Math.max(1, threshold))
        .map(([cat]) => cat);
    return {
        averageOverrunPercent: avgOverrun,
        splurgeCategories,
        regretCategories,
        disciplinedCategories: [], // TODO: compute from on-budget categories
        eventsAnalyzed: events.length,
    };
}
function computeGuestDynamics(events) {
    const dynamics = {
        chronicDecliners: [],
        lastMinuteCancelers: [],
        conflictPairs: [],
        dynamicDuos: [],
        regrettedOmissions: [],
        reliableStars: [],
    };
    if (events.length === 0)
        return dynamics;
    // Track guest attendance across all events
    const guestStats = {};
    for (const event of events) {
        for (const guest of event.guestOutcomes || []) {
            if (!guestStats[guest.name]) {
                guestStats[guest.name] = { invited: 0, attended: 0, canceled: 0 };
            }
            guestStats[guest.name].invited++;
            if (guest.attended)
                guestStats[guest.name].attended++;
            if (guest.canceledLastMinute)
                guestStats[guest.name].canceled++;
        }
    }
    // Compute decline and cancel rates
    for (const [name, stats] of Object.entries(guestStats)) {
        if (stats.invited >= 2) {
            const declineRate = 1 - stats.attended / stats.invited;
            const cancelRate = stats.canceled / stats.invited;
            if (declineRate > 0.6) {
                dynamics.chronicDecliners.push({ name, declineRate });
            }
            if (cancelRate > 0.3) {
                dynamics.lastMinuteCancelers.push({ name, cancelRate });
            }
            if (stats.attended / stats.invited > 0.9) {
                dynamics.reliableStars.push({ name, strength: 'always shows up' });
            }
        }
    }
    // Sort by rate
    dynamics.chronicDecliners.sort((a, b) => b.declineRate - a.declineRate);
    dynamics.lastMinuteCancelers.sort((a, b) => b.cancelRate - a.cancelRate);
    return dynamics;
}
function updateVendorPreference(profile, vendor) {
    const existing = profile.vendorPreferences.findIndex((v) => v.name.toLowerCase() === vendor.name.toLowerCase());
    if (existing >= 0) {
        // Update existing preference (most recent wins)
        profile.vendorPreferences[existing] = vendor;
    }
    else {
        profile.vendorPreferences.push(vendor);
    }
}
function updateEmotionalPatterns(profile, timeline) {
    // Check for 2-weeks-out anxiety
    const twoWeeksAnxiety = timeline.some((e) => e.daysBefore >= 10 && e.daysBefore <= 18 &&
        ['anxious', 'stressed', 'worried', 'overwhelmed'].includes(e.emotion.toLowerCase()));
    if (twoWeeksAnxiety) {
        profile.emotionalPatterns.twoWeeksOutAnxiety = true;
    }
    // Find stress peak
    const stressEntries = timeline.filter((e) => ['stressed', 'anxious', 'overwhelmed'].includes(e.emotion.toLowerCase()));
    if (stressEntries.length > 0) {
        const avgStressDays = stressEntries.reduce((a, b) => a + b.daysBefore, 0) / stressEntries.length;
        profile.emotionalPatterns.stressPeakDaysBefore = Math.round(avgStressDays);
    }
}
// ============================================================================
// SERVICE EXPORT
// ============================================================================
export const eventPatternMemory = {
    recordEventOutcome,
    recordGuestConflict,
    recordRegrettedOmission,
    recordVendorExperience,
    getEventPatternInsights,
    buildEventPatternContext,
    loadEventPatternProfile,
};
export default eventPatternMemory;
//# sourceMappingURL=event-pattern-memory.js.map