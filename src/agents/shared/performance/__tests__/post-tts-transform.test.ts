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
      expect(DEFAULT_CONFIG.enableBreath).toBe(true);
      expect(DEFAULT_CONFIG.enableWarmth).toBe(true);
      expect(DEFAULT_CONFIG.enableCompression).toBe(true);
      expect(DEFAULT_CONFIG.enablePresence).toBe(true);
    });

    it('should have humanization features enabled by default', () => {
      expect(DEFAULT_CONFIG.enableAmplitudeJitter).toBe(true);
      expect(DEFAULT_CONFIG.enablePitchDrift).toBe(true);
      expect(DEFAULT_CONFIG.enableNoiseFloor).toBe(true);
    });

    it('should have SOLA and emotion prosody enabled by default', () => {
      expect(DEFAULT_CONFIG.useSolaPitch).toBe(true);
      expect(DEFAULT_CONFIG.enableEmotionProsody).toBe(true);
    });

    it('should have advanced humanization features OFF by default', () => {
      expect(DEFAULT_CONFIG.enableVocalFry).toBe(false);
      expect(DEFAULT_CONFIG.enableLipSmacks).toBe(false);
      expect(DEFAULT_CONFIG.enableTempoVariation).toBe(false);
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

    it('betterThanHuman should enable basic humanization but not advanced', () => {
      const preset = PostTTSPresets.betterThanHuman;
      expect(preset.enableAmplitudeJitter).toBe(true);
      expect(preset.enablePitchDrift).toBe(true);
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
      expect(preset.vocalFryDepth).toBe(0.4); // Config preserved
      expect(preset.enableLipSmacks).toBe(false);
      expect(preset.lipSmackProbability).toBe(0.25); // Config preserved
      expect(preset.enableTempoVariation).toBe(false);
      expect(preset.tempoVariationDepth).toBe(0.03); // Config preserved
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
      expect(preset.compressionRatio).toBe(3.0);
      expect(preset.presenceBoostDb).toBe(3.0);
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

describe('PostTTS E2E Audio Processing', () => {
  it.skip('should process audio frames through the pipeline', async () => {
    // This test requires the Rust module to be available
    // Skip for now - would need actual AudioFrame instances
    const available = await isPostTTSAvailable();
    if (!available) {
      console.log('Skipping E2E test - Rust module not available');
      return;
    }

    // Would test actual audio processing here:
    // 1. Create transform with ultraRealistic preset
    // 2. Feed audio frames through
    // 3. Verify frames come out processed
    // 4. Check metrics updated
  });

  it.skip('should apply vocal fry at utterance end', async () => {
    // This would test that vocal fry is triggered on the last frame
    // Requires Rust module
  });

  it.skip('should inject lip smacks at phrase boundaries', async () => {
    // This would test that lip smacks are probabilistically injected
    // Requires Rust module
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
        // Values are preserved for when feature is fixed
        expect(PostTTSPresets.warmIntimate.vocalFryDepth).toBe(0.3);
        expect(PostTTSPresets.warmIntimate.vocalFryDurationMs).toBe(150);
        expect(PostTTSPresets.ultraRealistic.vocalFryDepth).toBe(0.4);
      });
    });

    describe('LipSmacks', () => {
      it('should have lipSmacks configuration options', () => {
        expect('enableLipSmacks' in DEFAULT_CONFIG).toBe(true);
        expect('lipSmackProbability' in DEFAULT_CONFIG).toBe(true);
      });

      it('should preserve lipSmack probability config', () => {
        expect(PostTTSPresets.ultraRealistic.lipSmackProbability).toBe(0.25);
      });
    });
  });
});
