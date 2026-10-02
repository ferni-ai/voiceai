/**
 * Safety Module
 *
 * Hard safety rails for Ferni agents that CANNOT be bypassed.
 * This module ensures user safety is never compromised.
 *
 * @module Safety
 */

export {
  detectCrisis,
  guardPreResponse,
  type CrisisGuardResult,
  type CrisisDetectionResult,
  type VoiceEmotionContext,
} from './crisis-guard.js';
