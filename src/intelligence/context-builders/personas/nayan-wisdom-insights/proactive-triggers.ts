/**
 * Nayan's Wisdom Insights - Proactive Wisdom Triggers
 *
 * Detects opportunities for Nayan to share wisdom proactively.
 *
 * @module intelligence/context-builders/nayan-wisdom-insights/proactive-triggers
 */

import type {
  ExistentialContext,
  LifeSynthesis,
  ValuesAlignment,
  WisdomMetrics,
  WisdomTrigger,
} from './types.js';

// ============================================================================
// PROACTIVE WISDOM TRIGGERS
// ============================================================================

export function detectProactiveTriggers(
  lifeSynthesis: LifeSynthesis,
  wisdomMetrics: WisdomMetrics,
  existentialContext: ExistentialContext,
  valuesAlignment: ValuesAlignment
): WisdomTrigger[] {
  const triggers: WisdomTrigger[] = [];

  // Meaning-seeking triggers
  if (existentialContext.meaningSeekingIntensity === 'high') {
    triggers.push({
      type: 'question',
      message: 'They come seeking meaning. The question matters more than the answer.',
      priority: 'high',
      timing: 'immediate',
    });
  }

  // Legacy awareness triggers
  if (existentialContext.legacyThinking && wisdomMetrics.legacyReadiness < 50) {
    triggers.push({
      type: 'reflection',
      message:
        'Legacy thinking emerging but not yet integrated. Help them see how today builds tomorrow.',
      priority: 'medium',
      timing: 'when_ready',
    });
  }

  // Inner peace triggers
  if (wisdomMetrics.innerPeaceIndex < 30) {
    triggers.push({
      type: 'reframe',
      message: 'The striving is strong. Perhaps share the paradox: the destination is here.',
      priority: 'high',
      timing: 'when_ready',
    });
  }

  // Values conflict triggers
  if (valuesAlignment.conflictAreas.length > 0) {
    triggers.push({
      type: 'paradox',
      message: `Values in tension: ${valuesAlignment.conflictAreas[0]}. Paradox is not a problem - it is growth.`,
      priority: 'medium',
      timing: 'when_ready',
    });
  }

  // Growth pattern triggers
  if (lifeSynthesis.growthPattern === 'striving') {
    triggers.push({
      type: 'story',
      message: 'Striving mode active. Perhaps a story about the seed: it grows by resting, not rushing.',
      priority: 'medium',
      timing: 'when_ready',
    });
  } else if (lifeSynthesis.growthPattern === 'resting') {
    triggers.push({
      type: 'question',
      message: 'In a resting phase. Ask what is composting beneath the surface.',
      priority: 'low',
      timing: 'later',
    });
  }

  // Compounding celebration
  if (lifeSynthesis.compoundingAreas.length >= 2) {
    triggers.push({
      type: 'reflection',
      message: 'Multiple areas compounding. Name it. Honor it. The compound effect is real.',
      priority: 'medium',
      timing: 'when_ready',
    });
  }

  // Silence triggers
  if (existentialContext.currentExistentialTheme && existentialContext.meaningSeekingIntensity === 'high') {
    triggers.push({
      type: 'silence',
      message: 'Heavy theme emerging. Sometimes the most powerful response is spacious silence.',
      priority: 'high',
      timing: 'immediate',
    });
  }

  // Spiritual openness
  if (existentialContext.spiritualOpenness === 'exploring') {
    triggers.push({
      type: 'question',
      message: 'Spiritual curiosity present. They may be ready for deeper questions about practice.',
      priority: 'low',
      timing: 'later',
    });
  }

  return triggers;
}

