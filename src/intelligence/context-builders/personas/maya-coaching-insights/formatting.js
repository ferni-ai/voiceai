/**
 * Briefing formatting for Maya's coaching insights.
 *
 * @module intelligence/context-builders/personas/maya-coaching-insights/formatting
 */
// ============================================================================
// FORMAT BRIEFING
// ============================================================================
export function formatMayaBriefing(briefing, handoffBriefing, turnCount) {
    const sections = [];
    sections.push(`[MAYA'S COACHING BRIEFING - Turn ${turnCount}]`);
    // Handoff context (high priority)
    if (handoffBriefing) {
        sections.push('\n=== HANDOFF CONTEXT ===');
        sections.push(`Topic: ${handoffBriefing.topic}`);
        if (handoffBriefing.fromPersona) {
            sections.push(`From: ${handoffBriefing.fromPersona.toUpperCase()}`);
        }
        if (handoffBriefing.urgency === 'high') {
            sections.push(`⚠️ URGENCY: HIGH`);
        }
        if (handoffBriefing.emotionalContext) {
            sections.push(`Emotional state: ${handoffBriefing.emotionalContext} - lead with warmth`);
        }
        if (handoffBriefing.actionItems.length > 0) {
            sections.push(`Action items:\n${handoffBriefing.actionItems.map((a) => `  • ${a}`).join('\n')}`);
        }
    }
    // Computed Metrics Dashboard
    const { coachingMetrics } = briefing;
    sections.push('\n=== 📊 COACHING METRICS DASHBOARD ===');
    sections.push(`• Consistency Index: ${coachingMetrics.consistencyIndex}/100`);
    sections.push(`• Cascade Potential: ${coachingMetrics.cascadePotential}/100`);
    sections.push(`• Recovery Speed: ${coachingMetrics.recoverySpeed}/100`);
    sections.push(`• Momentum Score: ${coachingMetrics.momentumScore}/100`);
    sections.push(`• Keystone Power: ${coachingMetrics.keystonePower}/100`);
    if (coachingMetrics.patterns.length > 0) {
        sections.push(`PATTERNS: ${coachingMetrics.patterns.join('; ')}`);
    }
    // Habit health dashboard
    const { habitHealth } = briefing;
    sections.push('\n=== 🌱 HABIT HEALTH ===');
    sections.push(`• Active habits: ${habitHealth.activeHabits}`);
    sections.push(`• Active streaks: ${habitHealth.totalStreaks}`);
    sections.push(`• Success rate: ${Math.round(habitHealth.averageSuccessRate * 100)}%`);
    sections.push(`• Total completions: ${habitHealth.totalCompletions}`);
    sections.push(`• Keystone: ${habitHealth.keystoneActive ? `✅ ${habitHealth.keystoneHabits.join(', ')}` : '❌ None active'}`);
    if (habitHealth.longestStreak) {
        sections.push(`• 🔥 Longest streak: ${habitHealth.longestStreak.name} (${habitHealth.longestStreak.days} days)`);
    }
    if (habitHealth.habitStacks.length > 0) {
        sections.push(`• Habit stacks: ${habitHealth.habitStacks.join(', ')}`);
    }
    // Mood Intelligence
    const { moodIntelligence } = briefing;
    if (moodIntelligence.currentState || moodIntelligence.recentMoodTrend !== 'unknown') {
        sections.push('\n=== 🧠 MOOD INTELLIGENCE ===');
        if (moodIntelligence.currentState) {
            sections.push(`• Current: ${moodIntelligence.currentState.mood} mood, ${moodIntelligence.currentState.energy} energy`);
        }
        sections.push(`• Trend: ${moodIntelligence.recentMoodTrend}`);
        if (moodIntelligence.optimalCoachingTime) {
            sections.push(`• Best time for challenges: ${moodIntelligence.optimalCoachingTime}`);
        }
        if (moodIntelligence.moodHabitCorrelations.length > 0) {
            sections.push(`• ${moodIntelligence.moodHabitCorrelations.join('; ')}`);
        }
    }
    // Four Tendencies coaching approach
    if (briefing.tendencyType) {
        sections.push('\n=== 🎯 COACHING APPROACH ===');
        const approaches = {
            upholder: "UPHOLDER: Clear rules and schedules work. Set expectations and they'll meet them.",
            questioner: 'QUESTIONER: Explain the WHY. They need logical reasons to commit.',
            obliger: 'OBLIGER: External accountability is key. Check-ins, partners, public commitments.',
            rebel: 'REBEL: Frame as choice and identity. "You\'re the kind of person who..." works better than rules.',
        };
        sections.push(approaches[briefing.tendencyType]);
    }
    // Proactive Triggers (high priority first)
    const highPriority = briefing.proactiveTriggers.filter((t) => t.priority === 'high');
    const otherTriggers = briefing.proactiveTriggers.filter((t) => t.priority !== 'high');
    if (highPriority.length > 0) {
        sections.push('\n=== ⚡ IMMEDIATE ACTIONS ===');
        highPriority.forEach((t) => sections.push(`• [${t.type.toUpperCase()}] ${t.message}`));
    }
    if (otherTriggers.length > 0) {
        sections.push('\n=== 💡 COACHING OPPORTUNITIES ===');
        otherTriggers.slice(0, 4).forEach((t) => sections.push(`• [${t.type}] ${t.message}`));
    }
    // Wins to celebrate
    if (briefing.winsToCelebrate.length > 0) {
        sections.push('\n=== 🎉 CELEBRATE THESE ===');
        briefing.winsToCelebrate.forEach((win) => sections.push(`• ${win}`));
    }
    // Struggles needing support
    if (briefing.strugglesToAddress.length > 0) {
        sections.push('\n=== 💚 SELF-COMPASSION NEEDED ===');
        briefing.strugglesToAddress.forEach((struggle) => sections.push(`• ${struggle}`));
        sections.push('Remember: Setbacks are data, not failure. Meet them where they are.');
    }
    // Cross-team insights
    if (briefing.peterInsights.length > 0) {
        sections.push('\n=== FROM PETER (Patterns) ===');
        briefing.peterInsights.forEach((insight) => sections.push(`• ${insight}`));
    }
    if (briefing.jordanInsights.length > 0) {
        sections.push('\n=== FROM JORDAN (Goals) ===');
        briefing.jordanInsights.forEach((insight) => sections.push(`• ${insight}`));
    }
    // Better Than Human: Calendar-Habit Correlation (from Alex's calendar data)
    if (briefing.calendarInsights) {
        sections.push('\n=== 📅 FROM ALEX (Calendar-Habit Correlation) ===');
        sections.push(briefing.calendarInsights);
    }
    // Memory context
    if (briefing.memoryInsights.totalHabitConversations > 0) {
        sections.push('\n=== 🧠 RELATIONSHIP HISTORY ===');
        sections.push(`• ${briefing.memoryInsights.totalHabitConversations} habit conversations`);
        if (briefing.memoryInsights.previousWins.length > 0) {
            sections.push(`• Past wins: ${briefing.memoryInsights.previousWins.slice(0, 3).join(', ')}`);
        }
        if (briefing.memoryInsights.whatWorked.length > 0) {
            sections.push(`• What worked before: ${briefing.memoryInsights.whatWorked.join(', ')}`);
        }
    }
    // Coaching reminders (first turns only)
    if (turnCount === 0 || turnCount === 1) {
        sections.push('\n=== YOUR COACHING PRINCIPLES ===');
        sections.push('• Start embarrassingly small - 2 minutes or less');
        sections.push('• Systems beat willpower every time');
        sections.push('• Celebrate EVERYTHING - emotions create habits');
        sections.push('• Meet them where they are, not where they "should" be');
        sections.push('• Progress over perfection, always');
    }
    sections.push("\n[Remember: Zero judgment. Infinite patience. They're doing better than they think.]");
    return sections;
}
//# sourceMappingURL=formatting.js.map