/**
 * Jordan Milestone Insights - Opportunities & Discoveries
 *
 * Celebration opportunities, proactive discoveries, and timeline alerts.
 *
 * @module intelligence/context-builders/jordan-milestone-insights/opportunities
 */
// ============================================================================
// CELEBRATION OPPORTUNITY DETECTION
// ============================================================================
export function detectCelebrationOpportunities(goalsOverview, planningMetrics, memoryInsights) {
    const opportunities = [];
    // Near completion celebrations
    for (const goal of goalsOverview.nearingCompletion) {
        opportunities.push(`🎯 ${goal} - SO CLOSE! Finish line energy!`);
    }
    // Recently achieved
    for (const goal of goalsOverview.recentlyAchieved) {
        opportunities.push(`🏆 ${goal} ACHIEVED! This NEEDS a celebration moment!`);
    }
    // Savings milestone
    if (goalsOverview.totalSavedTowardGoals >= 1000) {
        const formatted = goalsOverview.totalSavedTowardGoals.toLocaleString();
        opportunities.push(`💰 $${formatted} total saved toward goals - that's REAL progress!`);
    }
    // Multiple active goals
    if (goalsOverview.activeGoals >= 3) {
        opportunities.push(`📋 ${goalsOverview.activeGoals} active goals - building their life portfolio!`);
    }
    // Upcoming milestone dates
    for (const milestone of goalsOverview.milestoneDates.slice(0, 3)) {
        if (milestone.daysAway <= 30) {
            opportunities.push(`📅 "${milestone.name}" deadline in ${milestone.daysAway} days - countdown mode!`);
        }
    }
    // Planning metrics celebration
    if (planningMetrics.eventSuccessPredictor >= 80) {
        opportunities.push('🌟 Event Success Predictor at 80%+ - this person is READY to plan big!');
    }
    // Memory-based opportunities
    if (memoryInsights.totalMemories > 30) {
        opportunities.push('📚 Deep relationship - can celebrate their journey with specific memories');
    }
    return opportunities;
}
// ============================================================================
// PROACTIVE DISCOVERIES
// ============================================================================
export function generateProactiveDiscoveries(briefing) {
    const discoveries = [];
    // Goal-based discoveries
    if (briefing.goalsOverview.nearingCompletion.length > 0) {
        discoveries.push(`🎯 Goals nearing completion: ${briefing.goalsOverview.nearingCompletion.join(', ')} - celebrate progress!`);
    }
    // Financial readiness discoveries
    if (briefing.peterInsights.budgetHealth === 'excellent') {
        discoveries.push('💪 Financial runway is excellent - good time to dream bigger on milestone planning!');
    }
    // Habit momentum discoveries
    if (briefing.mayaInsights.keystoneHabits.length > 0) {
        discoveries.push(`🔑 Keystone habit "${briefing.mayaInsights.keystoneHabits[0]}" is driving momentum - connect it to milestone progress`);
    }
    // Mood-based discoveries
    if (briefing.moodPatterns.celebrationReadiness === 'high') {
        discoveries.push('🎉 Emotional readiness is HIGH - perfect time for celebration planning!');
    }
    else if (briefing.moodPatterns.recentMoodTrend === 'declining') {
        discoveries.push('💙 Mood trend declining - approach with extra care, honor where they are');
    }
    // Memory-based discoveries
    if (briefing.memoryInsights.milestoneMentions.length > 0) {
        discoveries.push(`📝 Past milestone discussions: ${briefing.memoryInsights.milestoneMentions[0]} - connect to current planning`);
    }
    // Planning metrics discoveries
    for (const pattern of briefing.planningMetrics.patterns.slice(0, 2)) {
        discoveries.push(pattern);
    }
    // Life stage discoveries
    if (briefing.lifeStageContext.transitionSignals.length > 0) {
        discoveries.push(`🔄 ${briefing.lifeStageContext.transitionSignals[0]}`);
    }
    // Seasonal discoveries
    if (briefing.seasonalContext.seasonalOpportunities.length > 0) {
        discoveries.push(briefing.seasonalContext.seasonalOpportunities[0]);
    }
    // Timeline alerts as discoveries
    for (const alert of briefing.timelineAlerts.slice(0, 2)) {
        discoveries.push(alert);
    }
    return discoveries;
}
// ============================================================================
// TIMELINE ALERTS
// ============================================================================
export function generateTimelineAlerts(goalsOverview, peterInsights) {
    const alerts = [];
    // At-risk goals
    for (const goal of goalsOverview.atRisk) {
        alerts.push(`⚠️ "${goal}" is behind schedule - might need timeline adjustment`);
    }
    // Financial constraints affecting timeline
    if (peterInsights.budgetHealth === 'stressed') {
        alerts.push('💸 Budget stress may impact milestone timelines - plan for flexibility');
    }
    // No current goals
    if (goalsOverview.activeGoals === 0) {
        alerts.push("📝 No active goals yet - what's the next chapter they're dreaming about?");
    }
    // Upcoming deadlines
    for (const milestone of goalsOverview.milestoneDates) {
        if (milestone.daysAway <= 14) {
            alerts.push(`🚨 "${milestone.name}" deadline in ${milestone.daysAway} days - crunch time!`);
        }
    }
    return alerts;
}
//# sourceMappingURL=opportunities.js.map