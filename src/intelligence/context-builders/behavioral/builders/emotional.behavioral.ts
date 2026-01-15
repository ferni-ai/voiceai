/**
 * Emotional Behavioral Builder
 *
 * Analyzes emotional state and emits behavioral signals.
 * This is the behavioral version of emotional/emotional.ts
 *
 * OLD: "[EMOTIONAL CONTEXT: User seems sad. Acknowledge their feelings.]"
 * NEW: { tone: 'gentle', style: 'supportive', questionStyle: 'reflective' }
 *
 * The model receives behavioral instructions, not emotional facts to interpret.
 *
 * @module intelligence/context-builders/behavioral/builders/emotional
 */

import type { ContextBuilderInput } from '../../core/types.js';
import { DISTRESS } from '../../../detectors/distress.js';
import type {
  BehavioralSignals,
  ToneModifier,
  StyleModifier,
  EnergyModifier,
  QuestionStyle,
} from '../signals.js';
import { createCrisisSignals, createPresenceSignals, createCallback } from '../signals.js';
import { registerBehavioralBuilder } from '../orchestrator.js';

// ============================================================================
// EMOTION TO BEHAVIOR MAPPINGS
// ============================================================================

/**
 * Map detected emotions to appropriate tones
 */
const EMOTION_TO_TONE: Record<string, ToneModifier> = {
  // Negative emotions
  sad: 'gentle',
  sadness: 'gentle',
  grief: 'gentle',
  anxious: 'grounding',
  anxiety: 'grounding',
  fear: 'grounding',
  worried: 'grounding',
  overwhelmed: 'grounding',
  frustrated: 'warm',
  angry: 'warm',
  hurt: 'gentle',
  disappointed: 'warm',
  lonely: 'warm',

  // Positive emotions
  happy: 'warm',
  joy: 'celebratory',
  excited: 'energetic',
  hopeful: 'warm',
  grateful: 'warm',
  proud: 'celebratory',
  relieved: 'warm',
  content: 'warm',
  peaceful: 'contemplative',

  // Neutral/processing
  confused: 'warm',
  curious: 'warm',
  thoughtful: 'contemplative',
  reflective: 'contemplative',
  neutral: 'warm',
};

/**
 * Map emotions to conversational style
 */
const EMOTION_TO_STYLE: Record<string, StyleModifier> = {
  // Need support
  sad: 'supportive',
  grief: 'supportive',
  hurt: 'supportive',
  lonely: 'supportive',

  // Need grounding
  anxious: 'grounding',
  overwhelmed: 'grounding',
  fear: 'grounding',

  // Need to be heard
  frustrated: 'listening',
  angry: 'listening',

  // Processing
  confused: 'exploratory',
  curious: 'exploratory',
  thoughtful: 'reflective',

  // Positive
  happy: 'celebratory',
  joy: 'celebratory',
  excited: 'celebratory',
  proud: 'celebratory',
};

/**
 * Map energy levels to question style
 */
function getQuestionStyle(emotion: string, intensity: number, isVenting: boolean): QuestionStyle {
  // Don't ask questions when venting or processing
  if (isVenting) return 'none';
  if (emotion === 'overwhelmed' || emotion === 'grief') return 'none';

  // High intensity negative = gentle or none
  if (intensity > 0.7 && ['sad', 'anxious', 'angry', 'frustrated'].includes(emotion)) {
    return 'gentle-probe';
  }

  // Processing emotions = reflective
  if (['confused', 'thoughtful', 'reflective'].includes(emotion)) {
    return 'reflective';
  }

  // Positive emotions = open
  if (['happy', 'excited', 'curious', 'hopeful'].includes(emotion)) {
    return 'open';
  }

  return 'open';
}

/**
 * Map intensity to energy modifier
 */
function getEnergyFromIntensity(intensity: number, valence: string): EnergyModifier {
  if (valence === 'negative') {
    // Match their subdued energy for negative emotions
    if (intensity > 0.7) return 'subdued';
    if (intensity > 0.5) return 'calm';
    return 'warm';
  }

  if (valence === 'positive') {
    // Match their elevated energy for positive emotions
    if (intensity > 0.7) return 'high';
    if (intensity > 0.5) return 'elevated';
    return 'warm';
  }

  return 'warm';
}

// ============================================================================
// BEHAVIORAL BUILDER
// ============================================================================

/**
 * Build emotional behavioral signals
 */
async function buildEmotionalBehavior(input: ContextBuilderInput): Promise<BehavioralSignals> {
  const { analysis, userData } = input;
  const emotion = analysis.emotion;

  // Get distress level (merged from voice + text if available)
  const distressLevel = emotion.distressLevel ?? 0;

  // =========================================
  // CRISIS MODE (highest priority)
  // =========================================
  if (distressLevel >= DISTRESS.HIGH) {
    return {
      ...createCrisisSignals(),
      source: 'emotional',
      confidence: Math.min(distressLevel + 0.2, 1), // High confidence
      priority: 100,
    };
  }

  // =========================================
  // MODERATE DISTRESS (presence mode)
  // =========================================
  if (distressLevel >= DISTRESS.MODERATE) {
    return {
      ...createPresenceSignals(),
      tone: 'gentle',
      source: 'emotional',
      confidence: 0.85,
      priority: 80,
    };
  }

  // =========================================
  // NORMAL EMOTIONAL GUIDANCE
  // =========================================
  const primaryEmotion = emotion.primary?.toLowerCase() || 'neutral';
  const intensity = emotion.intensity ?? 0.5;
  const valence = emotion.valence ?? 'neutral';
  const isVenting = emotion.isVenting ?? false;
  const needsSupport = emotion.needsSupport ?? false;

  const signals: BehavioralSignals = {
    source: 'emotional',
    confidence: emotion.confidence ?? 0.7,
    priority: 60,
  };

  // Set tone based on emotion
  signals.tone = EMOTION_TO_TONE[primaryEmotion] || 'warm';

  // Set style based on emotion
  const emotionStyle = EMOTION_TO_STYLE[primaryEmotion];
  if (emotionStyle) {
    signals.style = emotionStyle;
  } else if (needsSupport) {
    signals.style = 'supportive';
  }

  // Set energy based on intensity and valence
  signals.energy = getEnergyFromIntensity(intensity, valence);

  // Set pace (slow down for high intensity negative)
  if (valence === 'negative' && intensity > 0.6) {
    signals.pace = 'slow';
  }

  // Set question style
  signals.questionStyle = getQuestionStyle(primaryEmotion, intensity, isVenting);

  // Set modes
  if (isVenting) {
    signals.modes = { ventingMode: true };
    signals.style = 'listening';
    signals.questionStyle = 'none';
    signals.length = 'brief';
  }

  if (emotion.isProcessing) {
    signals.modes = { ...signals.modes, processingMode: true };
    signals.length = 'brief';
  }

  // Celebration mode for positive emotions
  if (valence === 'positive' && intensity > 0.6) {
    signals.modes = { ...signals.modes, celebrationMode: true };
  }

  // =========================================
  // VALIDATION CALLBACK
  // =========================================
  const validationPatterns =
    /\b(am i crazy|is it wrong|should i feel|normal to|stupid for|bad for|wrong to want|crazy to think)\b/i;
  const needsValidation =
    needsSupport ||
    (primaryEmotion === 'fear' && distressLevel > 0.3 && distressLevel < 0.7) ||
    validationPatterns.test(userData?.lastUserMessage || '');

  if (needsValidation) {
    signals.callbacks = [
      createCallback(
        'pattern',
        "They're seeking validation. Acknowledge this is understandable before anything else.",
        'important'
      ),
    ];
    signals.avoidances = ['giving advice before validating', 'using "but" after acknowledgment'];
  }

  return signals;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerBehavioralBuilder({
  name: 'emotional',
  description: 'Emotional state analysis to behavioral guidance',
  priority: 20, // High priority - informs approach
  category: 'emotional',
  build: buildEmotionalBehavior,
});

export { buildEmotionalBehavior };
