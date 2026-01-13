/**
 * Cross-Session Threader
 *
 * Tracks conversation threads that span multiple sessions.
 * Jack remembers unfinished discussions and can naturally continue them.
 *
 * Example: "Last time you were telling me about your mother's health
 * situation - we got cut off. Want to continue that conversation?"
 *
 * Features:
 * - Open thread detection (unfinished topics)
 * - Interrupted conversation tracking
 * - Topic continuity suggestions
 * - Follow-up question tracking
 * - Story/advice that was promised but not delivered
 */
import { getLogger } from '../../utils/safe-logger.js';
// ============================================================================
// CROSS-SESSION THREADER
// ============================================================================
export class CrossSessionThreader {
    userId;
    openThreads = [];
    promisedFollowUps = [];
    currentSessionId = null;
    constructor(userId, existingThreads, existingFollowUps) {
        this.userId = userId;
        if (existingThreads) {
            this.openThreads = existingThreads;
        }
        if (existingFollowUps) {
            this.promisedFollowUps = existingFollowUps;
        }
    }
    /**
     * Set the current session ID
     */
    setCurrentSession(sessionId) {
        this.currentSessionId = sessionId;
    }
    // ============================================================================
    // THREAD DETECTION
    // ============================================================================
    /**
     * Detect open threads when a session ends
     */
    detectOpenThreads(endContext) {
        const newThreads = [];
        // 1. Check for interrupted conversation
        if (!endContext.endedNaturally && endContext.lastTopic) {
            const thread = this.createThread({
                topic: endContext.lastTopic,
                reason: 'interrupted',
                reasonDetail: 'Conversation ended unexpectedly',
                emotionalWeight: this.inferEmotionalWeight(endContext.emotionalState),
                priority: 'high',
                summary: `Discussing ${endContext.lastTopic} when connection ended`,
            });
            newThreads.push(thread);
        }
        // 2. Check for time constraints
        if (endContext.durationMinutes < 5 && endContext.topicsDiscussed.length > 0) {
            const thread = this.createThread({
                topic: endContext.topicsDiscussed[0],
                reason: 'time_constraint',
                reasonDetail: 'Very short conversation',
                emotionalWeight: 'light',
                priority: 'medium',
                summary: `Brief discussion about ${endContext.topicsDiscussed[0]}`,
            });
            newThreads.push(thread);
        }
        // 3. Check for unanswered questions
        if (endContext.openQuestions.length > 0) {
            for (const question of endContext.openQuestions.slice(0, 3)) {
                const thread = this.createThread({
                    topic: this.extractTopicFromQuestion(question),
                    reason: 'unanswered_question',
                    reasonDetail: question,
                    emotionalWeight: 'light',
                    priority: 'medium',
                    summary: `Question about: ${question.slice(0, 50)}...`,
                    questionsToAnswer: [question],
                });
                newThreads.push(thread);
            }
        }
        // 4. Check for emotional topics that need follow-up
        if (endContext.emotionalState === 'distressed' ||
            endContext.emotionalState === 'anxious' ||
            endContext.emotionalState === 'sad') {
            const thread = this.createThread({
                topic: endContext.lastTopic || 'emotional support',
                reason: 'emotional_pause',
                reasonDetail: `User was ${endContext.emotionalState}`,
                emotionalWeight: 'heavy',
                priority: 'high',
                summary: `Important emotional discussion about ${endContext.lastTopic || 'personal matters'}`,
            });
            newThreads.push(thread);
        }
        // 5. Check for promised follow-ups
        if (endContext.jackPromisedFollowUp || endContext.userRequestedFollowUp) {
            const thread = this.createThread({
                topic: endContext.lastTopic || 'follow-up',
                reason: endContext.jackPromisedFollowUp ? 'promised_followup' : 'user_requested',
                emotionalWeight: 'medium',
                priority: 'medium',
                summary: 'Follow-up was requested or promised',
            });
            newThreads.push(thread);
        }
        // Add new threads
        for (const thread of newThreads) {
            this.openThreads.push(thread);
        }
        // Keep only last 20 open threads
        this.openThreads = this.openThreads.filter((t) => t.status === 'open').slice(-20);
        getLogger().info({
            newThreads: newThreads.length,
            totalOpen: this.openThreads.filter((t) => t.status === 'open').length,
        }, 'Open threads detected');
        return newThreads;
    }
    /**
     * Create a thread record
     */
    createThread(params) {
        const suggestedResumption = this.generateResumptionMessage(params.topic, params.reason);
        return {
            id: `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            createdAt: new Date(),
            lastUpdatedAt: new Date(),
            topic: params.topic,
            subtopics: [],
            summary: params.summary,
            reason: params.reason,
            reasonDetail: params.reasonDetail,
            emotionalWeight: params.emotionalWeight,
            priority: params.priority,
            suggestedResumption,
            questionsToAnswer: params.questionsToAnswer || [],
            promisedContent: params.promisedContent || [],
            status: 'open',
            sessionIdCreated: this.currentSessionId || 'unknown',
            conversationTurnCount: 0,
            relatedGoalIds: [],
            relatedKeyMomentIds: [],
        };
    }
    /**
     * Generate a natural message to resume a thread
     */
    generateResumptionMessage(topic, reason) {
        switch (reason) {
            case 'interrupted':
                return `Last time, we were in the middle of talking about ${topic} when we got cut off. Want to pick up where we left off?`;
            case 'time_constraint':
                return `I know we were rushed last time. You mentioned ${topic} - did you want to dig into that more?`;
            case 'unanswered_question':
                return `You asked me something about ${topic} last time that I don't think I fully answered. Let me address that.`;
            case 'emotional_pause':
                return `I've been thinking about what you shared last time about ${topic}. How are you feeling about that now?`;
            case 'promised_followup':
                return `I mentioned I'd follow up on ${topic} - let me do that now.`;
            case 'user_requested':
                return `You wanted to continue our discussion about ${topic}. I'm all ears.`;
            case 'incomplete_advice':
                return `I started to give you some thoughts on ${topic} but didn't finish. Let me continue.`;
            case 'topic_shifted':
                return `Before we moved on last time, we were discussing ${topic}. Did you want to go back to that?`;
            default:
                return `I remember we were discussing ${topic}. Want to continue that conversation?`;
        }
    }
    /**
     * Infer emotional weight from state
     */
    inferEmotionalWeight(emotionalState) {
        const heavy = ['distressed', 'anxious', 'sad', 'grief', 'angry', 'scared'];
        const medium = ['concerned', 'worried', 'frustrated', 'uncertain', 'confused'];
        if (heavy.includes(emotionalState.toLowerCase()))
            return 'heavy';
        if (medium.includes(emotionalState.toLowerCase()))
            return 'medium';
        return 'light';
    }
    /**
     * Extract topic from a question
     */
    extractTopicFromQuestion(question) {
        // Simple extraction - take key nouns
        const cleaned = question
            .toLowerCase()
            .replace(/^(what|how|why|when|where|can|should|is|are|do|does)\s+/i, '')
            .replace(/\?$/, '')
            .trim();
        // Take first meaningful phrase
        const words = cleaned.split(' ').slice(0, 5);
        return words.join(' ');
    }
    // ============================================================================
    // THREAD MANAGEMENT
    // ============================================================================
    /**
     * Get open threads sorted by priority
     */
    getOpenThreads() {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return this.openThreads
            .filter((t) => t.status === 'open')
            .sort((a, b) => {
            // First by priority
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (priorityDiff !== 0)
                return priorityDiff;
            // Then by emotional weight
            const weightOrder = { heavy: 0, medium: 1, light: 2 };
            return weightOrder[a.emotionalWeight] - weightOrder[b.emotionalWeight];
        });
    }
    /**
     * Get the most important thread to resume
     */
    getTopThread() {
        const open = this.getOpenThreads();
        return open[0] || null;
    }
    /**
     * Mark a thread as resumed
     */
    resumeThread(threadId) {
        const thread = this.openThreads.find((t) => t.id === threadId);
        if (thread) {
            thread.status = 'resumed';
            thread.sessionIdResumed = this.currentSessionId || undefined;
            thread.lastUpdatedAt = new Date();
            getLogger().info({ threadId, topic: thread.topic }, 'Thread resumed');
        }
    }
    /**
     * Mark a thread as closed
     */
    closeThread(threadId) {
        const thread = this.openThreads.find((t) => t.id === threadId);
        if (thread) {
            thread.status = 'closed';
            thread.lastUpdatedAt = new Date();
            getLogger().info({ threadId, topic: thread.topic }, 'Thread closed');
        }
    }
    /**
     * Add a promised follow-up
     */
    addPromisedFollowUp(type, description, context, targetTimeframe) {
        const followUp = {
            id: `followup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            createdAt: new Date(),
            type,
            description,
            context,
            targetTimeframe,
            delivered: false,
        };
        this.promisedFollowUps.push(followUp);
        // Keep only last 20 follow-ups
        if (this.promisedFollowUps.length > 20) {
            this.promisedFollowUps = this.promisedFollowUps.slice(-20);
        }
        getLogger().info({ type, description: description.slice(0, 50) }, 'Promised follow-up recorded');
        return followUp;
    }
    /**
     * Mark a follow-up as delivered
     */
    markFollowUpDelivered(followUpId) {
        const followUp = this.promisedFollowUps.find((f) => f.id === followUpId);
        if (followUp) {
            followUp.delivered = true;
            followUp.deliveredAt = new Date();
        }
    }
    /**
     * Get undelivered follow-ups
     */
    getUndeliveredFollowUps() {
        return this.promisedFollowUps.filter((f) => !f.delivered);
    }
    // ============================================================================
    // CONTEXT GENERATION
    // ============================================================================
    /**
     * Get thread context for prompt injection
     */
    getThreadContext() {
        const openThreads = this.getOpenThreads();
        const pendingFollowUps = this.getUndeliveredFollowUps();
        if (openThreads.length === 0 && pendingFollowUps.length === 0) {
            return '';
        }
        const lines = [];
        // Open threads
        if (openThreads.length > 0) {
            const top = openThreads[0];
            lines.push(`📌 OPEN THREAD: ${top.topic}`);
            lines.push(`   Reason: ${top.reason.replace('_', ' ')}`);
            lines.push(`   Suggested: "${top.suggestedResumption}"`);
            if (openThreads.length > 1) {
                lines.push(`   (${openThreads.length - 1} more open threads)`);
            }
        }
        // Pending follow-ups
        if (pendingFollowUps.length > 0) {
            const top = pendingFollowUps[0];
            lines.push(`📝 PROMISED: ${top.type} - ${top.description.slice(0, 50)}...`);
        }
        return `[CONVERSATION THREADS]\n${lines.join('\n')}`;
    }
    /**
     * Get a natural conversation starter if there are open threads
     */
    getConversationStarter() {
        const topThread = this.getTopThread();
        if (topThread) {
            return topThread.suggestedResumption;
        }
        const pendingFollowUp = this.getUndeliveredFollowUps()[0];
        if (pendingFollowUp) {
            return `I wanted to follow up on something - ${pendingFollowUp.description}`;
        }
        return null;
    }
    // ============================================================================
    // DATA ACCESS
    // ============================================================================
    /**
     * Get all data for persistence
     */
    getAllData() {
        return {
            threads: [...this.openThreads],
            followUps: [...this.promisedFollowUps],
        };
    }
    /**
     * Get stats
     */
    getStats() {
        return {
            openThreads: this.openThreads.filter((t) => t.status === 'open').length,
            resumedThreads: this.openThreads.filter((t) => t.status === 'resumed').length,
            closedThreads: this.openThreads.filter((t) => t.status === 'closed').length,
            pendingFollowUps: this.promisedFollowUps.filter((f) => !f.delivered).length,
            deliveredFollowUps: this.promisedFollowUps.filter((f) => f.delivered).length,
        };
    }
}
// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================
const threaders = new Map();
export function getCrossSessionThreader(userId, existingThreads, existingFollowUps) {
    let threader = threaders.get(userId);
    if (!threader) {
        threader = new CrossSessionThreader(userId, existingThreads, existingFollowUps);
        threaders.set(userId, threader);
    }
    return threader;
}
export function removeCrossSessionThreader(userId) {
    threaders.delete(userId);
}
export default CrossSessionThreader;
//# sourceMappingURL=cross-session.js.map