/**
 * Proactive coaching trigger detection for Peter's research insights.
 *
 * @module intelligence/context-builders/personas/peter-research-insights/opportunities
 */
import { createLogger } from '../../../../utils/safe-logger.js';
import { detectProactiveTriggers, } from '../../../../tools/domains/proactive/coaching/index.js';
const log = createLogger({ module: 'context:peter-opportunities' });
// ============================================================================
// PROACTIVE COACHING TRIGGER DETECTION
// ============================================================================
export function detectProactiveCoachingInsights(userId, mayaInsights) {
    const priorityInsights = [];
    try {
        // Build detection context from Maya's data
        const activeHabits = mayaInsights.currentStreaks.map((s, i) => ({
            id: `habit_${i}`,
            name: s.name,
            currentStreak: s.streak,
            lastCompletion: new Date(), // Would come from actual data
            level: 1,
            successRate: mayaInsights.averageSuccessRate,
        }));
        // Add at-risk habits with broken streaks
        mayaInsights.atRiskHabits.forEach((name, i) => {
            activeHabits.push({
                id: `atrisk_${i}`,
                name,
                currentStreak: 0,
                lastCompletion: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h ago
                level: 1,
                successRate: 0.3,
            });
        });
        const detectionContext = {
            userId,
            activeHabits,
            recentMoods: [], // Would come from mood data
            weeklyReflectionsDue: false,
        };
        const triggers = detectProactiveTriggers(detectionContext);
        // Extract priority insights from triggers
        triggers.slice(0, 3).forEach((t) => {
            if (t.priority === 'urgent' || t.priority === 'high') {
                priorityInsights.push(`[${t.type}] ${t.message.opener}`);
            }
        });
        // Add streak-at-risk insights
        const streakRisk = triggers.filter((t) => t.type === 'streak_at_risk');
        if (streakRisk.length > 0) {
            priorityInsights.push(`⚠️ ${streakRisk.length} streak(s) at risk of breaking - opportunity for intervention`);
        }
        // Add celebration opportunities
        const milestones = triggers.filter((t) => t.type === 'streak_milestone');
        if (milestones.length > 0) {
            priorityInsights.push(`🎉 ${milestones.length} streak milestone(s) achieved - celebrate these wins!`);
        }
        return { triggers, priorityInsights };
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Could not detect proactive coaching insights');
        return { triggers: [], priorityInsights: [] };
    }
}
//# sourceMappingURL=opportunities.js.map