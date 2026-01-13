/**
 * Briefing formatting for Peter's research insights.
 *
 * @module intelligence/context-builders/personas/peter-research-insights/formatting
 */
import { analyzeTimePatterns } from './metrics.js';
// ============================================================================
// FORMAT BRIEFING FOR INJECTION
// ============================================================================
export function formatBriefingForInjection(briefing, handoffBriefing, turnCount) {
    const sections = [];
    // Opening context
    sections.push(`[PETER'S RESEARCH BRIEFING - Turn ${turnCount}]`);
    // Handoff context first (if transferring to Peter)
    if (handoffBriefing) {
        sections.push('\n=== HANDOFF CONTEXT ===');
        sections.push(`Topic in progress: ${handoffBriefing.topic}`);
        if (handoffBriefing.previousPersonaInsights.length > 0) {
            sections.push(`From previous persona: ${handoffBriefing.previousPersonaInsights.join('; ')}`);
        }
        if (handoffBriefing.questionsForPeter.length > 0) {
            sections.push(`Questions for your research: ${handoffBriefing.questionsForPeter.join('; ')}`);
        }
        if (handoffBriefing.emotionalWeight > 0.5) {
            sections.push('NOTE: User may be emotionally charged. Start with validation before diving into data.');
        }
    }
    // COMPUTED BEHAVIORAL METRICS (Peter's research dashboard)
    const { behavioralMetrics } = briefing;
    sections.push('\n=== YOUR COMPUTED METRICS (Real Data) ===');
    sections.push(`• Decision Quality Index: ${behavioralMetrics.decisionQualityIndex}/100`);
    sections.push(`• Habit Formation Velocity: ${behavioralMetrics.habitFormationVelocity}`);
    sections.push(`• Motivation Sustainability: ${behavioralMetrics.motivationSustainability}`);
    sections.push(`• Financial Stress Level: ${behavioralMetrics.financialStressLevel}`);
    // Cross-domain patterns from behavioral analysis
    if (behavioralMetrics.patterns.length > 0) {
        sections.push('\n=== CROSS-DOMAIN CORRELATIONS DETECTED ===');
        behavioralMetrics.patterns.forEach((pattern) => {
            sections.push(`🔗 ${pattern}`);
        });
    }
    // MAYA'S HABIT DATA (Cross-team integration)
    const { mayaInsights } = briefing;
    if (mayaInsights.activeHabits > 0) {
        sections.push('\n=== FROM MAYA (Habit Intelligence) ===');
        sections.push(`• Active habits: ${mayaInsights.activeHabits}`);
        sections.push(`• Success rate: ${Math.round(mayaInsights.averageSuccessRate * 100)}%`);
        sections.push(`• Total completions: ${mayaInsights.totalCompletions}`);
        if (mayaInsights.keystoneHabits.length > 0) {
            sections.push(`• 🌟 Keystone habits: ${mayaInsights.keystoneHabits.join(', ')}`);
        }
        if (mayaInsights.currentStreaks.length > 0) {
            const streakStr = mayaInsights.currentStreaks
                .slice(0, 3)
                .map((s) => `${s.name} (${s.streak}d)`)
                .join(', ');
            sections.push(`• 🔥 Active streaks: ${streakStr}`);
        }
        if (mayaInsights.atRiskHabits.length > 0) {
            sections.push(`• ⚠️ At-risk habits: ${mayaInsights.atRiskHabits.join(', ')}`);
        }
        if (mayaInsights.habitStacks.length > 0) {
            sections.push(`• Habit stacks: ${mayaInsights.habitStacks.join(', ')}`);
        }
        if (mayaInsights.weeklyReflectionSummary) {
            sections.push(`• Latest reflection: ${mayaInsights.weeklyReflectionSummary}`);
        }
    }
    // MOOD/ENERGY DATA
    const { moodPatterns } = briefing;
    if (moodPatterns.lastMood || moodPatterns.recentMoodTrend !== 'unknown') {
        sections.push('\n=== MOOD/ENERGY INTELLIGENCE ===');
        if (moodPatterns.lastMood) {
            sections.push(`• Last logged: Mood ${moodPatterns.lastMood.mood}, Energy ${moodPatterns.lastMood.energy}`);
        }
        sections.push(`• Mood trend (2 weeks): ${moodPatterns.recentMoodTrend}`);
        sections.push(`• Average energy: ${moodPatterns.averageEnergy.toFixed(1)}/5`);
        if (moodPatterns.moodCorrelations.length > 0) {
            moodPatterns.moodCorrelations.forEach((corr) => {
                sections.push(`• 💡 ${corr}`);
            });
        }
    }
    // Spending insights
    if (briefing.spendingInsights.length > 0) {
        sections.push('\n=== SPENDING PATTERNS DETECTED ===');
        briefing.spendingInsights.slice(0, 3).forEach((insight) => {
            sections.push(`• ${insight}`);
        });
    }
    // Goal trajectory
    if (briefing.goalInsights.length > 0) {
        sections.push('\n=== GOAL TRAJECTORY ===');
        briefing.goalInsights.slice(0, 2).forEach((insight) => {
            sections.push(`• ${insight}`);
        });
    }
    // Coaching & Personal Research Analytics
    if (briefing.habitCorrelations.length > 0) {
        sections.push('\n=== COACHING ANALYTICS TO APPLY ===');
        briefing.habitCorrelations.slice(0, 3).forEach((insight) => {
            sections.push(`• ${insight}`);
        });
    }
    // Cross-domain patterns (framework reminders) - only on first turns
    if (turnCount === 0 || turnCount === 1) {
        sections.push('\n=== YOUR RESEARCH FRAMEWORKS ===');
        sections.push('• Two-Minute Drill: Can you explain any finding simply?');
        sections.push('• Story Behind the Numbers: Every data point has a human story');
        sections.push('• Leading vs Lagging: Focus on what PREDICTS, not just what MEASURES');
        sections.push('• Cross-Domain: Best insights come from connecting unrelated data');
        sections.push('• Behavioral Economics: People are not rational - find the emotional driver');
    }
    // Time-based context
    const timePatterns = analyzeTimePatterns();
    if (timePatterns.length > 0) {
        sections.push('\n=== TIME CONTEXT ===');
        timePatterns.slice(0, 1).forEach((pattern) => {
            sections.push(`• ${pattern}`);
        });
    }
    // Better Than Human: Calendar awareness for research timing
    if (briefing.calendarContext) {
        const cal = briefing.calendarContext;
        sections.push('\n=== 📅 FROM ALEX (Calendar Awareness) ===');
        // Load indicator
        const loadEmoji = cal.loadLevel === 'overloaded'
            ? '🔴'
            : cal.loadLevel === 'heavy'
                ? '🟠'
                : cal.loadLevel === 'moderate'
                    ? '🟡'
                    : '🟢';
        sections.push(`• Calendar load: ${loadEmoji} ${cal.loadLevel}`);
        sections.push(`• Focus time this week: ${cal.focusTimeHours}h available`);
        if (cal.bestDayForDeepWork) {
            sections.push(`• Best day for deep research: ${cal.bestDayForDeepWork}`);
        }
        if (cal.timingSuggestion) {
            sections.push(`• 💡 Timing: ${cal.timingSuggestion}`);
        }
        // Immediate context
        if (cal.justEndedMeeting) {
            sections.push('• ⏰ User just finished a meeting - they may need a moment');
        }
        if (cal.upcomingMeetingSoon) {
            sections.push('• ⏰ Meeting coming up soon - keep insights focused');
        }
    }
    // Proactive discoveries (top priority items)
    if (briefing.proactiveDiscoveries.length > 0) {
        sections.push('\n=== 🎯 PROACTIVE OPPORTUNITIES ===');
        briefing.proactiveDiscoveries.slice(0, 5).forEach((discovery) => {
            sections.push(`• ${discovery}`);
        });
    }
    sections.push("\n[Remember: Make data human. Find the story. Connect the dots they haven't seen.]");
    return sections;
}
//# sourceMappingURL=formatting.js.map