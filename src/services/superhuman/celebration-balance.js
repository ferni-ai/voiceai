/**
 * Celebration Balance Tracker
 *
 * "Are you celebrating enough? Too much? Humans can't track this objectively."
 *
 * This service tracks the balance of celebration in a user's life:
 * - Celebration density (too sparse? too dense?)
 * - Celebration focus (always for others, never for self?)
 * - Celebration fatigue signals
 * - Joy gaps (too long since last celebration)
 *
 * Better Than Human: We objectively track celebration patterns and notice
 * when someone needs more joy or more rest.
 *
 * @module services/superhuman/celebration-balance
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';
const log = createLogger({ module: 'superhuman:celebration-balance' });
// ============================================================================
// CONSTANTS
// ============================================================================
const SIZE_ENERGY_MAP = {
    micro: 1,
    small: 2,
    medium: 4,
    large: 6,
    major: 9,
};
const IDEAL_CELEBRATIONS_PER_MONTH = 2.5; // Research-backed sweet spot
const CELEBRATION_DROUGHT_DAYS = 45; // Warning if no celebration in 45 days
const CELEBRATION_FATIGUE_THRESHOLD = 4; // Warning if 4+ celebrations in 30 days
// ============================================================================
// STORAGE
// ============================================================================
const COLLECTION = 'celebration_balance';
async function loadCelebrationProfile(userId) {
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
        log.debug({ error, userId }, 'Failed to load celebration balance profile');
        return null;
    }
}
async function saveCelebrationProfile(userId, profile) {
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
        log.debug({ userId }, 'Saved celebration balance profile');
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to save celebration balance profile');
    }
}
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Record a celebration
 */
export async function recordCelebration(userId, description, type, size, honoree, options) {
    const profile = (await loadCelebrationProfile(userId)) || createDefaultProfile(userId);
    const id = `cel_${Date.now()}`;
    const date = options?.date || new Date().toISOString().split('T')[0];
    // Default energy cost based on size
    const energyCost = options?.energyCost ?? SIZE_ENERGY_MAP[size];
    // Default joy to match energy (balanced)
    const joyReceived = options?.joyReceived ?? energyCost;
    const celebration = {
        id,
        description,
        type,
        size,
        honoree,
        date,
        energyCost,
        joyReceived,
        notes: options?.notes,
        recordedAt: new Date().toISOString(),
    };
    profile.celebrations.push(celebration);
    // Update patterns based on this celebration
    updatePatterns(profile, celebration);
    await saveCelebrationProfile(userId, profile);
    log.info({ userId, type, size, honoree }, 'Recorded celebration');
    return celebration;
}
/**
 * Get celebration balance assessment
 */
export async function getCelebrationBalance(userId) {
    const profile = await loadCelebrationProfile(userId);
    if (!profile || profile.celebrations.length === 0) {
        return {
            recentCelebrations: 0,
            daysSinceLastCelebration: 999,
            avgCelebrationsPerMonth: 0,
            selfVsOthersRatio: 0.5,
            largeVsSmallRatio: 0,
            energyBalance: 1,
            state: 'celebration_drought',
            recommendations: [
                "You haven't recorded any celebrations yet. Every win, big or small, deserves acknowledgment!",
                "What's something worth celebrating this week?",
            ],
        };
    }
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    // Recent celebrations (last 30 days)
    const recentCelebrations = profile.celebrations.filter((c) => new Date(c.date) >= thirtyDaysAgo);
    // Last celebration
    const sortedByDate = [...profile.celebrations].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const lastCelebration = sortedByDate[0];
    const daysSinceLastCelebration = Math.floor((now.getTime() - new Date(lastCelebration.date).getTime()) / (1000 * 60 * 60 * 24));
    // Calculate average per month (using last 6 months of data)
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const lastSixMonthsCelebrations = profile.celebrations.filter((c) => new Date(c.date) >= sixMonthsAgo);
    const monthsOfData = Math.min(6, profile.celebrations.length > 0 ?
        Math.ceil((now.getTime() - new Date(sortedByDate[sortedByDate.length - 1].date).getTime()) / (30 * 24 * 60 * 60 * 1000)) : 1);
    const avgCelebrationsPerMonth = lastSixMonthsCelebrations.length / Math.max(1, monthsOfData);
    // Self vs others ratio
    const selfCelebrations = profile.celebrations.filter((c) => c.honoree === 'self' || c.honoree === 'both').length;
    const selfVsOthersRatio = profile.celebrations.length > 0
        ? selfCelebrations / profile.celebrations.length
        : 0.5;
    // Large vs small ratio
    const largeCelebrations = profile.celebrations.filter((c) => ['large', 'major'].includes(c.size)).length;
    const largeVsSmallRatio = profile.celebrations.length > 0
        ? largeCelebrations / profile.celebrations.length
        : 0;
    // Energy balance (joy received / energy cost)
    const totalJoy = profile.celebrations.reduce((sum, c) => sum + c.joyReceived, 0);
    const totalEnergy = profile.celebrations.reduce((sum, c) => sum + c.energyCost, 0);
    const energyBalance = totalEnergy > 0 ? totalJoy / totalEnergy : 1;
    // Determine state
    let state = 'balanced';
    const recommendations = [];
    if (daysSinceLastCelebration >= CELEBRATION_DROUGHT_DAYS) {
        state = 'celebration_drought';
        recommendations.push(`It's been ${daysSinceLastCelebration} days since your last celebration. Life has good moments worth marking!`);
        recommendations.push("Even small wins count - finishing a project, a good conversation, making progress on a goal.");
    }
    else if (recentCelebrations.length >= CELEBRATION_FATIGUE_THRESHOLD) {
        state = 'celebration_fatigue';
        recommendations.push(`You've had ${recentCelebrations.length} celebrations in the last 30 days. That's wonderful, but also tiring!`);
        recommendations.push("Consider some quieter, lower-energy ways to mark moments for a bit.");
    }
    else if (selfVsOthersRatio < 0.25) {
        state = 'others_focused';
        recommendations.push("You celebrate others beautifully, but you deserve celebration too!");
        recommendations.push("What personal win have you not acknowledged lately?");
    }
    else if (selfVsOthersRatio > 0.85) {
        state = 'self_focused';
        recommendations.push("Your self-celebration is strong! Consider: is there someone else's win you could celebrate?");
    }
    // Additional recommendations based on patterns
    if (energyBalance < 0.7) {
        recommendations.push("Your celebrations have been costing more energy than joy they bring. Try some lower-key celebrations.");
    }
    if (avgCelebrationsPerMonth < 1) {
        recommendations.push("Research shows celebrating small wins regularly boosts wellbeing. Aim for 2-3 moments of celebration per month.");
    }
    return {
        recentCelebrations: recentCelebrations.length,
        daysSinceLastCelebration,
        avgCelebrationsPerMonth,
        selfVsOthersRatio,
        largeVsSmallRatio,
        energyBalance,
        state,
        recommendations,
    };
}
/**
 * Get celebration suggestions based on current balance
 */
export async function getCelebrationSuggestions(userId) {
    const balance = await getCelebrationBalance(userId);
    const result = {
        needsJoy: balance.state === 'celebration_drought',
        needsRest: balance.state === 'celebration_fatigue',
        suggestions: [],
    };
    if (balance.state === 'celebration_drought') {
        result.suggestions = [
            "Plan a small celebration this week - even just a nice dinner for yourself",
            "Write down 3 things worth celebrating from the past month",
            "Schedule a call with someone to share good news",
            "Buy yourself something small as a treat",
        ];
    }
    else if (balance.state === 'celebration_fatigue') {
        result.suggestions = [
            "This week, try internal celebration - just pause and feel good about something",
            "Skip the next event invitation if you need to - rest is important",
            "Journal about recent wins instead of planning another party",
            "Celebrate with solitude - a walk, a bath, quiet appreciation",
        ];
    }
    else if (balance.state === 'others_focused') {
        result.suggestions = [
            "What have YOU accomplished lately that deserves acknowledgment?",
            "Schedule a self-date to celebrate your own wins",
            "Tell someone about something you're proud of",
            "Treat yourself to something you've been putting off",
        ];
    }
    else {
        result.suggestions = [
            "Your celebration balance is healthy!",
            "Keep acknowledging both big and small wins",
            "Mix personal celebrations with celebrating others",
        ];
    }
    return result;
}
/**
 * Check if user needs celebration prompting
 */
export async function shouldPromptForCelebration(userId) {
    const balance = await getCelebrationBalance(userId);
    if (balance.state === 'celebration_drought') {
        return {
            shouldPrompt: true,
            reason: `It's been ${balance.daysSinceLastCelebration} days since you celebrated something`,
            suggestion: "What's one thing - big or small - worth celebrating this week?",
        };
    }
    if (balance.state === 'others_focused' && balance.recentCelebrations >= 2) {
        return {
            shouldPrompt: true,
            reason: "You've been celebrating others, which is wonderful! But you deserve celebration too",
            suggestion: "What's a personal win you haven't acknowledged?",
        };
    }
    return { shouldPrompt: false };
}
/**
 * Build context string for LLM injection
 */
export async function buildCelebrationBalanceContext(userId) {
    const balance = await getCelebrationBalance(userId);
    const prompt = await shouldPromptForCelebration(userId);
    if (!prompt.shouldPrompt && balance.state === 'balanced') {
        return '';
    }
    const lines = ['[CELEBRATION BALANCE - Better Than Human]'];
    lines.push('You track their celebration patterns objectively:\n');
    // State summary
    const stateDescriptions = {
        balanced: 'Their celebration balance is healthy',
        celebration_drought: `⚠️ Celebration drought: ${balance.daysSinceLastCelebration} days without celebration`,
        celebration_fatigue: `⚠️ Celebration fatigue: ${balance.recentCelebrations} celebrations in 30 days`,
        others_focused: '⚠️ Always celebrating others, rarely self',
        self_focused: 'Celebrating self well, could celebrate others more',
    };
    lines.push(`📊 Status: ${stateDescriptions[balance.state]}`);
    lines.push(`📈 Avg: ${balance.avgCelebrationsPerMonth.toFixed(1)} celebrations/month`);
    lines.push(`⚡ Energy balance: ${balance.energyBalance.toFixed(1)} (joy/energy ratio)`);
    if (prompt.shouldPrompt) {
        lines.push(`\n💡 Gently explore: "${prompt.suggestion}"`);
    }
    if (balance.recommendations.length > 0) {
        lines.push(`\n${balance.recommendations[0]}`);
    }
    return lines.join('\n');
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function createDefaultProfile(userId) {
    return {
        userId,
        celebrations: [],
        preferences: {
            preferredSize: 'small',
            energyCapacity: 'medium',
            soloVsSocial: 'mixed',
        },
        patterns: {
            bestMonthsForCelebration: [],
            avoidMonths: [],
            preferredDayOfWeek: [],
        },
        lastUpdated: new Date().toISOString(),
    };
}
function updatePatterns(profile, celebration) {
    const date = new Date(celebration.date);
    const month = date.getMonth() + 1;
    const dayOfWeek = date.getDay();
    // Track good months (high joy, low energy cost)
    if (celebration.joyReceived >= 7 && celebration.energyCost <= 5) {
        if (!profile.patterns.bestMonthsForCelebration.includes(month)) {
            profile.patterns.bestMonthsForCelebration.push(month);
        }
    }
    // Track preferred day of week (repeated days)
    if (!profile.patterns.preferredDayOfWeek.includes(dayOfWeek)) {
        // Only add if we see this day multiple times
        const sameDayCelebrations = profile.celebrations.filter((c) => new Date(c.date).getDay() === dayOfWeek).length;
        if (sameDayCelebrations >= 2) {
            profile.patterns.preferredDayOfWeek.push(dayOfWeek);
        }
    }
    // Detect preferred size from history
    const sizeCounts = {
        micro: 0, small: 0, medium: 0, large: 0, major: 0
    };
    for (const c of profile.celebrations) {
        sizeCounts[c.size]++;
    }
    const preferredSize = Object.entries(sizeCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'small';
    profile.preferences.preferredSize = preferredSize;
}
// ============================================================================
// SERVICE EXPORT
// ============================================================================
export const celebrationBalance = {
    recordCelebration,
    getCelebrationBalance,
    getCelebrationSuggestions,
    shouldPromptForCelebration,
    buildCelebrationBalanceContext,
    loadCelebrationProfile,
};
export default celebrationBalance;
//# sourceMappingURL=celebration-balance.js.map