/**
 * Live Backchanneling Service
 *
 * Provides real-time verbal feedback during user speech.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { CONFIG, SOFT_BACKCHANNELS } from './constants.js';
import type { LiveBackchannelContext, LiveBackchannelResult } from './types.js';

// ============================================================================
// LIVE BACKCHANNELING SERVICE
// ============================================================================

export class LiveBackchannelingService {
  private lastBackchannelTime = 0;
  private backchannelCount = 0;
  private recentBackchannels: string[] = [];

  /**
   * Determine if we should emit a live backchannel
   */
  shouldEmitLiveBackchannel(ctx: LiveBackchannelContext): LiveBackchannelResult {
    const noBackchannel: LiveBackchannelResult = {
      shouldBackchannel: false,
      phrase: null,
      volumeRatio: CONFIG.SOFT_VOLUME_RATIO,
      allowOverlap: false,
      reason: 'none',
    };

    // ===== PREREQUISITE CHECKS =====

    // Not enough turns to establish rapport
    if (ctx.turnCount < CONFIG.MIN_TURNS) {
      return { ...noBackchannel, reason: 'insufficient_turns' };
    }

    // User hasn't been speaking long enough
    if (ctx.userSpeakingDurationMs < CONFIG.MIN_SPEAKING_DURATION) {
      return { ...noBackchannel, reason: 'speaking_too_short' };
    }

    // Too soon since last backchannel
    if (ctx.timeSinceLastBackchannel < CONFIG.MIN_INTERVAL) {
      return { ...noBackchannel, reason: 'too_soon' };
    }

    // Not in a breath pause - don't interrupt mid-word
    if (!ctx.isBreathPause) {
      return { ...noBackchannel, reason: 'not_breath_pause' };
    }

    // ===== PROBABILITY CHECK =====

    const probability = ctx.isEmotionalMoment
      ? CONFIG.EMOTIONAL_PROBABILITY
      : CONFIG.BASE_PROBABILITY;

    if (Math.random() > probability) {
      return { ...noBackchannel, reason: 'probability_skip' };
    }

    // ===== GENERATE BACKCHANNEL =====

    const phrase = this.selectBackchannel(ctx);
    if (!phrase) {
      return { ...noBackchannel, reason: 'no_phrase_available' };
    }

    // Record this backchannel
    this.lastBackchannelTime = Date.now();
    this.backchannelCount++;
    this.recentBackchannels.push(phrase);
    if (this.recentBackchannels.length > 5) {
      this.recentBackchannels.shift();
    }

    getLogger().debug(
      {
        personaId: ctx.personaId,
        phrase,
        userSpeakingMs: ctx.userSpeakingDurationMs,
        isEmotional: ctx.isEmotionalMoment,
        count: this.backchannelCount,
      },
      '🎤 Live backchannel triggered'
    );

    return {
      shouldBackchannel: true,
      phrase: this.wrapWithSoftVolume(phrase),
      volumeRatio: CONFIG.SOFT_VOLUME_RATIO,
      allowOverlap: true,
      reason: 'triggered',
    };
  }

  /**
   * Select appropriate backchannel phrase
   */
  private selectBackchannel(ctx: LiveBackchannelContext): string | null {
    // Determine emotion type
    const emotionType = ctx.isEmotionalMoment ? 'empathetic' : 'neutral';

    // Get persona-specific phrases
    const personaPhrases = SOFT_BACKCHANNELS[ctx.personaId];
    if (personaPhrases) {
      const phrases = personaPhrases[emotionType] || personaPhrases['neutral'];
      if (phrases && phrases.length > 0) {
        // Avoid repeating recent backchannels
        const availablePhrases = phrases.filter((p) => !this.recentBackchannels.includes(p));
        if (availablePhrases.length > 0) {
          return availablePhrases[Math.floor(Math.random() * availablePhrases.length)];
        }
        // Fall back to any phrase if all were recently used
        return phrases[Math.floor(Math.random() * phrases.length)];
      }
    }

    // Fall back to generic
    const genericPhrases = ['Mm', 'Yeah', 'Mhm'];
    return genericPhrases[Math.floor(Math.random() * genericPhrases.length)];
  }

  /**
   * Wrap phrase with SSML for soft volume
   */
  private wrapWithSoftVolume(phrase: string): string {
    // Use Cartesia-compatible SSML
    return `<volume level="soft"><speed ratio="0.95">${phrase}</speed></volume>`;
  }

  /**
   * Get the last backchannel time
   */
  getLastBackchannelTime(): number {
    return this.lastBackchannelTime;
  }

  /**
   * Reset service state
   */
  reset(): void {
    this.lastBackchannelTime = 0;
    this.backchannelCount = 0;
    this.recentBackchannels = [];
  }
}
