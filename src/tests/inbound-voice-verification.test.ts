/**
 * Inbound Voice Verification Service Tests
 *
 * Tests for the voice verification system that compares incoming
 * caller's voice against stored voice sketches to detect shared phones.
 *
 * @module tests/inbound-voice-verification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock voice memory thresholds
vi.mock('../services/memory/voice-memory.js', () => ({
  VOICE_MISMATCH_THRESHOLD: 0.4,
  VOICE_MATCH_THRESHOLD: 0.75,
  VOICE_UNCERTAIN_THRESHOLD: 0.55,
  VOICE_SUGGEST_THRESHOLD: 0.6,
  compareVoiceSketches: vi.fn(),
}));

// ============================================================================
// TEST DATA
// ============================================================================

const TEST_SESSION_ID = 'session-123';
const TEST_USER_ID = 'user-456';
const TEST_USER_NAME = 'Seth';
const TEST_STORED_SKETCH = {
  fundamentalFrequency: { mean: 120, std: 15 },
  spectralCentroid: { mean: 2000, std: 300 },
  speechRate: { mean: 150, std: 20 },
  pausePattern: { mean: 0.3, std: 0.1 },
  energyContour: { mean: 0.6, std: 0.15 },
};
const TEST_LIVE_SKETCH = {
  fundamentalFrequency: { mean: 118, std: 14 },
  spectralCentroid: { mean: 1980, std: 290 },
  speechRate: { mean: 155, std: 22 },
  pausePattern: { mean: 0.32, std: 0.12 },
  energyContour: { mean: 0.58, std: 0.14 },
};

// ============================================================================
// HELPERS
// ============================================================================

function resetMocks() {
  vi.clearAllMocks();
}

// ============================================================================
// TESTS
// ============================================================================

describe('Inbound Voice Verification Service', () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  // ==========================================================================
  // REGISTER FOR VERIFICATION
  // ==========================================================================

  describe('registerForVoiceVerification', () => {
    it('stores expected user info for session', async () => {
      const { registerForVoiceVerification, getVerificationState } =
        await import('../services/voice/inbound-voice-verification.js');

      registerForVoiceVerification(
        TEST_SESSION_ID,
        TEST_USER_ID,
        TEST_USER_NAME,
        TEST_STORED_SKETCH
      );

      const state = getVerificationState(TEST_SESSION_ID);

      expect(state).toBeDefined();
      expect(state?.expectedUserId).toBe(TEST_USER_ID);
      expect(state?.expectedName).toBe(TEST_USER_NAME);
    });

    it('stores voice sketch for comparison', async () => {
      const { registerForVoiceVerification, getVerificationState } =
        await import('../services/voice/inbound-voice-verification.js');

      registerForVoiceVerification(
        TEST_SESSION_ID,
        TEST_USER_ID,
        TEST_USER_NAME,
        TEST_STORED_SKETCH
      );

      const state = getVerificationState(TEST_SESSION_ID);

      expect(state?.storedSketch).toEqual(TEST_STORED_SKETCH);
    });

    it('overwrites existing registration for same session', async () => {
      const { registerForVoiceVerification, getVerificationState } =
        await import('../services/voice/inbound-voice-verification.js');

      // Register first time
      registerForVoiceVerification(TEST_SESSION_ID, 'old-user', 'OldName', TEST_STORED_SKETCH);

      // Register again with different user
      registerForVoiceVerification(
        TEST_SESSION_ID,
        TEST_USER_ID,
        TEST_USER_NAME,
        TEST_STORED_SKETCH
      );

      const state = getVerificationState(TEST_SESSION_ID);

      expect(state?.expectedUserId).toBe(TEST_USER_ID);
      expect(state?.expectedName).toBe(TEST_USER_NAME);
    });
  });

  // ==========================================================================
  // VERIFY INBOUND VOICE
  // ==========================================================================

  describe('verifyInboundVoice', () => {
    it('returns passed=true when similarity > MATCH_THRESHOLD', async () => {
      const { compareVoiceSketches } = await import('../services/memory/voice-memory.js');
      (compareVoiceSketches as ReturnType<typeof vi.fn>).mockReturnValue({
        similarity: 0.85, // Above VOICE_MATCH_THRESHOLD (0.75)
        confidence: 0.9,
      });

      const { registerForVoiceVerification, verifyInboundVoice } =
        await import('../services/voice/inbound-voice-verification.js');

      registerForVoiceVerification(
        TEST_SESSION_ID,
        TEST_USER_ID,
        TEST_USER_NAME,
        TEST_STORED_SKETCH
      );

      const result = await verifyInboundVoice(TEST_SESSION_ID, TEST_LIVE_SKETCH);

      expect(result.passed).toBe(true);
      expect(result.shouldChallenge).toBe(false);
      expect(result.similarity).toBe(0.85);
    });

    it('returns shouldChallenge=true when similarity < MISMATCH_THRESHOLD', async () => {
      const { compareVoiceSketches } = await import('../services/memory/voice-memory.js');
      (compareVoiceSketches as ReturnType<typeof vi.fn>).mockReturnValue({
        similarity: 0.3, // Below VOICE_MISMATCH_THRESHOLD (0.4)
        confidence: 0.8,
      });

      const { registerForVoiceVerification, verifyInboundVoice } =
        await import('../services/voice/inbound-voice-verification.js');

      registerForVoiceVerification(
        TEST_SESSION_ID,
        TEST_USER_ID,
        TEST_USER_NAME,
        TEST_STORED_SKETCH
      );

      const result = await verifyInboundVoice(TEST_SESSION_ID, TEST_LIVE_SKETCH);

      expect(result.passed).toBe(false);
      expect(result.shouldChallenge).toBe(true);
    });

    it('returns shouldChallenge=false for uncertain range', async () => {
      const { compareVoiceSketches } = await import('../services/memory/voice-memory.js');
      (compareVoiceSketches as ReturnType<typeof vi.fn>).mockReturnValue({
        similarity: 0.5, // Between MISMATCH (0.4) and UNCERTAIN (0.55)
        confidence: 0.7,
      });

      const { registerForVoiceVerification, verifyInboundVoice } =
        await import('../services/voice/inbound-voice-verification.js');

      registerForVoiceVerification(
        TEST_SESSION_ID,
        TEST_USER_ID,
        TEST_USER_NAME,
        TEST_STORED_SKETCH
      );

      const result = await verifyInboundVoice(TEST_SESSION_ID, TEST_LIVE_SKETCH);

      // Should not challenge in uncertain range - give benefit of the doubt
      expect(result.shouldChallenge).toBe(false);
    });

    it('marks session as verified after check', async () => {
      const { compareVoiceSketches } = await import('../services/memory/voice-memory.js');
      (compareVoiceSketches as ReturnType<typeof vi.fn>).mockReturnValue({
        similarity: 0.85,
        confidence: 0.9,
      });

      const { registerForVoiceVerification, verifyInboundVoice, getVerificationState } =
        await import('../services/voice/inbound-voice-verification.js');

      registerForVoiceVerification(
        TEST_SESSION_ID,
        TEST_USER_ID,
        TEST_USER_NAME,
        TEST_STORED_SKETCH
      );

      await verifyInboundVoice(TEST_SESSION_ID, TEST_LIVE_SKETCH);

      const state = getVerificationState(TEST_SESSION_ID);
      expect(state?.verified).toBe(true);
    });

    it('returns error result when session not registered', async () => {
      const { verifyInboundVoice } =
        await import('../services/voice/inbound-voice-verification.js');

      const result = await verifyInboundVoice('unregistered-session', TEST_LIVE_SKETCH);

      expect(result.passed).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('does not verify already-verified session', async () => {
      const { compareVoiceSketches } = await import('../services/memory/voice-memory.js');
      const mockCompare = compareVoiceSketches as ReturnType<typeof vi.fn>;
      mockCompare.mockReturnValue({
        similarity: 0.85,
        confidence: 0.9,
      });

      const { registerForVoiceVerification, verifyInboundVoice } =
        await import('../services/voice/inbound-voice-verification.js');

      registerForVoiceVerification(
        TEST_SESSION_ID,
        TEST_USER_ID,
        TEST_USER_NAME,
        TEST_STORED_SKETCH
      );

      // Verify first time
      await verifyInboundVoice(TEST_SESSION_ID, TEST_LIVE_SKETCH);
      const callCount = mockCompare.mock.calls.length;

      // Try to verify again
      const result = await verifyInboundVoice(TEST_SESSION_ID, TEST_LIVE_SKETCH);

      // Should return cached result without re-comparing
      expect(result.passed).toBe(true);
      expect(mockCompare.mock.calls.length).toBe(callCount); // No new calls
    });
  });

  // ==========================================================================
  // SHOULD SETUP VERIFICATION
  // ==========================================================================

  describe('shouldSetupVoiceVerification', () => {
    it('returns true for inbound known caller with voice sketch', async () => {
      const { shouldSetupVoiceVerification } =
        await import('../services/voice/inbound-voice-verification.js');

      const profile = {
        id: TEST_USER_ID,
        name: TEST_USER_NAME,
        voiceSketch: TEST_STORED_SKETCH,
      };

      const result = shouldSetupVoiceVerification(profile, true, true);

      expect(result.shouldSetup).toBe(true);
      expect(result.voiceSketch).toEqual(TEST_STORED_SKETCH);
      expect(result.userName).toBe(TEST_USER_NAME);
    });

    it('returns false for outbound calls', async () => {
      const { shouldSetupVoiceVerification } =
        await import('../services/voice/inbound-voice-verification.js');

      const profile = {
        id: TEST_USER_ID,
        name: TEST_USER_NAME,
        voiceSketch: TEST_STORED_SKETCH,
      };

      const result = shouldSetupVoiceVerification(profile, false, true); // isInboundCall = false

      expect(result.shouldSetup).toBe(false);
    });

    it('returns false for unknown callers', async () => {
      const { shouldSetupVoiceVerification } =
        await import('../services/voice/inbound-voice-verification.js');

      const profile = {
        id: TEST_USER_ID,
        name: TEST_USER_NAME,
        voiceSketch: TEST_STORED_SKETCH,
      };

      const result = shouldSetupVoiceVerification(profile, true, false); // isKnownCaller = false

      expect(result.shouldSetup).toBe(false);
    });

    it('returns false when no voice sketch', async () => {
      const { shouldSetupVoiceVerification } =
        await import('../services/voice/inbound-voice-verification.js');

      const profile = {
        id: TEST_USER_ID,
        name: TEST_USER_NAME,
        // No voiceSketch
      };

      const result = shouldSetupVoiceVerification(profile, true, true);

      expect(result.shouldSetup).toBe(false);
    });

    it('returns false when profile is null', async () => {
      const { shouldSetupVoiceVerification } =
        await import('../services/voice/inbound-voice-verification.js');

      const result = shouldSetupVoiceVerification(null, true, true);

      expect(result.shouldSetup).toBe(false);
    });
  });

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  describe('cleanupVoiceVerification', () => {
    it('removes verification state for session', async () => {
      const { registerForVoiceVerification, cleanupVoiceVerification, getVerificationState } =
        await import('../services/voice/inbound-voice-verification.js');

      registerForVoiceVerification(
        TEST_SESSION_ID,
        TEST_USER_ID,
        TEST_USER_NAME,
        TEST_STORED_SKETCH
      );

      expect(getVerificationState(TEST_SESSION_ID)).toBeDefined();

      cleanupVoiceVerification(TEST_SESSION_ID);

      expect(getVerificationState(TEST_SESSION_ID)).toBeUndefined();
    });

    it('handles cleanup of non-existent session gracefully', async () => {
      const { cleanupVoiceVerification } =
        await import('../services/voice/inbound-voice-verification.js');

      // Should not throw
      expect(() => cleanupVoiceVerification('nonexistent-session')).not.toThrow();
    });
  });
});
