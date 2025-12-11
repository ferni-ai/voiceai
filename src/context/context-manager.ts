/**
 * Context Manager
 *
 * Manages conversation context for prompt injection.
 * Handles rolling summaries, relationship context, and cross-session continuity.
 *
 * Enhanced with speech insights:
 * - Emotional contagion continuity (prosody hints)
 * - Human listening analysis (cognitive load, hedging, self-soothing)
 * - Dynamic speed recommendations
 *
 * @module context/context-manager
 */

import type { ConversationState, PhaseGuidance } from '../intelligence/conversation-state.js';
import type { EmotionResult } from '../intelligence/emotion-detector.js';
import { generateRollingSummary, type ConversationTurn } from '../memory/summarizer.js';
import {
  formatForPrompt,
  injectSharedContent,
  type InjectedContent,
  type SharedContentContext,
} from '../personas/shared/index.js';
import type { PersonaId, SessionId } from '../types/branded.js';
import { createSessionId, isValidPersonaId } from '../types/branded.js';
import type { UserProfile } from '../types/user-profile.js';
import { getLogger } from '../utils/safe-logger.js';

// Speech insights imports
import type { SpeedControlResult } from '../speech/adaptive-ssml/dynamic-speed-control.js';
import type { EmotionalMomentum, ProsodyContinuityHints } from '../speech/emotional-contagion.js';
import type { HumanListeningResult } from '../speech/human-listening-pipeline/types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Context for prompt injection
 */
export interface PromptContext {
  /** Session identifier */
  sessionId: SessionId;

  /** Current persona handling the conversation */
  currentPersona: PersonaId;

  // Conversation state
  phase: string;
  turnCount: number;
  durationMinutes: number;

  // Relationship
  relationshipContext: string;
  userName?: string;
  isReturning: boolean;

  // Current emotional state
  emotionalContext: string;
  needsSupport: boolean;

  // Topic context
  topicContext: string;
  topicsToCircleBack: string[];

  // History
  rollingSummary?: string;
  lastConversationSummary?: string;

  // Combined formatted context
  formattedForPrompt: string;

  // Speech insights (optional - available when speech pipeline is active)
  speechInsights?: SpeechInsightsContext;
}

/**
 * Speech-derived insights for context enhancement
 */
export interface SpeechInsightsContext {
  /** Current emotional momentum (valence, arousal, warmth trend) */
  emotionalMomentum?: EmotionalMomentum;

  /** Prosody continuity hints for TTS */
  prosodyContinuityHints?: ProsodyContinuityHints;

  /** Human listening analysis results */
  humanListeningResult?: HumanListeningResult;

  /** Recommended speech speed adjustments */
  speedControl?: SpeedControlResult;

  /** Whether user appears to be in distress (voice + text signals) */
  voiceDistressSignals: boolean;

  /** User's cognitive load estimate from speech */
  estimatedCognitiveLoad: number;

  /** Speech-derived guidance for response */
  speechGuidance: string;
}

/**
 * Options for context building
 */
export interface ContextOptions {
  includeRelationship?: boolean;
  includeEmotional?: boolean;
  includeTopics?: boolean;
  includeHistory?: boolean;
  maxLength?: number;
}

// ============================================================================
// CONTEXT MANAGER
// ============================================================================

/**
 * Context Manager class
 *
 * Manages all context for a conversation session, including:
 * - Rolling conversation summaries
 * - User profile and relationship data
 * - Emotional state tracking
 * - Topic context and navigation
 * - Cross-session continuity
 */
export class ContextManager {
  private turns: ConversationTurn[] = [];
  private rollingSummary = '';
  private userProfile?: UserProfile;
  private readonly sessionId: SessionId;
  private readonly startedAt: Date;
  private currentPersona: PersonaId = 'ferni' as PersonaId;
  private previousPersona?: PersonaId;

  constructor(sessionId: SessionId, userProfile?: UserProfile) {
    this.sessionId = sessionId;
    this.userProfile = userProfile;
    this.startedAt = new Date();

    getLogger().info({ sessionId }, 'ContextManager created');
  }

  /**
   * Get the session ID
   */
  getSessionId(): SessionId {
    return this.sessionId;
  }

  /**
   * Set current persona (for shared content)
   */
  setCurrentPersona(personaId: string, previousPersonaId?: string): void {
    if (!isValidPersonaId(personaId)) {
      getLogger().warn({ personaId }, 'Invalid persona ID provided');
      return;
    }

    this.previousPersona = this.currentPersona;
    this.currentPersona = personaId as PersonaId;

    if (previousPersonaId && isValidPersonaId(previousPersonaId)) {
      this.previousPersona = previousPersonaId as PersonaId;
    }
  }

  /**
   * Get current persona
   */
  getCurrentPersona(): PersonaId {
    return this.currentPersona;
  }

  /**
   * Set user profile (can be loaded later)
   */
  setUserProfile(profile: UserProfile): void {
    this.userProfile = profile;
  }

  /**
   * Add a conversation turn
   */
  addTurn(turn: ConversationTurn): void {
    this.turns.push(turn);

    // Generate rolling summary every 10 turns (fire and forget)
    if (this.turns.length % 10 === 0) {
      void this.updateRollingSummary();
    }
  }

  /**
   * Update rolling summary
   */
  private async updateRollingSummary(): Promise<void> {
    try {
      this.rollingSummary = await generateRollingSummary(this.turns, this.rollingSummary);
      getLogger().debug('Updated rolling summary');
    } catch (error) {
      getLogger().warn(`Failed to update rolling summary: ${error}`);
    }
  }

  /**
   * Build relationship context from user profile
   */
  buildRelationshipContext(): string {
    if (!this.userProfile) {
      return 'New user - no prior history.';
    }

    const p = this.userProfile;
    const sections: string[] = [];

    // Basic relationship
    if (p.name) {
      sections.push(`User: ${p.name}`);
    }

    if (p.totalConversations > 1) {
      sections.push(`Conversations: ${p.totalConversations}`);
      sections.push(`Relationship: ${p.relationshipStage.replace('_', ' ')}`);
    }

    // Last conversation
    if (p.lastConversationSummary) {
      sections.push(`Last time: ${p.lastConversationSummary}`);
    }

    // Pending follow-ups
    if (p.pendingFollowUps.length > 0) {
      const followUp = p.pendingFollowUps[0];
      sections.push(`Follow-up needed: ${followUp.topic} (${followUp.reason})`);
    }

    // Open questions
    if (p.openQuestions.length > 0) {
      sections.push(`Unanswered questions: ${p.openQuestions.slice(0, 2).join('; ')}`);
    }

    // Key moments
    const recentMoments = p.keyMoments
      .filter((m) => m.followUpNeeded)
      .slice(0, 2)
      .map((m) => m.summary);
    if (recentMoments.length > 0) {
      sections.push(`Key moments: ${recentMoments.join('; ')}`);
    }

    // Communication preferences
    if (p.communicationStyle !== 'mixed') {
      sections.push(`Prefers: ${p.communicationStyle} communication`);
    }

    return sections.join('\n');
  }

  /**
   * Build emotional context
   */
  buildEmotionalContext(emotion?: EmotionResult, state?: ConversationState): string {
    const sections: string[] = [];

    if (emotion) {
      sections.push(
        `Current mood: ${emotion.primary} (intensity: ${emotion.intensity.toFixed(1)})`
      );

      if (emotion.distressLevel > 0.5) {
        sections.push(
          `⚠️ DISTRESS DETECTED (${emotion.distressLevel.toFixed(2)}) - prioritize emotional support`
        );
      }
    }

    if (state) {
      if (state.emotionalTrend !== 'unknown') {
        sections.push(`Emotional trend: ${state.emotionalTrend}`);
      }
    }

    // Historical emotional patterns
    if (this.userProfile?.emotionalPatterns.length) {
      const recent = this.userProfile.emotionalPatterns.slice(-3);
      const emotions = recent.map((p) => p.emotion).join(' → ');
      if (emotions) {
        sections.push(`Recent pattern: ${emotions}`);
      }
    }

    return sections.join('\n');
  }

  /**
   * Build topic context
   */
  buildTopicContext(state?: ConversationState): string {
    const sections: string[] = [];

    if (state?.currentTopic) {
      sections.push(`Current topic: ${state.currentTopic}`);
    }

    if (state?.topicsDiscussed.length) {
      sections.push(`Topics covered: ${state.topicsDiscussed.join(', ')}`);
    }

    if (state?.topicsToCircleBack.length) {
      sections.push(`Circle back to: ${state.topicsToCircleBack.join(', ')}`);
    }

    // User's preferred topics
    if (this.userProfile?.preferredTopics.length) {
      sections.push(`User interests: ${this.userProfile.preferredTopics.slice(0, 5).join(', ')}`);
    }

    // Topics to avoid
    if (this.userProfile?.avoidTopics.length) {
      sections.push(`Avoid: ${this.userProfile.avoidTopics.join(', ')}`);
    }

    return sections.join('\n');
  }

  /**
   * Build phase-specific guidance
   */
  buildPhaseGuidance(guidance: PhaseGuidance): string {
    return `
Phase: ${guidance.phase}
Voice: ${guidance.voiceMode}
Focus: ${guidance.focus}
Ask: ${guidance.shouldAsk.slice(0, 2).join(' | ')}
Avoid: ${guidance.shouldAvoid.slice(0, 2).join(' | ')}
`.trim();
  }

  /**
   * Build shared content (team dynamics, relationship building, life events)
   */
  buildSharedContent(options?: {
    isGreeting?: boolean;
    isClosing?: boolean;
    isHandoff?: boolean;
    mentionTeammate?: string;
    lastUserMessage?: string;
  }): InjectedContent {
    // Build context for shared content injector
    const sharedContext: SharedContentContext = {
      currentPersona: this.currentPersona,
      userName: this.userProfile?.name,
      relationshipStage: this.userProfile?.relationshipStage,
      conversationCount: this.userProfile?.totalConversations,
      lastConversationSummary: this.userProfile?.lastConversationSummary,
      previousPersona: this.previousPersona,
    };

    // Calculate days since last contact
    if (this.userProfile?.lastContact) {
      const lastContact = new Date(this.userProfile.lastContact);
      sharedContext.daysSinceLastContact = Math.floor(
        (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    // Life events context (for Jordan's Life's Firsts coordination)
    if (this.userProfile?.lifeEvents && this.userProfile.lifeEvents.length > 0) {
      const activeEvents = this.userProfile.lifeEvents.filter(
        (e) => e.status === 'planning' || e.status === 'upcoming' || e.status === 'in_progress'
      );

      if (activeEvents.length > 0) {
        sharedContext.activeLifeEvents = activeEvents.map((e) => ({
          type: e.type,
          title: e.title,
          status: e.status,
          date: e.date,
          emotionalSignificance: e.emotionalSignificance,
        }));
      }

      // Recent completions (for celebration)
      const recentCompletions = this.userProfile.lifeEvents.filter((e) => {
        if (e.status !== 'completed' || !e.completedAt) return false;
        const daysSinceCompletion = Math.floor(
          (Date.now() - new Date(e.completedAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysSinceCompletion <= 30; // Last 30 days
      });

      if (recentCompletions.length > 0) {
        sharedContext.recentLifeMilestones = recentCompletions.map((e) => e.title);
      }
    }

    return injectSharedContent(sharedContext, options);
  }

  /**
   * Get formatted shared content for prompt injection
   */
  getFormattedSharedContent(options?: {
    isGreeting?: boolean;
    isClosing?: boolean;
    isHandoff?: boolean;
    mentionTeammate?: string;
    lastUserMessage?: string;
  }): string {
    const content = this.buildSharedContent(options);
    return formatForPrompt(content);
  }

  /**
   * Build cross-session continuity context
   */
  buildContinuityContext(): string {
    if (!this.userProfile || this.userProfile.totalConversations <= 1) {
      return '';
    }

    const sections: string[] = [];
    const p = this.userProfile;

    // Time since last conversation
    const lastContact = new Date(p.lastContact);
    const daysSince = Math.floor((Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSince >= 1) {
      sections.push(`Last talked: ${daysSince} day${daysSince > 1 ? 's' : ''} ago`);
    }

    // Last conversation summary
    if (p.lastConversationSummary) {
      sections.push(`Last time: "${p.lastConversationSummary}"`);
    }

    // Goals mentioned
    if (p.goals.length > 0) {
      const activeGoals = p.goals.filter((g) => g.status === 'active' || g.status === 'on_track');
      if (activeGoals.length > 0) {
        sections.push(`Working on: ${activeGoals.map((g) => g.name).join(', ')}`);
      }
    }

    // Stories already told
    if (p.sharedStories.length > 0) {
      const themes = [...new Set(p.sharedStories.map((s) => s.theme))];
      sections.push(`Stories told: ${themes.slice(0, 3).join(', ')}`);
    }

    return sections.length > 0 ? `[CONTINUITY]\n${sections.join('\n')}` : '';
  }

  /**
   * Build full prompt context
   */
  buildPromptContext(
    state?: ConversationState,
    guidance?: PhaseGuidance,
    emotion?: EmotionResult,
    options?: ContextOptions & {
      isGreeting?: boolean;
      isClosing?: boolean;
      isHandoff?: boolean;
      lastUserMessage?: string;
    }
  ): PromptContext {
    const opts = {
      includeRelationship: true,
      includeEmotional: true,
      includeTopics: true,
      includeHistory: true,
      maxLength: 2000,
      ...options,
    };

    // Build individual sections
    const relationshipContext = opts.includeRelationship ? this.buildRelationshipContext() : '';

    const emotionalContext = opts.includeEmotional
      ? this.buildEmotionalContext(emotion, state)
      : '';

    const topicContext = opts.includeTopics ? this.buildTopicContext(state) : '';

    const continuityContext = opts.includeHistory ? this.buildContinuityContext() : '';

    const phaseGuidance = guidance ? this.buildPhaseGuidance(guidance) : '';

    // Build shared content (team dynamics, relationship building, life events)
    const sharedContent = this.getFormattedSharedContent({
      isGreeting: opts.isGreeting,
      isClosing: opts.isClosing,
      isHandoff: opts.isHandoff,
      lastUserMessage: opts.lastUserMessage,
    });

    // Calculate duration
    const durationMinutes = Math.floor((Date.now() - this.startedAt.getTime()) / 60000);

    // Build formatted context
    const sections: string[] = [];

    // Priority: Emotional support
    if (emotion?.distressLevel && emotion.distressLevel > 0.6) {
      sections.push(`[PRIORITY: EMOTIONAL SUPPORT]\n${emotionalContext}`);
    }

    // Shared content (greetings, team dynamics, life events)
    if (sharedContent) {
      sections.push(sharedContent);
    }

    // Relationship context (if returning user)
    if (this.userProfile && this.userProfile.totalConversations > 1 && relationshipContext) {
      sections.push(`[RELATIONSHIP]\n${relationshipContext}`);
    }

    // Continuity
    if (continuityContext) {
      sections.push(continuityContext);
    }

    // Phase guidance
    if (phaseGuidance) {
      sections.push(`[GUIDANCE]\n${phaseGuidance}`);
    }

    // Topic context
    if (topicContext) {
      sections.push(`[TOPICS]\n${topicContext}`);
    }

    // Rolling summary
    if (opts.includeHistory && this.rollingSummary) {
      sections.push(`[CONVERSATION SUMMARY]\n${this.rollingSummary}`);
    }

    // Combine and truncate
    let formatted = sections.join('\n\n');
    if (formatted.length > opts.maxLength) {
      formatted = `${formatted.slice(0, opts.maxLength)}...`;
    }

    return {
      sessionId: this.sessionId,
      currentPersona: this.currentPersona,
      phase: state?.phase || 'greeting',
      turnCount: this.turns.length,
      durationMinutes,
      relationshipContext,
      userName: this.userProfile?.name,
      isReturning: (this.userProfile?.totalConversations || 0) > 1,
      emotionalContext,
      needsSupport: (emotion?.distressLevel || 0) > 0.6,
      topicContext,
      topicsToCircleBack: state?.topicsToCircleBack || [],
      rollingSummary: this.rollingSummary,
      lastConversationSummary: this.userProfile?.lastConversationSummary,
      formattedForPrompt: formatted,
    };
  }

  /**
   * Get context window (last N turns)
   */
  getContextWindow(maxTurns = 10): ConversationTurn[] {
    return this.turns.slice(-maxTurns);
  }

  /**
   * Get turn count
   */
  getTurnCount(): number {
    return this.turns.length;
  }

  /**
   * Get duration in minutes
   */
  getDurationMinutes(): number {
    return Math.floor((Date.now() - this.startedAt.getTime()) / 60000);
  }

  /**
   * Check if should summarize
   */
  shouldSummarize(): boolean {
    return this.turns.length > 0 && this.turns.length % 10 === 0;
  }

  /**
   * Get all turns
   */
  getAllTurns(): ConversationTurn[] {
    return [...this.turns];
  }

  /**
   * Clear context (for testing)
   */
  clear(): void {
    this.turns = [];
    this.rollingSummary = '';
  }

  // ==========================================================================
  // SPEECH INSIGHTS INTEGRATION
  // ==========================================================================

  /**
   * Build speech insights context from available speech pipeline data
   *
   * This integrates data from:
   * - Human listening pipeline (cognitive load, hedging, self-soothing)
   * - Emotional contagion (momentum, continuity hints)
   * - Dynamic speed control
   *
   * @param options - Speech data from various pipeline components
   * @returns Speech insights context for prompt injection
   */
  buildSpeechInsightsContext(options: {
    humanListeningResult?: HumanListeningResult;
    emotionalMomentum?: EmotionalMomentum;
    prosodyContinuityHints?: ProsodyContinuityHints;
    speedControl?: SpeedControlResult;
  }): SpeechInsightsContext {
    const { humanListeningResult, emotionalMomentum, prosodyContinuityHints, speedControl } =
      options;

    // Determine distress signals from voice
    let voiceDistressSignals = false;
    if (humanListeningResult) {
      voiceDistressSignals =
        humanListeningResult.possibleDistress ||
        (humanListeningResult.audio?.tremor?.detected ?? false);
    }

    // Estimate cognitive load from complex type
    let estimatedCognitiveLoad = 0.3; // Default
    if (humanListeningResult) {
      // CognitiveLoadState has level and confidence properties
      const cognitiveLevel = humanListeningResult.text.cognitiveLoad?.level;
      const textLoadScore =
        cognitiveLevel === 'overloaded'
          ? 1.0
          : cognitiveLevel === 'high'
            ? 0.8
            : cognitiveLevel === 'medium'
              ? 0.5
              : 0.3;
      // HedgingAnalysisResult has hedgingDensity
      const hedgingDensity = humanListeningResult.text.hedging?.hedgingDensity ?? 0;
      estimatedCognitiveLoad = Math.min(1, textLoadScore + Math.min(hedgingDensity / 20, 0.5));
    }

    // Build speech-derived guidance
    const speechGuidance = this.buildSpeechGuidance({
      humanListeningResult,
      emotionalMomentum,
      speedControl,
      voiceDistressSignals,
      estimatedCognitiveLoad,
    });

    return {
      emotionalMomentum,
      prosodyContinuityHints,
      humanListeningResult,
      speedControl,
      voiceDistressSignals,
      estimatedCognitiveLoad,
      speechGuidance,
    };
  }

  /**
   * Build speech-derived guidance for prompt injection
   */
  private buildSpeechGuidance(options: {
    humanListeningResult?: HumanListeningResult;
    emotionalMomentum?: EmotionalMomentum;
    speedControl?: SpeedControlResult;
    voiceDistressSignals: boolean;
    estimatedCognitiveLoad: number;
  }): string {
    const {
      humanListeningResult,
      emotionalMomentum,
      speedControl,
      voiceDistressSignals,
      estimatedCognitiveLoad,
    } = options;

    const guidance: string[] = [];

    // Voice distress signals (highest priority)
    if (voiceDistressSignals) {
      guidance.push('🔴 Voice shows distress signals - prioritize emotional support');
    }

    // Cognitive load
    if (estimatedCognitiveLoad > 0.7) {
      guidance.push('User is processing heavily - use simpler language, shorter sentences');
    } else if (estimatedCognitiveLoad > 0.5) {
      guidance.push('User showing moderate cognitive load - be clear and concise');
    }

    // Emotional momentum from voice
    if (emotionalMomentum) {
      if (emotionalMomentum.warmth === 'high') {
        guidance.push('Maintain warm, supportive tone (momentum: high warmth)');
      }
      if (emotionalMomentum.trend === 'building') {
        guidance.push('Energy is building - match the increasing momentum');
      } else if (emotionalMomentum.trend === 'dissipating') {
        guidance.push('Energy is settling - use calm, grounding language');
      }
    }

    // Human listening signals
    if (humanListeningResult) {
      const { text } = humanListeningResult;

      if (text.selfSoothing?.detected && text.selfSoothing.confidence > 0.5) {
        guidance.push('User is self-soothing - they need validation, not advice');
      }

      // HedgingAnalysisResult has 'elevated' and 'shouldProbe' flags
      if (text.hedging?.elevated && text.hedging.shouldProbe) {
        guidance.push('User hedging significantly - gently explore what they really mean');
      }

      if (humanListeningResult.shouldSlowDown) {
        guidance.push('Slow down - user needs processing time');
      }
    }

    // Speed control reason
    if (speedControl && speedControl.reason !== 'normal pace') {
      guidance.push(`Speech pacing: ${speedControl.reason}`);
    }

    return guidance.length > 0 ? `[VOICE INSIGHTS]\n${guidance.join('\n')}` : '';
  }

  /**
   * Format speech insights for LLM prompt injection
   */
  formatSpeechInsightsForPrompt(insights: SpeechInsightsContext): string {
    if (!insights.speechGuidance) {
      return '';
    }

    return insights.speechGuidance;
  }
}

// ============================================================================
// SINGLETON REGISTRY
// ============================================================================

const contextManagers = new Map<SessionId, ContextManager>();

/**
 * Get or create a context manager for a session
 *
 * @param sessionId - Session identifier (string or branded SessionId)
 * @param userProfile - Optional user profile to associate
 * @returns ContextManager instance for the session
 */
export function getContextManager(
  sessionId: string | SessionId,
  userProfile?: UserProfile
): ContextManager {
  // Ensure we have a branded SessionId
  const brandedId = typeof sessionId === 'string' ? createSessionId(sessionId) : sessionId;

  let manager = contextManagers.get(brandedId);

  if (!manager) {
    manager = new ContextManager(brandedId, userProfile);
    contextManagers.set(brandedId, manager);
  } else if (userProfile) {
    manager.setUserProfile(userProfile);
  }

  return manager;
}

/**
 * Check if a context manager exists for a session
 */
export function hasContextManager(sessionId: string | SessionId): boolean {
  const brandedId = typeof sessionId === 'string' ? createSessionId(sessionId) : sessionId;
  return contextManagers.has(brandedId);
}

/**
 * Remove a context manager (on session end)
 */
export function removeContextManager(sessionId: string | SessionId): void {
  const brandedId = typeof sessionId === 'string' ? createSessionId(sessionId) : sessionId;
  contextManagers.delete(brandedId);
}

/**
 * Get count of active context managers
 */
export function getContextManagerCount(): number {
  return contextManagers.size;
}

/**
 * Clear all context managers (for shutdown)
 */
export function clearAllContextManagers(): void {
  contextManagers.clear();
}

export default ContextManager;
