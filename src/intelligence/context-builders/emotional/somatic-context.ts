/**
 * Somatic Intelligence Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates somatic awareness and body-based interventions into
 * the context pipeline. Suggests grounding and breathing exercises
 * when users are in distress.
 *
 * PHILOSOPHY:
 * Sometimes the best thing isn't to talk more—it's to help someone
 * breathe, ground, and regulate their nervous system. This builder
 * detects when somatic intervention might help and provides guidance.
 *
 * @module ContextBuilders/SomaticContext
 */

import {
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
  createHintInjection,
  createStandardInjection,
} from './index.js';

import {
  selectExercise,
  detectNervousSystemState,
  generateVoiceGuidance,
  type Exercise,
  type NervousSystemState,
} from '../../services/somatic-intelligence/index.js';

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SomaticContextBuilder' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Emotion intensity threshold to suggest somatic intervention */
const DISTRESS_THRESHOLD = 0.65;

/** Keywords that indicate somatic intervention might help */
const SOMATIC_TRIGGER_KEYWORDS = [
  'panic',
  'panicking',
  "can't breathe",
  'freaking out',
  'heart racing',
  "can't calm down",
  'overwhelmed',
  'spiraling',
  'losing it',
  'need to calm down',
  'so stressed',
  "can't relax",
  "can't sleep",
  'tense',
  'anxious',
  'help me calm down',
  'dissociated',
  'numb',
  'frozen',
];

/** Recent somatic suggestions per user (to avoid over-suggesting) */
const recentSuggestions = new Map<string, { timestamp: Date; exerciseId: string }>();

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build somatic awareness context for the current turn.
 */
async function buildSomaticContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, services, analysis } = input;
  const userId = services?.userId;

  if (!userId || !userText) {
    return [];
  }

  const injections: ContextInjection[] = [];
  const lowerText = userText.toLowerCase();

  // Check if somatic intervention might be appropriate
  const shouldSuggestSomatic = checkSomaticTriggers(
    lowerText,
    analysis?.emotion?.primary,
    analysis?.emotion?.intensity
  );

  if (!shouldSuggestSomatic) {
    return [];
  }

  // Check if we recently suggested something (avoid over-suggesting)
  const recent = recentSuggestions.get(userId);
  if (recent) {
    const minutesSince = (Date.now() - recent.timestamp.getTime()) / (1000 * 60);
    if (minutesSince < 10) {
      // Don't re-suggest within 10 minutes
      return [];
    }
  }

  // Detect nervous system state
  const nervousSystemState = detectNervousSystemState({
    emotion: analysis?.emotion?.primary,
    emotionIntensity: analysis?.emotion?.intensity,
    keywords: extractKeywords(lowerText),
  });

  // Select the best exercise
  const exercise = selectExercise({
    state: nervousSystemState,
    emotion: analysis?.emotion?.primary,
    emotionIntensity: analysis?.emotion?.intensity,
  });

  // Build the context injection
  const injection = buildSomaticInjection(
    exercise,
    nervousSystemState,
    analysis?.emotion?.intensity || 0.5
  );

  injections.push(injection);

  // Record the suggestion
  recentSuggestions.set(userId, {
    timestamp: new Date(),
    exerciseId: exercise.id,
  });

  log.debug(
    {
      userId,
      exerciseId: exercise.id,
      nervousSystemState,
      emotionIntensity: analysis?.emotion?.intensity,
    },
    '🧘 Somatic intervention suggested'
  );

  return injections;
}

/**
 * Check if somatic intervention should be suggested.
 */
function checkSomaticTriggers(text: string, emotion?: string, emotionIntensity?: number): boolean {
  // Check for trigger keywords
  for (const keyword of SOMATIC_TRIGGER_KEYWORDS) {
    if (text.includes(keyword)) {
      return true;
    }
  }

  // Check for high distress emotions
  const highDistressEmotions = ['panic', 'fear', 'terror', 'anxious', 'overwhelmed'];
  if (emotion && highDistressEmotions.includes(emotion.toLowerCase())) {
    if ((emotionIntensity || 0) >= DISTRESS_THRESHOLD) {
      return true;
    }
  }

  // Check for general high distress
  if ((emotionIntensity || 0) >= 0.8) {
    return true;
  }

  return false;
}

/**
 * Extract keywords from text for state detection.
 */
function extractKeywords(text: string): string[] {
  const keywords: string[] = [];

  for (const keyword of SOMATIC_TRIGGER_KEYWORDS) {
    if (text.includes(keyword)) {
      keywords.push(keyword);
    }
  }

  return keywords;
}

/**
 * Build the context injection for somatic intervention.
 */
function buildSomaticInjection(
  exercise: Exercise,
  state: NervousSystemState,
  intensity: number
): ContextInjection {
  const lines: string[] = [];

  // Header based on urgency
  if (intensity > 0.8 || state === 'sympathetic') {
    lines.push('[🆘 SOMATIC INTERVENTION OPPORTUNITY]');
    lines.push('');
    lines.push(
      "This person's nervous system is activated. Consider offering a grounding or breathing exercise."
    );
  } else {
    lines.push('[🧘 SOMATIC SUPPORT AVAILABLE]');
    lines.push('');
    lines.push('A body-based exercise might help right now.');
  }

  lines.push('');

  // State description
  const stateDescriptions: Record<NervousSystemState, string> = {
    sympathetic: "They're in fight-or-flight mode (sympathetic activation). Long exhales help.",
    dorsal_vagal: 'They may be in shutdown mode. Gentle grounding and movement help.',
    ventral_vagal: "They're regulated. No intervention needed.",
  };
  lines.push(`Nervous System: ${stateDescriptions[state]}`);
  lines.push('');

  // Suggested exercise
  lines.push(`Suggested Exercise: ${exercise.name}`);
  lines.push(`Description: ${exercise.description}`);
  lines.push(
    `Duration: ${exercise.duration === 'short' ? '< 2 minutes' : exercise.duration === 'medium' ? '2-5 minutes' : '> 5 minutes'}`
  );
  lines.push('');

  // How to offer
  lines.push('HOW TO OFFER:');
  if (intensity > 0.8) {
    lines.push(
      '• Don\'t ask, gently lead: "Let\'s do something that might help. Breathe with me..."'
    );
  } else {
    lines.push(
      '• Offer gently: "Would you like to try a quick breathing exercise? It might help."'
    );
    lines.push("• If they decline, that's okay. Don't push.");
  }
  lines.push('');

  // Quick guidance for the exercise
  lines.push('[EXERCISE STEPS - GUIDE NATURALLY, DO NOT READ VERBATIM]');
  for (const step of exercise.steps.slice(0, 2)) {
    lines.push(`• ${step.voiceGuidance}`);
  }
  lines.push('');

  // Coaching notes (internal)
  lines.push('[YOUR APPROACH - DO NOT READ ALOUD]');
  lines.push('• Slow your own pace to model calm');
  lines.push('• Pause between instructions');
  lines.push('• Your calm voice helps co-regulate their nervous system');

  // Determine injection type based on urgency
  if (intensity > 0.8) {
    return createStandardInjection('somatic_intervention', lines.join('\n'));
  } else {
    return createHintInjection('somatic_opportunity', lines.join('\n'), { category: 'somatic' });
  }
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'somatic-context',
  priority: 88, // High priority, right after emotional crisis
  description: 'Suggest grounding and breathing exercises when users are in distress',
  build: buildSomaticContext,
});

// ============================================================================
// EXPORTS
// ============================================================================

export { buildSomaticContext };

export default {
  buildSomaticContext,
};
