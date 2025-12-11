/**
 * Voice Manager Types
 *
 * Type definitions for voice management and TTS.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * All supported agent IDs for voice switching.
 * Includes canonical IDs and aliases for flexibility.
 */
export type VoiceAgentId =
  // Canonical IDs (preferred)
  | 'ferni'
  | 'peter-john'
  | 'alex-chen'
  | 'maya-santos'
  | 'jordan-taylor'
  | 'nayan-patel'
  // Short aliases
  | 'alex'
  | 'maya'
  | 'jordan'
  | 'peter'
  | 'nayan'
  // Legacy aliases
  | 'jack-b'
  | 'comm-specialist'
  | 'spend-save'
  | 'event-planner';

/**
 * Voice configuration for a persona
 */
export interface VoiceConfig {
  id: string;
  name: string;
  model: string;
  description: string;
}

/**
 * Voice configuration from PersonaConfig
 *
 * Speed values for Cartesia sonic-2-2025-03-07:
 * - String: "slowest", "slow", "normal", "fast", "fastest"
 * - Number: -1.0 (slowest) to 1.0 (fastest), 0 = normal
 */
export interface PersonaVoiceConfig {
  voiceId: string;
  provider?: string;
  language?: string;
  defaultRate?: number | string;
  /** English accent preference (american, british, australian, indian) */
  accent?: 'american' | 'british' | 'australian' | 'indian';
  /** Whether the voiceId is a localized voice from Cartesia's localization API */
  isLocalizedVoice?: boolean;
}
