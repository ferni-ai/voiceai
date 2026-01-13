/**
 * Alex Communication Insights Context Builder
 *
 * > "Clear is kind. I'll help you say what needs to be said."
 *
 * This builder loads Alex with DEEP communication intelligence when:
 * 1. A user transfers TO Alex from another persona
 * 2. A user starts talking directly with Alex
 *
 * @module intelligence/context-builders/personas/alex-communication-insights
 */
import { createLogger } from '../../../../utils/safe-logger.js';
import { BuilderCategory, createHighInjection, createHintInjection, createStandardInjection, registerContextBuilder, } from '../../index.js';
import { getHandoffContext } from '../../../../tools/handoff/executor.js';
import { getFinancialStore } from '../../../../services/stores/financial-store.js';
import { getSuperhuman } from '../../superhuman/superhuman-integration.js';
import { detectMilestoneConflicts, findOptimalMilestoneWindows, } from '../../../../services/superhuman/milestone-calendar-coordinator.js';
import { getSession, clearAlexCommunicationSession } from './session.js';
import { getUserStateSnapshot, getUpcomingPriorities, getMemoryContext } from './data-fetchers.js';
import { computeCommunicationMetrics } from './metrics.js';
import { buildCommunicationContext } from './communication-context.js';
import { detectProactiveTriggers } from './triggers.js';
import { identifyCoachingOpportunities } from './coaching.js';
import { gatherTeamInsights } from './team-insights.js';
import { formatBriefingForInjection } from './formatting.js';
import { buildAlexSuperhumanContext, processTranscriptForSuperhuman, } from './superhuman-context.js';
const log = createLogger({ module: 'context:alex-communication-insights' });
// Re-export session functions for external use
export { clearAlexCommunicationSession };
// ============================================================================
// MILESTONE HELPER
// ============================================================================
async function getActiveMilestonesForAlex(userId) {
    try {
        const financialStore = getFinancialStore();
        const goals = financialStore.getUserSavingsGoals(userId);
        const milestones = [];
        const now = new Date();
        for (const goal of goals) {
            if (goal.deadline) {
                const deadline = new Date(goal.deadline);
                const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                // Only include upcoming milestones (next 30 days)
                if (daysUntil > 0 && daysUntil <= 30) {
                    milestones.push({
                        id: goal.id || `goal-${goal.name}`,
                        name: goal.name,
                        targetDate: deadline,
                        importance: daysUntil <= 7 ? 'high' : daysUntil <= 14 ? 'medium' : 'low',
                        estimatedHours: 10, // Default estimate
                    });
                }
            }
        }
        return milestones;
    }
    catch (error) {
        log.debug({ error: String(error), userId }, 'Could not get active milestones');
        return [];
    }
}
// ============================================================================
// BRIEFING BUILDER
// ============================================================================
async function buildCommunicationBriefing(userId, handoffContext) {
    // Default fallback values for graceful degradation
    const defaultUserState = {
        stressLevel: 'unknown',
        stressSignals: [],
        energyLevel: 'unknown',
        productivityMomentum: 'unknown',
        timeOfDayContext: 'unknown',
        optimalCommunicationWindow: null,
    };
    const defaultMemoryContext = {
        previousCommunicationTopics: [],
        scriptsThatWorked: [],
        pendingFollowUps: [],
        relationshipNotes: [],
    };
    // 🐛 FIX: Each promise has its own catch to prevent one failure from crashing all
    const [userState, memoryContext] = await Promise.all([
        getUserStateSnapshot(userId).catch((e) => {
            log.warn({ error: String(e) }, 'Failed to get user state snapshot');
            return defaultUserState;
        }),
        Promise.resolve(getMemoryContext(userId)).catch((e) => {
            log.warn({ error: String(e) }, 'Failed to get memory context');
            return defaultMemoryContext;
        }),
    ]);
    const upcomingPriorities = getUpcomingPriorities(userId);
    const communicationContext = buildCommunicationContext(handoffContext);
    const communicationMetrics = computeCommunicationMetrics(userState, upcomingPriorities, communicationContext);
    const proactiveTriggers = detectProactiveTriggers(userState, communicationMetrics, upcomingPriorities, communicationContext);
    const coachingOpportunities = identifyCoachingOpportunities(userState, communicationContext, handoffContext);
    const teamInsights = gatherTeamInsights(userState, upcomingPriorities, handoffContext);
    // Jordan↔Alex coordination: Get milestone conflicts and protected time windows
    let milestoneConflicts = [];
    let protectedTimeWindows = [];
    try {
        // Get active milestones from Jordan's domain
        const activeMilestones = await getActiveMilestonesForAlex(userId);
        if (activeMilestones.length > 0) {
            // Detect conflicts between milestones and calendar
            milestoneConflicts = await detectMilestoneConflicts(userId, activeMilestones);
            // Find optimal focus windows for milestone work
            protectedTimeWindows = await findOptimalMilestoneWindows(userId, {
                daysAhead: 7,
                minDurationHours: 2,
                preferMornings: true,
            });
            log.debug({
                userId,
                conflictCount: milestoneConflicts.length,
                windowCount: protectedTimeWindows.length,
            }, 'Jordan↔Alex coordination loaded');
        }
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to get Jordan↔Alex coordination');
    }
    // Build action items
    const actionItems = [];
    if (userState.stressLevel === 'high') {
        actionItems.push('Start with grounding - "Take a breath. What\'s most urgent?"');
    }
    if (upcomingPriorities.some((p) => p.urgency === 'critical')) {
        actionItems.push('Critical deadlines need attention - prioritize these first');
    }
    if (communicationContext.recentDifficultTopics.length > 0) {
        actionItems.push('Difficult conversation flagged - offer role-play support');
    }
    if (communicationContext.boundaryConversations.length > 0) {
        actionItems.push('Boundary conversation needed - script it out');
    }
    // Add milestone-based action items
    const highSeverityConflicts = milestoneConflicts.filter((c) => c.severity === 'high');
    if (highSeverityConflicts.length > 0) {
        actionItems.push(`⚠️ MILESTONE ALERT: ${highSeverityConflicts[0].description} - ${highSeverityConflicts[0].suggestion}`);
    }
    if (protectedTimeWindows.length > 0 && protectedTimeWindows[0].quality === 'ideal') {
        const window = protectedTimeWindows[0];
        const dateStr = window.date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
        });
        actionItems.push(`🛡️ Suggest protecting ${dateStr} ${window.startHour}:00-${window.endHour}:00 for milestone focus`);
    }
    return {
        userState,
        communicationMetrics,
        upcomingPriorities,
        communicationContext,
        coachingOpportunities,
        teamInsights,
        actionItems,
        proactiveTriggers,
        memoryContext,
        milestoneConflicts,
        protectedTimeWindows,
    };
}
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
async function buildAlexCommunicationInsightsContext(input) {
    const injections = [];
    // Only for Alex
    const currentPersona = input.services?.personaId || '';
    const isAlex = [
        'alex',
        'alex-chen',
        'admin-assistant',
        'scheduler',
        'communication-coach',
        'chief-of-staff',
    ].includes(currentPersona.toLowerCase());
    if (!isAlex)
        return injections;
    const userId = input.services?.userId || 'anonymous';
    if (userId === 'anonymous')
        return injections;
    const turnCount = input.userData?.turnCount ?? 0;
    const sessionId = input.services?.sessionId || userId;
    const session = getSession(sessionId);
    const handoffContext = getHandoffContext();
    const isHandoff = handoffContext !== undefined;
    // Inject on first turn, handoff, or every 10 turns
    const shouldInject = turnCount === 0 ||
        isHandoff ||
        (turnCount > 0 && turnCount % 10 === 0 && turnCount !== session.briefingTurn);
    if (!shouldInject)
        return injections;
    try {
        const briefing = await buildCommunicationBriefing(userId, handoffContext);
        const formattedSections = formatBriefingForInjection(briefing, handoffContext, turnCount);
        // Get superhuman context (network, commitments, capacity)
        // V3 Semantic Intelligence needs current conversation context
        const personMatch = input.userText?.match(/\b(my (?:mom|dad|wife|husband|partner|sister|brother|friend|boss|coworker)|(?:mom|dad|wife|husband)\b)/i);
        const superhumanContext = await getSuperhuman(userId, 'alex', {
            currentTranscript: input.userText,
            currentTopics: input.analysis?.topics?.detected,
            currentEmotion: input.analysis?.emotion?.primary,
            currentMentionedPerson: personMatch?.[1],
        });
        if (superhumanContext) {
            formattedSections.push('\n' + superhumanContext);
        }
        // 🦸 BETTER THAN HUMAN: Add superhuman communication intelligence
        // This gives Alex 10 capabilities no human friend can match
        const superhumanCommContext = await buildAlexSuperhumanContext(userId, {
            transcript: input.userText,
            topics: input.analysis?.topics?.detected,
            mentionedPerson: personMatch?.[1],
            emotion: input.analysis?.emotion?.primary,
        });
        if (superhumanCommContext.contextString) {
            formattedSections.push('\n' + superhumanCommContext.contextString);
        }
        // Process transcript for real-time pattern detection
        if (input.userText) {
            void processTranscriptForSuperhuman(userId, input.userText, {
                currentTopic: input.analysis?.topics?.detected?.[0],
            });
        }
        // 🤝 TEAM HUDDLE: Record Alex's observations for cross-persona intelligence
        try {
            const { alex: alexObserver } = await import('../../../../services/cross-persona/observation-recorder.js');
            // Record stress-related concerns from user state
            if (briefing.userState.stressLevel === 'high') {
                alexObserver.concern(userId, `High stress level detected: ${briefing.userState.stressSignals.join(', ')}`, 0.85, ['stress', 'communication', 'boundaries']);
            }
            // Record upcoming priority concerns (overloaded schedule)
            if (briefing.upcomingPriorities.length > 5) {
                alexObserver.concern(userId, `${briefing.upcomingPriorities.length} upcoming priorities - may be overloaded`, 0.7, ['schedule', 'priorities', 'overload']);
            }
            // Record coaching opportunities
            if (briefing.coachingOpportunities.length > 0) {
                alexObserver.opportunity(userId, briefing.coachingOpportunities[0], 0.7, undefined, [
                    'communication',
                    'coaching',
                ]);
            }
            // Record proactive triggers
            if (briefing.proactiveTriggers?.length > 0) {
                const topTrigger = briefing.proactiveTriggers[0];
                alexObserver.pattern(userId, topTrigger.message || 'Communication pattern detected', 0.65, [
                    'communication',
                    'patterns',
                ]);
            }
        }
        catch (err) {
            // Non-critical - don't block if observation recording fails
            log.debug({ error: String(err) }, 'Failed to record Alex observations (non-blocking)');
        }
        const content = formattedSections.join('\n');
        if (isHandoff) {
            injections.push(createHighInjection('alex_handoff_briefing', content, {
                category: 'persona-communication',
                confidence: 0.9,
            }));
            log.info({ userId, urgency: handoffContext?.urgency }, '📬 Alex loaded with handoff briefing');
        }
        else if (turnCount === 0) {
            injections.push(createStandardInjection('alex_initial_briefing', content, {
                category: 'persona-communication',
                confidence: 0.8,
            }));
            log.info({ userId, readiness: briefing.communicationMetrics.communicationReadiness }, '📬 Alex loaded with communication briefing');
        }
        else {
            injections.push(createHintInjection('alex_refresh_briefing', content, {
                category: 'persona-communication',
            }));
        }
        session.briefingTurn = turnCount;
        // Alex's mindset reminder
        if (turnCount === 0 || isHandoff) {
            injections.push(createHintInjection('alex_mindset', "[ALEX'S HEART: You show love through clarity. Clear is kind. " +
                'Help them say what needs to be said, find the words they need, ' +
                "and navigate the conversations they're avoiding. " +
                "You're their Chief of Staff - handle their communication with care.]", { category: 'persona-identity' }));
        }
    }
    catch (err) {
        log.warn({ error: String(err) }, 'Failed to build Alex communication briefing');
        injections.push(createStandardInjection('[Alex: Communication briefing unavailable. Proceeding with standard context.]', 'alex_briefing'));
    }
    return injections;
}
// ============================================================================
// REGISTRATION
// ============================================================================
registerContextBuilder({
    name: 'alex-communication-insights',
    description: 'Loads Alex with deep communication insights - metrics, coaching, coordination',
    priority: 44,
    category: BuilderCategory.PERSONA,
    build: buildAlexCommunicationInsightsContext,
});
export { buildAlexCommunicationInsightsContext };
//# sourceMappingURL=index.js.map