/**
 * Voice Humanization Feature Flags
 *
 * Controls gradual rollout of voice humanization features.
 * Each feature can be enabled/disabled independently for testing
 * and gradual production rollout.
 *
 * @module VoiceHumanizationFlags
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'VoiceHumanizationFlags' });

// ============================================================================
// FEATURE FLAGS
// ============================================================================

export interface VoiceHumanizationFlags {
  // Phase 1: Foundation
  /** Enable prosody-aware turn prediction (intonation detection) */
  enableProsodyTurnPrediction: boolean;
  /** Enable micro-interruption detection ("wait", "hold on" stops agent) */
  enableMicroInterruptions: boolean;
  /** Enable emotional arc influence on TTS pauses */
  enableEmotionalArcTts: boolean;

  // Phase 2: Audio Intelligence
  /** Enable laughter detection */
  enableLaughterDetection: boolean;
  /** Enable ambient sound awareness */
  enableAmbientAwareness: boolean;

  // Phase 3: Advanced
  /** Enable speech rhythm mirroring */
  enableRhythmMirroring: boolean;
  /** Enable emotional contagion continuity */
  enableEmotionalContagion: boolean;
  /** Enable enhanced voice fingerprinting */
  enableEnhancedVoiceFingerprinting: boolean;

  // Rollout controls
  /** Percentage of sessions to enable (0-100) */
  rolloutPercentage: number;
  /** Enable verbose logging for debugging */
  enableVerboseLogging: boolean;
}

// ============================================================================
// DEFAULT FLAGS
// ============================================================================

/**
 * Default flags - conservative defaults for production safety
 */
const DEFAULT_FLAGS: VoiceHumanizationFlags = {
  // Phase 1: Enable by default (well tested)
  enableProsodyTurnPrediction: true,
  enableMicroInterruptions: true,
  enableEmotionalArcTts: true,

  // Phase 2: Enable by default
  enableLaughterDetection: true,
  enableAmbientAwareness: true,

  // Phase 3: Enable by default (new)
  enableRhythmMirroring: true,
  enableEmotionalContagion: true,
  enableEnhancedVoiceFingerprinting: false, // Not yet implemented

  // Rollout: 100% by default
  rolloutPercentage: 100,
  enableVerboseLogging: false,
};

/**
 * Staging flags - more aggressive for testing
 */
const STAGING_FLAGS: VoiceHumanizationFlags = {
  ...DEFAULT_FLAGS,
  enableVerboseLogging: true,
  rolloutPercentage: 100,
};

/**
 * Development flags - all features enabled
 */
const DEVELOPMENT_FLAGS: VoiceHumanizationFlags = {
  ...DEFAULT_FLAGS,
  enableEnhancedVoiceFingerprinting: true,
  enableVerboseLogging: true,
  rolloutPercentage: 100,
};

// ============================================================================
// FLAG MANAGEMENT
// ============================================================================

let currentFlags: VoiceHumanizationFlags = DEFAULT_FLAGS;
let isInitialized = false;

/**
 * Initialize feature flags based on environment
 */
export function initializeFlags(): void {
  if (isInitialized) return;

  const env = process.env['NODE_ENV'] || 'development';

  switch (env) {
    case 'production':
      currentFlags = { ...DEFAULT_FLAGS };
      break;
    case 'staging':
      currentFlags = { ...STAGING_FLAGS };
      break;
    default:
      currentFlags = { ...DEVELOPMENT_FLAGS };
  }

  // Override from environment variables
  applyEnvironmentOverrides();

  isInitialized = true;
  log.info({ flags: currentFlags, env }, '🚩 Voice humanization flags initialized');
}

/**
 * Apply overrides from environment variables
 */
function applyEnvironmentOverrides(): void {
  const overrides: Partial<VoiceHumanizationFlags> = {};

  // Boolean flags
  const boolFlags: (keyof VoiceHumanizationFlags)[] = [
    'enableProsodyTurnPrediction',
    'enableMicroInterruptions',
    'enableEmotionalArcTts',
    'enableLaughterDetection',
    'enableAmbientAwareness',
    'enableRhythmMirroring',
    'enableEmotionalContagion',
    'enableEnhancedVoiceFingerprinting',
    'enableVerboseLogging',
  ];

  for (const flag of boolFlags) {
    const envKey = `VOICE_HUMANIZATION_${flag.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
    const envValue = process.env[envKey];
    if (envValue !== undefined) {
      (overrides as Record<string, unknown>)[flag] = envValue === 'true' || envValue === '1';
    }
  }

  // Rollout percentage
  const rolloutEnv = process.env['VOICE_HUMANIZATION_ROLLOUT_PERCENTAGE'];
  if (rolloutEnv !== undefined) {
    const percentage = parseInt(rolloutEnv, 10);
    if (!isNaN(percentage) && percentage >= 0 && percentage <= 100) {
      overrides.rolloutPercentage = percentage;
    }
  }

  // Master kill switch
  if (process.env['VOICE_HUMANIZATION_DISABLED'] === 'true') {
    log.warn('Voice humanization DISABLED via kill switch');
    overrides.enableProsodyTurnPrediction = false;
    overrides.enableMicroInterruptions = false;
    overrides.enableEmotionalArcTts = false;
    overrides.enableLaughterDetection = false;
    overrides.enableAmbientAwareness = false;
    overrides.enableRhythmMirroring = false;
    overrides.enableEmotionalContagion = false;
    overrides.enableEnhancedVoiceFingerprinting = false;
    overrides.rolloutPercentage = 0;
  }

  currentFlags = { ...currentFlags, ...overrides };

  if (Object.keys(overrides).length > 0) {
    log.info({ overrides }, '🚩 Applied environment overrides');
  }
}

/**
 * Get current feature flags
 */
export function getFlags(): VoiceHumanizationFlags {
  if (!isInitialized) {
    initializeFlags();
  }
  return { ...currentFlags };
}

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(
  feature: keyof Omit<VoiceHumanizationFlags, 'rolloutPercentage' | 'enableVerboseLogging'>
): boolean {
  const flags = getFlags();
  return flags[feature] === true;
}

/**
 * Check if voice humanization is enabled for a session
 * Uses rollout percentage to determine inclusion
 */
export function isEnabledForSession(sessionId: string): boolean {
  const flags = getFlags();
  
  if (flags.rolloutPercentage >= 100) {
    return true;
  }
  
  if (flags.rolloutPercentage <= 0) {
    return false;
  }

  // Deterministic hash for consistent rollout
  const hash = hashSessionId(sessionId);
  return hash < flags.rolloutPercentage;
}

/**
 * Get flags for a specific session (with rollout check)
 */
export function getSessionFlags(sessionId: string): VoiceHumanizationFlags & { isEnabled: boolean } {
  const flags = getFlags();
  const isEnabled = isEnabledForSession(sessionId);

  if (!isEnabled) {
    // Return all features disabled
    return {
      ...flags,
      enableProsodyTurnPrediction: false,
      enableMicroInterruptions: false,
      enableEmotionalArcTts: false,
      enableLaughterDetection: false,
      enableAmbientAwareness: false,
      enableRhythmMirroring: false,
      enableEmotionalContagion: false,
      enableEnhancedVoiceFingerprinting: false,
      isEnabled: false,
    };
  }

  return { ...flags, isEnabled: true };
}

/**
 * Simple hash function for session ID
 */
function hashSessionId(sessionId: string): number {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    const char = sessionId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash % 100);
}

/**
 * Update flags at runtime (for testing/debugging)
 */
export function updateFlags(updates: Partial<VoiceHumanizationFlags>): void {
  currentFlags = { ...currentFlags, ...updates };
  log.info({ updates }, '🚩 Flags updated at runtime');
}

/**
 * Reset flags to defaults
 */
export function resetFlags(): void {
  currentFlags = { ...DEFAULT_FLAGS };
  isInitialized = false;
  log.info('🚩 Flags reset to defaults');
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export {
  DEFAULT_FLAGS,
  STAGING_FLAGS,
  DEVELOPMENT_FLAGS,
};

