/**
 * Voice Pack Service
 *
 * Handles user voice pack preferences from the frontend personalization system.
 * Integrates with dynamic-voice-parameters to apply voice style modifiers.
 *
 * Voice packs modify:
 * - Speed (talking pace)
 * - Pitch offset (warmer = lower, energetic = slightly higher)
 * - Emotional baseline tone
 *
 * Frontend stores preferences in localStorage as 'ferni_voice_style'
 * This service reads from user session data passed via data channel.
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { VoiceParameters } from '../voice/dynamic-voice-parameters.js';

const log = createLogger({ module: 'VoicePackService' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoicePackConfig {
  voiceStyle: 'natural' | 'warm' | 'calm' | 'energetic';
  speed: string; // e.g., "0.95", "1.0", "1.05"
  pitch: string; // e.g., "-2", "0", "+1"
}

export interface VoicePackModifiers {
  speedMultiplier: number;
  pauseMultiplier: number;
  emotionalTone: VoiceParameters['emotionalTone'];
  pitchOffset: number;
}

// ============================================================================
// VOICE PACK DEFINITIONS
// ============================================================================

const VOICE_PACK_MODIFIERS: Record<string, VoicePackModifiers> = {
  natural: {
    speedMultiplier: 1.0,
    pauseMultiplier: 1.0,
    emotionalTone: 'warm',
    pitchOffset: 0,
  },
  warm: {
    speedMultiplier: 0.95, // Slightly slower
    pauseMultiplier: 1.1, // Slightly longer pauses
    emotionalTone: 'warm',
    pitchOffset: -10, // Slightly lower (warmer)
  },
  calm: {
    speedMultiplier: 0.9, // Slower, more meditative
    pauseMultiplier: 1.25, // More breathing room
    emotionalTone: 'gentle',
    pitchOffset: -5,
  },
  energetic: {
    speedMultiplier: 1.05, // Slightly faster
    pauseMultiplier: 0.9, // Tighter pacing
    emotionalTone: 'energetic',
    pitchOffset: 5, // Slightly higher
  },
};

// ============================================================================
// SESSION STORAGE
// ============================================================================

// In-memory storage for user voice pack preferences (per session)
const userVoicePackPreferences = new Map<string, VoicePackConfig>();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Set voice pack preference for a user session
 * Called when user connects and sends their preferences via data channel
 */
export function setUserVoicePack(userId: string, config: VoicePackConfig | null): void {
  if (config) {
    userVoicePackPreferences.set(userId, config);
    log.info({ userId, config }, 'Voice pack preference set');
  } else {
    userVoicePackPreferences.delete(userId);
    log.info({ userId }, 'Voice pack preference cleared');
  }
}

/**
 * Get voice pack preference for a user session
 */
export function getUserVoicePack(userId: string): VoicePackConfig | null {
  return userVoicePackPreferences.get(userId) ?? null;
}

/**
 * Get voice modifiers based on user's voice pack preference
 * These are applied on top of emotion/context-based modifiers
 */
export function getVoicePackModifiers(userId: string): VoicePackModifiers {
  const config = getUserVoicePack(userId);
  const style = config?.voiceStyle ?? 'natural';

  const modifiers = VOICE_PACK_MODIFIERS[style] ?? VOICE_PACK_MODIFIERS.natural;

  // Allow override from config if provided
  if (config) {
    const speedFromConfig = parseFloat(config.speed);
    if (!isNaN(speedFromConfig)) {
      modifiers.speedMultiplier = speedFromConfig;
    }

    const pitchFromConfig = parseInt(config.pitch, 10);
    if (!isNaN(pitchFromConfig)) {
      modifiers.pitchOffset = pitchFromConfig;
    }
  }

  return modifiers;
}

/**
 * Apply voice pack modifiers to voice parameters
 * Call this after computing emotion-based parameters
 */
export function applyVoicePackToParameters(
  params: VoiceParameters,
  userId: string
): VoiceParameters {
  const packModifiers = getVoicePackModifiers(userId);

  return {
    ...params,
    // Multiply speed modifiers (pack * emotion-based)
    speedMultiplier: params.speedMultiplier * packModifiers.speedMultiplier,
    // Multiply pause modifiers
    pauseMultiplier: params.pauseMultiplier * packModifiers.pauseMultiplier,
    // Voice pack can override emotional tone if stronger
    // For now, keep the context-based tone but allow pack to influence
    emotionalTone:
      packModifiers.emotionalTone !== 'warm' ? packModifiers.emotionalTone : params.emotionalTone,
  };
}

/**
 * Clear all voice pack preferences (for cleanup)
 */
export function clearAllVoicePackPreferences(): void {
  userVoicePackPreferences.clear();
  log.info('All voice pack preferences cleared');
}

/**
 * Handle voice pack change from frontend
 * Called when data message received with voice pack update
 */
export function handleVoicePackMessage(
  userId: string,
  message: { type: string; packId?: string; config?: VoicePackConfig }
): void {
  if (message.type === 'voice-pack-change') {
    if (message.config) {
      setUserVoicePack(userId, message.config);
    } else if (message.packId) {
      // Map pack ID to config
      const style = message.packId.replace('voice-', '') as VoicePackConfig['voiceStyle'];
      const defaultConfig: VoicePackConfig = {
        voiceStyle: style,
        speed: VOICE_PACK_MODIFIERS[style]?.speedMultiplier.toString() ?? '1.0',
        pitch: VOICE_PACK_MODIFIERS[style]?.pitchOffset.toString() ?? '0',
      };
      setUserVoicePack(userId, defaultConfig);
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const voicePackService = {
  setUserVoicePack,
  getUserVoicePack,
  getVoicePackModifiers,
  applyVoicePackToParameters,
  handleVoicePackMessage,
  clearAllVoicePackPreferences,
};

export default voicePackService;
