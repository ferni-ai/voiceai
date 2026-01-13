/**
 * Briefing formatting for Alex's communication insights.
 *
 * @module intelligence/context-builders/personas/alex-communication-insights/formatting
 */
// ============================================================================
// FORMATTING
// ============================================================================
export function formatBriefingForInjection(briefing, handoffContext, turnCount) {
    const sections = [];
    sections.push(`[ALEX'S COMMUNICATION BRIEFING - Turn ${turnCount}]`);
    // Handoff context (high priority)
    if (handoffContext) {
        sections.push('\n=== HANDOFF CONTEXT ===');
        if (handoffContext.fromPersona) {
            sections.push(`From: ${handoffContext.fromPersona.toUpperCase()}`);
        }
        if (handoffContext.summary) {
            sections.push(`Context: ${handoffContext.summary}`);
        }
        if (handoffContext.urgency === 'high') {
            sections.push('⚠️ URGENCY: HIGH');
        }
    }
    // Communication Metrics Dashboard
    const { communicationMetrics } = briefing;
    sections.push('\n=== 📊 COMMUNICATION METRICS ===');
    sections.push(`• Readiness: ${communicationMetrics.communicationReadiness}/100`);
    sections.push(`• Calendar Density: ${communicationMetrics.calendarDensity}/100`);
    sections.push(`• Response Velocity: ${communicationMetrics.responseVelocity}/100`);
    sections.push(`• Delegation Clarity: ${communicationMetrics.delegationClarity}/100`);
    sections.push(`• Context Switch Load: ${communicationMetrics.contextSwitchLoad}/100`);
    if (communicationMetrics.patterns.length > 0) {
        sections.push(`PATTERNS: ${communicationMetrics.patterns.join('; ')}`);
    }
    // User State
    const { userState } = briefing;
    sections.push('\n=== 🎯 USER STATE ===');
    sections.push(`• Stress level: ${userState.stressLevel}`);
    sections.push(`• Energy: ${userState.energyLevel}`);
    sections.push(`• Productivity: ${userState.productivityMomentum}`);
    sections.push(`• Time context: ${userState.timeOfDayContext}`);
    if (userState.optimalCommunicationWindow) {
        sections.push(`• Best window: ${userState.optimalCommunicationWindow}`);
    }
    if (userState.stressSignals.length > 0) {
        sections.push(`• Stress signals: ${userState.stressSignals.join(', ')}`);
    }
    // High-priority proactive triggers
    const highTriggers = briefing.proactiveTriggers.filter((t) => t.priority === 'high');
    if (highTriggers.length > 0) {
        sections.push('\n=== ⚡ IMMEDIATE ACTIONS ===');
        highTriggers.forEach((t) => sections.push(`• [${t.type.toUpperCase()}] ${t.message}`));
    }
    // Upcoming Priorities
    if (briefing.upcomingPriorities.length > 0) {
        sections.push('\n=== 📋 PRIORITIES ===');
        const urgencyEmoji = {
            critical: '🚨',
            high: '⚠️',
            medium: '📌',
            low: '📝',
        };
        for (const p of briefing.upcomingPriorities.slice(0, 5)) {
            const emoji = urgencyEmoji[p.urgency] || '📋';
            sections.push(`${emoji} [${p.source}] ${p.description}`);
            if (p.actionNeeded) {
                sections.push(`   → ${p.actionNeeded}`);
            }
        }
    }
    // Communication Context
    const { communicationContext } = briefing;
    const hasCommunicationContext = communicationContext.recentDifficultTopics.length > 0 ||
        communicationContext.boundaryConversations.length > 0 ||
        communicationContext.scriptingNeeds.length > 0;
    if (hasCommunicationContext) {
        sections.push('\n=== 💬 COMMUNICATION CONTEXT ===');
        communicationContext.recentDifficultTopics.forEach((t) => sections.push(`• Difficult topic: ${t}`));
        communicationContext.boundaryConversations.forEach((t) => sections.push(`• Boundary needed: ${t}`));
        communicationContext.scriptingNeeds.forEach((t) => sections.push(`• Scripting needed: ${t}`));
        communicationContext.communicationPatterns.forEach((p) => sections.push(`• ${p}`));
        communicationContext.relationshipDynamics.forEach((d) => sections.push(`• ${d}`));
    }
    // Coaching Opportunities
    if (briefing.coachingOpportunities.length > 0) {
        sections.push('\n=== 💡 COACHING OPPORTUNITIES ===');
        briefing.coachingOpportunities.slice(0, 4).forEach((o) => sections.push(`• ${o}`));
    }
    // Team Insights
    const directInsights = briefing.teamInsights.filter((i) => i.relevance === 'direct');
    if (directInsights.length > 0) {
        sections.push('\n=== 🤝 TEAM INSIGHTS ===');
        directInsights.forEach((i) => sections.push(`• [${i.from}] ${i.insight}`));
    }
    // Jordan↔Alex Milestone Coordination
    if (briefing.milestoneConflicts.length > 0 || briefing.protectedTimeWindows.length > 0) {
        sections.push('\n=== 🎯 JORDAN↔ALEX: MILESTONE-CALENDAR COORDINATION ===');
        // High-severity conflicts first
        const highConflicts = briefing.milestoneConflicts.filter((c) => c.severity === 'high');
        const mediumConflicts = briefing.milestoneConflicts.filter((c) => c.severity === 'medium');
        if (highConflicts.length > 0) {
            sections.push('⚠️ ALERTS (action needed):');
            for (const conflict of highConflicts.slice(0, 3)) {
                sections.push(`  • ${conflict.milestoneName}: ${conflict.description}`);
                sections.push(`    → ${conflict.suggestion}`);
            }
        }
        if (mediumConflicts.length > 0) {
            sections.push('📌 HEADS UP:');
            for (const conflict of mediumConflicts.slice(0, 2)) {
                sections.push(`  • ${conflict.milestoneName}: ${conflict.description}`);
            }
        }
        // Protected time windows
        if (briefing.protectedTimeWindows.length > 0) {
            sections.push('🛡️ PROTECTED FOCUS WINDOWS (suggest blocking):');
            for (const window of briefing.protectedTimeWindows.slice(0, 3)) {
                const dateStr = window.date.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                });
                const quality = window.quality === 'ideal' ? '⭐' : window.quality === 'good' ? '✓' : '';
                sections.push(`  ${quality} ${dateStr} ${window.startHour}:00-${window.endHour}:00 (${window.reason})`);
            }
        }
    }
    // Memory Context
    if (briefing.memoryContext.scriptsThatWorked.length > 0 ||
        briefing.memoryContext.previousCommunicationTopics.length > 0) {
        sections.push('\n=== 🧠 RELATIONSHIP HISTORY ===');
        if (briefing.memoryContext.scriptsThatWorked.length > 0) {
            sections.push(`• What worked: ${briefing.memoryContext.scriptsThatWorked.join(', ')}`);
        }
        if (briefing.memoryContext.previousCommunicationTopics.length > 0) {
            sections.push(`• Previous topics: ${briefing.memoryContext.previousCommunicationTopics.join(', ')}`);
        }
    }
    // Action Items
    if (briefing.actionItems.length > 0) {
        sections.push('\n=== 🎯 SUGGESTED ACTIONS ===');
        briefing.actionItems.forEach((a) => sections.push(`→ ${a}`));
    }
    // Alex's principles (first turns only)
    if (turnCount === 0 || turnCount === 1) {
        sections.push('\n=== YOUR PRINCIPLES ===');
        sections.push('• Clear is kind - say what needs to be said');
        sections.push('• Script difficult conversations - practice makes perfect');
        sections.push('• Boundaries are self-care, not selfishness');
        sections.push('• Help them find THEIR voice, not yours');
        sections.push('• Slow down for stress - speed up for momentum');
    }
    sections.push("\n[Remember: You're their Chief of Staff. Handle with clarity and care.]");
    return sections;
}
//# sourceMappingURL=formatting.js.map