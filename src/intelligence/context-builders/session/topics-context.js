// Types restored - context builder properly typed
/**
 * Topics Context Builder
 *
 * Handles topic management:
 * - Topic threading (track multiple topics)
 * - Circle-back suggestions
 * - Topic change transitions
 * - Topic threading verification
 * - Goal connection
 *
 * These ensure no topic gets lost in conversation.
 *
 * Extracted from jack-bogle.ts lines 1052-1064, 1389-1411
 */
import { getSessionConversationManager } from '../../../services/conversation-manager.js';
import { getProactiveGoalReference, verifyTopicThreading } from '../../human-behaviors.js';
import { createHintInjection, createStandardInjection, registerContextBuilder, } from '../index.js';
// ============================================================================
// TOPICS CONTEXT BUILDER
// ============================================================================
/**
 * Build topic-related context injections
 */
function buildTopicsContext(input) {
    const { userText, analysis, userData, userProfile } = input;
    const services = input.services;
    const injections = [];
    const turnCount = userData.turnCount || 0;
    const sessionId = input.services.sessionId || 'default';
    const conversationManager = getSessionConversationManager(sessionId);
    const detectedTopics = analysis.topics.detected;
    const promptContext = services.getPromptContext?.() ?? {};
    const circleBackTopics = promptContext.topicsToCircleBack || [];
    // -----------------------------------------------
    // TOPIC THREADING
    // Show current topic and open threads
    // -----------------------------------------------
    if (detectedTopics.length > 0 && circleBackTopics.length > 0) {
        const currentTopic = detectedTopics[0];
        const otherTopics = circleBackTopics.filter((t) => t !== currentTopic);
        if (otherTopics.length > 0) {
            injections.push(createHintInjection('topic_threading', `[TOPICS: Currently discussing "${currentTopic}". Open threads to circle back to: ${otherTopics.join(', ')}]`));
        }
    }
    // -----------------------------------------------
    // TOPIC CHANGE TRANSITIONS
    // If topic changed, suggest natural transition
    // -----------------------------------------------
    const topicWeight = services.getSpeechContext?.()?.topicWeight ?? 'medium';
    // Cast types for compatibility with conversation manager
    const emotionForEnhancements = analysis.emotion;
    const topicChange = conversationManager.getConversationEnhancements(userText, emotionForEnhancements, topicWeight);
    if (topicChange.topicTransition) {
        injections.push(createStandardInjection('topic_transition', `[TOPIC CHANGE: Acknowledge with "${topicChange.topicTransition}"]`));
    }
    // -----------------------------------------------
    // TOPIC THREADING VERIFICATION
    // Make sure we actually circle back to topics
    // -----------------------------------------------
    if (circleBackTopics.length > 0 && turnCount > 5) {
        const recentTurns = services.historyTracker?.getSimpleTurns().slice(-8) || [];
        const recentMessages = recentTurns.map((t) => ({
            role: t.role,
            content: t.content,
        }));
        const threading = verifyTopicThreading(recentMessages, circleBackTopics);
        if (threading.suggestion) {
            injections.push(createStandardInjection('topic_verify', `[TOPIC THREADING: ${threading.suggestion}]`));
        }
    }
    // -----------------------------------------------
    // PROACTIVE GOAL REFERENCE
    // Connect conversation to user's financial goals
    // -----------------------------------------------
    if (userProfile?.goals && userProfile.goals.length > 0) {
        const currentTopic = detectedTopics[0] || userText.slice(0, 50);
        const goalRef = getProactiveGoalReference(userProfile, currentTopic);
        if (goalRef) {
            injections.push(createHintInjection('goal_connection', `[GOAL CONNECTION: ${goalRef}]`));
        }
    }
    return injections;
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder('topics', buildTopicsContext);
export { buildTopicsContext };
//# sourceMappingURL=topics-context.js.map