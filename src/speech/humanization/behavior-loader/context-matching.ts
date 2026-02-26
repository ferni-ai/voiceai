/**
 * Context Matching & Pacing
 *
 * Injection config per persona style, late-night pacing,
 * energy matching, and callback selection.
 *
 * @module speech/humanization/behavior-loader/context-matching
 */

import type { InjectionConfig } from '../types.js';
import { getSpeechProfileSync, getRandomPhrase } from './profile-loader.js';

// =============================================================================
// INJECTION CONFIG
// =============================================================================

/**
 * Get injection config for a persona
 */
export function getInjectionConfig(personaId: string): InjectionConfig {
  const INJECTION_CONFIGS: Record<string, InjectionConfig> = {
    high_energy: {
      baseProbability: 0.25,
      turnMultiplier: 0.05,
      maxBehaviorsPerResponse: 2,
      minCharsBetweenInjections: 50,
      preferredCategories: [
        'excitement_overflow',
        'restarts',
        'natural_restarts',
        'thinking_aloud',
        'vocal_vulnerability',
      ],
      avoidCategories: [],
    },
    warm: {
      baseProbability: 0.2,
      turnMultiplier: 0.04,
      maxBehaviorsPerResponse: 2,
      minCharsBetweenInjections: 60,
      preferredCategories: [
        'empathy_sounds',
        'genuine_processing',
        'celebration_overflow',
        'vocal_vulnerability',
        'natural_restarts',
        'warm_processing',
        'celebration_warmth',
      ],
      avoidCategories: [],
    },
    efficient: {
      baseProbability: 0.15,
      turnMultiplier: 0.03,
      maxBehaviorsPerResponse: 1,
      minCharsBetweenInjections: 80,
      preferredCategories: [
        'efficient_processing',
        'grounding_sounds',
        'natural_restarts',
        'vocal_vulnerability',
      ],
      avoidCategories: ['excitement_overflow', 'celebration_overflow'],
    },
    contemplative: {
      baseProbability: 0.2,
      turnMultiplier: 0.02,
      maxBehaviorsPerResponse: 2,
      minCharsBetweenInjections: 100,
      preferredCategories: [
        'contemplative_sounds',
        'wisdom_building',
        'presence_sounds',
        'vocal_vulnerability',
        'natural_restarts',
      ],
      avoidCategories: ['excitement_overflow', 'restarts'],
    },
    analytical: {
      baseProbability: 0.15,
      turnMultiplier: 0.03,
      maxBehaviorsPerResponse: 1,
      minCharsBetweenInjections: 70,
      preferredCategories: [
        'thinking_aloud',
        'self_corrections',
        'grandfatherly_processing',
        'vocal_vulnerability',
        'natural_restarts',
        'research_precision',
        'elderly_warmth',
      ],
      avoidCategories: ['excitement_overflow', 'empathy_sounds'],
    },
  };

  const PERSONA_INJECTION_STYLE: Record<string, string> = {
    ferni: 'warm',
    'maya-santos': 'warm',
    'jordan-taylor': 'high_energy',
    'alex-chen': 'efficient',
    'nayan-patel': 'contemplative',
    'peter-john': 'analytical',
  };

  const style = PERSONA_INJECTION_STYLE[personaId] || 'warm';
  return INJECTION_CONFIGS[style] || INJECTION_CONFIGS.warm;
}

// =============================================================================
// LATE NIGHT PACING
// =============================================================================

/**
 * Check if it's late night hours
 */
export function isLateNightHours(): boolean {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 5;
}

/**
 * Get late night pacing adjustments for a persona
 */
export function getLateNightPacing(personaId: string): {
  speedMultiplier: number;
  pauseMultiplier: number;
  energyReduction: number;
} | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.lateNightPresence || !isLateNightHours()) {
    return null;
  }

  const { pacing_adjustment } = profile.lateNightPresence;
  return {
    speedMultiplier: 1 - (pacing_adjustment.energy_reduction || 0.2),
    pauseMultiplier: pacing_adjustment.pause_multiplier || 1.3,
    energyReduction: pacing_adjustment.energy_reduction || 0.2,
  };
}

/**
 * Get a late night greeting for a persona
 */
export function getLateNightGreeting(personaId: string, seed?: string): string | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.lateNightPresence || !isLateNightHours()) {
    return null;
  }

  return getRandomPhrase(profile.lateNightPresence.late_night_greetings, seed);
}

// =============================================================================
// ENERGY MATCHING
// =============================================================================

export type EnergyLevel = 'very_low' | 'low' | 'neutral' | 'elevated' | 'high';

/**
 * Get energy-matched pacing adjustments
 */
export function getEnergyMatchedPacing(
  personaId: string,
  userEnergyLevel: EnergyLevel
): {
  speedMultiplier: number;
  pauseMultiplier: number;
  energyReduction: number;
  phrase: string | null;
} | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.energyMatching) {
    return null;
  }

  const levelConfig = profile.energyMatching.energy_levels[userEnergyLevel];
  if (!levelConfig) {
    return null;
  }

  return {
    speedMultiplier: levelConfig.pacing.speed_multiplier,
    pauseMultiplier: levelConfig.pacing.pause_multiplier,
    energyReduction: levelConfig.pacing.energy_reduction,
    phrase: getRandomPhrase(levelConfig.phrases),
  };
}

// =============================================================================
// CALLBACKS SELECTION
// =============================================================================

/**
 * Check if a callback phrase should be used based on conversation history
 */
export function shouldUseCallback(
  personaId: string,
  callbackId: string,
  conversationCount: number
): { shouldUse: boolean; phrase: string | null } {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.callbacks) {
    return { shouldUse: false, phrase: null };
  }

  const callback = profile.callbacks.callbacks.find((c) => c.id === callbackId);
  if (!callback) {
    return { shouldUse: false, phrase: null };
  }

  // Check if we've had enough conversations
  if (conversationCount < callback.callbacks.minConversationsForCallback) {
    // Use first-time phrase
    const phrase = getRandomPhrase(callback.firstUse.variations);
    return { shouldUse: true, phrase };
  }

  // Probability check for callback
  if (Math.random() < callback.callbacks.probability) {
    const phrase = getRandomPhrase(callback.callbacks.variations);
    return { shouldUse: true, phrase };
  }

  return { shouldUse: false, phrase: null };
}
