/**
 * Presence UI - timing and voice-pulse configuration (derived from design system). Extracted from presence.ui.ts.
 */

import { AVATAR_BREATH_TIMING, REACTION_PHASES } from '@design-system/tokens';

export const TIMING = {
  breath: parseInt(AVATAR_BREATH_TIMING.idle),
  breathConnected: parseInt(AVATAR_BREATH_TIMING.connected),
  breathSpeaking: parseInt(AVATAR_BREATH_TIMING.speaking),
  breathListening: parseInt(AVATAR_BREATH_TIMING.listening),
  glowPhaseOffset: 0.23, // Secondary action offset (slightly out of sync)
  reactionAnticipation: parseInt(REACTION_PHASES.anticipation),
  reactionFollow: parseInt(REACTION_PHASES.followThrough),
};

// Voice pulse configuration
export const VOICE_PULSE_CONFIG = {
  // Scale range: avatar pulses between 1.0 and 1.0 + MAX_SCALE
  maxScale: 0.12, // 12% max scale increase (bass speaker effect)
  minScale: 0.02, // 2% minimum pulse when speaking (always some movement)

  // Smoothing: lower = more responsive, higher = smoother
  smoothingUp: 0.25, // Fast attack - respond quickly to volume increases
  smoothingDown: 0.08, // Slow release - smooth decay feels more organic

  // Squash/stretch for Pixar-quality deformation
  squashRatio: 0.4, // When scaling up, squash horizontally by this ratio

  // Update rate
  targetFps: 60,
};
