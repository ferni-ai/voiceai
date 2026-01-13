/**
 * Coaching opportunity identification for Alex's communication insights.
 *
 * @module intelligence/context-builders/personas/alex-communication-insights/coaching
 */
// ============================================================================
// COACHING OPPORTUNITIES
// ============================================================================
export function identifyCoachingOpportunities(userState, communicationContext, handoffContext) {
    const opportunities = [];
    // Stress-based coaching
    if (userState.stressLevel === 'high') {
        opportunities.push('High stress detected - start with grounding before any tasks');
        opportunities.push('Offer to draft difficult messages together');
    }
    // Difficult conversation coaching
    if (communicationContext.recentDifficultTopics.length > 0) {
        opportunities.push(`Difficult conversation ahead: ${communicationContext.recentDifficultTopics[0]}`);
        opportunities.push('Offer to role-play the conversation first');
        opportunities.push('Help identify the core message they need to convey');
    }
    // Boundary coaching
    if (communicationContext.boundaryConversations.length > 0) {
        opportunities.push('Boundary conversation needed - practice "clear is kind" approach');
        opportunities.push('Script specific phrases for saying no');
    }
    // Scripting support
    if (communicationContext.scriptingNeeds.length > 0) {
        opportunities.push('Scripting requested - help craft specific language');
        opportunities.push('Identify their authentic voice vs. what they think they "should" say');
    }
    // Relationship dynamics coaching
    if (communicationContext.relationshipDynamics.length > 0) {
        opportunities.push('Relationship context mentioned - explore the dynamic');
        opportunities.push("Consider the other person's perspective");
    }
    // Handoff-based coaching
    if (handoffContext?.fromPersona) {
        const persona = handoffContext.fromPersona.toLowerCase();
        if (persona.includes('peter')) {
            opportunities.push('From Peter - check if stress patterns need communication support');
        }
        else if (persona.includes('maya')) {
            opportunities.push('From Maya - check if habits need accountability scheduling');
        }
        else if (persona.includes('jordan')) {
            opportunities.push('From Jordan - check if goals need coordination/scheduling');
        }
        else if (persona.includes('nayan')) {
            opportunities.push('From Nayan - wisdom context, approach communication mindfully');
        }
    }
    return opportunities;
}
//# sourceMappingURL=coaching.js.map