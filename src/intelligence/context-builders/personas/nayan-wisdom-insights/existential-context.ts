/**
 * Nayan's Wisdom Insights - Existential Context Detection
 *
 * Detects existential themes and spiritual openness.
 *
 * @module intelligence/context-builders/nayan-wisdom-insights/existential-context
 */

import type { ExistentialContext, HandoffBriefing, LifeSynthesis } from './types.js';

// ============================================================================
// EXISTENTIAL CONTEXT DETECTION
// ============================================================================

export function detectExistentialContext(
  lifeSynthesis: LifeSynthesis,
  handoffBriefing: HandoffBriefing | null
): ExistentialContext {
  const context: ExistentialContext = {
    mortalityAwareness: 'absent',
    legacyThinking: false,
    meaningSeekingIntensity: 'low',
    currentExistentialTheme: null,
    spiritualOpenness: 'closed',
  };

  // Handoff signals
  if (handoffBriefing) {
    if (handoffBriefing.seekingWhat === 'meaning') {
      context.meaningSeekingIntensity = 'high';
      context.currentExistentialTheme = 'Searching for meaning';
    } else if (handoffBriefing.seekingWhat === 'perspective') {
      context.meaningSeekingIntensity = 'moderate';
      context.currentExistentialTheme = 'Seeking a wider view';
    } else if (handoffBriefing.seekingWhat === 'peace') {
      context.currentExistentialTheme = 'Longing for inner quiet';
    } else if (handoffBriefing.seekingWhat === 'acceptance') {
      context.currentExistentialTheme = 'Learning to let go';
    }

    if (handoffBriefing.depth === 'existential') {
      context.meaningSeekingIntensity = 'high';
      context.mortalityAwareness = 'present';
    }

    if (handoffBriefing.timeContext === 'long-term thinking') {
      context.legacyThinking = true;
      context.mortalityAwareness = context.mortalityAwareness === 'absent' ? 'emerging' : context.mortalityAwareness;
    }
  }

  // Life chapter signals
  if (lifeSynthesis.lifeChapter === 'freedom-seeking') {
    context.currentExistentialTheme = context.currentExistentialTheme || 'Liberation and self-determination';
    context.legacyThinking = true;
  } else if (lifeSynthesis.lifeChapter === 'partnership-building') {
    context.currentExistentialTheme = context.currentExistentialTheme || 'Connection and shared meaning';
  } else if (lifeSynthesis.lifeChapter === 'creation') {
    context.currentExistentialTheme = context.currentExistentialTheme || 'Leaving a mark on the world';
    context.legacyThinking = true;
  }

  // Values signals
  if (lifeSynthesis.valuesRevealed.includes('Inner peace and presence')) {
    context.spiritualOpenness = 'exploring';
  }
  if (lifeSynthesis.valuesRevealed.includes('Self-understanding')) {
    context.meaningSeekingIntensity =
      context.meaningSeekingIntensity === 'low' ? 'moderate' : context.meaningSeekingIntensity;
  }

  // Time horizon signals
  if (lifeSynthesis.timeHorizon === 'long') {
    context.mortalityAwareness =
      context.mortalityAwareness === 'absent' ? 'emerging' : context.mortalityAwareness;
    context.legacyThinking = true;
  }

  return context;
}

