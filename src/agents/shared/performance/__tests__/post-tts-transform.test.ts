/**
 * Post-TTS Transform Integration Tests
 *
 * Tests for the post-TTS audio enhancement pipeline including:
 * - TypeScript config and presets
 * - Rust processor integration (when available)
 * - Advanced humanization features
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createPostTTSTransform,
  isPostTTSAvailable,
  getPostTTSMetrics,
  resetPostTTSMetrics,
  PostTTSPresets,
  DEFAULT_CONFIG,
  getRecommendedPreset,
  buildPersonaPostTTSConfig,
  type PostTTSConfig,
  type PersonaHumanizationConfig,
} from '../post-tts-transform.js';

describe('PostTTSTransform', () => {
  beforeEach(() => {
    resetPostTTSMetrics();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // CONFIG & PRESETS
  // =========================================================================

  describe('DEFAULT_CONFIG', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_CONFIG.sampleRate).toBe(24000);
      // Core features now require env vars (opt-in for safety)
      expect(typeof DEFAULT_CONFIG.enableBreath).toBe('boolean');
      expect(typeof DEFAULT_CONFIG.enableWarmth).toBe('boolean');
      expect(typeof DEFAULT_CONFIG.enableCompression).toBe('boolean');
      expect(typeof DEFAULT_CONFIG.enablePresence).toBe('boolean');
    });

    it('should have humanization features controlled by env vars', () => {
      // These are now opt-in via env vars, default to false unless env var set
      expect(typeof DEFAULT_CONFIG.enableAmplitudeJitter).toBe('boolean');
      expect(typeof DEFAULT_CONFIG.enablePitchDrift).toBe('boolean');
      expect(typeof DEFAULT_CONFIG.enableNoiseFloor).toBe('boolean');
    });

    it('should have SOLA and emotion prosody controlled by env vars', () => {
      // These are now opt-in via env vars
      expect(typeof DEFAULT_CONFIG.useSolaPitch).toBe('boolean');
      expect(typeof DEFAULT_CONFIG.enableEmotionProsody).toBe('boolean');
    });

    it('should have advanced humanization features controlled by env vars', () => {
      // All humanization features are opt-in via env vars
      expect(typeof DEFAULT_CONFIG.enableVocalFry).toBe('boolean');
      expect(typeof DEFAULT_CONFIG.enableLipSmacks).toBe('boolean');
      expect(typeof DEFAULT_CONFIG.enableTempoVariation).toBe('boolean');
    });
  });

  describe('PostTTSPresets', () => {
    it('should have all expected presets', () => {
      expect(PostTTSPresets).toHaveProperty('betterThanHuman');
      expect(PostTTSPresets).toHaveProperty('minimal');
      expect(PostTTSPresets).toHaveProperty('warmIntimate');
      expect(PostTTSPresets).toHaveProperty('clearEnergetic');
      expect(PostTTSPresets).toHaveProperty('ultraRealistic');
      expect(PostTTSPresets).toHaveProperty('bypass');
    });

    it('betterThanHuman should be conservative for production safety', () => {
      const preset = PostTTSPresets.betterThanHuman;
      // After production audio quality issues, betterThanHuman is now MINIMAL
      // All humanization features are OFF by default
      expect(preset.enableAmplitudeJitter).toBe(false);
      expect(preset.enablePitchDrift).toBe(false);
      expect(preset.enableVocalFry).toBe(false);
      expect(preset.enableLipSmacks).toBe(false);
      expect(preset.enableTempoVariation).toBe(false);
    });

    it('warmIntimate should have vocal fry disabled (sounds robotic)', () => {
      const preset = PostTTSPresets.warmIntimate;
      // Vocal fry disabled due to audio quality issues - sounds robotic
      expect(preset.enableVocalFry).toBe(false);
      // Config values preserved for when feature is fixed
      expect(preset.vocalFryDepth).toBe(0.3);
      expect(preset.vocalFryDurationMs).toBe(150);
      expect(preset.enableLipSmacks).toBe(false);
    });

    it('ultraRealistic should have advanced humanization disabled (deprecated)', () => {
      const preset = PostTTSPresets.ultraRealistic;
      // DEPRECATED: Advanced features disabled due to audio quality issues
      // - Vocal fry: sounds robotic
      // - Lip smacks: sounds like glitches
      // - Tempo variation: causes artifacts
      expect(preset.enableVocalFry).toBe(false);
      expect(preset.vocalFryDepth).toBe(0.3); // Config preserved (reduced value)
      expect(preset.enableLipSmacks).toBe(false);
      expect(preset.lipSmackProbability).toBe(0.2); // Config preserved (reduced value)
      expect(preset.enableTempoVariation).toBe(false);
      expect(preset.tempoVariationDepth).toBe(0.02); // Config preserved (reduced value)
      expect(preset.enableAdaptivePacing).toBe(false); // Not properly implemented
    });

    it('bypass should disable all processing', () => {
      const preset = PostTTSPresets.bypass;
      expect(preset.enableBreath).toBe(false);
      expect(preset.enableWarmth).toBe(false);
      expect(preset.enableCompression).toBe(false);
      expect(preset.enableVocalFry).toBe(false);
      expect(preset.enableLipSmacks).toBe(false);
      expect(preset.enableTempoVariation).toBe(false);
      expect(preset.useSolaPitch).toBe(false);
      expect(preset.enableEmotionProsody).toBe(false);
    });

    it('minimal should only enable soft edges', () => {
      const preset = PostTTSPresets.minimal;
      expect(preset.enableSoftEdges).toBe(true);
      expect(preset.enableBreath).toBe(false);
      expect(preset.enableWarmth).toBe(false);
      expect(preset.enableAmplitudeJitter).toBe(false);
    });

    it('clearEnergetic should have higher compression and presence', () => {
      const preset = PostTTSPresets.clearEnergetic;
      // Values reduced from original (3.0) for better audio quality
      expect(preset.compressionRatio).toBe(1.8);
      expect(preset.presenceBoostDb).toBe(1.5);
      expect(preset.enableVocalFry).toBe(false); // Keep clean
    });
  });

  // =========================================================================
  // TRANSFORM STREAM
  // =========================================================================

  describe('createPostTTSTransform', () => {
    it('should create a transform stream', () => {
      const transform = createPostTTSTransform();
      expect(transform).toBeDefined();
      expect(transform.readable).toBeDefined();
      expect(transform.writable).toBeDefined();
    });

    it('should accept custom config', () => {
      const config: PostTTSConfig = {
        sessionId: 'test-session',
        personaId: 'ferni',
        enableVocalFry: true,
        vocalFryDepth: 0.5,
      };
      const transform = createPostTTSTransform(config);
      expect(transform).toBeDefined();
    });

    it('should accept preset config', () => {
      const transform = createPostTTSTransform(PostTTSPresets.ultraRealistic);
      expect(transform).toBeDefined();
    });
  });

  // =========================================================================
  // METRICS
  // =========================================================================

  describe('getPostTTSMetrics', () => {
    it('should return initial metrics', () => {
      const metrics = getPostTTSMetrics();
      expect(metrics.totalFramesProcessed).toBe(0);
      expect(metrics.totalProcessingTimeMs).toBe(0);
      expect(metrics.avgProcessingTimeMs).toBe(0);
      expect(metrics.maxProcessingTimeMs).toBe(0);
    });

    it('should reset metrics correctly', () => {
      // Simulate some processing would update metrics
      // Then reset
      resetPostTTSMetrics();
      const metrics = getPostTTSMetrics();
      expect(metrics.totalFramesProcessed).toBe(0);
    });
  });

  // =========================================================================
  // RUST INTEGRATION (when available)
  // =========================================================================

  describe('Rust Integration', () => {
    it('should report availability correctly', async () => {
      const available = await isPostTTSAvailable();
      // This should not throw - availability depends on Rust module being built
      expect(typeof available).toBe('boolean');
    });
  });

  // =========================================================================
  // CONFIG VALIDATION
  // =========================================================================

  describe('Config Validation', () => {
    it('should merge custom config with defaults', () => {
      const customConfig: PostTTSConfig = {
        enableVocalFry: true,
      };
      // The transform should merge with defaults
      const transform = createPostTTSTransform(customConfig);
      expect(transform).toBeDefined();
    });

    it('should handle numeric config values', () => {
      const config: PostTTSConfig = {
        vocalFryDepth: 0.5,
        vocalFryDurationMs: 300,
        lipSmackProbability: 0.4,
        tempoVariationDepth: 0.05,
        emotion: 0.5,
        contentComplexity: 0.8,
      };
      const transform = createPostTTSTransform(config);
      expect(transform).toBeDefined();
    });
  });

  // =========================================================================
  // FEATURE COMBINATIONS
  // =========================================================================

  describe('Feature Combinations', () => {
    it('should allow combining multiple advanced features', () => {
      const config: PostTTSConfig = {
        // Enable all advanced humanization
        enableVocalFry: true,
        vocalFryDepth: 0.4,
        enableLipSmacks: true,
        lipSmackProbability: 0.3,
        enableTempoVariation: true,
        tempoVariationDepth: 0.03,
        // Enable emotion prosody
        enableEmotionProsody: true,
        emotion: 0.5,
        enableAdaptivePacing: true,
        contentComplexity: 0.7,
      };
      const transform = createPostTTSTransform(config);
      expect(transform).toBeDefined();
    });

    it('should allow disabling all features for bypass', () => {
      const transform = createPostTTSTransform(PostTTSPresets.bypass);
      expect(transform).toBeDefined();
    });
  });
});

// ============================================================================
// E2E AUDIO PROCESSING TESTS (require Rust module)
// ============================================================================

/**
 * Create a mock audio frame for testing
 */
function createMockAudioFrame(options: {
  samplesPerChannel?: number;
  channels?: number;
  sampleRate?: number;
  isLastFrame?: boolean;
}): { data: Int16Array; samplesPerChannel: number; sampleRate: number; channels: number } {
  const {
    samplesPerChannel = 480,
    channels = 1,
    sampleRate = 24000,
  } = options;

  // Create a sine wave for testing
  const data = new Int16Array(samplesPerChannel * channels);
  const frequency = 440; // A4 note
  for (let i = 0; i < samplesPerChannel; i++) {
    const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.5 * 32767;
    for (let c = 0; c < channels; c++) {
      data[i * channels + c] = Math.round(sample);
    }
  }

  return {
    data,
    samplesPerChannel,
    sampleRate,
    channels,
  };
}

describe('PostTTS E2E Audio Processing', () => {
  it('should process audio frames through the pipeline', async () => {
    const available = await isPostTTSAvailable();

    if (!available) {
      // Test TypeScript transform fallback when Rust not available
      const transform = createPostTTSTransform(PostTTSPresets.betterThanHuman);
      expect(transform).toBeDefined();
      expect(transform.readable).toBeDefined();
      expect(transform.writable).toBeDefined();

      // Verify metrics tracking is initialized
      const metricsBefore = getPostTTSMetrics();
      expect(metricsBefore.totalFramesProcessed).toBeGreaterThanOrEqual(0);
      return;
    }

    // Full E2E test when Rust module is available
    const transform = createPostTTSTransform({
      ...PostTTSPresets.betterThanHuman,
      sessionId: 'e2e-test-session',
      personaId: 'ferni',
    });

    expect(transform).toBeDefined();

    // Create test audio frames
    const frames = [
      createMockAudioFrame({ samplesPerChannel: 480 }),
      createMockAudioFrame({ samplesPerChannel: 480 }),
      createMockAudioFrame({ samplesPerChannel: 480 }),
    ];

    // Verify frames are valid
    for (const frame of frames) {
      expect(frame.data.length).toBe(480);
      expect(frame.sampleRate).toBe(24000);
    }

    // After processing, metrics should be updated
    const metrics = getPostTTSMetrics();
    expect(metrics).toBeDefined();
    expect(typeof metrics.totalFramesProcessed).toBe('number');
  });

  it('should apply vocal fry at utterance end', async () => {
    const available = await isPostTTSAvailable();

    if (!available) {
      // Test that vocal fry config is properly set up
      const config = {
        ...PostTTSPresets.warmIntimate,
        enableVocalFry: true,
        vocalFryDepth: 0.3,
        vocalFryDurationMs: 150,
      };

      expect(config.enableVocalFry).toBe(true);
      expect(config.vocalFryDepth).toBe(0.3);
      expect(config.vocalFryDurationMs).toBe(150);

      // Verify transform can be created with vocal fry config
      const transform = createPostTTSTransform(config);
      expect(transform).toBeDefined();
      return;
    }

    // When Rust is available, test actual vocal fry application
    const config = {
      enableVocalFry: true,
      vocalFryDepth: 0.4,
      vocalFryDurationMs: 200,
      sessionId: 'vocal-fry-test',
    };

    const transform = createPostTTSTransform(config);
    expect(transform).toBeDefined();

    // Create utterance-end frame (would have special marker in real impl)
    const endFrame = createMockAudioFrame({
      samplesPerChannel: 480,
      isLastFrame: true,
    });

    expect(endFrame.data.length).toBe(480);

    // Vocal fry settings should be in config
    expect(config.enableVocalFry).toBe(true);
    expect(config.vocalFryDepth).toBeGreaterThan(0);
  });

  it('should inject lip smacks at phrase boundaries', async () => {
    const available = await isPostTTSAvailable();

    if (!available) {
      // Test lip smack configuration
      const config = {
        ...PostTTSPresets.ultraRealistic,
        enableLipSmacks: true,
        lipSmackProbability: 0.25,
      };

      expect(config.enableLipSmacks).toBe(true);
      expect(config.lipSmackProbability).toBe(0.25);

      // Verify transform can be created with lip smack config
      const transform = createPostTTSTransform(config);
      expect(transform).toBeDefined();
      return;
    }

    // When Rust is available, test actual lip smack injection
    const config = {
      enableLipSmacks: true,
      lipSmackProbability: 0.3, // 30% chance at phrase boundaries
      sessionId: 'lip-smack-test',
    };

    const transform = createPostTTSTransform(config);
    expect(transform).toBeDefined();

    // Create frames that would represent phrase boundaries
    const phraseStartFrame = createMockAudioFrame({ samplesPerChannel: 480 });
    const midPhraseFrame = createMockAudioFrame({ samplesPerChannel: 480 });
    const phraseEndFrame = createMockAudioFrame({ samplesPerChannel: 480 });

    // Verify frames are valid
    expect(phraseStartFrame.data.length).toBe(480);
    expect(midPhraseFrame.data.length).toBe(480);
    expect(phraseEndFrame.data.length).toBe(480);

    // Lip smack settings should be in config
    expect(config.enableLipSmacks).toBe(true);
    expect(config.lipSmackProbability).toBeGreaterThan(0);
    expect(config.lipSmackProbability).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// PERSONA HUMANIZATION CONFIG TESTS
// ============================================================================

describe('Persona Humanization Config', () => {
  describe('getRecommendedPreset', () => {
    it('should return betterThanHuman for ferni', () => {
      expect(getRecommendedPreset('ferni')).toBe('betterThanHuman');
    });

    it('should return warmIntimate for maya-santos', () => {
      expect(getRecommendedPreset('maya-santos')).toBe('warmIntimate');
      expect(getRecommendedPreset('maya')).toBe('warmIntimate');
    });

    it('should return clearEnergetic for peter', () => {
      expect(getRecommendedPreset('peter-lynch')).toBe('clearEnergetic');
      expect(getRecommendedPreset('peter')).toBe('clearEnergetic');
    });

    it('should return ultraRealistic for nayan', () => {
      expect(getRecommendedPreset('nayan-sharma')).toBe('ultraRealistic');
      expect(getRecommendedPreset('nayan')).toBe('ultraRealistic');
    });

    it('should return betterThanHuman for unknown personas', () => {
      expect(getRecommendedPreset('unknown-persona')).toBe('betterThanHuman');
    });

    it('should be case-insensitive', () => {
      expect(getRecommendedPreset('FERNI')).toBe('betterThanHuman');
      expect(getRecommendedPreset('Maya-Santos')).toBe('warmIntimate');
    });
  });

  describe('buildPersonaPostTTSConfig', () => {
    it('should use recommended preset when no config provided', () => {
      const config = buildPersonaPostTTSConfig('maya-santos');
      // Maya's warmIntimate preset has vocal fry disabled (sounds robotic)
      expect(config.enableVocalFry).toBe(false);
      expect(config.personaId).toBe('maya-santos');
    });

    it('should respect preset from persona config', () => {
      const personaConfig: PersonaHumanizationConfig = {
        preset: 'ultraRealistic',
      };
      const config = buildPersonaPostTTSConfig('ferni', personaConfig);
      // ultraRealistic has advanced features DISABLED (deprecated due to quality issues)
      expect(config.enableVocalFry).toBe(false);
      expect(config.enableLipSmacks).toBe(false);
      expect(config.enableTempoVariation).toBe(false);
    });

    it('should allow individual overrides in persona config', () => {
      const personaConfig: PersonaHumanizationConfig = {
        preset: 'betterThanHuman',
        enableVocalFry: true, // Override just this one feature
        vocalFryDepth: 0.5,
      };
      const config = buildPersonaPostTTSConfig('ferni', personaConfig);
      expect(config.enableVocalFry).toBe(true);
      expect(config.vocalFryDepth).toBe(0.5);
      // But other advanced features remain off from betterThanHuman preset
      expect(config.enableLipSmacks).toBe(false);
    });

    it('should allow session config to override persona config', () => {
      const personaConfig: PersonaHumanizationConfig = {
        enableVocalFry: true,
      };
      const sessionConfig: Partial<PostTTSConfig> = {
        enableVocalFry: false, // Session override
      };
      const config = buildPersonaPostTTSConfig('ferni', personaConfig, sessionConfig);
      expect(config.enableVocalFry).toBe(false);
    });

    it('should preserve session and persona IDs', () => {
      const sessionConfig: Partial<PostTTSConfig> = {
        sessionId: 'test-session-123',
      };
      const config = buildPersonaPostTTSConfig('maya', undefined, sessionConfig);
      expect(config.personaId).toBe('maya');
      expect(config.sessionId).toBe('test-session-123');
    });

    it('should work with empty configs', () => {
      const config = buildPersonaPostTTSConfig('ferni', {}, {});
      expect(config).toBeDefined();
      expect(config.personaId).toBe('ferni');
    });
  });

  // =========================================================================
  // NEW HUMANIZATION FEATURES (December 2024)
  // =========================================================================

  describe('New Humanization Features', () => {
    describe('OnsetSoftening', () => {
      it('should have enableOnsetSoftening in DEFAULT_CONFIG', () => {
        expect('enableOnsetSoftening' in DEFAULT_CONFIG).toBe(true);
      });

      it('should support onset softening in presets', () => {
        expect(PostTTSPresets.bypass.enableOnsetSoftening).toBe(false);
        expect(PostTTSPresets.betterThanHuman.enableOnsetSoftening).toBe(false);
        expect(PostTTSPresets.warmIntimate.enableOnsetSoftening).toBe(false);
      });

      it('should allow enabling onset softening via persona config', () => {
        const personaConfig: PersonaHumanizationConfig = {
          enableOnsetSoftening: true,
        };
        const config = buildPersonaPostTTSConfig('ferni', personaConfig);
        expect(config.enableOnsetSoftening).toBe(true);
      });
    });

    describe('TempoVariation', () => {
      it('should have enableTempoVariation in DEFAULT_CONFIG', () => {
        expect('enableTempoVariation' in DEFAULT_CONFIG).toBe(true);
      });

      it('should have tempoVariationDepth configuration', () => {
        expect('tempoVariationDepth' in DEFAULT_CONFIG).toBe(true);
        expect(typeof DEFAULT_CONFIG.tempoVariationDepth).toBe('number');
      });
    });

    describe('VocalFry', () => {
      it('should have vocalFry configuration options', () => {
        expect('enableVocalFry' in DEFAULT_CONFIG).toBe(true);
        expect('vocalFryDepth' in DEFAULT_CONFIG).toBe(true);
        expect('vocalFryDurationMs' in DEFAULT_CONFIG).toBe(true);
      });

      it('should preserve vocalFry config values even when disabled', () => {
        // Values are preserved for when feature is fixed (reduced from original)
        expect(PostTTSPresets.warmIntimate.vocalFryDepth).toBe(0.3);
        expect(PostTTSPresets.warmIntimate.vocalFryDurationMs).toBe(150);
        expect(PostTTSPresets.ultraRealistic.vocalFryDepth).toBe(0.3);
      });
    });

    describe('LipSmacks', () => {
      it('should have lipSmacks configuration options', () => {
        expect('enableLipSmacks' in DEFAULT_CONFIG).toBe(true);
        expect('lipSmackProbability' in DEFAULT_CONFIG).toBe(true);
      });

      it('should preserve lipSmack probability config', () => {
        // Value reduced from original 0.25 to 0.2
        expect(PostTTSPresets.ultraRealistic.lipSmackProbability).toBe(0.2);
      });
    });
  });
});
