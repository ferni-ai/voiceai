/**
 * Emotional Arc Tracker
 *
 * Tracks emotional trajectory across turns, not just per-message.
 * Enables smooth emotional transitions and appropriate agent responses.
 *
 * Features:
 * - Emotional momentum tracking (improving/declining)
 * - Conversation "temperature" (overall emotional intensity)
 * - Transition smoothing (avoid jarring shifts)
 * - Empathy calibration (match intensity to user's emotional state)
 */

import { getLogger } from '../utils/safe-logger.js';
import type { EmotionResult } from '../intelligence/emotion-detector.js';
import type { VoiceEmotionResult } from '../speech/audio-prosody.js';

// ============================================================================
// TYPES
// ============================================================================

export interface EmotionalSnapshot {
  timestamp: number;
  textEmotion: string;
  textIntensity: number;
  voiceEmotion?: string;
  voiceArousal?: number;
  voiceValence?: number;
  combinedValence: number; // -1 to 1
  combinedArousal: number; // -1 to 1
}

export interface EmotionalArc {
  // Current state
  currentEmotion: string;
  currentValence: number;
  currentArousal: number;

  // Trajectory
  trajectory: 'improving' | 'stable' | 'declining' | 'volatile' | 'unknown';
  trajectoryConfidence: number;

  // Momentum (rate of change)
  valenceMomentum: number; // positive = improving, negative = declining
  arousalMomentum: number;

  // Temperature (overall intensity)
  conversationTemperature: number; // 0-1, higher = more emotional

  // Smoothed values for stable output
  smoothedValence: number;
  smoothedArousal: number;

  // Turn count since significant emotional event
  turnsSinceEmotionalPeak: number;
  turnsSinceDistress: number;

  // Flags
  needsEmotionalSupport: boolean;
  emotionStabilizing: boolean;
  suddenShiftDetected: boolean;
}

export interface EmotionalResponse {
  // How agent should respond
  suggestedTone: 'match' | 'calm' | 'uplift' | 'celebrate' | 'support';

  // Voice adjustments
  speedAdjust: number; // -0.3 to 0.3
  volumeAdjust: number; // 0.8 to 1.2
  warmthLevel: 'high' | 'medium' | 'low';
  pauseFrequency: 'more' | 'normal' | 'less';

  // Content guidance
  guidance: string;

  // SSML suggestions
  suggestedEmotion: string;
  suggestedBreaks: boolean;
}

// ============================================================================
// EMOTIONAL ARC TRACKER
// ============================================================================

export class EmotionalArcTracker {
  private history: EmotionalSnapshot[] = [];
  private readonly maxHistory = 20;
  private lastSignificantEvent: number = 0;
  private peakArousal: number = 0;
  private distressCount: number = 0;

  // Smoothing parameters
  private readonly smoothingFactor = 0.3; // Higher = more responsive to changes
  private readonly trajectoryWindow = 5; // Turns to consider for trajectory

  constructor() {
    getLogger().debug('EmotionalArcTracker initialized');
  }

  /**
   * Record a new emotional snapshot
   */
  recordEmotion(
    textEmotion: EmotionResult | null,
    voiceEmotion: VoiceEmotionResult | null
  ): EmotionalArc {
    const snapshot = this.createSnapshot(textEmotion, voiceEmotion);
    this.history.push(snapshot);

    // Trim history
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Track peaks and distress
    if (snapshot.combinedArousal > this.peakArousal) {
      this.peakArousal = snapshot.combinedArousal;
      this.lastSignificantEvent = Date.now();
    }

    if (snapshot.combinedValence < -0.5) {
      this.distressCount++;
    }

    return this.computeArc();
  }

  /**
   * Get current emotional arc
   */
  getArc(): EmotionalArc {
    return this.computeArc();
  }

  /**
   * Get response recommendations based on emotional arc
   */
  getResponseRecommendation(): EmotionalResponse {
    const arc = this.computeArc();
    return this.computeResponse(arc);
  }

  /**
   * Get SSML adjustments based on emotional state
   */
  getSsmlAdjustments(): {
    speed: number;
    volume: number;
    emotion: string;
    addBreaks: boolean;
  } {
    const arc = this.computeArc();
    const response = this.computeResponse(arc);

    // Map to actual SSML values
    let speed = 0.85; // Base speed
    let volume = 1.0;

    if (arc.needsEmotionalSupport) {
      speed = 0.75; // Slower for support
      volume = 0.95; // Slightly softer
    } else if (arc.trajectory === 'improving' && arc.currentValence > 0.3) {
      speed = 0.9; // More energy for positive momentum
      volume = 1.05;
    } else if (arc.conversationTemperature > 0.7) {
      speed = 0.8; // Calm high-emotion situations
    }

    // Apply adjustments
    speed += response.speedAdjust;
    volume *= response.volumeAdjust;

    // Clamp values
    speed = Math.max(0.6, Math.min(1.1, speed));
    volume = Math.max(0.8, Math.min(1.2, volume));

    return {
      speed,
      volume,
      emotion: response.suggestedEmotion,
      addBreaks: response.suggestedBreaks,
    };
  }

  /**
   * Check if there was a sudden emotional shift
   */
  hasSuddenShift(): boolean {
    if (this.history.length < 2) return false;

    const current = this.history[this.history.length - 1];
    const previous = this.history[this.history.length - 2];

    const valenceDelta = Math.abs(current.combinedValence - previous.combinedValence);
    const arousalDelta = Math.abs(current.combinedArousal - previous.combinedArousal);

    return valenceDelta > 0.5 || arousalDelta > 0.6;
  }

  /**
   * Get transition phrase for emotional shift
   */
  getTransitionPhrase(): string | null {
    if (!this.hasSuddenShift() || this.history.length < 2) return null;

    const current = this.history[this.history.length - 1];
    const previous = this.history[this.history.length - 2];

    // Improving mood
    if (current.combinedValence - previous.combinedValence > 0.4) {
      const phrases = [
        'I can hear things are looking up.',
        "That's a shift in tone—tell me more.",
        "Sounds like there's good news here.",
      ];
      return phrases[Math.floor(Math.random() * phrases.length)];
    }

    // Declining mood
    if (previous.combinedValence - current.combinedValence > 0.4) {
      const phrases = [
        'I hear that. That sounds difficult.',
        "Oh... that's a lot to carry.",
        "I'm sensing something shifted there.",
      ];
      return phrases[Math.floor(Math.random() * phrases.length)];
    }

    // Sudden increase in arousal
    if (current.combinedArousal - previous.combinedArousal > 0.5) {
      const phrases = [
        'I can hear this matters to you.',
        "Yes, I'm listening carefully.",
        'Tell me more about that.',
      ];
      return phrases[Math.floor(Math.random() * phrases.length)];
    }

    return null;
  }

  /**
   * Reset tracker (new conversation)
   */
  reset(): void {
    this.history = [];
    this.lastSignificantEvent = 0;
    this.peakArousal = 0;
    this.distressCount = 0;
    getLogger().debug('EmotionalArcTracker reset');
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private createSnapshot(
    textEmotion: EmotionResult | null,
    voiceEmotion: VoiceEmotionResult | null
  ): EmotionalSnapshot {
    // Extract text emotion values
    const textValence = textEmotion ? this.emotionToValence(textEmotion.primary) : 0;
    const textArousal = textEmotion ? textEmotion.intensity : 0.5;

    // Extract voice emotion values
    const voiceValence = voiceEmotion?.valence ?? 0;
    const voiceArousal = voiceEmotion?.arousal ?? 0.5;

    // Combine with weights (voice is more reliable for arousal, text for sentiment)
    const hasVoice = voiceEmotion !== null;
    const combinedValence = hasVoice ? textValence * 0.6 + voiceValence * 0.4 : textValence;
    const combinedArousal = hasVoice ? textArousal * 0.4 + voiceArousal * 0.6 : textArousal;

    return {
      timestamp: Date.now(),
      textEmotion: textEmotion?.primary ?? 'neutral',
      textIntensity: textEmotion?.intensity ?? 0.5,
      voiceEmotion: voiceEmotion?.primary,
      voiceValence,
      voiceArousal,
      combinedValence,
      combinedArousal,
    };
  }

  private emotionToValence(emotion: string): number {
    const valenceMap: Record<string, number> = {
      // Positive
      happy: 0.8,
      excited: 0.7,
      grateful: 0.7,
      hopeful: 0.6,
      curious: 0.3,
      confident: 0.5,

      // Negative
      sad: -0.7,
      angry: -0.6,
      frustrated: -0.5,
      anxious: -0.4,
      worried: -0.4,
      fearful: -0.6,
      overwhelmed: -0.5,
      guilty: -0.4,

      // Neutral
      neutral: 0,
      calm: 0.1,
      confused: -0.1,
    };

    return valenceMap[emotion.toLowerCase()] ?? 0;
  }

  private computeArc(): EmotionalArc {
    if (this.history.length === 0) {
      return this.getDefaultArc();
    }

    const current = this.history[this.history.length - 1];

    // Compute smoothed values
    const smoothedValence = this.computeSmoothedValue('combinedValence');
    const smoothedArousal = this.computeSmoothedValue('combinedArousal');

    // Compute trajectory
    const trajectory = this.computeTrajectory();

    // Compute momentum (rate of change)
    const valenceMomentum = this.computeMomentum('combinedValence');
    const arousalMomentum = this.computeMomentum('combinedArousal');

    // Compute temperature (average arousal with recency bias)
    const temperature = this.computeTemperature();

    // Detect support needs
    const needsSupport =
      current.combinedValence < -0.4 ||
      this.distressCount > 2 ||
      (current.combinedArousal > 0.7 && current.combinedValence < 0);

    // Detect stabilization
    const stabilizing =
      trajectory.type === 'improving' ||
      (Math.abs(valenceMomentum) < 0.1 && Math.abs(arousalMomentum) < 0.1);

    // Detect sudden shift
    const suddenShift = this.hasSuddenShift();

    // Compute turns since events
    const turnsSincePeak =
      this.history.length - this.history.findIndex((s) => s.combinedArousal === this.peakArousal);
    const lastDistressIdx = [...this.history].reverse().findIndex((s) => s.combinedValence < -0.5);
    const turnsSinceDistress = lastDistressIdx === -1 ? this.history.length : lastDistressIdx;

    return {
      currentEmotion: current.textEmotion,
      currentValence: current.combinedValence,
      currentArousal: current.combinedArousal,
      trajectory: trajectory.type,
      trajectoryConfidence: trajectory.confidence,
      valenceMomentum,
      arousalMomentum,
      conversationTemperature: temperature,
      smoothedValence,
      smoothedArousal,
      turnsSinceEmotionalPeak: turnsSincePeak,
      turnsSinceDistress,
      needsEmotionalSupport: needsSupport,
      emotionStabilizing: stabilizing,
      suddenShiftDetected: suddenShift,
    };
  }

  private computeSmoothedValue(field: 'combinedValence' | 'combinedArousal'): number {
    if (this.history.length === 0) return 0;
    if (this.history.length === 1) return this.history[0][field];

    // Exponential moving average
    let smoothed = this.history[0][field];
    for (let i = 1; i < this.history.length; i++) {
      smoothed =
        this.smoothingFactor * this.history[i][field] + (1 - this.smoothingFactor) * smoothed;
    }
    return smoothed;
  }

  private computeTrajectory(): { type: EmotionalArc['trajectory']; confidence: number } {
    if (this.history.length < 3) {
      return { type: 'unknown', confidence: 0 };
    }

    const window = this.history.slice(-this.trajectoryWindow);

    // Compute valence trend
    let valenceTrend = 0;
    let arousalVariance = 0;

    for (let i = 1; i < window.length; i++) {
      valenceTrend += window[i].combinedValence - window[i - 1].combinedValence;
      arousalVariance += Math.abs(window[i].combinedArousal - window[i - 1].combinedArousal);
    }

    valenceTrend /= window.length - 1;
    arousalVariance /= window.length - 1;

    // High variance = volatile
    if (arousalVariance > 0.3) {
      return { type: 'volatile', confidence: arousalVariance };
    }

    // Positive trend = improving
    if (valenceTrend > 0.1) {
      return { type: 'improving', confidence: Math.min(1, valenceTrend * 3) };
    }

    // Negative trend = declining
    if (valenceTrend < -0.1) {
      return { type: 'declining', confidence: Math.min(1, Math.abs(valenceTrend) * 3) };
    }

    return { type: 'stable', confidence: 1 - Math.abs(valenceTrend) * 5 };
  }

  private computeMomentum(field: 'combinedValence' | 'combinedArousal'): number {
    if (this.history.length < 2) return 0;

    const recent = this.history.slice(-3);
    let momentum = 0;

    for (let i = 1; i < recent.length; i++) {
      momentum += recent[i][field] - recent[i - 1][field];
    }

    return momentum / (recent.length - 1);
  }

  private computeTemperature(): number {
    if (this.history.length === 0) return 0.5;

    // Weighted average with recency bias
    let sum = 0;
    let weight = 0;

    for (let i = 0; i < this.history.length; i++) {
      const w = Math.pow(1.5, i); // Exponential weight
      sum += this.history[i].combinedArousal * w;
      weight += w;
    }

    return Math.max(0, Math.min(1, sum / weight));
  }

  private computeResponse(arc: EmotionalArc): EmotionalResponse {
    let tone: EmotionalResponse['suggestedTone'] = 'match';
    let speedAdjust = 0;
    let volumeAdjust = 1;
    let warmth: EmotionalResponse['warmthLevel'] = 'medium';
    let pauseFreq: EmotionalResponse['pauseFrequency'] = 'normal';
    let guidance = '';
    let emotion = 'neutral';
    let addBreaks = false;

    // Emotional support needed
    if (arc.needsEmotionalSupport) {
      tone = 'support';
      speedAdjust = -0.15;
      volumeAdjust = 0.95;
      warmth = 'high';
      pauseFreq = 'more';
      guidance =
        'User needs emotional support. Slow down, validate feelings, avoid rushing to solutions.';
      emotion = 'affectionate';
      addBreaks = true;
    }
    // Positive trajectory
    else if (arc.trajectory === 'improving' && arc.currentValence > 0.3) {
      tone = 'celebrate';
      speedAdjust = 0.1;
      volumeAdjust = 1.05;
      warmth = 'high';
      guidance = 'Mood is improving! Share in their positive energy.';
      emotion = 'happy';
    }
    // High arousal negative
    else if (arc.currentArousal > 0.6 && arc.currentValence < -0.2) {
      tone = 'calm';
      speedAdjust = -0.1;
      volumeAdjust = 0.95;
      warmth = 'high';
      pauseFreq = 'more';
      guidance = 'User is agitated. Stay calm, speak slowly, validate without escalating.';
      emotion = 'affectionate';
      addBreaks = true;
    }
    // Positive high energy
    else if (arc.currentArousal > 0.5 && arc.currentValence > 0.3) {
      tone = 'match';
      speedAdjust = 0.1;
      volumeAdjust = 1.1;
      warmth = 'medium';
      pauseFreq = 'less';
      guidance = 'User is energized and positive. Match their energy!';
      emotion = 'curious';
    }
    // Low energy
    else if (arc.currentArousal < 0.3) {
      tone = 'uplift';
      speedAdjust = 0;
      volumeAdjust = 1.0;
      warmth = 'high';
      guidance = 'User seems low energy. Be warm but not overwhelming.';
      emotion = 'affectionate';
    }
    // Volatile
    else if (arc.trajectory === 'volatile') {
      tone = 'calm';
      speedAdjust = -0.05;
      warmth = 'high';
      guidance = 'Emotional state is shifting. Stay grounded and attentive.';
      emotion = 'neutral';
    }

    return {
      suggestedTone: tone,
      speedAdjust,
      volumeAdjust,
      warmthLevel: warmth,
      pauseFrequency: pauseFreq,
      guidance,
      suggestedEmotion: emotion,
      suggestedBreaks: addBreaks,
    };
  }

  private getDefaultArc(): EmotionalArc {
    return {
      currentEmotion: 'neutral',
      currentValence: 0,
      currentArousal: 0.5,
      trajectory: 'unknown',
      trajectoryConfidence: 0,
      valenceMomentum: 0,
      arousalMomentum: 0,
      conversationTemperature: 0.5,
      smoothedValence: 0,
      smoothedArousal: 0.5,
      turnsSinceEmotionalPeak: 0,
      turnsSinceDistress: 100,
      needsEmotionalSupport: false,
      emotionStabilizing: true,
      suddenShiftDetected: false,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: EmotionalArcTracker | null = null;

export function getEmotionalArcTracker(): EmotionalArcTracker {
  if (!instance) {
    instance = new EmotionalArcTracker();
  }
  return instance;
}

export function resetEmotionalArcTracker(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}

export default EmotionalArcTracker;
