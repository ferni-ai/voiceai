/**
 * Real-Time Backchannel System
 *
 * Determines when to inject backchannels ("Mmhmm", "Right", etc.)
 * during extended pauses in user speech.
 *
 * @module intelligence/human-behaviors/backchannels
 */

// ============================================================================
// TYPES
// ============================================================================

export interface BackchannelConfig {
  enabled: boolean;
  minUserSpeechDuration: number; // ms before eligible
  silenceThreshold: number; // ms of silence to trigger
  maxBackchannelsPerTurn: number;
}

export interface BackchannelState {
  userSpeechStartTime: number | null;
  backchannelsThisTurn: number;
  lastBackchannelTime: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const defaultConfig: BackchannelConfig = {
  enabled: true,
  minUserSpeechDuration: 3000, // 3 seconds
  silenceThreshold: 1500, // 1.5 seconds
  maxBackchannelsPerTurn: 2,
};

// ============================================================================
// BACKCHANNEL LOGIC
// ============================================================================

/**
 * Determine if a backchannel should be injected
 */
export function shouldInjectBackchannel(
  state: BackchannelState,
  silenceDurationMs: number,
  config: BackchannelConfig = defaultConfig
): { inject: boolean; sound: string } | null {
  if (!config.enabled) return null;

  // Check limit
  if (state.backchannelsThisTurn >= config.maxBackchannelsPerTurn) return null;

  // Check speech duration
  if (!state.userSpeechStartTime) return null;
  const speechDuration = Date.now() - state.userSpeechStartTime;
  if (speechDuration < config.minUserSpeechDuration) return null;

  // Check silence threshold
  if (silenceDurationMs < config.silenceThreshold) return null;

  // Don't backchannel too frequently
  if (Date.now() - state.lastBackchannelTime < 4000) return null;

  // Pick a backchannel sound
  const sounds = ['Mmhmm.', 'Mm.', 'Right.', 'Yeah.', 'I see.', 'Go on.', 'Uh huh.'];

  return {
    inject: true,
    sound: sounds[Math.floor(Math.random() * sounds.length)],
  };
}

export default shouldInjectBackchannel;
