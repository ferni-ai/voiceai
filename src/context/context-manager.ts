/**
 * Context Manager
 *
 * Manages conversation context for prompt injection.
 * Handles rolling summaries, relationship context, and cross-session continuity.
 */

import { getLogger } from '../utils/safe-logger.js';
import type { UserProfile } from '../types/user-profile.js';
import type { ConversationState, PhaseGuidance } from '../intelligence/conversation-state.js';
import type { EmotionResult } from '../intelligence/emotion-detector.js';
import { generateRollingSummary, type ConversationTurn } from '../memory/summarizer.js';
import {
  injectSharedContent,
  formatForPrompt,
  type SharedContentContext,
  type InjectedContent,
} from '../personas/shared/index.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Context for prompt injection
 */
export interface PromptContext {
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
 */
export class ContextManager {
  private turns: ConversationTurn[] = [];
  private rollingSummary: string = '';
  private userProfile?: UserProfile;
  private sessionId: string;
  private startedAt: Date;
  private currentPersona: string = 'jack-b';
  private previousPersona?: string;

  constructor(sessionId: string, userProfile?: UserProfile) {
    this.sessionId = sessionId;
    this.userProfile = userProfile;
    this.startedAt = new Date();

    getLogger().info(`ContextManager created for session: ${sessionId}`);
  }

  /**
   * Set current persona (for shared content)
   */
  setCurrentPersona(personaId: string, previousPersonaId?: string): void {
    this.previousPersona = this.currentPersona;
    this.currentPersona = personaId;
    if (previousPersonaId) {
      this.previousPersona = previousPersonaId;
    }
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

    // Generate rolling summary every 10 turns
    if (this.turns.length % 10 === 0) {
      this.updateRollingSummary();
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
      formatted = formatted.slice(0, opts.maxLength) + '...';
    }

    return {
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
  getContextWindow(maxTurns: number = 10): ConversationTurn[] {
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
}

// ============================================================================
// SINGLETON
// ============================================================================

const contextManagers: Map<string, ContextManager> = new Map();

/**
 * Get or create a context manager for a session
 */
export function getContextManager(sessionId: string, userProfile?: UserProfile): ContextManager {
  let manager = contextManagers.get(sessionId);

  if (!manager) {
    manager = new ContextManager(sessionId, userProfile);
    contextManagers.set(sessionId, manager);
  } else if (userProfile) {
    manager.setUserProfile(userProfile);
  }

  return manager;
}

/**
 * Remove a context manager (on session end)
 */
export function removeContextManager(sessionId: string): void {
  contextManagers.delete(sessionId);
}

/**
 * Clear all context managers (for shutdown)
 */
export function clearAllContextManagers(): void {
  contextManagers.clear();
}

export default ContextManager;
