/**
 * Shared Content Injector
 *
 * Provides runtime access to shared persona content for injection into
 * prompts and responses. This makes the team dynamics, relationship building,
 * and life event content actually get used.
 */
import { generateHandoffSummary, getCasualMention, getHandoffWarmth, getOpinionAbout, getTeamSuggestion, } from './team-dynamics.js';
import { getAcknowledgment, getDeepeningQuestion, getNameUsage, getStageClosing, getStageGreeting, shouldSharePersonalStory, } from './relationship-building.js';
import { getMilestoneMessage, getTimeBasedGreeting, isMilestoneConversation, } from './welcome-back.js';
import { findEventsToAcknowledge, generateEventAcknowledgment, getUpcomingEventMention, } from './life-events.js';
// ============================================================================
// SIMPLE WELCOME BACK GENERATION (doesn't need full UserProfile)
// ============================================================================
function simpleWelcomeBack(daysSinceLastContact, userName, lastSummary) {
    const name = userName ? `${userName}! ` : '';
    if (daysSinceLastContact === 0) {
        return `${name}Back so soon! <break time=\"200ms\"/>What's going on?`;
    }
    else if (daysSinceLastContact === 1) {
        return `${name}Good to see you again! <break time=\"200ms\"/>How's it going?`;
    }
    else if (daysSinceLastContact <= 7) {
        return `${name}Hey! <break time=\"200ms\"/>It's been a few days. <break time=\"150ms\"/>What's on your mind?`;
    }
    else if (daysSinceLastContact <= 30) {
        const intro = `${name}Welcome back! <break time=\"200ms\"/>It's been a little while.`;
        if (lastSummary) {
            return `${intro} <break time=\"150ms\"/>Last time we talked about ${lastSummary}. <break time=\"200ms\"/>How'd that go?`;
        }
        return intro;
    }
    else {
        return `${name}It's great to see you again! <break time=\"200ms\"/>It's been a while. <break time=\"150ms\"/>What's new?`;
    }
}
// ============================================================================
// MAIN INJECTOR FUNCTION
// ============================================================================
/**
 * Generate all applicable shared content for a conversation turn
 */
export function injectSharedContent(context, options) {
    const result = {};
    const { userName, relationshipStage, conversationCount, daysSinceLastContact } = context;
    // ========== GREETING CONTENT ==========
    if (options?.isGreeting) {
        // Welcome back for returning users
        if (conversationCount && conversationCount > 1 && daysSinceLastContact !== undefined) {
            const welcome = simpleWelcomeBack(daysSinceLastContact, userName, context.lastConversationSummary);
            if (welcome) {
                result.greeting = welcome;
            }
        }
        // Stage-appropriate greeting (if no welcome back)
        if (relationshipStage && !result.greeting) {
            const stageGreeting = getStageGreeting(relationshipStage);
            if (stageGreeting) {
                result.greeting = userName ? stageGreeting.replace('{name}', userName) : stageGreeting;
            }
        }
        // Add time-based greeting if nothing else
        if (!result.greeting && daysSinceLastContact !== undefined) {
            result.greeting = getTimeBasedGreeting(daysSinceLastContact, userName);
        }
        // Milestone conversation (10th, 25th, 50th, etc.)
        if (conversationCount && isMilestoneConversation(conversationCount)) {
            const milestone = getMilestoneMessage(conversationCount);
            if (milestone) {
                result.greeting = result.greeting ? `${result.greeting} ${milestone}` : milestone;
            }
        }
    }
    // ========== TEAM CONTEXT (HANDOFFS) ==========
    if (options?.isHandoff && context.previousPersona) {
        // What to say when receiving a handoff
        const warmth = getHandoffWarmth('from', context.previousPersona);
        if (warmth) {
            result.teamContext = warmth;
        }
    }
    else if (options?.mentionTeammate) {
        // Casual mention of a teammate
        const mention = getCasualMention(options.mentionTeammate);
        if (mention) {
            result.teamContext = mention;
        }
    }
    // ========== RELATIONSHIP CONTEXT ==========
    if (relationshipStage) {
        // Deepening question (occasionally)
        if (Math.random() < 0.2) {
            // 20% chance
            const question = getDeepeningQuestion(relationshipStage);
            if (question) {
                result.relationshipContext = question;
            }
        }
    }
    // ========== LIFE EVENT ACKNOWLEDGMENT ==========
    if (context.lifeEvents && context.lifeEvents.length > 0) {
        const eventsToAck = findEventsToAcknowledge(context.lifeEvents);
        if (eventsToAck.length > 0) {
            // Acknowledge the most relevant event
            const ack = generateEventAcknowledgment(eventsToAck[0]);
            if (ack) {
                result.lifeEventAcknowledgment = ack;
            }
        }
        else {
            // Check for upcoming events to mention
            const upcoming = context.lifeEvents.find((e) => {
                const days = Math.ceil((new Date(e.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return days > 0 && days <= 14;
            });
            if (upcoming) {
                const mention = getUpcomingEventMention(upcoming);
                if (mention) {
                    result.lifeEventAcknowledgment = mention;
                }
            }
        }
    }
    // ========== CLOSING CONTENT ==========
    if (options?.isClosing && relationshipStage) {
        const closing = getStageClosing(relationshipStage);
        if (closing) {
            result.closingContent = userName ? closing.replace('{name}', userName) : closing;
        }
    }
    return result;
}
// ============================================================================
// SPECIFIC CONTENT GETTERS
// ============================================================================
/**
 * Get what a persona should say about a teammate
 */
export function getTeammateOpinion(fromPersona, aboutPersona) {
    return getOpinionAbout(fromPersona, aboutPersona);
}
/**
 * Get a suggestion to bring in a teammate
 */
export function suggestTeammate(persona) {
    return getTeamSuggestion(persona);
}
/**
 * Generate handoff context for passing to next persona
 */
export function createHandoffContext(fromPersona, toPersona, topicsDiscussed, currentGoal, emotionalState, keyPoints = []) {
    const context = {
        fromPersona,
        toPersona,
        topicsDiscussed,
        currentGoal,
        emotionalState,
        keyPointsToKnow: keyPoints,
    };
    return generateHandoffSummary(context);
}
/**
 * Get appropriate acknowledgment for user's situation
 */
export function acknowledgeUser(situation) {
    return getAcknowledgment(situation);
}
/**
 * Get name usage for personalization
 */
export function getPersonalizedNameUsage(name, context) {
    return getNameUsage(name, context);
}
/**
 * Check if a personal story should be shared
 */
export function shouldTellStory(stage, storyWeight) {
    return shouldSharePersonalStory(stage, storyWeight);
}
/**
 * Get time-appropriate greeting
 * @param daysSince - Days since last contact (0 = same day)
 * @param name - Optional user name
 */
export function getTimeGreeting(daysSince = 0, name) {
    return getTimeBasedGreeting(daysSince, name);
}
// ============================================================================
// PROMPT INJECTION HELPERS
// ============================================================================
/**
 * Format injected content for prompt
 */
export function formatForPrompt(content) {
    const sections = [];
    if (content.greeting) {
        sections.push(`[GREETING SUGGESTION]\n${content.greeting}`);
    }
    if (content.teamContext) {
        sections.push(`[TEAM CONTEXT]\n${content.teamContext}`);
    }
    if (content.relationshipContext) {
        sections.push(`[RELATIONSHIP]\n${content.relationshipContext}`);
    }
    if (content.lifeEventAcknowledgment) {
        sections.push(`[ACKNOWLEDGE]\n${content.lifeEventAcknowledgment}`);
    }
    if (content.callbackContent) {
        sections.push(`[CALLBACK]\n${content.callbackContent}`);
    }
    if (content.closingContent) {
        sections.push(`[CLOSING]\n${content.closingContent}`);
    }
    return sections.join('\n\n');
}
export default injectSharedContent;
//# sourceMappingURL=content-injector.js.map