/**
 * Session Priming
 *
 * Enhanced cross-session continuity that makes returning feel like
 * picking up a conversation with an old friend.
 *
 * Philosophy: When you reconnect with a close friend after time apart,
 * they don't greet you like a stranger. They might ask about that thing
 * you were worried about, reference a joke from last time, or simply
 * show through their warmth that they remember who you are.
 *
 * Session priming gives Ferni the context to do exactly this - naturally
 * and without feeling forced.
 */
import { getLogger } from '../utils/safe-logger.js';
import { getMemoryDecayManager } from './memory-decay.js';
const log = getLogger();
// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================
const DEFAULT_CONFIG = {
    maxOpenThreads: 3,
    maxFollowUps: 2,
    maxSalientMemories: 5,
    staleDays: 30,
    includeSensitiveTopics: true,
};
// ============================================================================
// SESSION PRIMER
// ============================================================================
export class SessionPrimer {
    config;
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Generate complete priming context for a new session
     */
    async generatePrimingContext(profile, memories, recentSummaries) {
        const lastSummary = recentSummaries[0];
        const sessionCount = profile.totalConversations || recentSummaries.length;
        // Calculate days since last session
        const lastSessionGap = lastSummary
            ? Math.floor((Date.now() - lastSummary.timestamp.getTime()) / (1000 * 60 * 60 * 24))
            : 0;
        // Build each component
        const openThreads = this.extractOpenThreads(profile, recentSummaries, memories);
        const pendingFollowUps = this.extractPendingFollowUps(profile, memories);
        const emotionalContext = this.analyzeEmotionalContext(lastSummary, profile);
        const relationshipContext = this.buildRelationshipContext(profile, sessionCount, lastSessionGap);
        const salientMemories = this.selectSalientMemories(memories);
        const sensitiveTopics = this.identifySensitiveTopics(memories, lastSummary);
        const suggestedOpener = this.generateOpener(relationshipContext, emotionalContext, openThreads, pendingFollowUps, profile.name);
        log.info({
            userId: profile.id,
            openThreads: openThreads.length,
            followUps: pendingFollowUps.length,
            sessionGap: lastSessionGap,
            stage: relationshipContext.relationshipStage,
        }, 'Generated session priming context');
        return {
            openThreads,
            pendingFollowUps,
            emotionalContext,
            relationshipContext,
            salientMemories,
            suggestedOpener,
            sensitiveTopics,
        };
    }
    // ============================================================================
    // COMPONENT EXTRACTORS
    // ============================================================================
    /**
     * Extract open threads from profile and recent conversations
     */
    extractOpenThreads(profile, recentSummaries, memories) {
        const threads = [];
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.staleDays);
        // 1. From profile's explicit open threads
        for (const thread of profile.openThreads || []) {
            if (thread.createdAt >= cutoffDate) {
                threads.push({
                    id: thread.id,
                    topic: thread.topic,
                    lastMentioned: thread.createdAt,
                    context: thread.reason,
                    suggestedOpener: thread.suggestedResumption,
                    priority: thread.priority === 'high' ? 'high' : 'medium',
                    emotionalWeight: 0.6,
                });
            }
        }
        // 2. From recent summaries with unresolved questions
        for (const summary of recentSummaries.slice(0, 3)) {
            for (const question of summary.questionsRemaining || []) {
                threads.push({
                    id: `question_${summary.id}`,
                    topic: question,
                    lastMentioned: summary.timestamp,
                    context: `Unresolved question from ${this.formatDate(summary.timestamp)}`,
                    suggestedOpener: `I was thinking about your question: ${question}`,
                    priority: 'medium',
                    emotionalWeight: 0.4,
                });
            }
        }
        // 3. From emotionally significant recent memories
        const emotionalMemories = memories
            .filter((m) => m.emotionalWeight > 0.6 && m.timestamp >= cutoffDate)
            .slice(0, 3);
        for (const memory of emotionalMemories) {
            // Skip if already covered
            if (threads.some((t) => t.topic === memory.topics?.[0] || t.context.includes(memory.content.slice(0, 30)))) {
                continue;
            }
            threads.push({
                id: `emotional_${memory.id}`,
                topic: memory.topics?.[0] || 'something important',
                lastMentioned: memory.timestamp,
                context: memory.content.slice(0, 100),
                suggestedOpener: this.generateEmotionalOpener(memory),
                priority: memory.emotionalWeight > 0.8 ? 'high' : 'medium',
                emotionalWeight: memory.emotionalWeight,
            });
        }
        // Sort by priority and recency
        return threads
            .sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (priorityDiff !== 0)
                return priorityDiff;
            return b.lastMentioned.getTime() - a.lastMentioned.getTime();
        })
            .slice(0, this.config.maxOpenThreads);
    }
    /**
     * Extract pending follow-ups
     */
    extractPendingFollowUps(profile, memories) {
        const followUps = [];
        const now = new Date();
        // 1. From profile's explicit pending follow-ups
        for (const followUp of profile.pendingFollowUps || []) {
            const urgency = this.calculateUrgency(followUp.targetDate, now);
            followUps.push({
                id: `profile_${followUp.topic}`,
                commitment: followUp.reason,
                madeOn: followUp.targetDate,
                dueDate: followUp.targetDate,
                naturalPrompt: `How did things go with ${followUp.topic}?`,
                urgency,
                context: followUp.topic,
            });
        }
        // 2. From memories marked as commitments
        const commitmentMemories = memories.filter((m) => m.commitment && m.type !== 'commitment');
        for (const memory of commitmentMemories.slice(0, 5)) {
            followUps.push({
                id: `memory_${memory.id}`,
                commitment: memory.content.slice(0, 100),
                madeOn: memory.timestamp,
                naturalPrompt: this.generateFollowUpPrompt(memory),
                urgency: 'future',
            });
        }
        // Sort by urgency
        const urgencyOrder = { overdue: 0, due_soon: 1, future: 2 };
        return followUps
            .sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency])
            .slice(0, this.config.maxFollowUps);
    }
    /**
     * Analyze emotional context from last session
     */
    analyzeEmotionalContext(lastSummary, profile) {
        if (!lastSummary) {
            return {
                lastSessionMood: 'neutral',
                sessionEndState: 'neutral',
                suggestedTone: 'warm and welcoming',
                carePoints: [],
            };
        }
        // Parse emotional arc
        const arc = lastSummary.emotionalArc?.toLowerCase() || '';
        let sessionEndState = 'neutral';
        if (arc.includes('ended') && arc.includes('positive')) {
            sessionEndState = 'positive';
        }
        else if (arc.includes('heavy') || arc.includes('difficult')) {
            sessionEndState = 'heavy';
        }
        else if (arc.includes('unresolved') || arc.includes('uncertain')) {
            sessionEndState = 'unresolved';
        }
        // Determine suggested tone
        let suggestedTone = 'warm and present';
        if (sessionEndState === 'heavy') {
            suggestedTone = 'gentle and supportive';
        }
        else if (sessionEndState === 'positive') {
            suggestedTone = 'warm and encouraging';
        }
        else if (sessionEndState === 'unresolved') {
            suggestedTone = 'curious and supportive';
        }
        // Extract care points (things to be mindful of)
        const carePoints = [];
        if (lastSummary.followUpItems) {
            carePoints.push(...lastSummary.followUpItems.slice(0, 2));
        }
        return {
            lastSessionMood: arc.split(',')[0] || 'neutral',
            sessionEndState,
            suggestedTone,
            carePoints,
        };
    }
    /**
     * Build relationship context
     */
    buildRelationshipContext(profile, sessionCount, lastSessionGap) {
        // Determine relationship stage
        let relationshipStage = 'new';
        if (sessionCount >= 20) {
            relationshipStage = 'deep';
        }
        else if (sessionCount >= 10) {
            relationshipStage = 'established';
        }
        else if (sessionCount >= 3) {
            relationshipStage = 'building';
        }
        // Calculate connection strength based on recency and frequency
        let connectionStrength = 0.5;
        // Recency factor
        if (lastSessionGap <= 1) {
            connectionStrength += 0.3;
        }
        else if (lastSessionGap <= 7) {
            connectionStrength += 0.2;
        }
        else if (lastSessionGap <= 30) {
            connectionStrength += 0.1;
        }
        else {
            connectionStrength -= 0.1;
        }
        // Session count factor
        connectionStrength += Math.min(0.2, sessionCount * 0.01);
        // Clamp
        connectionStrength = Math.max(0, Math.min(1, connectionStrength));
        // Known preferences
        const knownPreferences = [
            ...(profile.preferredTopics || []).slice(0, 3),
            ...(profile.communicationStyle ? [profile.communicationStyle] : []),
        ];
        return {
            sessionCount,
            relationshipStage,
            lastSessionGap,
            connectionStrength,
            knownPreferences,
        };
    }
    /**
     * Select most salient memories for potential reference
     */
    selectSalientMemories(memories) {
        const decayManager = getMemoryDecayManager();
        // Score each memory
        const scored = memories.map((memory) => {
            const decayingMemory = decayManager.initializeDecay(memory);
            const decayResult = decayManager.calculateStrength(memory);
            // Combine factors
            let score = decayResult.currentStrength;
            score *= 1 + memory.emotionalWeight; // Boost emotional
            score *= memory.commitment ? 1.5 : 1; // Boost commitments
            return { memory, score };
        });
        // Sort and return top
        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, this.config.maxSalientMemories)
            .map((s) => s.memory);
    }
    /**
     * Identify sensitive topics to avoid
     */
    identifySensitiveTopics(memories, lastSummary) {
        if (!this.config.includeSensitiveTopics) {
            return [];
        }
        const sensitiveTopics = [];
        // Topics with high emotional weight that ended badly
        const heavyMemories = memories.filter((m) => m.emotionalWeight > 0.8);
        // If last session ended heavy, be careful with those topics
        if (lastSummary?.emotionalArc?.includes('heavy')) {
            for (const topic of lastSummary.mainTopics || []) {
                sensitiveTopics.push(topic);
            }
        }
        return [...new Set(sensitiveTopics)].slice(0, 3);
    }
    /**
     * Generate suggested opener based on context
     */
    generateOpener(relationshipContext, emotionalContext, openThreads, pendingFollowUps, userName) {
        const name = userName || '';
        const { relationshipStage, lastSessionGap } = relationshipContext;
        // New user
        if (relationshipStage === 'new') {
            return name
                ? `Hi ${name}! I'm looking forward to getting to know you.`
                : "Hi there! I'm looking forward to getting to know you.";
        }
        // Been a while
        if (lastSessionGap > 14) {
            return name
                ? `${name}! It's good to hear from you again.`
                : "It's good to hear from you again.";
        }
        // Has urgent follow-up
        if (pendingFollowUps.some((f) => f.urgency === 'overdue' || f.urgency === 'due_soon')) {
            const followUp = pendingFollowUps[0];
            return `I've been thinking about you. ${followUp.naturalPrompt}`;
        }
        // Has high-priority open thread
        if (openThreads.some((t) => t.priority === 'high')) {
            const thread = openThreads.find((t) => t.priority === 'high');
            return thread.suggestedOpener;
        }
        // Last session was heavy
        if (emotionalContext.sessionEndState === 'heavy') {
            return name ? `Hey ${name}. How are you doing?` : 'Hey. How are you doing?';
        }
        // Default warm greeting
        const greetings = [
            name ? `Hey ${name}! How's it going?` : "Hey! How's it going?",
            name ? `Good to see you, ${name}.` : 'Good to see you.',
            "What's on your mind?",
        ];
        return greetings[Math.floor(Math.random() * greetings.length)];
    }
    // ============================================================================
    // HELPER METHODS
    // ============================================================================
    calculateUrgency(dueDate, now) {
        const diffDays = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0)
            return 'overdue';
        if (diffDays <= 3)
            return 'due_soon';
        return 'future';
    }
    generateEmotionalOpener(memory) {
        const topic = memory.topics?.[0] || 'something';
        const openers = [
            `I've been thinking about what you shared about ${topic}.`,
            `How are things with ${topic}?`,
            `I wanted to check in about ${topic}.`,
        ];
        return openers[Math.floor(Math.random() * openers.length)];
    }
    generateFollowUpPrompt(memory) {
        const topic = memory.topics?.[0] || 'that';
        return `How did things go with ${topic}?`;
    }
    formatDate(date) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let defaultPrimer = null;
/**
 * Get the default session primer
 */
export function getSessionPrimer(config) {
    if (!defaultPrimer) {
        defaultPrimer = new SessionPrimer(config);
    }
    return defaultPrimer;
}
/**
 * Reset the primer (for testing)
 */
export function resetSessionPrimer() {
    defaultPrimer = null;
}
export default {
    SessionPrimer,
    getSessionPrimer,
    resetSessionPrimer,
};
//# sourceMappingURL=session-priming.js.map