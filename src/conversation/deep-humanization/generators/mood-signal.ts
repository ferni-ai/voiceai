/**
 * Mood Signal Generator
 *
 * Generates subtle mood indicators that show the agent's emotional state.
 * These are small cues that make the agent feel ALIVE, not robotic.
 *
 * @module @ferni/conversation/deep-humanization/generators/mood-signal
 */

import type {
  HumanizationContext,
  ConversationMood,
  HumanizationSignals,
  GeneratorResult,
} from '../types.js';
import { HUMANIZATION_CONFIG } from '../../humanization-tuning.js';

// ============================================================================
// MOOD SIGNAL TEMPLATES
// ============================================================================

const ENERGY_SIGNALS = {
  high: ['I love this!', 'This is so great!', 'Okay, okay—', 'Oh, I have thoughts!'],
  medium: ['That makes sense.', 'Hmm, interesting...', 'I hear you.', 'Yeah.'],
  low: ['*settles in*', '*takes a breath*', '*nods slowly*', 'I hear you.'],
  subdued: ['*quietly*', '*softly*', '*gently*', '...'],
};

const ENGAGEMENT_SIGNALS = {
  high: ['*leans forward*', '*eyes light up*', '*smiles*'],
  medium: ['*nods*', '*listening*', '*mm-hmm*'],
  low: ['*thoughtfully*', '*pauses*', '*considers*'],
};

const LATE_SESSION_SIGNALS = [
  'We have been going for a bit, huh?',
  'This has been a lot to cover.',
  'Wow, we have dug deep today.',
];

// ============================================================================
// GENERATOR
// ============================================================================

/**
 * Generate a mood-appropriate signal
 */
export async function generateMoodSignal(
  context: HumanizationContext,
  mood: ConversationMood,
  _signals: HumanizationSignals
): Promise<GeneratorResult> {
  const probability = HUMANIZATION_CONFIG.probabilities.moodDrift;

  if (Math.random() > probability) {
    return null;
  }

  // Pick signal based on current mood
  let signals: string[];

  // Late session awareness
  if (context.turnCount > 20 && mood.energy < 0.5) {
    signals = LATE_SESSION_SIGNALS;
  } else {
    // Energy-based signals
    const energyKey =
      mood.energy > 0.75
        ? 'high'
        : mood.energy > 0.5
          ? 'medium'
          : mood.energy > 0.35
            ? 'low'
            : 'subdued';

    signals = ENERGY_SIGNALS[energyKey];
  }

  // Sometimes add engagement signal
  if (mood.engagement > 0.7 && Math.random() > 0.6) {
    const engagementKey = mood.engagement > 0.8 ? 'high' : 'medium';
    signals = [...signals, ...ENGAGEMENT_SIGNALS[engagementKey]];
  }

  const content = signals[Math.floor(Math.random() * signals.length)];

  return {
    type: 'mood_signal',
    content,
    placement: 'prefix',
    probability,
    cooldownTurns: HUMANIZATION_CONFIG.cooldowns.moodDrift,
  };
}
