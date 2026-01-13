/**
 * Team insight gathering for Alex's communication insights.
 *
 * @module intelligence/context-builders/personas/alex-communication-insights/team-insights
 */
// ============================================================================
// TEAM INSIGHTS
// ============================================================================
export function gatherTeamInsights(userState, upcomingPriorities, handoffContext) {
    const insights = [];
    // Peter's insights (financial patterns → communication implications)
    if (userState.stressSignals.length > 0) {
        insights.push({
            from: 'Peter',
            insight: 'Stress patterns detected in spending - communication may be affected',
            relevance: 'context',
            actionable: false,
        });
    }
    // Maya's insights (habits → scheduling needs)
    const mayaPriorities = upcomingPriorities.filter((p) => p.source === 'maya');
    for (const priority of mayaPriorities) {
        insights.push({
            from: 'Maya',
            insight: priority.description,
            relevance: priority.urgency === 'high' ? 'direct' : 'context',
            actionable: !!priority.actionNeeded,
        });
    }
    // Jordan's insights (goals/deadlines → coordination needs)
    const jordanPriorities = upcomingPriorities.filter((p) => p.source === 'jordan');
    for (const priority of jordanPriorities) {
        insights.push({
            from: 'Jordan',
            insight: priority.description,
            relevance: priority.urgency === 'critical' ? 'direct' : 'context',
            actionable: !!priority.actionNeeded,
        });
    }
    // Handoff context insights
    if (handoffContext?.summary) {
        insights.push({
            from: handoffContext.fromPersona || 'team',
            insight: `Context: ${handoffContext.summary}`,
            relevance: 'direct',
            actionable: true,
        });
    }
    return insights;
}
//# sourceMappingURL=team-insights.js.map