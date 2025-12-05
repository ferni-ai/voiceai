/**
 * Conversation Manager - Orchestrates Real-Time Dynamics
 *
 * Coordinates interruption handling, turn-taking, topic changes,
 * and backchanneling for natural conversation flow.
 */

import { log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import type { AudioFrame } from '@livekit/rtc-node';
import { getInterruptionHandler } from '../conversation/interruption-handler.js';
import { getTurnTakingMonitor } from '../conversation/turn-taking.js';
import { getTopicChangeDetector } from '../conversation/topic-change-detector.js';
import { getBackchannelingSystem } from '../speech/backchanneling.js';
import type { EmotionResult } from '../intelligence/emotion-detector.js';
import type { TopicWeight } from '../speech/speech-context.js';

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
  private interruptionHandler = getInterruptionHandler();
  private turnMonitor = getTurnTakingMonitor();
  private topicDetector = getTopicChangeDetector();
  private backchannelSystem = getBackchannelingSystem();

  private agentCurrentlySpeaking = false;
  private currentAgentUtterance = '';
  private userSpeakingStartTime: number | null = null;

  // Callback for feeding insights to the learning engine
  private insightCallback:
    | ((type: string, key: string, value: unknown, confidence: number) => void)
    | null = null;

  // Current persona ID for persona-specific behaviors
  private personaId: string | null = null;

  /**
   * Set the current persona ID for persona-specific behaviors
   * Called when persona is loaded or changes
   */
  setPersonaId(personaId: string): void {
    this.personaId = personaId;
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
            topic: this.topicDetector.getCurrentTopic(),
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
    const topicChange = this.topicDetector.analyzeForTopicChange(userMessage);
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

    const backchannelResult = this.backchannelSystem.shouldBackchannel({
      userHasBeenSpeaking: userSpeakingDuration,
      userPausedBriefly: userSpeakingDuration > 3000, // Assume pause after 3+ seconds
      userEmotion: emotion,
      topicWeight,
      lastBackchannelTime: this.backchannelSystem.getStats().lastTime,
      personaId: this.personaId || undefined, // Pass persona for persona-specific backchannels
    });

    if (backchannelResult.shouldBackchannel && backchannelResult.phrase) {
      enhancements.backchannel = backchannelResult.phrase;
      this.backchannelSystem.recordBackchannel();
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
    return this.topicDetector.getCurrentTopic();
  }

  /**
   * Get topic history
   */
  getTopicHistory(): string[] {
    return this.topicDetector.getTopicHistory();
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.interruptionHandler.reset();
    this.turnMonitor.reset();
    this.topicDetector.reset();
    this.backchannelSystem.reset();
    this.agentCurrentlySpeaking = false;
    this.currentAgentUtterance = '';
    this.userSpeakingStartTime = null;
    this.insightCallback = null;
  }

  /**
   * Get comprehensive stats
   */
  getStats() {
    return {
      interruptions: this.interruptionHandler.getStats(),
      turnTaking: this.turnMonitor.getStats(),
      currentTopic: this.topicDetector.getCurrentTopic(),
      backchannels: this.backchannelSystem.getStats(),
    };
  }
}

// Singleton instance
let defaultManager: ConversationManager | null = null;

/**
 * Get global conversation manager
 */
export function getConversationManager(): ConversationManager {
  if (!defaultManager) {
    defaultManager = new ConversationManager();
  }
  return defaultManager;
}

/**
 * Reset global conversation manager
 */
export function resetConversationManager(): void {
  if (defaultManager) {
    defaultManager.reset();
  }
  defaultManager = null;
}
