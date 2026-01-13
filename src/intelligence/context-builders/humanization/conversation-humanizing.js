/**
 * Conversation Humanizing Context Builder
 *
 * Uses the ConversationHumanizer orchestrator as the single entry point for all
 * conversation humanization features:
 * - Speech naturalization guidance
 * - Active listening cues
 * - Memory callbacks
 * - Question diversity
 * - Emotional arc tracking
 * - Topic change detection
 *
 * This bridges the conversation module with the LLM prompt injection system.
 *
 * Uses centralized DISTRESS constants for consistent thresholds.
 */
import { getConversationHumanizer, getEmotionalArcTracker, } from '../../../conversation/index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { DISTRESS } from '../../distress-levels.js';
import { createInjection } from '../index.js';
const log = createLogger({ module: 'context:conversation-humanizing' });
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
/**
 * Build humanization context injections using the unified ConversationHumanizer
 */
export function buildConversationHumanizingContext(input) {
    const { userText, analysis, personaId, turnNumber } = input;
    // Get the humanizer for this persona
    const humanizer = getConversationHumanizer(personaId);
    // Build humanization context
    const topic = analysis.topics?.detected?.[0] || analysis.topics?.primary || undefined;
    const distressLevel = analysis.emotion.distressLevel ?? 0;
    const humanizationContext = {
        personaId,
        turnNumber,
        userMessage: userText,
        userEmotion: analysis.emotion.primary,
        topic,
        // Use centralized DISTRESS constants
        isSeriousContext: distressLevel >= DISTRESS.MILD, // 0.2
        wasPersonalSharing: input.wasPersonalSharing ||
            distressLevel >= DISTRESS.MODERATE || // 0.5
            analysis.emotion.intensity > 0.7,
    };
    // Process the user message (records in memory, dynamics, etc.)
    const preActions = humanizer.processUserMessage(humanizationContext);
    // Generate all context guidance from the humanizer
    const guidance = humanizer.generateContextGuidance(humanizationContext);
    // Convert guidance to context injections
    const injections = guidance.map((g) => createInjection(g.source, g.content, g.priority));
    // Add topic change notification if detected
    if (preActions.topicChange?.detected && preActions.topicChange.transitionPhrase) {
        injections.push(createInjection('topic_change', `[TOPIC SHIFT] User changed topic. Consider: "${preActions.topicChange.transitionPhrase}"`, 'standard'));
    }
    // Log what we're injecting
    if (injections.length > 0) {
        log.debug({
            personaId,
            turnNumber,
            injectionsCount: injections.length,
            sources: [...new Set(injections.map((i) => i.source))],
        }, 'Built conversation humanizing context via orchestrator');
    }
    return injections;
}
/**
 * Format humanizing guidance for prompt injection
 */
export function formatConversationHumanizingForPrompt(injections) {
    if (injections.length === 0)
        return '';
    const lines = [];
    // Group by priority
    const high = injections.filter((i) => i.priority === 'high');
    const standard = injections.filter((i) => i.priority === 'standard');
    const hints = injections.filter((i) => i.priority === 'hint');
    if (high.length > 0) {
        lines.push('[BEHAVIORAL CONTEXT - DO NOT READ ALOUD]');
        high.forEach((i) => lines.push(i.content));
    }
    if (standard.length > 0) {
        lines.push('[CONVERSATION CONTEXT - DO NOT READ ALOUD]');
        standard.forEach((i) => lines.push(i.content));
    }
    if (hints.length > 0) {
        lines.push('[OPTIONAL CONTEXT - DO NOT READ ALOUD]');
        hints.forEach((i) => lines.push(i.content));
    }
    return lines.join('\n');
}
/**
 * Get a summary of humanizing features for this persona
 */
export function getHumanizingSummary(personaId) {
    const humanizer = getConversationHumanizer(personaId);
    const emotional = getEmotionalArcTracker();
    const arc = emotional.getArc();
    const summary = humanizer.getConversationSummary();
    return {
        unresolvedThreads: summary.unresolvedThreads,
        commitments: summary.commitments,
        emotionalTrajectory: arc.trajectory,
        suggestedPacing: arc.needsEmotionalSupport ? 'slower' : 'normal',
    };
}
export default buildConversationHumanizingContext;
//# sourceMappingURL=conversation-humanizing.js.map