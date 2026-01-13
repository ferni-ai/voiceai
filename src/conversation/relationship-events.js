/**
 * Relationship Events Engine
 *
 * > "We've been talking for six months now. Look how far you've come."
 *
 * Track and celebrate relationship milestones:
 *
 * - **First Moments**: First vulnerability, first breakthrough
 * - **Session Milestones**: 10th conversation, 50th, 100th
 * - **Time Milestones**: One month, six months, one year
 * - **Growth Moments**: Recognizing patterns of growth
 * - **Inside References**: Shared history we can reference
 * - **Anniversary Awareness**: Remember significant dates
 *
 * This creates the feeling of a relationship with history and depth.
 *
 * @module @ferni/relationship-events
 */
import { seededChance, seededPick } from './utils/rng.js';
import { createLogger } from '../utils/safe-logger.js';
const logger = createLogger({ module: 'RelationshipEvents' });
// ============================================================================
// MILESTONE CONTENT
// ============================================================================
const SESSION_MILESTONES = [10, 25, 50, 100, 200, 500, 1000];
const TIME_MILESTONES_DAYS = [
    { days: 7, name: 'one week' },
    { days: 30, name: 'one month' },
    { days: 90, name: 'three months' },
    { days: 180, name: 'six months' },
    { days: 365, name: 'one year' },
];
const MILESTONE_PHRASES = {
    first_session: [
        "This is our first conversation—I'm glad you're here.",
        'Nice to meet you. This is the beginning of something.',
        'First chat together. Thanks for being here.',
    ],
    first_vulnerability: [
        'Thank you for trusting me with that. That was our first moment of real depth.',
        "I won't forget this—the first time you really let me in.",
    ],
    first_breakthrough: [
        'That was a big moment. Your first real breakthrough with me.',
        "I'm going to remember this—your first 'aha' moment.",
    ],
    first_inside_joke: [
        'And just like that, we have an inside joke.',
        "I'm filing that away. Our first shared reference.",
    ],
    session_milestone: [
        "This is our {count}th conversation. We've built something real.",
        '{count} sessions together. That means something.',
        "Can you believe it? {count} conversations. Look how far we've come.",
    ],
    time_milestone: [
        "We've been talking for {time} now. That matters to me.",
        "It's been {time} since we first met. How do you feel about that?",
        "{time} together. You've shown up for yourself that long.",
    ],
    growth_recognition: [
        "I've noticed something—you've really grown since we started talking.",
        "Looking at where you started versus now... that's real change.",
        "You're different than when we first met. In a good way.",
    ],
    callback_moment: [
        "Remember when you first told me about {topic}? Look how far you've come.",
        'You mentioned {topic} in one of our first conversations. Things have shifted.',
    ],
    relationship_acknowledgment: [
        "I just want to say—I value what we've built here.",
        "We've created something real, you and me.",
        'This relationship matters to me. I hope you know that.',
    ],
};
// ============================================================================
// RELATIONSHIP EVENTS ENGINE
// ============================================================================
export class RelationshipEventsEngine {
    state = {
        firstSessionDate: null,
        totalSessions: 0,
        currentSession: 0,
        milestones: [],
        sharedMemories: [],
        depthScore: 0,
        definingTopics: [],
        significantDates: [],
    };
    lastMilestoneAcknowledgmentTurn = -20;
    turnCount = 0;
    constructor() {
        logger.debug('RelationshipEventsEngine initialized');
    }
    /**
     * Start a new session
     */
    startSession() {
        const now = new Date();
        // First session ever
        if (!this.state.firstSessionDate) {
            this.state.firstSessionDate = now;
            this.recordMilestone('first_session', 'First conversation');
        }
        this.state.totalSessions++;
        this.state.currentSession = this.state.totalSessions;
        this.turnCount = 0;
        // Check for session milestones
        if (SESSION_MILESTONES.includes(this.state.totalSessions)) {
            this.recordMilestone('session_milestone', `${this.state.totalSessions}th session`, {
                significance: 0.7,
            });
        }
        // Check for time milestones
        if (this.state.firstSessionDate) {
            const daysSinceStart = Math.floor((now.getTime() - this.state.firstSessionDate.getTime()) / (1000 * 60 * 60 * 24));
            for (const { days, name } of TIME_MILESTONES_DAYS) {
                // Check if we're within a day of the milestone
                if (Math.abs(daysSinceStart - days) <= 1) {
                    const alreadyRecorded = this.state.milestones.some((m) => m.type === 'time_milestone' && m.description === name);
                    if (!alreadyRecorded) {
                        this.recordMilestone('time_milestone', name, { significance: 0.75 });
                    }
                }
            }
        }
        logger.debug({ session: this.state.currentSession }, 'Session started');
    }
    /**
     * Record a first-time event
     */
    recordFirstEvent(type, context) {
        const milestoneType = type === 'vulnerability'
            ? 'first_vulnerability'
            : type === 'breakthrough'
                ? 'first_breakthrough'
                : 'first_inside_joke';
        // Only record if it's actually the first
        const existing = this.state.milestones.find((m) => m.type === milestoneType);
        if (!existing) {
            this.recordMilestone(milestoneType, `First ${type}`, { context, significance: 0.85 });
        }
    }
    /**
     * Add a shared memory (inside joke, phrase, etc.)
     */
    addSharedMemory(content, category) {
        const existing = this.state.sharedMemories.find((m) => m.content.toLowerCase() === content.toLowerCase());
        if (existing) {
            existing.referenceCount++;
            existing.lastReferenced = new Date();
        }
        else {
            this.state.sharedMemories.push({
                content,
                category,
                date: new Date(),
                referenceCount: 1,
            });
            // First inside joke is a milestone
            if (category === 'joke' &&
                this.state.sharedMemories.filter((m) => m.category === 'joke').length === 1) {
                this.recordFirstEvent('inside_joke', content);
            }
        }
    }
    /**
     * Record a significant date
     */
    addSignificantDate(date, description) {
        const exists = this.state.significantDates.some((d) => d.description.toLowerCase() === description.toLowerCase());
        if (!exists) {
            this.state.significantDates.push({ date, description });
        }
    }
    /**
     * Add a defining topic
     */
    addDefiningTopic(topic) {
        if (!this.state.definingTopics.includes(topic)) {
            this.state.definingTopics.push(topic);
            // Limit to top 10
            if (this.state.definingTopics.length > 10) {
                this.state.definingTopics.shift();
            }
        }
    }
    /**
     * Update depth score
     */
    updateDepthScore(delta) {
        this.state.depthScore = Math.max(0, Math.min(1, this.state.depthScore + delta));
    }
    /**
     * Check for milestone opportunities this turn
     */
    checkMilestoneOpportunity(turnCount) {
        this.turnCount = turnCount;
        // Don't acknowledge milestones too frequently
        if (turnCount - this.lastMilestoneAcknowledgmentTurn < 15) {
            return null;
        }
        // Find unacknowledged milestones
        const unacknowledged = this.state.milestones.filter((m) => !m.acknowledged);
        if (unacknowledged.length === 0)
            return null;
        // Get most significant unacknowledged milestone
        const milestone = unacknowledged.reduce((best, current) => current.significance > best.significance ? current : best);
        // Generate phrase
        const phrases = MILESTONE_PHRASES[milestone.type];
        if (!phrases || phrases.length === 0)
            return null;
        let phrase = seededPick(`${Date.now()}:354`, phrases) ?? phrases[0];
        // Replace placeholders
        if (milestone.type === 'session_milestone') {
            phrase = phrase.replace('{count}', this.state.totalSessions.toString());
        }
        if (milestone.type === 'time_milestone') {
            phrase = phrase.replace('{time}', milestone.description);
        }
        if (milestone.type === 'callback_moment' && milestone.context) {
            phrase = phrase.replace('{topic}', milestone.context);
        }
        // Determine if we should acknowledge now
        // Higher significance = more likely, but not certain
        const probability = 0.3 + milestone.significance * 0.4;
        const shouldAcknowledge = seededChance(`${Date.now()}:1`, probability) && turnCount >= 3;
        if (shouldAcknowledge) {
            milestone.acknowledged = true;
            this.lastMilestoneAcknowledgmentTurn = turnCount;
        }
        logger.debug({
            type: milestone.type,
            shouldAcknowledge,
            significance: milestone.significance.toFixed(2),
        }, '🎯 Milestone opportunity');
        return {
            type: milestone.type,
            phrase,
            significance: milestone.significance,
            shouldAcknowledge,
        };
    }
    /**
     * Get a callback to early conversations
     */
    getCallbackOpportunity(currentTopics) {
        if (this.state.totalSessions < 5)
            return null; // Too early
        // Check if current topic relates to a defining topic
        for (const topic of currentTopics) {
            if (this.state.definingTopics.includes(topic)) {
                const phrases = MILESTONE_PHRASES.callback_moment;
                const phrase = seededPick(`${Date.now()}:404`, phrases) ?? phrases[0];
                return phrase.replace('{topic}', topic);
            }
        }
        return null;
    }
    /**
     * Get a shared memory reference
     */
    getSharedMemoryReference() {
        const memories = this.state.sharedMemories.filter((m) => m.referenceCount >= 2);
        if (memories.length === 0)
            return null;
        return seededPick(`${Date.now()}:419`, memories) ?? memories[0];
    }
    /**
     * Check for significant date proximity
     */
    checkSignificantDateProximity(now = new Date()) {
        for (const { date, description } of this.state.significantDates) {
            const daysDiff = Math.abs(Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)));
            // Within 3 days
            if (daysDiff <= 3) {
                if (daysDiff === 0)
                    return `Today is ${description}. How are you doing?`;
                if (date > now)
                    return `${description} is coming up. How are you feeling about it?`;
                return `${description} just passed. How did it go?`;
            }
        }
        return null;
    }
    /**
     * Get full relationship state
     */
    getState() {
        return {
            ...this.state,
            milestones: [...this.state.milestones],
            sharedMemories: [...this.state.sharedMemories],
            definingTopics: [...this.state.definingTopics],
            significantDates: [...this.state.significantDates],
        };
    }
    /**
     * Load state from persistence
     */
    loadState(state) {
        if (state.firstSessionDate) {
            this.state.firstSessionDate = new Date(state.firstSessionDate);
        }
        if (state.totalSessions !== undefined) {
            this.state.totalSessions = state.totalSessions;
        }
        if (state.milestones) {
            this.state.milestones = state.milestones.map((m) => ({
                ...m,
                date: new Date(m.date),
            }));
        }
        if (state.sharedMemories) {
            this.state.sharedMemories = state.sharedMemories.map((m) => ({
                ...m,
                date: new Date(m.date),
                lastReferenced: m.lastReferenced ? new Date(m.lastReferenced) : undefined,
            }));
        }
        if (state.depthScore !== undefined) {
            this.state.depthScore = state.depthScore;
        }
        if (state.definingTopics) {
            this.state.definingTopics = state.definingTopics;
        }
        if (state.significantDates) {
            this.state.significantDates = state.significantDates.map((d) => ({
                ...d,
                date: new Date(d.date),
            }));
        }
        logger.debug('RelationshipEventsEngine state loaded');
    }
    /**
     * Reset for new user
     */
    reset() {
        this.state = {
            firstSessionDate: null,
            totalSessions: 0,
            currentSession: 0,
            milestones: [],
            sharedMemories: [],
            depthScore: 0,
            definingTopics: [],
            significantDates: [],
        };
        this.lastMilestoneAcknowledgmentTurn = -20;
        this.turnCount = 0;
        logger.debug('RelationshipEventsEngine reset');
    }
    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================
    recordMilestone(type, description, options = {}) {
        const milestone = {
            id: `${type}-${Date.now()}`,
            type,
            date: new Date(),
            sessionNumber: this.state.currentSession,
            description,
            acknowledged: false,
            significance: options.significance ?? 0.6,
            context: options.context,
        };
        this.state.milestones.push(milestone);
        logger.debug({ type, description, significance: milestone.significance }, '✨ Milestone recorded');
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
import { createSessionRegistry, registerGlobalRegistry } from '../utils/session-registry.js';
const relationshipEventsRegistry = createSessionRegistry((userId) => new RelationshipEventsEngine(), { name: 'RelationshipEvents', cleanup: (engine) => engine.reset(), verbose: false });
registerGlobalRegistry(relationshipEventsRegistry);
export function getRelationshipEventsEngine(userId) {
    return relationshipEventsRegistry.get(userId);
}
export function resetRelationshipEventsEngine(userId) {
    const engine = relationshipEventsRegistry.get(userId);
    engine.reset();
}
export function clearRelationshipEventsEngine(userId) {
    relationshipEventsRegistry.reset(userId);
}
export function getActiveRelationshipEventsCount() {
    return relationshipEventsRegistry.getActiveCount();
}
export default RelationshipEventsEngine;
//# sourceMappingURL=relationship-events.js.map