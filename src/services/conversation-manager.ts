/**
 * Conversation Manager - Orchestrates Real-Time Dynamics
 *
 * Coordinates interruption handling, turn-taking, topic changes,
 * and backchanneling for natural conversation flow.
 *
 * REFACTORED: Now session-scoped to prevent cross-session contamination.
 * Use getSessionConversationManager(sessionId) to get session-specific instance.
 * Legacy getConversationManager() still works for backward compatibility but is deprecated.
 */

import type { AudioFrame } from '@livekit/rtc-node';
import { getInterruptionHandler } from '../conversation/interruption-handler.js';
import { getTurnTakingMonitor } from '../conversation/turn-taking.js';
import type { EmotionResult } from '../intelligence/detectors/emotion.js';
import { getTopicTracker } from '../intelligence/topic-tracker.js';
import { getBackchannelManager } from '../speech/backchanneling/index.js';
import type { TopicWeight } from '../speech/speech-context.js';
import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationEnhancements {
  // Prefix to add to response (e.g., interruption recovery)
  responsePrefix?: string;

  // Length guidance for next response
  lengthGuidance: 'brief' | 'normal' | 'detailed';

  // Should invite user to speak?
  shouldInviteToSpeak: boolean;

  // Topic transition phrase (if topic changed)
  topicTransition?: string;

  // Backchannel phrase (if needed)
  backchannel?: string;

  // Meta guidance for LLM
  metaGuidance: string[];
}

// ============================================================================
// CONVERSATION MANAGER
// ============================================================================

export class ConversationManager {
  private readonly sessionId: string;
  private interruptionHandler = getInterruptionHandler();
  private turnMonitor = getTurnTakingMonitor();
  private topicTracker = getTopicTracker();

  private agentCurrentlySpeaking = false;
  private currentAgentUtterance = '';
  private userSpeakingStartTime: number | null = null;

  // Callback for feeding insights to the learning engine
  private insightCallback:
    | ((type: string, key: string, value: unknown, confidence: number) => void)
    | null = null;

  // Current persona ID for persona-specific behaviors
  private personaId: string | null = null;

  // Track last backchannel time for rate limiting
  private lastBackchannelTime = 0;

  constructor(sessionId = 'default') {
    this.sessionId = sessionId;
  }

  /**
   * Set the current persona ID for persona-specific behaviors
   * Called when persona is loaded or changes
   */
  setPersonaId(personaId: string): void {
    this.personaId = personaId;
  }

  /**
   * Get the session-scoped backchanneling manager
   */
  private getBackchannelEngine() {
    return getBackchannelManager(this.sessionId).getEngine('standard');
  }

  /**
   * Set the callback for capturing conversation insights
   * Called by services/index.ts during session setup
   */
  setInsightCallback(
    callback: (type: string, key: string, value: unknown, confidence: number) => void
  ): void {
    this.insightCallback = callback;
  }

  private captureInsight(type: string, key: string, value: unknown, confidence: number): void {
    if (this.insightCallback) {
      this.insightCallback(type, key, value, confidence);
    }
  }

  /**
   * Handle user starting to speak
   */
  handleUserStartedSpeaking(audioFrame?: AudioFrame): void {
    this.userSpeakingStartTime = Date.now();

    // Check for interruption
    if (this.agentCurrentlySpeaking && audioFrame) {
      const interruption = this.interruptionHandler.detectInterruption(
        audioFrame,
        this.agentCurrentlySpeaking
      );

      if (interruption) {
        getLogger().info('User interrupted Jack', {
          utterance: this.currentAgentUtterance.substring(0, 50),
        });

        // Capture interruption pattern for learning
        this.captureInsight(
          'communication_style',
          'interruption_pattern',
          {
            utteranceLength: this.currentAgentUtterance.length,
            topic: this.topicTracker.getCurrentTopic()?.name || null,
          },
          0.6
        );

        // Stop agent speech immediately (handled by LiveKit)
        this.agentCurrentlySpeaking = false;
      }
    }
  }

  /**
   * Handle user finished speaking
   */
  handleUserFinishedSpeaking(durationMs: number): void {
    // Record user turn
    this.turnMonitor.recordTurn('user', durationMs);
    this.userSpeakingStartTime = null;
  }

  /**
   * Handle agent started speaking
   */
  handleAgentStartedSpeaking(utterance: string): void {
    this.agentCurrentlySpeaking = true;
    this.currentAgentUtterance = utterance;
    this.interruptionHandler.setAgentSpeaking(true, utterance);
  }

  /**
   * Handle agent finished speaking
   */
  handleAgentFinishedSpeaking(durationMs: number): void {
    this.agentCurrentlySpeaking = false;
    this.interruptionHandler.setAgentSpeaking(false);
    this.turnMonitor.recordTurn('jack', durationMs);
  }

  /**
   * Check if agent is currently speaking
   * Used by backchannel system to avoid overlapping speech
   */
  isAgentSpeaking(): boolean {
    return this.agentCurrentlySpeaking;
  }

  /**
   * Analyze conversation and get enhancements for next response
   */
  getConversationEnhancements(
    userMessage: string,
    emotion: EmotionResult,
    topicWeight: TopicWeight
  ): ConversationEnhancements {
    const enhancements: ConversationEnhancements = {
      lengthGuidance: 'normal',
      shouldInviteToSpeak: false,
      metaGuidance: [],
    };

    // 1. Check for interruption recovery
    const interruptionStats = this.interruptionHandler.getStats();
    if (interruptionStats.recentInterruptions > 0) {
      enhancements.responsePrefix = this.interruptionHandler.getRecoveryPhrase();
      enhancements.lengthGuidance = 'brief';
      enhancements.metaGuidance.push('User has interrupted. Keep brief. Let them talk.');
    }

    // 2. Check turn-taking balance
    const turnStats = this.turnMonitor.getStats();
    if (this.turnMonitor.shouldInviteUserToSpeak()) {
      enhancements.shouldInviteToSpeak = true;
      enhancements.metaGuidance.push('Jack is dominating. MUST invite user to speak.');
      enhancements.lengthGuidance = 'brief';
    } else if (this.turnMonitor.shouldKeepResponseBrief()) {
      enhancements.lengthGuidance = 'brief';
      enhancements.metaGuidance.push('Keep response brief. User wants more space.');
    }

    // Log turn balance
    const speakingRatio = this.turnMonitor.getSpeakingRatio();
    enhancements.metaGuidance.push(
      `Speaking ratio: Jack ${(speakingRatio * 100).toFixed(0)}%, User ${((1 - speakingRatio) * 100).toFixed(0)}%`
    );

    // 3. Check for topic change
    const topicChange = this.topicTracker.detectTopicChange(userMessage);
    if (topicChange.detected && topicChange.transitionPhrase) {
      enhancements.topicTransition = topicChange.transitionPhrase;
      enhancements.metaGuidance.push(
        `Topic changed: ${topicChange.previousTopic} → ${topicChange.newTopic}`
      );

      // Capture topic interest for learning
      if (topicChange.newTopic) {
        this.captureInsight(
          'topic_interest',
          topicChange.newTopic,
          {
            previousTopic: topicChange.previousTopic,
            userInitiated: true,
          },
          0.7
        );
      }
    }

    // 4. Check for backchanneling need (with persona-specific backchannels)
    const userSpeakingDuration = this.userSpeakingStartTime
      ? Date.now() - this.userSpeakingStartTime
      : 0;

    // Use the unified backchanneling engine
    const backchannelEngine = this.getBackchannelEngine();
    const timeSinceLastBackchannel = this.lastBackchannelTime
      ? Date.now() - this.lastBackchannelTime
      : undefined;

    // Create context for the unified backchannel engine
    const backchannelDecision = backchannelEngine.decide({
      sessionId: this.sessionId,
      personaId: this.personaId || 'ferni',
      userSpeechDuration: userSpeakingDuration,
      currentPauseDuration: userSpeakingDuration > 3000 ? 500 : 0, // Assume brief pause after 3+ seconds
      userEmotion: emotion,
      topicWeight: topicWeight,
      turnCount: 0, // Not tracked here - could be added
      backchannelCountThisTurn: 0, // Not tracked here - could be added
      lastBackchannelTime: this.lastBackchannelTime || undefined,
      timeSinceLastBackchannel,
    });

    if (backchannelDecision.shouldEmit && backchannelDecision.phrase) {
      enhancements.backchannel = backchannelDecision.phrase;
      this.lastBackchannelTime = Date.now();
    }

    // 5. Add length guidance details
    if (enhancements.lengthGuidance === 'brief') {
      enhancements.metaGuidance.push('Response length: 1-2 sentences max');
    } else if (enhancements.lengthGuidance === 'detailed') {
      enhancements.metaGuidance.push('Response length: Can elaborate fully');
    }

    return enhancements;
  }

  /**
   * Build conversation guidance string for prompt
   */
  buildConversationGuidance(enhancements: ConversationEnhancements): string {
    let guidance = '\n\n[CONVERSATION DYNAMICS]\n';
    guidance += enhancements.metaGuidance.join('\n');

    if (enhancements.shouldInviteToSpeak) {
      guidance += '\n\n⚠️ CRITICAL: End your response with an invitation for the user to speak.';
      guidance += `\nUse: "${this.turnMonitor.getInvitation()}"`;
    }

    if (enhancements.lengthGuidance === 'brief') {
      guidance += '\n\n⚠️ Keep response BRIEF (1-2 sentences). User wants to talk more.';
    }

    return guidance;
  }

  /**
   * Get current topic
   */
  getCurrentTopic(): string | null {
    return this.topicTracker.getCurrentTopic()?.name || null;
  }

  /**
   * Get topic history
   */
  getTopicHistory(): string[] {
    return this.topicTracker.getSimpleTopicHistory();
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.interruptionHandler.reset();
    this.turnMonitor.reset();
    this.topicTracker.clear();
    // Reset backchanneling via the session-scoped manager
    getBackchannelManager(this.sessionId).reset();
    this.agentCurrentlySpeaking = false;
    this.currentAgentUtterance = '';
    this.userSpeakingStartTime = null;
    this.lastBackchannelTime = 0;
    this.insightCallback = null;
  }

  /**
   * Get comprehensive stats
   */
  getStats() {
    return {
      interruptions: this.interruptionHandler.getStats(),
      turnTaking: this.turnMonitor.getStats(),
      currentTopic: this.topicTracker.getCurrentTopic()?.name || null,
      backchannels: {
        lastTime: this.lastBackchannelTime,
        count: 0, // Simplified stats - detailed stats available via BackchannelEngine
      },
    };
  }
}

// ============================================================================
// SESSION-SCOPED MANAGEMENT
// ============================================================================

const sessionManagers = new Map<string, ConversationManager>();

/**
 * Get session-scoped conversation manager
 * This is the preferred way to get a ConversationManager instance.
 */
export function getSessionConversationManager(sessionId: string): ConversationManager {
  let manager = sessionManagers.get(sessionId);
  if (!manager) {
    manager = new ConversationManager(sessionId);
    sessionManagers.set(sessionId, manager);
    getLogger().debug({ sessionId }, 'Created session conversation manager');
  }
  return manager;
}

/**
 * Reset session-scoped conversation manager
 */
export function resetSessionConversationManager(sessionId: string): void {
  const manager = sessionManagers.get(sessionId);
  if (manager) {
    manager.reset();
    sessionManagers.delete(sessionId);
    getLogger().debug({ sessionId }, 'Reset session conversation manager');
  }
}

// ============================================================================
// LEGACY GLOBAL SINGLETON (DEPRECATED)
// ============================================================================

// Global singleton instance for backward compatibility
let defaultManager: ConversationManager | null = null;

/**
 * Get global conversation manager
 * @deprecated Use getSessionConversationManager(sessionId) instead for session isolation
 */
export function getConversationManager(): ConversationManager {
  if (!defaultManager) {
    defaultManager = new ConversationManager('global');
  }
  return defaultManager;
}

/**
 * Reset global conversation manager
 * @deprecated Use resetSessionConversationManager(sessionId) instead
 */
export function resetConversationManager(): void {
  if (defaultManager) {
    defaultManager.reset();
  }
  defaultManager = null;
}
