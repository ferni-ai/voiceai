/**
 * Jordan Milestone Insights - Handoff Analysis
 *
 * Analyzes handoff context when transferring to Jordan from another persona.
 *
 * @module intelligence/context-builders/jordan-milestone-insights/handoff-analysis
 */
import { getHandoffContext } from '../../../../tools/handoff/executor.js';
// ============================================================================
// HANDOFF CONTEXT ANALYSIS
// ============================================================================
export function analyzeHandoffForJordan() {
    const handoffContext = getHandoffContext();
    if (!handoffContext)
        return null;
    const briefing = {
        topic: handoffContext.topics?.[0] || 'planning',
        planningContext: null,
        excitementLevel: 'medium',
        actionItems: [],
        emotionalWeight: 0,
        previousPersonaInsights: [],
    };
    const topics = handoffContext.topics || [];
    for (const topic of topics) {
        const lower = topic.toLowerCase();
        // From Peter - financial readiness
        if (lower.includes('saving') || lower.includes('budget') || lower.includes('afford')) {
            briefing.planningContext = 'financial-planning';
            briefing.actionItems.push(`Peter crunched numbers for "${topic}" - help make it real`);
        }
        // From Maya - habit support
        if (lower.includes('habit') || lower.includes('routine') || lower.includes('streak')) {
            briefing.planningContext = 'habit-supported-goal';
            briefing.actionItems.push(`Maya's building habits for "${topic}" - tie them to milestones`);
        }
        // From Nayan - wisdom context
        if (lower.includes('values') || lower.includes('purpose') || lower.includes('meaning')) {
            briefing.planningContext = 'values-aligned-planning';
            briefing.actionItems.push(`Nayan explored values around "${topic}" - align milestones to meaning`);
        }
        // Exciting topics
        if (lower.includes('wedding') ||
            lower.includes('baby') ||
            lower.includes('house') ||
            lower.includes('vacation') ||
            lower.includes('retirement')) {
            briefing.excitementLevel = 'high';
        }
        // Difficult topics
        if (lower.includes('divorce') ||
            lower.includes('loss') ||
            lower.includes('ending') ||
            lower.includes('transition')) {
            briefing.excitementLevel = 'low';
            briefing.planningContext = 'life-transition';
            briefing.emotionalWeight = 0.7;
        }
    }
    // Capture summary
    if (handoffContext.summary) {
        briefing.previousPersonaInsights.push(`Previous persona noted: "${handoffContext.summary}"`);
    }
    // Emotional state
    if (handoffContext.emotionalState && handoffContext.emotionalState !== 'neutral') {
        briefing.previousPersonaInsights.push(`User emotional state: ${handoffContext.emotionalState} - adjust planning energy accordingly`);
        briefing.emotionalWeight = Math.max(briefing.emotionalWeight, 0.5);
    }
    // Cognitive context
    if (handoffContext.cognitiveContext) {
        const cogCtx = handoffContext.cognitiveContext;
        if (cogCtx.effectiveApproaches?.length > 0) {
            briefing.previousPersonaInsights.push(`What worked: ${cogCtx.effectiveApproaches.join(', ')}`);
        }
    }
    return briefing;
}
//# sourceMappingURL=handoff-analysis.js.map