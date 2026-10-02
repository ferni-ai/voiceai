/**
 * Coach UI - persona animation profiles (design-system driven). Extracted from coach.ui.ts.
 */

import {
  getPersonaAnimationProfile,
  getEasing,
  type PersonaAnimationProfile,
} from '@design-system/tokens';

export interface AnimationProfile {
  breatheDuration: string;
  breatheIntensity: number;
  bounceDuration: string;
  bounceIntensity: number;
  reactionDelay: number;
  easing: string;
}

// Base durations for timing calculations
export const BASE_BREATHE_DURATION = 4000; // 4s
export const BASE_BOUNCE_DURATION = 500; // 500ms
export const BASE_REACTION_DELAY = 200; // 200ms

/**
 * Convert design system persona profile to animation profile.
 * Uses timing multiplier and bounciness from design tokens.
 */
export function createAnimationProfile(dsProfile: PersonaAnimationProfile): AnimationProfile {
  const breatheDuration = Math.round(BASE_BREATHE_DURATION * dsProfile.timingMultiplier);
  const bounceDuration = Math.round(BASE_BOUNCE_DURATION * dsProfile.timingMultiplier);
  const reactionDelay = Math.round(BASE_REACTION_DELAY * dsProfile.timingMultiplier);

  // Higher bounciness = more bounce intensity
  const bounceIntensity = 1 + dsProfile.bounciness * 0.1;
  const breatheIntensity = 1 + dsProfile.bounciness * 0.03;

  return {
    breatheDuration: `${breatheDuration}ms`,
    breatheIntensity,
    bounceDuration: `${bounceDuration}ms`,
    bounceIntensity,
    reactionDelay,
    easing: getEasing(dsProfile.easingPreference),
  };
}

// Default animation profile (used when persona not found)
export const DEFAULT_ANIMATION: AnimationProfile = {
  breatheDuration: '4s',
  breatheIntensity: 1.02,
  bounceDuration: '500ms',
  bounceIntensity: 1.05,
  reactionDelay: 200,
  easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
};

// Cache for converted profiles
export const profileCache = new Map<string, AnimationProfile>();

/**
 * Get animation profile for persona from design system.
 * Falls back to default if persona not found.
 */
export function getAnimationProfileForPersona(personaId: string): AnimationProfile {
  // Check cache first
  if (profileCache.has(personaId)) {
    return profileCache.get(personaId)!;
  }

  // Try design system profile
  const dsProfile = getPersonaAnimationProfile(personaId);
  if (dsProfile) {
    const profile = createAnimationProfile(dsProfile);
    profileCache.set(personaId, profile);
    return profile;
  }

  // Fall back to default
  return DEFAULT_ANIMATION;
}
