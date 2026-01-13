/**
 * Session Bundle Runtime Manager
 *
 * Wraps the BundleRuntimeEngine and integrates shared utilities:
 * - Life events (birthdays, anniversaries, milestones)
 * - Welcome back messaging (time-based greetings)
 * - Relationship building (deepening questions, callbacks)
 * - Team dynamics (handoff context, teammate mentions)
 *
 * This provides a unified API for all session-level persona content,
 * making it easy to wire up rich, relationship-aware interactions.
 */
import { getLogger } from '../utils/safe-logger.js';
import { createBundleRuntime } from './bundles/index.js';
import { loadBundleById } from './bundles/loader.js';
// Import shared utilities
import { findEventsToAcknowledge, generateEventAcknowledgment, getUpcomingEventMention, isEventSoon, } from './shared/life-events.js';
import { generateCallback, getAcknowledgment, getDeepeningQuestion, getStageClosing, getStageGreeting, shouldSharePersonalStory, } from './shared/relationship-building.js';
import { getCasualMention, getHandoffWarmth, getOpinionAbout } from './shared/team-dynamics.js';
import { generateWelcomeBack, getMilestoneMessage, isMilestoneConversation, } from './shared/welcome-back.js';
// Import new intelligence systems
import { getPersonaIntelligence, } from './persona-intelligence.js';
const log = getLogger();
// ============================================================================
// SESSION BUNDLE RUNTIME MANAGER
// ============================================================================
export class SessionBundleRuntimeManager {
    bundleRuntime = null;
    personaId;
    userProfile;
    lifeEvents = [];
    initialized = false;
    // New intelligence engine
    intelligenceEngine = null;
    userId;
    constructor(config) {
        this.personaId = config.personaId;
        this.userProfile = config.userProfile;
        this.lifeEvents = config.lifeEvents || [];
        this.userId = config.userProfile?.id;
    }
    /**
     * Initialize the session runtime.
     * Loads the bundle and initializes the runtime engine.
     */
    async initialize(options) {
        if (this.initialized) {
            log.debug({ personaId: this.personaId }, 'Session runtime already initialized');
            return true;
        }
        try {
            const bundle = await loadBundleById(this.personaId);
            if (bundle) {
                this.bundleRuntime = await createBundleRuntime(bundle);
                // Sync user profile state
                if (this.userProfile) {
                    this.bundleRuntime.updateState({
                        userName: this.userProfile.name,
                        sessionCount: this.userProfile.totalConversations || 0,
                    });
                }
                log.info({ personaId: this.personaId }, 'Session runtime initialized');
                this.initialized = true;
            }
            else {
                log.debug({ personaId: this.personaId }, 'No bundle found for session runtime');
                this.initialized = true; // Mark as initialized even without bundle
            }
            // Initialize intelligence engine if we have a user ID
            if (options?.enableIntelligence !== false && this.userId) {
                this.intelligenceEngine = getPersonaIntelligence(this.personaId, this.userId, options?.existingRelationshipMemory);
                log.info({ personaId: this.personaId, userId: this.userId }, 'Intelligence engine initialized');
            }
            return this.bundleRuntime !== null;
        }
        catch (error) {
            log.warn({ personaId: this.personaId, error: String(error) }, 'Failed to initialize session runtime');
            this.initialized = true; // Mark as initialized to prevent retry loops
            return false;
        }
    }
    /**
     * Get the underlying BundleRuntimeEngine.
     */
    getBundleRuntime() {
        return this.bundleRuntime;
    }
    /**
     * Check if we have a bundle runtime available.
     */
    hasBundleRuntime() {
        return this.bundleRuntime !== null;
    }
    // ============================================================================
    // WELCOME BACK & GREETING ENHANCEMENTS
    // ============================================================================
    /**
     * Generate a welcome back result with life event acknowledgments.
     */
    generateWelcomeBackEnhanced(context) {
        const { lastConversationDate, conversationCount } = context;
        // Determine time bucket
        let type = 'new';
        if (lastConversationDate) {
            const daysSince = Math.floor((Date.now() - lastConversationDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSince === 0)
                type = 'same_day';
            else if (daysSince === 1)
                type = 'next_day';
            else if (daysSince <= 6)
                type = 'few_days';
            else if (daysSince <= 13)
                type = 'week';
            else if (daysSince <= 29)
                type = 'weeks';
            else if (daysSince <= 59)
                type = 'month';
            else
                type = 'long_time';
        }
        // Generate base welcome back greeting using profile
        const greeting = this.userProfile ? generateWelcomeBack(this.userProfile) : '';
        // Check for milestones
        const hasMilestone = isMilestoneConversation(conversationCount || 0);
        const milestoneMessage = hasMilestone
            ? (getMilestoneMessage(conversationCount || 0) ?? undefined)
            : undefined;
        // Check for life events to acknowledge
        let lifeEventAcknowledgment;
        const eventsToAcknowledge = findEventsToAcknowledge(this.lifeEvents);
        if (eventsToAcknowledge.length > 0) {
            const event = eventsToAcknowledge[0]; // Acknowledge most important event
            const ack = generateEventAcknowledgment(event, context.userName, event.personName) ?? undefined;
            if (ack)
                lifeEventAcknowledgment = ack;
        }
        return {
            greeting,
            type,
            hasMilestone,
            milestoneMessage,
            lifeEventAcknowledgment,
        };
    }
    /**
     * Get all session enhancements for the current context.
     */
    getSessionEnhancements(context) {
        const { relationshipStage, conversationCount, lastConversationDate, detectedEmotion } = context;
        const enhancements = {
            storyRecommended: false,
        };
        // Welcome back (only for returning users)
        if (lastConversationDate) {
            enhancements.welcomeBack = this.generateWelcomeBackEnhanced(context);
        }
        // Deepening question (based on relationship stage)
        if (relationshipStage && relationshipStage !== 'new_acquaintance') {
            enhancements.deepeningQuestion = getDeepeningQuestion(relationshipStage);
        }
        // Callback (reference to past conversation)
        if (this.userProfile) {
            const callback = generateCallback(this.userProfile);
            if (callback)
                enhancements.callback = callback;
        }
        // Acknowledgment based on detected emotion
        if (detectedEmotion) {
            const ackType = this.mapEmotionToAckType(detectedEmotion);
            enhancements.acknowledgment = getAcknowledgment(ackType);
        }
        // Should share a personal story?
        const storyWeight = this.getStoryWeight(conversationCount || 0);
        enhancements.storyRecommended = shouldSharePersonalStory(relationshipStage || 'new_acquaintance', storyWeight);
        // Team mention (occasional)
        if (Math.random() < 0.15) {
            // 15% chance
            const teammates = ['peter-john', 'alex-chen', 'maya-santos', 'jordan-taylor', 'nayan-patel'];
            const otherTeammate = teammates.find((t) => t !== this.personaId);
            if (otherTeammate) {
                enhancements.teamMention = getCasualMention(otherTeammate) || undefined;
            }
        }
        // Intelligence injection (unified prompt context)
        if (this.intelligenceEngine) {
            enhancements.intelligenceInjection = this.intelligenceEngine.buildPromptInjection(context.currentTopic);
        }
        return enhancements;
    }
    /**
     * Map detected emotion to acknowledgment type.
     */
    mapEmotionToAckType(emotion) {
        const emotionLower = emotion.toLowerCase();
        if (emotionLower.includes('happy') ||
            emotionLower.includes('excited') ||
            emotionLower.includes('proud')) {
            return 'progress';
        }
        if (emotionLower.includes('sad') ||
            emotionLower.includes('frustrated') ||
            emotionLower.includes('anxious')) {
            return 'struggle';
        }
        if (emotionLower.includes('vulnerable') ||
            emotionLower.includes('open') ||
            emotionLower.includes('trust')) {
            return 'personal';
        }
        return 'emotional';
    }
    /**
     * Determine story weight based on conversation count.
     */
    getStoryWeight(conversationCount) {
        if (conversationCount < 5)
            return 'light';
        if (conversationCount < 20)
            return 'medium';
        return 'heavy';
    }
    // ============================================================================
    // LIFE EVENTS
    // ============================================================================
    /**
     * Set life events for the session.
     */
    setLifeEvents(events) {
        this.lifeEvents = events;
    }
    /**
     * Get events that should be acknowledged today.
     */
    getEventsToAcknowledge() {
        return findEventsToAcknowledge(this.lifeEvents);
    }
    /**
     * Get upcoming events that could be mentioned.
     */
    getUpcomingEvents(daysAhead = 7) {
        return this.lifeEvents.filter((event) => isEventSoon(event, daysAhead));
    }
    /**
     * Generate mention for an upcoming event.
     */
    getUpcomingEventMentionText(event) {
        return getUpcomingEventMention(event);
    }
    // ============================================================================
    // RELATIONSHIP BUILDING
    // ============================================================================
    /**
     * Get stage-appropriate greeting.
     */
    getStageGreetingText() {
        const stage = this.userProfile?.relationshipStage || 'new_acquaintance';
        return getStageGreeting(stage);
    }
    /**
     * Get stage-appropriate closing.
     */
    getStageClosingText() {
        const stage = this.userProfile?.relationshipStage || 'new_acquaintance';
        return getStageClosing(stage);
    }
    /**
     * Get a deepening question for the current relationship stage.
     */
    getDeepeningQuestionText() {
        const stage = this.userProfile?.relationshipStage || 'new_acquaintance';
        return getDeepeningQuestion(stage);
    }
    // ============================================================================
    // TEAM DYNAMICS
    // ============================================================================
    /**
     * Get opinion about another team member.
     */
    getOpinionAboutTeammate(teammateId) {
        return getOpinionAbout(this.personaId, teammateId);
    }
    /**
     * Get handoff warmth phrase for handing off to another team member.
     */
    getHandoffWarmthPhrase(toPersonaId) {
        return getHandoffWarmth('to', toPersonaId);
    }
    /**
     * Get handoff warmth phrase for receiving from another team member.
     */
    getReceiveWarmthPhrase(fromPersonaId) {
        return getHandoffWarmth('from', fromPersonaId);
    }
    // ============================================================================
    // INTELLIGENCE ENGINE
    // ============================================================================
    /**
     * Get the intelligence engine (if initialized).
     */
    getIntelligenceEngine() {
        return this.intelligenceEngine;
    }
    /**
     * Check if intelligence engine is available.
     */
    hasIntelligenceEngine() {
        return this.intelligenceEngine !== null;
    }
    /**
     * Start an intelligence session (tracks relationship progression).
     */
    startIntelligenceSession() {
        if (this.intelligenceEngine) {
            this.intelligenceEngine.startSession();
        }
    }
    /**
     * End an intelligence session with summary.
     */
    endIntelligenceSession(sessionMood, sessionEnergy, topics) {
        if (this.intelligenceEngine) {
            this.intelligenceEngine.endSession(sessionMood, sessionEnergy, topics);
        }
    }
    /**
     * Build unified prompt injection for LLM.
     * Combines relationship, cognitive, predictive, and team context.
     */
    buildIntelligencePromptInjection(currentTopic) {
        if (!this.intelligenceEngine)
            return null;
        return this.intelligenceEngine.buildPromptInjection(currentTopic);
    }
    /**
     * Record a significant moment in the relationship.
     */
    recordMoment(type, summary, options) {
        if (this.intelligenceEngine) {
            this.intelligenceEngine.recordMoment(type, summary, options);
        }
    }
    /**
     * Get a persona-appropriate question.
     */
    getPersonaQuestion(type = 'starter') {
        if (!this.intelligenceEngine)
            return undefined;
        return this.intelligenceEngine.getQuestion(type);
    }
    /**
     * Get a disagreement phrase.
     */
    getDisagreementPhrase(intensity = 'mild') {
        if (!this.intelligenceEngine)
            return undefined;
        return this.intelligenceEngine.getDisagreement(intensity);
    }
    /**
     * Get silence response based on duration.
     */
    getSilenceResponse(durationMs) {
        if (!this.intelligenceEngine)
            return undefined;
        return this.intelligenceEngine.getSilenceResponse(durationMs);
    }
    /**
     * Get team reference about another persona.
     */
    getTeamReference(aboutPersona, type = 'admiration') {
        if (!this.intelligenceEngine)
            return undefined;
        return this.intelligenceEngine.getTeamRef(aboutPersona, type);
    }
    /**
     * Generate handoff note for another persona.
     */
    generateHandoffNote(toPersona, topic, emotionalState) {
        if (!this.intelligenceEngine)
            return undefined;
        return this.intelligenceEngine.generateHandoff(toPersona, topic, emotionalState);
    }
    /**
     * Get current relationship stage.
     */
    getIntelligenceRelationshipStage() {
        if (!this.intelligenceEngine)
            return undefined;
        return this.intelligenceEngine.getRelationshipStage();
    }
    /**
     * Get current trust score (0-1).
     */
    getTrustScore() {
        if (!this.intelligenceEngine)
            return undefined;
        return this.intelligenceEngine.getTrustScore();
    }
    /**
     * Export relationship memory for persistence.
     */
    exportRelationshipMemory() {
        if (!this.intelligenceEngine)
            return undefined;
        return this.intelligenceEngine.getRelationshipMemory();
    }
    // ============================================================================
    // BUNDLE RUNTIME PASSTHROUGH
    // ============================================================================
    /**
     * Get time-of-day modifiers from bundle runtime.
     */
    getTimeOfDayModifiers() {
        if (!this.bundleRuntime)
            return {};
        return this.bundleRuntime.getTimeOfDayModifiers();
    }
    /**
     * Get relationship stage name.
     */
    getRelationshipStageName() {
        if (!this.bundleRuntime)
            return 'unknown';
        return this.bundleRuntime.getRelationshipStageName();
    }
    /**
     * Get quirk content from bundle.
     */
    async getQuirk(context) {
        if (!this.bundleRuntime)
            return null;
        // Use optional chaining as these methods may not exist on all bundles
        const fn = this.bundleRuntime['getQuirkContent'];
        if (typeof fn === 'function') {
            return fn.call(this.bundleRuntime, context) || null;
        }
        return null;
    }
    /**
     * Get "caught doing" moment for alive greetings.
     */
    getCaughtDoing() {
        if (!this.bundleRuntime)
            return null;
        const fn = this.bundleRuntime['getCaughtDoing'];
        if (typeof fn === 'function') {
            return fn.call(this.bundleRuntime) || null;
        }
        return null;
    }
    /**
     * Get physical moment for embodied presence.
     */
    getPhysicalMoment() {
        if (!this.bundleRuntime)
            return null;
        const fn = this.bundleRuntime['getPhysicalMoment'];
        if (typeof fn === 'function') {
            return fn.call(this.bundleRuntime) || null;
        }
        return null;
    }
    /**
     * Get backstory hint for alive greetings.
     */
    getBackstoryHint() {
        if (!this.bundleRuntime)
            return null;
        const fn = this.bundleRuntime['getBackstoryHint'];
        if (typeof fn === 'function') {
            return fn.call(this.bundleRuntime) || null;
        }
        return null;
    }
    /**
     * Update runtime state.
     */
    updateState(state) {
        if (this.bundleRuntime) {
            this.bundleRuntime.updateState(state);
        }
    }
    /**
     * Increment turn counter.
     */
    incrementTurn() {
        if (this.bundleRuntime) {
            this.bundleRuntime.incrementTurn();
        }
    }
    /**
     * Update user profile reference.
     */
    setUserProfile(profile) {
        this.userProfile = profile;
        if (this.bundleRuntime) {
            this.bundleRuntime.updateState({
                userName: profile.name,
                sessionCount: profile.totalConversations || 0,
            });
        }
    }
}
// ============================================================================
// FACTORY FUNCTION
// ============================================================================
/**
 * Create and initialize a SessionBundleRuntimeManager.
 *
 * @param config - Session configuration including persona, user profile, and options
 * @returns Initialized session runtime manager with optional intelligence engine
 *
 * @example
 * ```typescript
 * // Basic usage
 * const session = await createSessionRuntime({
 *   personaId: 'ferni',
 *   userProfile: user,
 * });
 *
 * // With intelligence engine for relationship tracking
 * const session = await createSessionRuntime({
 *   personaId: 'ferni',
 *   userProfile: user,
 *   enableIntelligence: true,
 *   existingRelationshipMemory: savedMemory, // Optional - restore from persistence
 * });
 *
 * // Start intelligence session
 * session.startIntelligenceSession();
 *
 * // Get prompt injection for LLM
 * const injection = session.buildIntelligencePromptInjection('career');
 * // Use injection.combined in system prompt
 *
 * // Record significant moment
 * session.recordMoment('breakthrough', 'User realized their fear pattern');
 *
 * // End session
 * session.endIntelligenceSession('positive', 'high', ['career', 'growth']);
 *
 * // Export memory for persistence
 * const memory = session.exportRelationshipMemory();
 * await saveToDatabase(memory);
 * ```
 */
export async function createSessionRuntime(config) {
    const manager = new SessionBundleRuntimeManager(config);
    await manager.initialize({
        enableIntelligence: config.enableIntelligence,
        existingRelationshipMemory: config.existingRelationshipMemory,
    });
    return manager;
}
export default SessionBundleRuntimeManager;
//# sourceMappingURL=session-runtime.js.map