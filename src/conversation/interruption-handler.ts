/**
 * Interruption Handler
 *
 * Detects when users interrupt Jack and provides recovery phrases
 * to make Jack feel responsive and natural.
 */

import { log } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';

export interface InterruptionEvent {
  type: 'user_started_speaking' | 'user_stopped_speaking';
  timestamp: number;
  userEnergy: number;
  agentWasSpeaking: boolean;
  interruptedUtterance?: string;
}

export class InterruptionHandler {
  private agentCurrentlySpeaking: boolean = false;
  private currentAgentUtterance: string = '';
  private interruptionCount: number = 0;
  private lastInterruptionTime: number = 0;
  private interruptionHistory: InterruptionEvent[] = [];

  /**
   * Detect if user is interrupting the agent
   */
  detectInterruption(audioEvent: AudioFrame, agentSpeaking: boolean): InterruptionEvent | null {
    const userStartedSpeaking = audioEvent.sampleRate > 0 && audioEvent.samplesPerChannel > 0;

    if (userStartedSpeaking && agentSpeaking) {
      this.interruptionCount++;
      this.lastInterruptionTime = Date.now();

      const event: InterruptionEvent = {
        type: 'user_started_speaking',
        timestamp: Date.now(),
        userEnergy: this.estimateEnergy(audioEvent),
        agentWasSpeaking: true,
        interruptedUtterance: this.currentAgentUtterance,
      };

      this.interruptionHistory.push(event);
      log().info('User interrupted agent', {
        count: this.interruptionCount,
        utterance: this.currentAgentUtterance.substring(0, 50) + '...',
      });

      return event;
    }

    return null;
  }

  /**
   * Get a natural recovery phrase after being interrupted
   */
  getRecoveryPhrase(): string {
    const timeSinceLastInterruption = Date.now() - this.lastInterruptionTime;
    const isFrequentInterrupter = this.interruptionCount > 3;

    // If user interrupts frequently, Jack should be more yielding
    if (isFrequentInterrupter) {
      const yieldingPhrases = [
        "No, please—go ahead.",
        "I'm listening. What's on your mind?",
        "Tell me what you're thinking.",
        "Yes, I want to hear this.",
        "Please, continue.",
      ];
      return yieldingPhrases[Math.floor(Math.random() * yieldingPhrases.length)];
    }

    // Standard recovery phrases
    const recoveries = [
      "Oh! Go ahead, what were you saying?",
      "Sorry, I was rambling. What's on your mind?",
      "Yes, yes—please, go ahead.",
      "Oh, excuse me. You go first.",
      "<break time=\"150ms\"/>Right, right. Tell me.",
      "I'm sorry, I interrupted your thought. Please continue.",
      "No, no—what were you going to say?",
      "I should let you talk. Go ahead.",
    ];

    return recoveries[Math.floor(Math.random() * recoveries.length)];
  }

  /**
   * Determine if Jack should give shorter responses
   * (user wants to talk more)
   */
  shouldShortenNextResponse(): boolean {
    // Recent interruptions suggest user wants to talk
    const recentInterruptions = this.interruptionHistory.filter(
      e => Date.now() - e.timestamp < 60000 // Last minute
    ).length;

    return recentInterruptions > 2;
  }

  /**
   * Get guidance for response length
   */
  getResponseLengthGuidance(): string {
    if (this.shouldShortenNextResponse()) {
      return "Keep responses brief (1-2 sentences). User wants to talk more.";
    }

    if (this.interruptionCount === 0) {
      return "User hasn't interrupted. Can elaborate more naturally.";
    }

    return "Normal response length. Listen for user's pace.";
  }

  /**
   * Set agent speaking state
   */
  setAgentSpeaking(speaking: boolean, utterance?: string): void {
    this.agentCurrentlySpeaking = speaking;
    if (utterance) {
      this.currentAgentUtterance = utterance;
    }
  }

  /**
   * Get interruption statistics
   */
  getStats(): {
    totalInterruptions: number;
    recentInterruptions: number;
    shouldYield: boolean;
    guidance: string;
  } {
    const recentInterruptions = this.interruptionHistory.filter(
      e => Date.now() - e.timestamp < 60000
    ).length;

    return {
      totalInterruptions: this.interruptionCount,
      recentInterruptions,
      shouldYield: this.shouldShortenNextResponse(),
      guidance: this.getResponseLengthGuidance(),
    };
  }

  /**
   * Reset interruption tracking (new session)
   */
  reset(): void {
    this.interruptionCount = 0;
    this.lastInterruptionTime = 0;
    this.interruptionHistory = [];
    this.currentAgentUtterance = '';
    this.agentCurrentlySpeaking = false;
  }

  /**
   * Estimate audio energy from frame
   * (Simple placeholder - real implementation would analyze samples)
   */
  private estimateEnergy(frame: AudioFrame): number {
    // In production, analyze frame.data buffer for RMS energy
    // For now, return moderate energy
    return 0.6 + Math.random() * 0.3;
  }
}

// Singleton instance
let defaultHandler: InterruptionHandler | null = null;

/**
 * Get global interruption handler
 */
export function getInterruptionHandler(): InterruptionHandler {
  if (!defaultHandler) {
    defaultHandler = new InterruptionHandler();
  }
  return defaultHandler;
}

/**
 * Reset global interruption handler
 */
export function resetInterruptionHandler(): void {
  if (defaultHandler) {
    defaultHandler.reset();
  }
}
