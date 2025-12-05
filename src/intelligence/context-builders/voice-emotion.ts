/**
 * Voice Emotion Context Builder
 *
 * Integrates voice emotion signals into cognitive adjustments.
 * When we detect stress, tremor, or other voice qualities,
 * this builder suggests cognitive adaptations.
 *
 * This creates emotionally intelligent AI that responds to
 * HOW something is said, not just WHAT is said.
 */

import { registerContextBuilder, createStandardInjection, createHintInjection, createCriticalInjection } from './index.js';
import type { ContextBuilderInput, ContextInjection } from './index.js';
import {
  processVoiceEmotion,
  generateVoiceAwareGuidance,
  trackSessionVoiceEmotion,
  getSessionVoiceState,
  type VoiceEmotionSignals,
  type CognitiveStateAdjustment,
} from '../voice-emotion-cognitive.js';

// Broadcast service for real-time dashboard updates
import { broadcastVoiceEmotion } from '../../services/cognitive-broadcast.js';

// Session tracking for voice emotion state
const sessionVoiceHistory: Map<string, string[]> = new Map();

/**
 * Build voice emotion context
 */
async function buildVoiceEmotionContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const sessionId = input.services.sessionId || 'default';

  // Get voice emotion if available
  const voiceEmotion = input.voiceEmotion;

  if (!voiceEmotion) {
    return injections;
  }

  // Initialize session tracking
  if (!sessionVoiceHistory.has(sessionId)) {
    sessionVoiceHistory.set(sessionId, []);
  }
  const history = sessionVoiceHistory.get(sessionId)!;
  history.push(voiceEmotion.emotion);
  if (history.length > 10) {
    history.shift();
  }

  // Build voice emotion signals
  const signals: VoiceEmotionSignals = {
    emotion: voiceEmotion.emotion,
    confidence: voiceEmotion.confidence,
    speechRate: voiceEmotion.speechRate,
    pitchVariance: voiceEmotion.pitch,
    // Additional signals from voice analysis if available
    hasTremor: detectTremorFromPitch(voiceEmotion.pitch),
    isRushed: detectRushFromRate(voiceEmotion.speechRate),
    hasHesitation: detectHesitation(input.userText),
  };

  // Track session voice emotion
  const sessionState = trackSessionVoiceEmotion(sessionId, signals);

  // 📡 Broadcast voice emotion for dashboard
  broadcastVoiceEmotion(
    input.services.userId || 'anonymous',
    signals.emotion,
    signals.confidence || 0.5,
    sessionState.emotionalTrend || 'stable'
  );

  // Process voice emotion for cognitive adjustments
  const adjustment = processVoiceEmotion(signals);

  // ============================================================================
  // 1. VOICE EMOTIONAL SIGNALS - Critical guidance
  // ============================================================================
  const voiceGuidance = generateVoiceAwareGuidance(signals);

  if (voiceGuidance.length > 0) {
    // High-priority voice signals
    const priorityGuidance = voiceGuidance.filter(g => 
      g.includes('tremor') || g.includes('emotionally affected')
    );

    if (priorityGuidance.length > 0) {
      injections.push(
        createCriticalInjection(
          'voice-emotion-critical',
          priorityGuidance.join('\n'),
          { category: 'voice-emotion', confidence: 0.9 }
        )
      );
    }

    // Standard voice signals
    const standardGuidance = voiceGuidance.filter(g => 
      !g.includes('tremor') && !g.includes('emotionally affected')
    );

    if (standardGuidance.length > 0) {
      injections.push(
        createStandardInjection(
          'voice-emotion-guidance',
          standardGuidance.join('\n'),
          { category: 'voice-emotion', confidence: 0.8 }
        )
      );
    }
  }

  // ============================================================================
  // 2. COGNITIVE STYLE OVERRIDE - When voice suggests different approach
  // ============================================================================
  if (adjustment.suggestionStrength > 0.6 && adjustment.suggestedStyle) {
    injections.push(
      createStandardInjection(
        'voice-cognitive-shift',
        `[VOICE-TRIGGERED SHIFT] Based on voice signals, shift to ${adjustment.suggestedStyle} approach. Reason: ${adjustment.reason}`,
        { category: 'voice-emotion', confidence: adjustment.suggestionStrength }
      )
    );
  }

  // ============================================================================
  // 3. EMOTIONAL TREND - Track improving/worsening
  // ============================================================================
  if (sessionState.totalSamples >= 3) {
    if (sessionState.emotionalTrend === 'improving') {
      injections.push(
        createHintInjection(
          'voice-trend',
          `[EMOTIONAL TREND: IMPROVING] User's voice is becoming calmer. What you're doing is working.`,
          { category: 'voice-emotion', confidence: 0.7 }
        )
      );
    } else if (sessionState.emotionalTrend === 'worsening') {
      injections.push(
        createStandardInjection(
          'voice-trend',
          `[EMOTIONAL TREND: INCREASING STRESS] User's voice shows more stress. Consider: slow down, validate more, add pauses.`,
          { category: 'voice-emotion', confidence: 0.8 }
        )
      );
    }
  }

  // ============================================================================
  // 4. SPEECH ADAPTATION CUES - For TTS adjustment
  // ============================================================================
  if (adjustment.slowDown || adjustment.addPauses || adjustment.softenTone) {
    const adaptations: string[] = [];
    if (adjustment.slowDown) adaptations.push('slow your pace');
    if (adjustment.addPauses) adaptations.push('add thoughtful pauses');
    if (adjustment.softenTone) adaptations.push('soften your tone');

    injections.push(
      createHintInjection(
        'voice-speech-adapt',
        `[VOICE ADAPTATION] ${adaptations.join(', ')}`,
        { category: 'voice-emotion', confidence: 0.75 }
      )
    );
  }

  // ============================================================================
  // 5. COMPREHENSION CHECK - When voice suggests confusion
  // ============================================================================
  if (adjustment.increaseComprehensionChecks) {
    injections.push(
      createHintInjection(
        'voice-comprehension',
        `[VOICE SIGNAL: CHECK UNDERSTANDING] Voice suggests confusion or uncertainty. Check in: "Does that make sense?" or "Am I explaining this clearly?"`,
        { category: 'voice-emotion', confidence: 0.7 }
      )
    );
  }

  return injections;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Detect tremor from pitch variance
 */
function detectTremorFromPitch(pitch?: number): boolean {
  if (pitch === undefined) return false;
  // High pitch variance can indicate tremor
  return pitch > 1.5; // Normalized variance
}

/**
 * Detect rushed speech from rate
 */
function detectRushFromRate(speechRate?: number): boolean {
  if (speechRate === undefined) return false;
  return speechRate > 200; // Words per minute
}

/**
 * Detect hesitation from text patterns
 */
function detectHesitation(userText: string): boolean {
  const hesitationPatterns = [
    /\.\.\./,           // Ellipses
    /\bum+\b/i,         // "um"
    /\buh+\b/i,         // "uh"
    /\bi\s+(?:don't\s+)?know\b/i, // "I don't know"
    /\blike,?\s+like\b/i, // Repeated "like"
    /\bwell,?\s+well\b/i, // Repeated "well"
  ];

  return hesitationPatterns.some(pattern => pattern.test(userText));
}

/**
 * Clear voice emotion session state
 */
export function clearVoiceEmotionSession(sessionId: string): void {
  sessionVoiceHistory.delete(sessionId);
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'voice-emotion',
  description: 'Voice emotion analysis and cognitive adaptation',
  priority: 85, // High priority - affects how we respond
  build: buildVoiceEmotionContext,
});

export { buildVoiceEmotionContext };
export default buildVoiceEmotionContext;

