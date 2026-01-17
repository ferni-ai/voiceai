/**
 * Energy Behavioral Builder
 *
 * Matches the model's energy to the user's energy level.
 * This is essential for connection - matching someone's energy
 * creates rapport, mismatching it creates disconnection.
 *
 * - Subdued user → Gentle, calm response
 * - Excited user → Match their enthusiasm
 * - Tired user → Don't overwhelm
 * - High energy → Be animated
 *
 * @module intelligence/context-builders/behavioral/builders/energy
 */

import type { ContextBuilderInput } from '../../core/types.js';
import type { BehavioralSignals, EnergyModifier, ToneModifier } from '../signals.js';
import { createCallback } from '../signals.js';
import { registerBehavioralBuilder } from '../orchestrator.js';

// ============================================================================
// ENERGY DETECTION
// ============================================================================

type UserEnergyLevel = 'depleted' | 'low' | 'normal' | 'elevated' | 'high';

/**
 * Patterns indicating low energy
 */
const LOW_ENERGY_PATTERNS = [
  /\b(so |really |exhausted|drained|tired|worn out|depleted|wiped)/i,
  /\b(can't|cannot) (think|focus|function)/i,
  /\b(no energy|out of steam|running on empty)/i,
  /\b(barely|hardly) (awake|functioning|keeping)/i,
];

/**
 * Patterns indicating high energy
 */
const HIGH_ENERGY_PATTERNS = [
  /\b(excited|thrilled|pumped|stoked|so happy|amazing)/i,
  /\b(can't wait|can hardly wait)/i,
  /!{2,}/, // Multiple exclamation marks
  /\b(omg|oh my god|wow|yes yes|yay)/i,
];

/**
 * Detect user energy from text
 */
function detectTextEnergy(text: string): UserEnergyLevel | null {
  if (LOW_ENERGY_PATTERNS.some((p) => p.test(text))) {
    // Check if VERY low
    if (/exhausted|depleted|can't function/i.test(text)) {
      return 'depleted';
    }
    return 'low';
  }

  if (HIGH_ENERGY_PATTERNS.some((p) => p.test(text))) {
    // Check if VERY high
    if (/!{3,}|so excited|can't wait/i.test(text)) {
      return 'high';
    }
    return 'elevated';
  }

  return null; // Can't determine from text
}

/**
 * Combine text and voice energy signals
 */
function determineUserEnergy(
  textEnergy: UserEnergyLevel | null,
  emotionIntensity: number,
  emotionValence: string,
  voiceEnergy?: string
): UserEnergyLevel {
  // Voice energy takes priority if available
  if (voiceEnergy) {
    if (voiceEnergy === 'depleted' || voiceEnergy === 'low') {
      return voiceEnergy as UserEnergyLevel;
    }
    if (voiceEnergy === 'high' || voiceEnergy === 'elevated') {
      return voiceEnergy as UserEnergyLevel;
    }
  }

  // Text energy if detected
  if (textEnergy) {
    return textEnergy;
  }

  // Infer from emotion intensity + valence
  if (emotionIntensity > 0.7) {
    if (emotionValence === 'positive') {
      return 'elevated';
    }
    if (emotionValence === 'negative') {
      return 'low'; // High intensity negative often means low energy
    }
  }

  if (emotionIntensity < 0.3) {
    return 'low';
  }

  return 'normal';
}

/**
 * Map user energy to response energy
 */
function mapToResponseEnergy(userEnergy: UserEnergyLevel): EnergyModifier {
  const mapping: Record<UserEnergyLevel, EnergyModifier> = {
    depleted: 'subdued',
    low: 'calm',
    normal: 'warm',
    elevated: 'elevated',
    high: 'high',
  };
  return mapping[userEnergy];
}

/**
 * Get tone based on energy
 */
function mapToTone(userEnergy: UserEnergyLevel): ToneModifier {
  switch (userEnergy) {
    case 'depleted':
      return 'gentle';
    case 'low':
      return 'gentle';
    case 'elevated':
      return 'warm';
    case 'high':
      return 'energetic';
    case 'normal':
    default:
      return 'warm';
  }
}

// ============================================================================
// BEHAVIORAL BUILDER
// ============================================================================

async function buildEnergyBehavior(input: ContextBuilderInput): Promise<BehavioralSignals> {
  const { userText, analysis, userData } = input;

  // Detect energy from various sources
  const textEnergy = detectTextEnergy(userText || '');
  const emotionIntensity = analysis?.emotion?.intensity || 0.5;
  const emotionValence = analysis?.emotion?.valence || 'neutral';
  const voiceEnergy = userData?.energyLevel;

  const userEnergy = determineUserEnergy(textEnergy, emotionIntensity, emotionValence, voiceEnergy);

  const signals: BehavioralSignals = {
    source: 'energy',
    confidence: textEnergy ? 0.8 : voiceEnergy ? 0.85 : 0.6,
    priority: 40,
    energy: mapToResponseEnergy(userEnergy),
    tone: mapToTone(userEnergy),
  };

  // Energy-specific behavioral hints
  if (userEnergy === 'depleted' || userEnergy === 'low') {
    signals.pace = 'slow';
    signals.length = 'brief';
    signals.avoidances = ['being too energetic', 'asking many questions', 'giving long responses'];
    signals.callbacks = [
      createCallback('pattern', 'They seem low energy. Match that - gentle and brief.', 'natural'),
    ];
  }

  if (userEnergy === 'high' || userEnergy === 'elevated') {
    signals.callbacks = [
      createCallback(
        'pattern',
        "They're energized! Match their enthusiasm - share in the excitement.",
        'natural'
      ),
    ];
  }

  return signals;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerBehavioralBuilder({
  name: 'energy',
  description: 'Energy level matching for rapport',
  priority: 30,
  category: 'emotional',
  build: buildEnergyBehavior,
});

export { buildEnergyBehavior, detectTextEnergy };
