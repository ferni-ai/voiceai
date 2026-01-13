/**
 * Superhuman Intelligence → Proactive Outreach Integration
 *
 * Connects the superhuman intelligence system to proactive outreach,
 * enabling "Better Than Human" follow-ups like:
 * - "How did that interview go?"
 * - "It's been a week since you mentioned wanting to start exercising"
 * - "I've noticed Mondays are hard for you - just checking in"
 *
 * @module @ferni/superhuman-outreach-integration
 */
import { getProactiveMemoryEngine } from '../../conversation/proactive-memory.js';
import { getLogger } from '../../utils/safe-logger.js';
import { addCommitment, addLifeEvent, getUserContext, needsSupport } from './context-aggregator.js';
import { getOutreachDecisionEngine } from './decision-engine.js';
const logger = getLogger();
// ============================================================================
// MEMORY → OUTREACH CONVERSION
// ============================================================================
/**
 * Check if a user has pending memory-based outreach opportunities
 */
export async function checkForMemoryBasedOutreach(userId, sessionId) {
    const triggers = [];
    try {
        const memoryEngine = getProactiveMemoryEngine(sessionId);
        const memories = memoryEngine.getAllMemories();
        const patterns = memoryEngine.getAllPatterns();
        const now = new Date();
        // Check for due follow-ups
        for (const memory of memories) {
            if (!memory.expectedFollowUpAt)
                continue;
            if (memory.surfaced)
                continue; // Already addressed
            const dueDate = new Date(memory.expectedFollowUpAt);
            const daysSinceDue = (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24);
            // If follow-up is due (0-3 days overdue)
            if (daysSinceDue >= 0 && daysSinceDue <= 3) {
                let suggestedMessage = '';
                let priority = 'medium';
                switch (memory.type) {
                    case 'event':
                        suggestedMessage = `Hey! I was thinking about you - how did ${memory.content} go?`;
                        priority = memory.wasVulnerable ? 'high' : 'medium';
                        break;
                    case 'goal':
                        suggestedMessage = `Just checking in - how's ${memory.content} coming along?`;
                        priority = 'medium';
                        break;
                    case 'struggle':
                        suggestedMessage = `I've been thinking about what you shared about ${memory.content}. How are you doing with that?`;
                        priority = 'high';
                        break;
                }
                if (suggestedMessage) {
                    triggers.push({
                        type: 'memory_followup',
                        userId,
                        content: memory.content,
                        priority,
                        suggestedMessage,
                        reason: `Follow-up due for ${memory.type}: ${memory.content}`,
                        source: 'proactive_memory',
                    });
                }
            }
        }
        // Check for pattern-based outreach
        for (const pattern of patterns) {
            if (pattern.acknowledged)
                continue;
            if (pattern.confidence < 0.6)
                continue;
            // For temporal patterns (e.g., "Mondays are hard")
            if (pattern.type === 'temporal') {
                const dayMatch = pattern.description.match(/(\w+)days? (tend to be|often|seem)/i);
                if (dayMatch) {
                    const dayName = dayMatch[1];
                    const dayMap = {
                        sunday: 0,
                        monday: 1,
                        tuesday: 2,
                        wednesday: 3,
                        thursday: 4,
                        friday: 5,
                        saturday: 6,
                    };
                    const targetDay = dayMap[dayName?.toLowerCase() || ''];
                    const currentDay = now.getDay();
                    // If it's that day or the day before, consider reaching out
                    if (targetDay !== undefined &&
                        (currentDay === targetDay || (currentDay + 1) % 7 === targetDay)) {
                        triggers.push({
                            type: 'pattern_acknowledgment',
                            userId,
                            content: pattern.description,
                            priority: 'low',
                            suggestedMessage: `Hey, I know ${dayName}s can be tough for you. Just wanted you to know I'm here if you need anything.`,
                            reason: `Pattern-based check-in: ${pattern.description}`,
                            source: 'pattern_detection',
                        });
                    }
                }
            }
            // For emotional cycles
            if (pattern.type === 'emotional_cycle') {
                triggers.push({
                    type: 'pattern_acknowledgment',
                    userId,
                    content: pattern.description,
                    priority: 'low',
                    suggestedMessage: `Thinking of you today. How are you really doing?`,
                    reason: `Emotional cycle check-in`,
                    source: 'pattern_detection',
                });
            }
        }
        logger.debug({ userId, triggerCount: triggers.length }, '🧠 Checked for memory-based outreach triggers');
        return triggers;
    }
    catch (error) {
        logger.warn({ userId, error }, 'Failed to check for memory-based outreach');
        return [];
    }
}
/**
 * Convert superhuman trigger to outreach system trigger
 * Returns partial trigger - id and createdAt are added by the decision engine
 */
export function convertToOutreachTrigger(trigger) {
    const priorityMap = {
        low: 'low',
        medium: 'medium',
        high: 'high',
        urgent: 'urgent',
    };
    const typeMap = {
        memory_followup: 'commitment_check',
        pattern_acknowledgment: 'check_in',
        concern_checkin: 'emotional_support',
        milestone: 'celebration',
    };
    return {
        type: typeMap[trigger.type],
        userId: trigger.userId,
        priority: priorityMap[trigger.priority],
        reason: trigger.reason,
        context: {
            suggestedMessage: trigger.suggestedMessage,
            source: trigger.source,
        },
    };
}
/**
 * Sync superhuman memories to outreach context
 */
export async function syncMemoriesToOutreachContext(userId, sessionId) {
    try {
        const memoryEngine = getProactiveMemoryEngine(sessionId);
        const memories = memoryEngine.getAllMemories();
        for (const memory of memories) {
            switch (memory.type) {
                case 'event':
                    if (memory.expectedFollowUpAt) {
                        addLifeEvent(userId, {
                            type: 'other',
                            description: memory.content,
                            date: memory.expectedFollowUpAt,
                            importance: memory.emotionalWeight === 'heavy' ? 'high' : 'medium',
                        });
                    }
                    break;
                case 'goal':
                    addCommitment(userId, {
                        what: memory.content,
                        when: memory.expectedFollowUpAt || new Date(),
                        status: 'pending',
                        createdAt: memory.mentionedAt,
                    });
                    break;
                case 'struggle': {
                    // Struggles inform emotional support decisions
                    const context = getUserContext(userId);
                    if (!context.progress.currentStruggles.some((s) => s.description === memory.content)) {
                        // Add to struggles (this is handled by context aggregator)
                        logger.debug({ userId, struggle: memory.content }, 'Synced struggle to outreach context');
                    }
                    break;
                }
            }
        }
        logger.info({ userId, memoryCount: memories.length }, '🧠 Synced memories to outreach context');
    }
    catch (error) {
        logger.warn({ userId, error }, 'Failed to sync memories to outreach context');
    }
}
/**
 * Process superhuman concern for potential outreach
 */
export async function processConcernForOutreach(userId, concernLevel, concernType) {
    if (concernLevel === 'none' || concernLevel === 'mild') {
        return null;
    }
    // Check if they might need support
    const userNeedsSupport = needsSupport(userId);
    if (concernLevel === 'crisis') {
        return {
            type: 'concern_checkin',
            userId,
            content: concernType,
            priority: 'urgent',
            suggestedMessage: `Hey, I've been thinking about you. I wanted to reach out and see how you're doing. I'm here if you want to talk.`,
            reason: `Elevated concern detected: ${concernType}`,
            source: 'concern_detection',
        };
    }
    if (concernLevel === 'elevated' || (concernLevel === 'moderate' && userNeedsSupport)) {
        return {
            type: 'concern_checkin',
            userId,
            content: concernType,
            priority: concernLevel === 'elevated' ? 'high' : 'medium',
            suggestedMessage: `Just thinking of you. How are you holding up?`,
            reason: `Concern level: ${concernLevel}, type: ${concernType}`,
            source: 'concern_detection',
        };
    }
    return null;
}
/**
 * Schedule outreach based on superhuman insights
 */
export async function scheduleSuperhunmanOutreach(triggers) {
    const decisionEngine = getOutreachDecisionEngine();
    for (const trigger of triggers) {
        try {
            const outreachTrigger = convertToOutreachTrigger(trigger);
            // The decision engine will evaluate if/when to actually reach out
            decisionEngine.addTrigger(outreachTrigger);
            logger.debug({ userId: trigger.userId, type: trigger.type }, '🧠 Superhuman outreach trigger evaluated');
        }
        catch (error) {
            logger.warn({ trigger, error }, 'Failed to schedule superhuman outreach');
        }
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export const superhumanOutreach = {
    checkForMemoryBasedOutreach,
    convertToOutreachTrigger,
    syncMemoriesToOutreachContext,
    processConcernForOutreach,
    scheduleSuperhunmanOutreach,
};
//# sourceMappingURL=superhuman-outreach-integration.js.map