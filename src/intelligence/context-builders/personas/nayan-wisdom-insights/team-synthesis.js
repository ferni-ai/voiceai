/**
 * Nayan's Wisdom Insights - Team Synthesis
 *
 * Synthesizes insights from all team members' domains for Nayan's wisdom view.
 *
 * @module intelligence/context-builders/nayan-wisdom-insights/team-synthesis
 */
import { createLogger } from '../../../../utils/safe-logger.js';
import { getFinancialStore } from '../../../../services/stores/financial-store.js';
import { getProductivityStore } from '../../../../services/stores/productivity-store.js';
const log = createLogger({ module: 'nayan:team-synthesis' });
// ============================================================================
// TEAM SYNTHESIS (Cross-Domain Wisdom)
// ============================================================================
export async function synthesizeTeamInsights(userId) {
    const synthesis = {
        peterPattern: null,
        mayaPattern: null,
        jordanPattern: null,
        alexPattern: null,
        integratedWisdom: null,
        crossDomainInsights: [],
    };
    try {
        const financialStore = getFinancialStore();
        await financialStore.loadUserData(userId);
        const productivityStore = getProductivityStore();
        const userData = productivityStore.getFullUserData(userId);
        // Peter's domain - what do the numbers reveal?
        const triggers = financialStore.getRecentSpendingTriggers(userId, 30);
        if (triggers.length >= 5) {
            const emotions = triggers.map((t) => t.emotion);
            const stressCount = emotions.filter((e) => e === 'stressed' || e === 'anxious' || e === 'bored').length;
            if (stressCount > triggers.length * 0.4) {
                synthesis.peterPattern =
                    'Money as coping mechanism - the spending reveals inner turbulence';
                synthesis.crossDomainInsights.push('Financial patterns mirror emotional state');
            }
            else {
                synthesis.peterPattern = 'Spending aligned with values - money serving purpose';
                synthesis.crossDomainInsights.push('Money is a tool, not a master');
            }
        }
        // Maya's domain - what do the habits reveal?
        const habits = userData.enhancedHabits || [];
        const activeHabits = habits.filter((h) => h.isActive && !h.isPaused);
        if (activeHabits.length > 0) {
            const avgSuccess = activeHabits.reduce((sum, h) => sum + h.successRate, 0) / activeHabits.length;
            const hasKeystone = activeHabits.some((h) => h.isKeystone && h.currentStreak >= 7);
            if (avgSuccess > 0.7 && hasKeystone) {
                synthesis.mayaPattern = 'Sustainable growth - the foundation is solid';
                synthesis.crossDomainInsights.push('Daily disciplines revealing character');
            }
            else if (avgSuccess < 0.4 && activeHabits.length >= 4) {
                synthesis.mayaPattern = 'Striving without self-compassion - too much, too fast';
                synthesis.crossDomainInsights.push("The body and habits speak what the mind won't say");
            }
            else {
                synthesis.mayaPattern = 'Learning the rhythm - patience is the teacher now';
            }
        }
        // Jordan's domain - what do the goals reveal?
        const goals = financialStore.getActiveSavingsGoals(userId);
        if (goals.length > 0) {
            const avgProgress = goals.reduce((sum, g) => sum + g.currentAmount / g.targetAmount, 0) / goals.length;
            if (avgProgress > 0.5) {
                synthesis.jordanPattern = 'Vision becoming reality - the future is being built';
                synthesis.crossDomainInsights.push('Goals reveal hopes - progress reveals commitment');
            }
            else if (goals.length >= 3 && avgProgress < 0.2) {
                synthesis.jordanPattern = 'Many dreams, scattered energy - focus might be needed';
                synthesis.crossDomainInsights.push('The number of goals often inverse to their depth');
            }
            else {
                synthesis.jordanPattern = 'Seeds planted - patience with the timeline';
            }
        }
        // Alex's domain - communication patterns
        const reflections = userData.weeklyReflections || [];
        if (reflections.length > 0) {
            const commChallenges = reflections
                .flatMap((r) => r.challenges || [])
                .filter((c) => c.toLowerCase().includes('conversation') ||
                c.toLowerCase().includes('tell') ||
                c.toLowerCase().includes('boundary'));
            if (commChallenges.length >= 2) {
                synthesis.alexPattern = 'Communication challenges recurring - something unsaid';
                synthesis.crossDomainInsights.push("What we don't say speaks louder than what we do");
            }
        }
        // Integrated wisdom - the synthesis
        if (synthesis.peterPattern && synthesis.mayaPattern) {
            const patterns = [
                synthesis.peterPattern,
                synthesis.mayaPattern,
                synthesis.jordanPattern,
            ].filter(Boolean);
            if (patterns.some((p) => p?.includes('sustainable') || p?.includes('solid') || p?.includes('reality'))) {
                synthesis.integratedWisdom =
                    'The outer work mirrors inner stability. Continue compounding. Trust is being earned.';
            }
            else if (patterns.some((p) => p?.includes('striving') || p?.includes('turbulence') || p?.includes('scattered'))) {
                synthesis.integratedWisdom =
                    'Before the doing, perhaps the being. Rest is not the opposite of growth - it is the soil.';
            }
            else {
                synthesis.integratedWisdom = 'The path is unfolding. Trust the process. Trust the timing.';
            }
        }
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Could not synthesize team insights');
    }
    return synthesis;
}
//# sourceMappingURL=team-synthesis.js.map