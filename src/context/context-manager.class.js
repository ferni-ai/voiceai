/**
 * ContextManager - Core conversation context management
 *
 * Responsibilities:
 * - Tracks conversation turns and rolling summaries
 * - Builds context for LLM prompt injection
 * - Manages persona transitions (with full handoff chain)
 * - Integrates speech insights for voice-aware context
 * - Provides hooks for trust and memory systems
 *
 * @module context/ContextManager
 */
import { generateRollingSummary } from '../memory/summarizer.js';
import { isValidPersonaId } from '../types/branded.js';
import { getLogger } from '../utils/safe-logger.js';
import { buildContinuityContext, buildEmotionalContext, buildHandoffChainDescription, buildPhaseGuidance, buildRelationshipContext, buildSharedContent, buildTopicContext, getFormattedSharedContent, } from './context-builders.js';
import { buildSpeechInsightsContext, formatSpeechInsightsForPrompt } from './speech-insights.js';
// ============================================================================
// CONFIGURATION
// ============================================================================
/** Maximum number of retries for rolling summary updates */
const MAX_SUMMARY_RETRIES = 3;
/** Maximum number of persona handoffs to track */
const MAX_HANDOFF_HISTORY = 10;
// ============================================================================
// CONTEXT MANAGER CLASS
// ============================================================================
export class ContextManager {
    turns = [];
    rollingSummary = '';
    userProfile;
    sessionId;
    startedAt;
    // Persona tracking
    currentPersona = 'ferni';
    previousPersona;
    handoffHistory = [];
    // Rolling summary state
    rollingSummaryUpdateInFlight = null;
    rollingSummaryUpdateQueued = false;
    rollingSummaryRetryCount = 0;
    // Trust context (lazy loaded via setter)
    trustContextBuilder;
    // Memory retrieval (lazy loaded via setter)
    memoryRetriever;
    constructor(sessionId, userProfile) {
        this.sessionId = sessionId;
        this.userProfile = userProfile;
        this.startedAt = new Date();
        getLogger().info({ sessionId }, 'ContextManager created');
    }
    // ============================================================================
    // GETTERS
    // ============================================================================
    getSessionId() {
        return this.sessionId;
    }
    getCurrentPersona() {
        return this.currentPersona;
    }
    getPreviousPersona() {
        return this.previousPersona;
    }
    /**
     * Get the full handoff chain for this session.
     * Useful for understanding conversation flow across personas.
     */
    getHandoffHistory() {
        return this.handoffHistory;
    }
    getUserProfile() {
        return this.userProfile;
    }
    getRollingSummary() {
        return this.rollingSummary;
    }
    // ============================================================================
    // SETTERS / MUTATORS
    // ============================================================================
    /**
     * Set the current persona with optional explicit previous persona.
     * Automatically tracks handoff history.
     */
    setCurrentPersona(personaId, previousPersonaId) {
        if (!isValidPersonaId(personaId)) {
            getLogger().warn({ personaId }, 'Invalid persona ID provided');
            return;
        }
        const prevPersona = previousPersonaId && isValidPersonaId(previousPersonaId)
            ? previousPersonaId
            : this.currentPersona;
        // Don't record if it's the same persona
        if (personaId === this.currentPersona) {
            return;
        }
        // Record handoff
        this.recordHandoff(prevPersona, personaId);
        this.previousPersona = prevPersona;
        this.currentPersona = personaId;
    }
    setUserProfile(profile) {
        this.userProfile = profile;
    }
    /**
     * Register a trust context builder function.
     * This allows trust systems to be injected without creating circular deps.
     */
    setTrustContextBuilder(builder) {
        this.trustContextBuilder = builder;
    }
    /**
     * Register a memory retrieval function.
     * This allows RAG/semantic search to be injected without creating circular deps.
     */
    setMemoryRetriever(retriever) {
        this.memoryRetriever = retriever;
    }
    // ============================================================================
    // TURN MANAGEMENT
    // ============================================================================
    addTurn(turn) {
        this.turns.push(turn);
        // Trigger rolling summary update every 10 turns
        if (this.turns.length % 10 === 0) {
            void this.requestRollingSummaryUpdate();
        }
    }
    getContextWindow(maxTurns = 10) {
        return this.turns.slice(-maxTurns);
    }
    getTurnCount() {
        return this.turns.length;
    }
    getDurationMinutes() {
        return Math.floor((Date.now() - this.startedAt.getTime()) / 60000);
    }
    shouldSummarize() {
        return this.turns.length > 0 && this.turns.length % 10 === 0;
    }
    getAllTurns() {
        return [...this.turns];
    }
    clear() {
        this.turns = [];
        this.rollingSummary = '';
        this.handoffHistory = [];
        this.rollingSummaryRetryCount = 0;
    }
    // ============================================================================
    // ROLLING SUMMARY (with retry protection)
    // ============================================================================
    async requestRollingSummaryUpdate() {
        // Don't queue if already at max retries
        if (this.rollingSummaryRetryCount >= MAX_SUMMARY_RETRIES) {
            getLogger().warn({ retryCount: this.rollingSummaryRetryCount }, 'Rolling summary update skipped - max retries reached');
            return;
        }
        // Queue if already in flight
        if (this.rollingSummaryUpdateInFlight) {
            this.rollingSummaryUpdateQueued = true;
            return;
        }
        const runUpdate = async () => {
            try {
                this.rollingSummary = await generateRollingSummary(this.turns, this.rollingSummary);
                this.rollingSummaryRetryCount = 0; // Reset on success
                getLogger().debug('Updated rolling summary');
            }
            catch (error) {
                this.rollingSummaryRetryCount++;
                getLogger().warn({ error, retryCount: this.rollingSummaryRetryCount, maxRetries: MAX_SUMMARY_RETRIES }, 'Failed to update rolling summary');
            }
        };
        this.rollingSummaryUpdateInFlight = runUpdate();
        await this.rollingSummaryUpdateInFlight;
        this.rollingSummaryUpdateInFlight = null;
        // Process queued update if we haven't hit max retries
        if (this.rollingSummaryUpdateQueued && this.rollingSummaryRetryCount < MAX_SUMMARY_RETRIES) {
            this.rollingSummaryUpdateQueued = false;
            await this.requestRollingSummaryUpdate();
        }
    }
    /**
     * Force a rolling summary update (useful for session end).
     * Resets retry count to allow one more attempt.
     */
    async forceRollingSummaryUpdate() {
        this.rollingSummaryRetryCount = 0;
        await this.requestRollingSummaryUpdate();
    }
    // ============================================================================
    // HANDOFF HISTORY TRACKING
    // ============================================================================
    recordHandoff(fromPersona, toPersona, reason) {
        const record = {
            fromPersona,
            toPersona,
            timestamp: new Date(),
            turnCount: this.turns.length,
            reason,
        };
        this.handoffHistory.push(record);
        // Trim to max size (keep most recent)
        if (this.handoffHistory.length > MAX_HANDOFF_HISTORY) {
            this.handoffHistory = this.handoffHistory.slice(-MAX_HANDOFF_HISTORY);
        }
        getLogger().debug({ fromPersona, toPersona, historyLength: this.handoffHistory.length }, 'Recorded persona handoff');
    }
    /**
     * Get a formatted string describing the handoff chain.
     * Example: "Ferni → Peter (turn 5) → Maya (turn 12)"
     */
    getHandoffChainDescription() {
        return buildHandoffChainDescription(this.handoffHistory, this.currentPersona);
    }
    // ============================================================================
    // PURE CONTEXT BUILDERS (wrappers for testability)
    // ============================================================================
    buildRelationshipContext() {
        return buildRelationshipContext(this.userProfile);
    }
    buildEmotionalContext(emotion, state) {
        return buildEmotionalContext(this.userProfile, emotion, state);
    }
    buildTopicContext(state) {
        return buildTopicContext(this.userProfile, state);
    }
    buildPhaseGuidance(guidance) {
        return buildPhaseGuidance(guidance);
    }
    buildContinuityContext() {
        return buildContinuityContext(this.userProfile);
    }
    buildSharedContent(options) {
        return buildSharedContent({
            userProfile: this.userProfile,
            currentPersona: this.currentPersona,
            previousPersona: this.previousPersona,
            handoffHistory: this.handoffHistory,
        }, options);
    }
    getFormattedSharedContent(options) {
        return getFormattedSharedContent({
            userProfile: this.userProfile,
            currentPersona: this.currentPersona,
            previousPersona: this.previousPersona,
            handoffHistory: this.handoffHistory,
        }, options);
    }
    // ============================================================================
    // TRUST CONTEXT (integration point)
    // ============================================================================
    /**
     * Build trust-aware context if a trust builder was registered.
     * Returns null if no trust builder is available.
     */
    buildTrustContext(userId, userText, context) {
        if (!this.trustContextBuilder) {
            return null;
        }
        try {
            return this.trustContextBuilder(userId, userText, context ?? {});
        }
        catch (error) {
            getLogger().warn({ error }, 'Trust context build failed');
            return null;
        }
    }
    // ============================================================================
    // MEMORY RETRIEVAL (integration point)
    // ============================================================================
    /**
     * Retrieve relevant memories if a memory retriever was registered.
     * Returns null if no retriever is available.
     */
    async retrieveRelevantMemories(userId, query, options) {
        if (!this.memoryRetriever) {
            return null;
        }
        try {
            return await this.memoryRetriever(userId, query, options);
        }
        catch (error) {
            getLogger().warn({ error }, 'Memory retrieval failed');
            return null;
        }
    }
    // ============================================================================
    // SPEECH INSIGHTS
    // ============================================================================
    buildSpeechInsightsContext(options) {
        return buildSpeechInsightsContext(options);
    }
    formatSpeechInsightsForPrompt(insights) {
        return formatSpeechInsightsForPrompt(insights);
    }
    // ============================================================================
    // PROMPT ASSEMBLY
    // ============================================================================
    buildPromptContext(state, guidance, emotion, options) {
        // Merge defaults with provided options
        const opts = {
            includeRelationship: true,
            includeEmotional: true,
            includeTopics: true,
            includeHistory: true,
            includeTrust: true,
            maxLength: 2000,
            ...options,
        };
        // Extract context strings
        const contextStrings = this.buildAllContextStrings(opts, emotion, state, guidance);
        // Build trust context if available and requested
        let trustContext = null;
        if (opts.includeTrust && opts.userId && opts.userText) {
            trustContext = this.buildTrustContext(opts.userId, opts.userText, {
                currentTopic: state?.currentTopic ?? undefined, // Convert null to undefined
                detectedEmotion: emotion?.primary,
                emotionIntensity: emotion?.intensity,
            });
        }
        // Build final formatted prompt
        const formattedForPrompt = this.formatForPrompt({
            emotion,
            ...contextStrings,
            trustContext,
            includeHistory: opts.includeHistory,
            maxLength: opts.maxLength,
        });
        // Return prompt context
        return this.assemblePromptContext(opts, state, emotion, contextStrings, formattedForPrompt, trustContext);
    }
    /** Extract all context strings in one helper (to reduce cyclomatic complexity) */
    buildAllContextStrings(opts, emotion, state, guidance) {
        const relationshipContext = opts.includeRelationship ? this.buildRelationshipContext() : '';
        const emotionalContext = opts.includeEmotional
            ? this.buildEmotionalContext(emotion, state)
            : '';
        const topicContext = opts.includeTopics ? this.buildTopicContext(state) : '';
        const continuityContext = opts.includeHistory ? this.buildContinuityContext() : '';
        const phaseGuidanceStr = guidance ? this.buildPhaseGuidance(guidance) : '';
        const speechGuidance = opts.speechInsights
            ? formatSpeechInsightsForPrompt(opts.speechInsights)
            : '';
        const sharedContent = this.getFormattedSharedContent({
            isGreeting: opts.isGreeting,
            isClosing: opts.isClosing,
            isHandoff: opts.isHandoff,
            lastUserMessage: opts.lastUserMessage,
        });
        const handoffContext = this.handoffHistory.length > 0
            ? `[HANDOFF HISTORY]\n${this.getHandoffChainDescription()}`
            : '';
        return {
            relationshipContext,
            emotionalContext,
            topicContext,
            continuityContext,
            phaseGuidance: phaseGuidanceStr,
            speechGuidance,
            sharedContent,
            handoffContext,
        };
    }
    /** Assemble the final PromptContext object */
    assemblePromptContext(opts, state, emotion, contextStrings, formattedForPrompt, trustContext) {
        const { speechInsights } = opts;
        const needsSupportFromVoice = speechInsights?.voiceDistressSignals ?? false;
        const needsSupportFromEmotion = (emotion?.distressLevel ?? 0) > 0.6;
        const needsSupportFromTrust = trustContext?.needsSupport ?? false;
        const durationMinutes = Math.floor((Date.now() - this.startedAt.getTime()) / 60000);
        return {
            sessionId: this.sessionId,
            currentPersona: this.currentPersona,
            previousPersona: this.previousPersona,
            handoffHistory: this.handoffHistory,
            phase: state?.phase || 'greeting',
            turnCount: this.turns.length,
            durationMinutes,
            relationshipContext: contextStrings.relationshipContext,
            userName: this.userProfile?.name,
            isReturning: (this.userProfile?.totalConversations ?? 0) > 1,
            emotionalContext: contextStrings.emotionalContext,
            needsSupport: needsSupportFromEmotion || needsSupportFromVoice || needsSupportFromTrust,
            topicContext: contextStrings.topicContext,
            topicsToCircleBack: state?.topicsToCircleBack || [],
            rollingSummary: this.rollingSummary,
            lastConversationSummary: this.userProfile?.lastConversationSummary,
            formattedForPrompt,
            speechInsights,
            trustContext,
        };
    }
    formatForPrompt(input) {
        const sections = [];
        appendPrioritySupport(sections, input.emotion, input.emotionalContext);
        appendTrustContext(sections, input.trustContext);
        appendIfPresent(sections, input.speechGuidance);
        appendIfPresent(sections, input.sharedContent);
        appendUserProfile(sections, this.userProfile, input.relationshipContext);
        appendIfPresent(sections, input.continuityContext);
        appendIfPresent(sections, input.handoffContext);
        appendLabeled(sections, 'GUIDANCE', input.phaseGuidance);
        appendLabeled(sections, 'TOPICS', input.topicContext);
        appendRollingSummary(sections, input.includeHistory, this.rollingSummary);
        return truncateSections(sections, input.maxLength);
    }
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function appendIfPresent(sections, value) {
    if (value)
        sections.push(value);
}
function appendLabeled(sections, label, value) {
    if (!value)
        return;
    sections.push(`[${label}]\n${value}`);
}
function appendPrioritySupport(sections, emotion, emotionalContext) {
    if ((emotion?.distressLevel ?? 0) > 0.6 && emotionalContext) {
        sections.push(`[PRIORITY: EMOTIONAL SUPPORT]\n${emotionalContext}`);
    }
}
function appendTrustContext(sections, trustContext) {
    if (!trustContext)
        return;
    const parts = [];
    if (trustContext.unsaidSignals && trustContext.unsaidSignals.length > 0) {
        parts.push(`Reading between lines: ${trustContext.unsaidSignals.join('; ')}`);
    }
    if (trustContext.topicsToAvoid && trustContext.topicsToAvoid.length > 0) {
        parts.push(`Avoid topics: ${trustContext.topicsToAvoid.join(', ')}`);
    }
    if (trustContext.growthReflection) {
        parts.push(`Growth noticed: ${trustContext.growthReflection}`);
    }
    if (trustContext.callbackOpportunity) {
        parts.push(`Callback: ${trustContext.callbackOpportunity}`);
    }
    if (parts.length > 0) {
        sections.push(`[TRUST CONTEXT]\n${parts.join('\n')}`);
    }
}
function appendUserProfile(sections, userProfile, relationshipContext) {
    if ((userProfile?.totalConversations ?? 0) > 1 && relationshipContext) {
        sections.push(`[USER PROFILE]\n${relationshipContext}`);
    }
}
function appendRollingSummary(sections, includeHistory, rollingSummary) {
    if (includeHistory && rollingSummary) {
        sections.push(`[CONVERSATION SUMMARY]\n${rollingSummary}`);
    }
}
function truncateSections(sections, maxLength) {
    let formatted = sections.join('\n\n');
    if (formatted.length > maxLength) {
        formatted = `${formatted.slice(0, maxLength)}...`;
    }
    return formatted;
}
//# sourceMappingURL=context-manager.class.js.map