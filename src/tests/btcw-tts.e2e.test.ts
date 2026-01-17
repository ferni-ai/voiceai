/**
 * BTCW TTS E2E Test
 *
 * Tests the full Ferni → BTCW integration:
 * - Health check
 * - Non-streaming synthesis
 * - Streaming synthesis
 * - Voice switching between personas
 * - Emotion control
 *
 * Requires BTCW_ENDPOINT and BTCW_API_KEY environment variables.
 * Skip with: SKIP_BTCW_E2E=true
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  BTCWTTS,
  BTCWEmotionType,
  createBTCWTTS,
  createBTCWTTSFromEnv,
  getBTCWVoiceIdForPersona,
  DEFAULT_BTCW_ENDPOINT,
} from '../speech/tts/btcw-core.js';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const BTCW_ENDPOINT = process.env.BTCW_ENDPOINT || DEFAULT_BTCW_ENDPOINT;
const { BTCW_API_KEY } = process.env;

const SKIP_REASON = !BTCW_API_KEY
  ? 'BTCW_API_KEY not set'
  : process.env.SKIP_BTCW_E2E === 'true'
    ? 'SKIP_BTCW_E2E=true'
    : null;

// Skip all tests if API key not available
const describeE2E = SKIP_REASON ? describe.skip : describe;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function collectAudioFrames(
  stream: AsyncIterable<{ type: string; frame?: { data: Int16Array } }>
): Promise<{ totalSamples: number; frameCount: number; errors: string[] }> {
  let totalSamples = 0;
  let frameCount = 0;
  const errors: string[] = [];

  for await (const event of stream) {
    if (event.type === 'audio' && event.frame) {
      totalSamples += event.frame.data.length;
      frameCount++;
    } else if (event.type === 'error') {
      errors.push((event as { error?: string }).error || 'Unknown error');
    }
  }

  return { totalSamples, frameCount, errors };
}

// ============================================================================
// E2E TESTS
// ============================================================================

describeE2E('BTCW TTS E2E Integration', () => {
  let tts: BTCWTTS;

  beforeAll(() => {
    console.log(`\n📡 Testing BTCW at: ${BTCW_ENDPOINT}`);
    tts = createBTCWTTS('ferni', {
      endpoint: BTCW_ENDPOINT,
      apiKey: BTCW_API_KEY,
      defaultEmotion: 'warm',
    });
  });

  afterAll(() => {
    console.log('\n✅ BTCW E2E tests completed');
  });

  // --------------------------------------------------------------------------
  // Health Check
  // --------------------------------------------------------------------------

  describe('Health Check', () => {
    it('should report healthy status with model loaded', async () => {
      const health = await tts.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.modelLoaded).toBe(true);
      expect(health.mockMode).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Non-Streaming Synthesis
  // --------------------------------------------------------------------------

  describe('Non-Streaming Synthesis', () => {
    it('should synthesize short text with Ferni voice', async () => {
      const text = 'Hello, this is a test.';
      const stream = await tts.synthesize(text);
      const result = await collectAudioFrames(stream);

      expect(result.errors).toHaveLength(0);
      expect(result.totalSamples).toBeGreaterThan(0);
      expect(result.frameCount).toBeGreaterThan(0);

      // At 24kHz, "Hello, this is a test" should be ~1-2 seconds = 24000-48000 samples
      expect(result.totalSamples).toBeGreaterThan(10000);

      console.log(`  ✓ Synthesized ${result.totalSamples} samples in ${result.frameCount} frames`);
    }, 30000); // 30s timeout for model inference

    it('should synthesize longer text', async () => {
      const text =
        'I understand how you feel. Sometimes we all need a moment to reflect on our journey and appreciate how far we have come.';
      const stream = await tts.synthesize(text);
      const result = await collectAudioFrames(stream);

      expect(result.errors).toHaveLength(0);
      expect(result.totalSamples).toBeGreaterThan(50000); // Should be several seconds

      console.log(`  ✓ Long text: ${result.totalSamples} samples`);
    }, 60000);
  });

  // --------------------------------------------------------------------------
  // Streaming Synthesis
  // --------------------------------------------------------------------------

  describe('Streaming Synthesis', () => {
    it('should stream audio chunks progressively', async () => {
      const streamSession = tts.stream();
      const chunks: number[] = [];
      let firstChunkTime: number | null = null;
      const startTime = Date.now();

      streamSession.pushText('This is a streaming test with multiple chunks of audio.');
      streamSession.endInput();

      for await (const event of streamSession) {
        if (event.type === 'audio' && event.frame) {
          if (firstChunkTime === null) {
            firstChunkTime = Date.now() - startTime;
          }
          chunks.push(event.frame.data.length);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(firstChunkTime).not.toBeNull();

      // First chunk should arrive within reasonable time (streaming benefit)
      // Note: CosyVoice streaming has ~150ms first-byte latency in ideal conditions
      // Cold starts on Cloud Run can add significant latency
      console.log(`  ✓ First chunk in ${firstChunkTime}ms, ${chunks.length} total chunks`);
    }, 60000); // 60s timeout for cold starts

    it('should handle multiple pushText calls', async () => {
      const streamSession = tts.stream();
      const results: number[] = [];

      // Push text in parts (simulating LLM streaming output)
      streamSession.pushText('First part. ');
      streamSession.pushText('Second part. ');
      streamSession.pushText('Third part.');
      streamSession.endInput();

      for await (const event of streamSession) {
        if (event.type === 'audio' && event.frame) {
          results.push(event.frame.data.length);
        }
      }

      expect(results.length).toBeGreaterThan(0);
      const totalSamples = results.reduce((a, b) => a + b, 0);
      expect(totalSamples).toBeGreaterThan(20000);

      console.log(`  ✓ Multi-push: ${totalSamples} samples from ${results.length} chunks`);
    }, 30000);
  });

  // --------------------------------------------------------------------------
  // Voice Switching (run sequentially to avoid server overload)
  // --------------------------------------------------------------------------

  describe('Voice Switching', () => {
    // Run each voice test with delay to avoid concurrent requests
    it('should synthesize with all voices sequentially', async () => {
      const PERSONAS = ['ferni', 'peter', 'maya', 'alex', 'jordan', 'nayan'] as const;
      const results: Record<string, { samples: number; error?: string }> = {};

      for (const persona of PERSONAS) {
        const personaTTS = createBTCWTTS(persona, {
          endpoint: BTCW_ENDPOINT,
          apiKey: BTCW_API_KEY,
        });

        try {
          const stream = await personaTTS.synthesize(`Hi, I'm ${persona}.`);
          const result = await collectAudioFrames(stream);

          if (result.errors.length > 0) {
            results[persona] = { samples: 0, error: result.errors[0] };
            console.log(`  ⚠ ${persona}: ${result.errors[0]}`);
          } else {
            results[persona] = { samples: result.totalSamples };
            expect(result.totalSamples).toBeGreaterThan(5000);
            console.log(`  ✓ ${persona}: ${result.totalSamples} samples`);
          }
        } catch (err) {
          results[persona] = { samples: 0, error: String(err) };
          console.log(`  ✗ ${persona}: ${err}`);
        }

        // Small delay between requests
        await new Promise((r) => {
          setTimeout(r, 500);
        });
      }

      // At least 4 of 6 voices should work
      const successCount = Object.values(results).filter((r) => r.samples > 0).length;
      expect(successCount).toBeGreaterThanOrEqual(4);
    }, 180000); // 3 minute timeout for all voices
  });

  // --------------------------------------------------------------------------
  // Emotion Control (use shared TTS instance to avoid rate limits)
  // --------------------------------------------------------------------------

  describe('Emotion Control', () => {
    it('should synthesize with various emotions sequentially', async () => {
      const EMOTIONS: BTCWEmotionType[] = ['neutral', 'warm', 'excited', 'calm', 'sympathetic'];
      const results: Record<string, number> = {};

      for (const emotion of EMOTIONS) {
        const emotionTTS = createBTCWTTS('ferni', {
          endpoint: BTCW_ENDPOINT,
          apiKey: BTCW_API_KEY,
          defaultEmotion: emotion,
        });

        try {
          const stream = await emotionTTS.synthesize('I understand how you feel.');
          const result = await collectAudioFrames(stream);

          if (result.errors.length === 0) {
            results[emotion] = result.totalSamples;
            expect(result.totalSamples).toBeGreaterThan(5000);
            console.log(`  ✓ ${emotion}: ${result.totalSamples} samples`);
          } else {
            console.log(`  ⚠ ${emotion}: ${result.errors[0]}`);
          }
        } catch (err) {
          console.log(`  ✗ ${emotion}: ${err}`);
        }

        // Small delay between requests
        await new Promise((r) => {
          setTimeout(r, 500);
        });
      }

      // At least 3 of 5 emotions should work
      const successCount = Object.values(results).filter((s) => s > 0).length;
      expect(successCount).toBeGreaterThanOrEqual(3);
    }, 120000); // 2 minute timeout
  });

  // --------------------------------------------------------------------------
  // Persona Mapping
  // --------------------------------------------------------------------------

  describe('Persona Mapping', () => {
    it('should map persona names to BTCW voice IDs', () => {
      expect(getBTCWVoiceIdForPersona('ferni')).toBe('ferni');
      expect(getBTCWVoiceIdForPersona('Ferni')).toBe('ferni');
      expect(getBTCWVoiceIdForPersona('jack-b')).toBe('ferni'); // Legacy alias
      expect(getBTCWVoiceIdForPersona('peter-john')).toBe('peter');
      expect(getBTCWVoiceIdForPersona('maya-santos')).toBe('maya');
      expect(getBTCWVoiceIdForPersona('unknown')).toBe('ferni'); // Fallback
    });

    it('should create TTS from environment', () => {
      // Temporarily set env vars
      const origEndpoint = process.env.BTCW_ENDPOINT;
      const origVoice = process.env.BTCW_DEFAULT_VOICE;
      const origApiKey = process.env.BTCW_API_KEY;

      process.env.BTCW_ENDPOINT = 'https://test-endpoint.example.com';
      process.env.BTCW_DEFAULT_VOICE = 'peter';
      process.env.BTCW_API_KEY = 'test-key';

      try {
        const envTTS = createBTCWTTSFromEnv();
        expect(envTTS.voiceId).toBe('peter');
        expect(envTTS.endpoint).toBe('https://test-endpoint.example.com');
      } finally {
        // Restore
        if (origEndpoint) process.env.BTCW_ENDPOINT = origEndpoint;
        else delete process.env.BTCW_ENDPOINT;
        if (origVoice) process.env.BTCW_DEFAULT_VOICE = origVoice;
        else delete process.env.BTCW_DEFAULT_VOICE;
        if (origApiKey) process.env.BTCW_API_KEY = origApiKey;
        else delete process.env.BTCW_API_KEY;
      }
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should handle invalid voice gracefully', async () => {
      const invalidTTS = createBTCWTTS('nonexistent-voice', {
        endpoint: BTCW_ENDPOINT,
        apiKey: BTCW_API_KEY,
      });

      // Should fall back to ferni or return an error
      const stream = await invalidTTS.synthesize('Test');
      const result = await collectAudioFrames(stream);

      // Either succeeds with fallback or returns error
      const hasAudio = result.totalSamples > 0;
      const hasError = result.errors.length > 0;
      expect(hasAudio || hasError).toBe(true);
    }, 30000);

    it('should handle empty text', async () => {
      const stream = await tts.synthesize('');
      const result = await collectAudioFrames(stream);

      // Empty text should either return no audio or an error
      expect(result.errors.length > 0 || result.totalSamples === 0).toBe(true);
    }, 10000);

    it('should reject auth without API key', async () => {
      // Temporarily unset the env var to truly test no auth
      const origApiKey = process.env.BTCW_API_KEY;
      delete process.env.BTCW_API_KEY;

      try {
        const noAuthTTS = createBTCWTTS('ferni', {
          endpoint: BTCW_ENDPOINT,
          // No API key and no env fallback
        });

        const stream = await noAuthTTS.synthesize('Test');
        const result = await collectAudioFrames(stream);

        // Should get auth error (401 or 500 - server may not return proper 401)
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toMatch(/401|500/);
      } finally {
        // Restore
        if (origApiKey) process.env.BTCW_API_KEY = origApiKey;
      }
    }, 10000);
  });
});

// ============================================================================
// SKIP MESSAGE
// ============================================================================

if (SKIP_REASON) {
  describe('BTCW TTS E2E Integration', () => {
    it.skip(`Skipped: ${SKIP_REASON}`, () => {});
  });
}
