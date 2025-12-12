/**
 * ContextManager (class implementation)
 */

import { generateRollingSummary, type ConversationTurn } from '../memory/summarizer.js';
import { isValidPersonaId, type PersonaId, type SessionId } from '../types/branded.js';
import type { UserProfile } from '../types/user-profile.js';
import { getLogger } from '../utils/safe-logger.js';

import type { InjectedContent } from '../personas/shared/index.js';
import {
  buildContinuityContext,
  buildEmotionalContext,
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
  PhaseGuidance,
  PromptContext,
  SpeechInsightsContext,
} from './types.js';

export class ContextManager {
  private turns: ConversationTurn[] = [];
  private rollingSummary = '';
  private userProfile?: UserProfile;
  private readonly sessionId: SessionId;
  private readonly startedAt: Date;
  private currentPersona: PersonaId = 'ferni' as PersonaId;
  private previousPersona?: PersonaId;
  private rollingSummaryUpdateInFlight: Promise<void> | null = null;
  private rollingSummaryUpdateQueued = false;

  constructor(sessionId: SessionId, userProfile?: UserProfile) {
    this.sessionId = sessionId;
    this.userProfile = userProfile;
    this.startedAt = new Date();

    getLogger().info({ sessionId }, 'ContextManager created');
  }

  getSessionId(): SessionId {
    return this.sessionId;
  }

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

  getCurrentPersona(): PersonaId {
    return this.currentPersona;
  }

  setUserProfile(profile: UserProfile): void {
    this.userProfile = profile;
  }

  addTurn(turn: ConversationTurn): void {
    this.turns.push(turn);

    if (this.turns.length % 10 === 0) {
      void this.requestRollingSummaryUpdate();
    }
  }

  private async requestRollingSummaryUpdate(): Promise<void> {
    if (this.rollingSummaryUpdateInFlight) {
      this.rollingSummaryUpdateQueued = true;
      return;
    }

    const runUpdate = async (): Promise<void> => {
      try {
        this.rollingSummary = await generateRollingSummary(this.turns, this.rollingSummary);
        getLogger().debug('Updated rolling summary');
      } catch (error) {
        getLogger().warn({ error }, 'Failed to update rolling summary');
      }
    };

    this.rollingSummaryUpdateInFlight = runUpdate();
    await this.rollingSummaryUpdateInFlight;
    this.rollingSummaryUpdateInFlight = null;

    if (this.rollingSummaryUpdateQueued) {
      this.rollingSummaryUpdateQueued = false;
      await this.requestRollingSummaryUpdate();
    }
  }

  // ============================================================================
  // Pure-context builders (wrappers)
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
      },
      options
    );
  }

  // ============================================================================
  // Prompt assembly
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
    }
  ): PromptContext {
    // Merge defaults with provided options (complexity: 1)
    const opts = {
      includeRelationship: true,
      includeEmotional: true,
      includeTopics: true,
      includeHistory: true,
      maxLength: 2000,
      ...options,
    };

    // Extract context strings
    const contextStrings = this.buildAllContextStrings(opts, emotion, state, guidance);

    // Build final formatted prompt
    const formattedForPrompt = this.formatForPrompt({
      emotion,
      ...contextStrings,
      includeHistory: opts.includeHistory,
      maxLength: opts.maxLength,
    });

    // Return prompt context
    return this.assemblePromptContext(opts, state, emotion, contextStrings, formattedForPrompt);
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
    return {
      relationshipContext,
      emotionalContext,
      topicContext,
      continuityContext,
      phaseGuidance: phaseGuidanceStr,
      speechGuidance,
      sharedContent,
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
    formattedForPrompt: string
  ): PromptContext {
    const { speechInsights } = opts;
    const needsSupportFromVoice = speechInsights?.voiceDistressSignals ?? false;
    const needsSupportFromEmotion = (emotion?.distressLevel ?? 0) > 0.6;
    const durationMinutes = Math.floor((Date.now() - this.startedAt.getTime()) / 60000);

    return {
      sessionId: this.sessionId,
      currentPersona: this.currentPersona,
      phase: state?.phase || 'greeting',
      turnCount: this.turns.length,
      durationMinutes,
      relationshipContext: contextStrings.relationshipContext,
      userName: this.userProfile?.name,
      isReturning: (this.userProfile?.totalConversations ?? 0) > 1,
      emotionalContext: contextStrings.emotionalContext,
      needsSupport: needsSupportFromEmotion || needsSupportFromVoice,
      topicContext: contextStrings.topicContext,
      topicsToCircleBack: state?.topicsToCircleBack || [],
      rollingSummary: this.rollingSummary,
      lastConversationSummary: this.userProfile?.lastConversationSummary,
      formattedForPrompt,
      speechInsights,
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
    includeHistory: boolean;
    maxLength: number;
  }): string {
    const sections: string[] = [];
    appendPrioritySupport(sections, input.emotion, input.emotionalContext);
    appendIfPresent(sections, input.speechGuidance);
    appendIfPresent(sections, input.sharedContent);
    appendUserProfile(sections, this.userProfile, input.relationshipContext);
    appendIfPresent(sections, input.continuityContext);
    appendLabeled(sections, 'GUIDANCE', input.phaseGuidance);
    appendLabeled(sections, 'TOPICS', input.topicContext);
    appendRollingSummary(sections, input.includeHistory, this.rollingSummary);

    return truncateSections(sections, input.maxLength);
  }

  // ============================================================================
  // Convenience getters (used in tests and integrations)
  // ============================================================================

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
  }

  // ============================================================================
  // Speech insights (API preserved)
  // ============================================================================

  buildSpeechInsightsContext(
    options: Parameters<typeof buildSpeechInsightsContext>[0]
  ): SpeechInsightsContext {
    return buildSpeechInsightsContext(options);
  }

  formatSpeechInsightsForPrompt(insights: SpeechInsightsContext): string {
    return formatSpeechInsightsForPrompt(insights);
  }
}

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
