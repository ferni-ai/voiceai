/**
 * Inbound Voice Verification Service
 *
 * Verifies that the caller's voice matches the expected user for inbound phone calls.
 * This enables detection of "borrowed phone" scenarios where someone else is calling
 * from a known phone number.
 *
 * Flow:
 * 1. On inbound call, we know who SHOULD be calling (from phone number lookup)
 * 2. After a few seconds of audio, we build a live voice sketch
 * 3. Compare with stored voice sketch for the expected user
 * 4. If mismatch, inject context so Ferni can gracefully verify identity
 *
 * @module services/voice/inbound-voice-verification
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  compareVoiceSketches,
  VOICE_MISMATCH_THRESHOLD,
  VOICE_MATCH_THRESHOLD,
  type VoiceSimilarityResult,
} from '../memory/voice-memory.js';
import {
  setVoiceMismatchContext,
  getVoiceMismatchContext,
  type VoiceMismatchContext,
} from '../../intelligence/context-builders/external/voice-mismatch-context.js';
import type { VoiceSketch } from '../../types/user-profile.js';
import type { UserProfile } from '../../types/user-profile.js';

const log = createLogger({ module: 'InboundVoiceVerification' });

// ============================================================================
// TYPES
// ============================================================================

export interface InboundVerificationRequest {
  /** Session ID for context storage */
  sessionId: string;

  /** The user we expect based on phone number lookup */
  expectedUserId: string;

  /** Expected user's name */
  expectedName: string;

  /** Expected user's stored voice sketch */
  storedSketch: VoiceSketch;

  /** The live voice sketch from current call */
  liveSketch: VoiceSketch;
}

export interface InboundVerificationResult {
  /** Whether verification passed (voice matches expected user) */
  passed: boolean;

  /** Similarity score (0-1) */
  similarity: number;

  /** Whether we should challenge the caller's identity */
  shouldChallenge: boolean;

  /** Full comparison result */
  comparison: VoiceSimilarityResult;
}

// ============================================================================
// VERIFICATION STATE
// ============================================================================

export interface VerificationState {
  sessionId: string;
  expectedUserId: string;
  expectedName: string;
  storedSketch: VoiceSketch;
  verified: boolean;
  startedAt: Date;
}

// Track sessions that need voice verification
const pendingVerifications = new Map<string, VerificationState>();

// Track sessions that have completed verification
const completedVerifications = new Set<string>();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Register an inbound call session for voice verification.
 * Call this when an inbound call connects and we have an expected user with voice sketch.
 */
export function registerForVoiceVerification(
  sessionId: string,
  expectedUserId: string,
  expectedName: string,
  storedSketch: VoiceSketch
): void {
  if (completedVerifications.has(sessionId)) {
    log.debug({ sessionId }, 'Session already verified, skipping registration');
    return;
  }

  pendingVerifications.set(sessionId, {
    sessionId,
    expectedUserId,
    expectedName,
    storedSketch,
    verified: false,
    startedAt: new Date(),
  });

  log.info(
    {
      sessionId,
      expectedName,
      sketchConfidence: storedSketch.confidence.toFixed(2),
    },
    '📞 Registered inbound call for voice verification'
  );
}

/**
 * Check if a session needs voice verification.
 */
export function needsVoiceVerification(sessionId: string): boolean {
  return pendingVerifications.has(sessionId) && !completedVerifications.has(sessionId);
}

/**
 * Perform voice verification for an inbound call.
 * Call this once we have a live voice sketch (after ~5-10 seconds of speech).
 */
export function verifyInboundVoice(
  sessionId: string,
  liveSketch: VoiceSketch
): InboundVerificationResult | null {
  const state = pendingVerifications.get(sessionId);

  if (!state) {
    log.debug({ sessionId }, 'No pending verification for session');
    return null;
  }

  if (state.verified) {
    log.debug({ sessionId }, 'Session already verified');
    return null;
  }

  // Compare voice sketches
  const comparison = compareVoiceSketches(liveSketch, state.storedSketch);

  log.info(
    {
      sessionId,
      expectedName: state.expectedName,
      similarity: comparison.similarity.toFixed(2),
      confidence: comparison.confidence.toFixed(2),
      matchingFeatures: comparison.matchingFeatures,
      divergentFeatures: comparison.divergentFeatures,
    },
    '🎤 Voice verification comparison'
  );

  // Determine result
  const passed = comparison.similarity >= VOICE_MATCH_THRESHOLD;
  const shouldChallenge = comparison.similarity < VOICE_MISMATCH_THRESHOLD;

  // Mark as verified
  state.verified = true;
  completedVerifications.add(sessionId);

  // If mismatch detected, set context for Ferni to handle
  if (shouldChallenge) {
    const mismatchContext: VoiceMismatchContext = {
      sessionId,
      expectedName: state.expectedName,
      expectedUserId: state.expectedUserId,
      liveSketch,
      storedSketch: state.storedSketch,
      comparison,
    };

    setVoiceMismatchContext(sessionId, mismatchContext);

    log.warn(
      {
        sessionId,
        expectedName: state.expectedName,
        similarity: comparison.similarity.toFixed(2),
      },
      '⚠️ Voice mismatch detected - different person may be calling'
    );
  } else if (passed) {
    log.info(
      {
        sessionId,
        expectedName: state.expectedName,
        similarity: comparison.similarity.toFixed(2),
      },
      '✅ Voice verification passed - confirmed expected caller'
    );
  } else {
    log.debug(
      {
        sessionId,
        expectedName: state.expectedName,
        similarity: comparison.similarity.toFixed(2),
      },
      '🤷 Voice verification uncertain - proceeding without challenge'
    );
  }

  return {
    passed,
    similarity: comparison.similarity,
    shouldChallenge,
    comparison,
  };
}

/**
 * Clean up verification state for a session.
 * Call this when session ends.
 */
export function cleanupVoiceVerification(sessionId: string): void {
  pendingVerifications.delete(sessionId);
  completedVerifications.delete(sessionId);
  log.debug({ sessionId }, 'Cleaned up voice verification state');
}

/**
 * Get the verification state for a session (for testing/debugging).
 */
export function getVerificationState(sessionId: string): VerificationState | undefined {
  return pendingVerifications.get(sessionId);
}

/**
 * Reset all verification state.
 * Used for testing to ensure clean state between tests.
 */
export function resetAllVerificationState(): void {
  pendingVerifications.clear();
  completedVerifications.clear();
}

/**
 * Helper to check if we should set up voice verification for an inbound call.
 * Returns the expected user info if verification should be set up.
 */
export function shouldSetupVoiceVerification(
  profile: UserProfile | null,
  isInboundCall: boolean,
  isKnownCaller: boolean
): { shouldSetup: boolean; voiceSketch?: VoiceSketch; userName?: string } {
  // Only for inbound calls from known callers with voice sketches
  if (!isInboundCall || !isKnownCaller || !profile) {
    return { shouldSetup: false };
  }

  if (!profile.voiceSketch) {
    log.debug(
      { userId: profile.id, name: profile.name },
      'Known caller has no voice sketch - skipping verification'
    );
    return { shouldSetup: false };
  }

  // Need reasonable confidence in stored sketch
  if (profile.voiceSketch.confidence < 0.3) {
    log.debug(
      { userId: profile.id, confidence: profile.voiceSketch.confidence },
      'Voice sketch confidence too low for verification'
    );
    return { shouldSetup: false };
  }

  return {
    shouldSetup: true,
    voiceSketch: profile.voiceSketch,
    userName: profile.preferredName || profile.name,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  registerForVoiceVerification,
  needsVoiceVerification,
  getVerificationState,
  verifyInboundVoice,
  cleanupVoiceVerification,
  resetAllVerificationState,
  shouldSetupVoiceVerification,
};
