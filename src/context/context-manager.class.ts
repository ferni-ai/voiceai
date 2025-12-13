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

import { generateRollingSummary, type ConversationTurn } from '../memory/summarizer.js';
import { isValidPersonaId, type PersonaId, type SessionId } from '../types/branded.js';
import type { UserProfile } from '../types/user-profile.js';
import { getLogger } from '../utils/safe-logger.js';

import type { InjectedContent } from '../personas/shared/index.js';
import {
  buildContinuityContext,
  buildEmotionalContext,
  buildHandoffChainDescription,
  buildPhaseGuidance,
  buildRelationshipContext,
  buildSharedContent,
  buildTopicContext,
  getFormattedSharedContent,
} from './context-builders.js';
import { buildSpeechInsightsContext, formatSpeechInsightsForPrompt } from './speech-insights.js';
import type {
  ContextOptions,
  ConversationState,
  EmotionResult,
  HandoffRecord,
  MemoryRetrievalResult,
  PhaseGuidance,
  PromptContext,
  SpeechInsightsContext,
  TrustContextResult,
} from './types.js';

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
  private turns: ConversationTurn[] = [];
  private rollingSummary = '';
  private userProfile?: UserProfile;
  private readonly sessionId: SessionId;
  private readonly startedAt: Date;

  // Persona tracking
  private currentPersona: PersonaId = 'ferni' as PersonaId;
  private previousPersona?: PersonaId;
  private handoffHistory: HandoffRecord[] = [];

  // Rolling summary state
  private rollingSummaryUpdateInFlight: Promise<void> | null = null;
  private rollingSummaryUpdateQueued = false;
  private rollingSummaryRetryCount = 0;

  // Trust context (lazy loaded via setter)
  private trustContextBuilder?: (
    userId: string,
    userText: string,
    context: { currentTopic?: string; detectedEmotion?: string; emotionIntensity?: number }
  ) => TrustContextResult;

  // Memory retrieval (lazy loaded via setter)
  private memoryRetriever?: (
    userId: string,
    query: string,
    options?: { limit?: number; minRelevance?: number }
  ) => Promise<MemoryRetrievalResult>;

  constructor(sessionId: SessionId, userProfile?: UserProfile) {
    this.sessionId = sessionId;
    this.userProfile = userProfile;
    this.startedAt = new Date();

    getLogger().info({ sessionId }, 'ContextManager created');
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  getSessionId(): SessionId {
    return this.sessionId;
  }

  getCurrentPersona(): PersonaId {
    return this.currentPersona;
  }

  getPreviousPersona(): PersonaId | undefined {
    return this.previousPersona;
  }

  /**
   * Get the full handoff chain for this session.
   * Useful for understanding conversation flow across personas.
   */
  getHandoffHistory(): readonly HandoffRecord[] {
    return this.handoffHistory;
  }

  getUserProfile(): UserProfile | undefined {
    return this.userProfile;
  }

  getRollingSummary(): string {
    return this.rollingSummary;
  }

  // ============================================================================
  // SETTERS / MUTATORS
  // ============================================================================

  /**
   * Set the current persona with optional explicit previous persona.
   * Automatically tracks handoff history.
   */
  setCurrentPersona(personaId: string, previousPersonaId?: string): void {
    if (!isValidPersonaId(personaId)) {
      getLogger().warn({ personaId }, 'Invalid persona ID provided');
      return;
    }

    const prevPersona =
      previousPersonaId && isValidPersonaId(previousPersonaId)
        ? (previousPersonaId as PersonaId)
        : this.currentPersona;

    // Don't record if it's the same persona
    if (personaId === this.currentPersona) {
      return;
    }

    // Record handoff
    this.recordHandoff(prevPersona, personaId as PersonaId);

    this.previousPersona = prevPersona;
    this.currentPersona = personaId as PersonaId;
  }

  setUserProfile(profile: UserProfile): void {
    this.userProfile = profile;
  }

  /**
   * Register a trust context builder function.
   * This allows trust systems to be injected without creating circular deps.
   */
  setTrustContextBuilder(
    builder: (
      userId: string,
      userText: string,
      context: { currentTopic?: string; detectedEmotion?: string; emotionIntensity?: number }
    ) => TrustContextResult
  ): void {
    this.trustContextBuilder = builder;
  }

  /**
   * Register a memory retrieval function.
   * This allows RAG/semantic search to be injected without creating circular deps.
   */
  setMemoryRetriever(
    retriever: (
      userId: string,
      query: string,
      options?: { limit?: number; minRelevance?: number }
    ) => Promise<MemoryRetrievalResult>
  ): void {
    this.memoryRetriever = retriever;
  }

  // ============================================================================
  // TURN MANAGEMENT
  // ============================================================================

  addTurn(turn: ConversationTurn): void {
    this.turns.push(turn);

    // Trigger rolling summary update every 10 turns
    if (this.turns.length % 10 === 0) {
      void this.requestRollingSummaryUpdate();
    }
  }

  getContextWindow(maxTurns = 10): ConversationTurn[] {
    return this.turns.slice(-maxTurns);
  }

  getTurnCount(): number {
    return this.turns.length;
  }

  getDurationMinutes(): number {
    return Math.floor((Date.now() - this.startedAt.getTime()) / 60000);
  }

  shouldSummarize(): boolean {
    return this.turns.length > 0 && this.turns.length % 10 === 0;
  }

  getAllTurns(): ConversationTurn[] {
    return [...this.turns];
  }

  clear(): void {
    this.turns = [];
    this.rollingSummary = '';
    this.handoffHistory = [];
    this.rollingSummaryRetryCount = 0;
  }

  // ============================================================================
  // ROLLING SUMMARY (with retry protection)
  // ============================================================================

  private async requestRollingSummaryUpdate(): Promise<void> {
    // Don't queue if already at max retries
    if (this.rollingSummaryRetryCount >= MAX_SUMMARY_RETRIES) {
      getLogger().warn(
        { retryCount: this.rollingSummaryRetryCount },
        'Rolling summary update skipped - max retries reached'
      );
      return;
    }

    // Queue if already in flight
    if (this.rollingSummaryUpdateInFlight) {
      this.rollingSummaryUpdateQueued = true;
      return;
    }

    const runUpdate = async (): Promise<void> => {
      try {
        this.rollingSummary = await generateRollingSummary(this.turns, this.rollingSummary);
        this.rollingSummaryRetryCount = 0; // Reset on success
        getLogger().debug('Updated rolling summary');
      } catch (error) {
        this.rollingSummaryRetryCount++;
        getLogger().warn(
          { error, retryCount: this.rollingSummaryRetryCount, maxRetries: MAX_SUMMARY_RETRIES },
          'Failed to update rolling summary'
        );
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
  async forceRollingSummaryUpdate(): Promise<void> {
    this.rollingSummaryRetryCount = 0;
    await this.requestRollingSummaryUpdate();
  }

  // ============================================================================
  // HANDOFF HISTORY TRACKING
  // ============================================================================

  private recordHandoff(fromPersona: PersonaId, toPersona: PersonaId, reason?: string): void {
    const record: HandoffRecord = {
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

    getLogger().debug(
      { fromPersona, toPersona, historyLength: this.handoffHistory.length },
      'Recorded persona handoff'
    );
  }

  /**
   * Get a formatted string describing the handoff chain.
   * Example: "Ferni → Peter (turn 5) → Maya (turn 12)"
   */
  getHandoffChainDescription(): string {
    return buildHandoffChainDescription(this.handoffHistory, this.currentPersona);
  }

  // ============================================================================
  // PURE CONTEXT BUILDERS (wrappers for testability)
  // ============================================================================

  buildRelationshipContext(): string {
    return buildRelationshipContext(this.userProfile);
  }

  buildEmotionalContext(emotion?: EmotionResult, state?: ConversationState): string {
    return buildEmotionalContext(this.userProfile, emotion, state);
  }

  buildTopicContext(state?: ConversationState): string {
    return buildTopicContext(this.userProfile, state);
  }

  buildPhaseGuidance(guidance: PhaseGuidance): string {
    return buildPhaseGuidance(guidance);
  }

  buildContinuityContext(): string {
    return buildContinuityContext(this.userProfile);
  }

  buildSharedContent(options?: {
    isGreeting?: boolean;
    isClosing?: boolean;
    isHandoff?: boolean;
    mentionTeammate?: string;
    lastUserMessage?: string;
  }): InjectedContent {
    return buildSharedContent(
      {
        userProfile: this.userProfile,
        currentPersona: this.currentPersona,
        previousPersona: this.previousPersona,
        handoffHistory: this.handoffHistory,
      },
      options
    );
  }

  getFormattedSharedContent(options?: {
    isGreeting?: boolean;
    isClosing?: boolean;
    isHandoff?: boolean;
    mentionTeammate?: string;
    lastUserMessage?: string;
  }): string {
    return getFormattedSharedContent(
      {
        userProfile: this.userProfile,
        currentPersona: this.currentPersona,
        previousPersona: this.previousPersona,
        handoffHistory: this.handoffHistory,
      },
      options
    );
  }

  // ============================================================================
  // TRUST CONTEXT (integration point)
  // ============================================================================

  /**
   * Build trust-aware context if a trust builder was registered.
   * Returns null if no trust builder is available.
   */
  buildTrustContext(
    userId: string,
    userText: string,
    context?: { currentTopic?: string; detectedEmotion?: string; emotionIntensity?: number }
  ): TrustContextResult | null {
    if (!this.trustContextBuilder) {
      return null;
    }

    try {
      return this.trustContextBuilder(userId, userText, context ?? {});
    } catch (error) {
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
  async retrieveRelevantMemories(
    userId: string,
    query: string,
    options?: { limit?: number; minRelevance?: number }
  ): Promise<MemoryRetrievalResult | null> {
    if (!this.memoryRetriever) {
      return null;
    }

    try {
      return await this.memoryRetriever(userId, query, options);
    } catch (error) {
      getLogger().warn({ error }, 'Memory retrieval failed');
      return null;
    }
  }

  // ============================================================================
  // SPEECH INSIGHTS
  // ============================================================================

  buildSpeechInsightsContext(
    options: Parameters<typeof buildSpeechInsightsContext>[0]
  ): SpeechInsightsContext {
    return buildSpeechInsightsContext(options);
  }

  formatSpeechInsightsForPrompt(insights: SpeechInsightsContext): string {
    return formatSpeechInsightsForPrompt(insights);
  }

  // ============================================================================
  // PROMPT ASSEMBLY
  // ============================================================================

  buildPromptContext(
    state?: ConversationState,
    guidance?: PhaseGuidance,
    emotion?: EmotionResult,
    options?: ContextOptions & {
      isGreeting?: boolean;
      isClosing?: boolean;
      isHandoff?: boolean;
      lastUserMessage?: string;
      speechInsights?: SpeechInsightsContext;
      userId?: string;
      userText?: string;
    }
  ): PromptContext {
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
    let trustContext: TrustContextResult | null = null;
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
    return this.assemblePromptContext(
      opts,
      state,
      emotion,
      contextStrings,
      formattedForPrompt,
      trustContext
    );
  }

  /** Extract all context strings in one helper (to reduce cyclomatic complexity) */
  private buildAllContextStrings(
    opts: {
      includeRelationship: boolean;
      includeEmotional: boolean;
      includeTopics: boolean;
      includeHistory: boolean;
      isGreeting?: boolean;
      isClosing?: boolean;
      isHandoff?: boolean;
      lastUserMessage?: string;
      speechInsights?: SpeechInsightsContext;
    },
    emotion: EmotionResult | undefined,
    state: ConversationState | undefined,
    guidance: PhaseGuidance | undefined
  ): {
    relationshipContext: string;
    emotionalContext: string;
    topicContext: string;
    continuityContext: string;
    phaseGuidance: string;
    speechGuidance: string;
    sharedContent: string;
    handoffContext: string;
  } {
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
    const handoffContext =
      this.handoffHistory.length > 0
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
  private assemblePromptContext(
    opts: { speechInsights?: SpeechInsightsContext },
    state: ConversationState | undefined,
    emotion: EmotionResult | undefined,
    contextStrings: {
      relationshipContext: string;
      emotionalContext: string;
      topicContext: string;
    },
    formattedForPrompt: string,
    trustContext: TrustContextResult | null
  ): PromptContext {
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

  private formatForPrompt(input: {
    emotion?: EmotionResult;
    emotionalContext: string;
    speechGuidance: string;
    sharedContent: string;
    relationshipContext: string;
    continuityContext: string;
    phaseGuidance: string;
    topicContext: string;
    handoffContext: string;
    trustContext: TrustContextResult | null;
    includeHistory: boolean;
    maxLength: number;
  }): string {
    const sections: string[] = [];

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

function appendIfPresent(sections: string[], value: string): void {
  if (value) sections.push(value);
}

function appendLabeled(sections: string[], label: string, value: string): void {
  if (!value) return;
  sections.push(`[${label}]\n${value}`);
}

function appendPrioritySupport(
  sections: string[],
  emotion: EmotionResult | undefined,
  emotionalContext: string
): void {
  if ((emotion?.distressLevel ?? 0) > 0.6 && emotionalContext) {
    sections.push(`[PRIORITY: EMOTIONAL SUPPORT]\n${emotionalContext}`);
  }
}

function appendTrustContext(sections: string[], trustContext: TrustContextResult | null): void {
  if (!trustContext) return;

  const parts: string[] = [];

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

function appendUserProfile(
  sections: string[],
  userProfile: UserProfile | undefined,
  relationshipContext: string
): void {
  if ((userProfile?.totalConversations ?? 0) > 1 && relationshipContext) {
    sections.push(`[USER PROFILE]\n${relationshipContext}`);
  }
}

function appendRollingSummary(
  sections: string[],
  includeHistory: boolean,
  rollingSummary: string
): void {
  if (includeHistory && rollingSummary) {
    sections.push(`[CONVERSATION SUMMARY]\n${rollingSummary}`);
  }
}

function truncateSections(sections: string[], maxLength: number): string {
  let formatted = sections.join('\n\n');
  if (formatted.length > maxLength) {
    formatted = `${formatted.slice(0, maxLength)}...`;
  }
  return formatted;
}
