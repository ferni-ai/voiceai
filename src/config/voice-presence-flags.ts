/**
 * Voice Presence Feature Flags
 *
 * ⚠️ DEPRECATED: This file now wraps the centralized feature flag service.
 * Use the dashboard at /feature-flags.html to manage flags.
 *
 * For new code, import directly from '../services/feature-flags.js':
 *   import { getFeatureFlags, isVoicePresenceEnabled } from '../services/feature-flags.js';
 */

// Re-export from centralized service for backward compatibility
export {
  isVoicePresenceEnabled,
  isVoicePresenceFeatureEnabled,
} from '../services/feature-flags.js';

// Legacy constants for type compatibility (now reads from service)
import { getFeatureFlags } from '../services/feature-flags.js';

/**
 * @deprecated Use getFeatureFlags().isEnabled('voice-presence') instead
 */
export const VOICE_PRESENCE_ENABLED = getFeatureFlags().isEnabled('voice-presence');

/**
 * @deprecated Use getFeatureFlags().isEnabled('voice-presence-*') instead
 */
export const VOICE_PRESENCE_FLAGS = {
  get breathPauseDetection() {
    return getFeatureFlags().isEnabled('voice-presence-breath-pause');
  },
  get liveBackchanneling() {
    return getFeatureFlags().isEnabled('voice-presence-live-backchannel');
  },
  get turnPrediction() {
    return getFeatureFlags().isEnabled('voice-presence-turn-prediction');
  },
  get cartesiaContextPatch() {
    return getFeatureFlags().isEnabled('voice-presence-cartesia-context');
  },
  get analyticsRecording() {
    return getFeatureFlags().isEnabled('voice-presence-analytics');
  },
} as const;

