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
   * Estimate audio energy from frame using RMS (Root Mean Square)
   * Returns normalized energy level from 0.0 (silence) to 1.0 (max)
   */
  private estimateEnergy(frame: AudioFrame): number {
    try {
      // Get audio data buffer
      const data = frame.data;
      if (!data || data.length === 0) {
        return 0;
      }

      const samplesPerChannel = frame.samplesPerChannel;
      const channels = frame.channels || 1;
      const totalSamples = samplesPerChannel * channels;

      // For 16-bit PCM audio (most common), samples are Int16
      // Each sample is 2 bytes, values range from -32768 to 32767
      const bytesPerSample = 2;
      const numSamples = Math.min(totalSamples, Math.floor(data.length / bytesPerSample));

      if (numSamples === 0) {
        return 0;
      }

      // Calculate RMS energy
      let sumSquares = 0;
      for (let i = 0; i < numSamples; i++) {
        const offset = i * bytesPerSample;
        // Read signed 16-bit little-endian sample
        const sample = (data[offset + 1] << 8) | data[offset];
        // Convert to signed value
        const signedSample = sample > 32767 ? sample - 65536 : sample;
        // Normalize to -1.0 to 1.0 range
        const normalized = signedSample / 32768;
        sumSquares += normalized * normalized;
      }

      // RMS = sqrt(sum of squares / n)
      const rms = Math.sqrt(sumSquares / numSamples);

      // RMS typically ranges 0-1, but speech usually peaks around 0.1-0.4
      // Normalize to make speech register around 0.5-0.8
      const normalized = Math.min(1.0, rms * 3);

      return normalized;
    } catch (error) {
      log().warn({ error }, 'Error estimating audio energy');
      // Fallback to moderate energy on error
      return 0.5;
    }
  }

  /**
   * Check if audio level indicates speech (above silence threshold)
   */
  isSpeechDetected(frame: AudioFrame, silenceThreshold: number = 0.15): boolean {
    const energy = this.estimateEnergy(frame);
    return energy > silenceThreshold;
  }

  /**
   * Get detailed energy analysis for debugging/logging
   */
  analyzeAudio(frame: AudioFrame): {
    energy: number;
    isSpeech: boolean;
    isLoud: boolean;
    isSilence: boolean;
  } {
    const energy = this.estimateEnergy(frame);
    return {
      energy,
      isSpeech: energy > 0.15,
      isLoud: energy > 0.6,
      isSilence: energy < 0.05,
    };
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
