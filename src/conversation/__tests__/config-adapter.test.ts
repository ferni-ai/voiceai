/**
 * Orchestrator Config Adapter Tests
 *
 * Tests for the unified configuration adapter that bridges
 * orchestrator config with existing humanization configs.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getConfigAdapter,
  orchestratorConfig,
  resetConfigAdapter,
  type UnifiedPreset,
} from '../orchestrator/config-adapter.js';

import { humanizationConfig, resetHumanizationConfig } from '../humanization/config.js';
import { resetHumanizingConfig } from '../humanizing-config.js';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('OrchestratorConfigAdapter', () => {
  beforeEach(() => {
    resetConfigAdapter();
    resetHumanizationConfig();
    resetHumanizingConfig();
  });

  afterEach(() => {
    resetConfigAdapter();
    resetHumanizationConfig();
    resetHumanizingConfig();
  });

  // ==========================================================================
  // INITIALIZATION TESTS
  // ==========================================================================

  describe('initialization', () => {
    it('should create adapter singleton', () => {
      const adapter1 = getConfigAdapter();
      const adapter2 = getConfigAdapter();
      expect(adapter1).toBe(adapter2);
    });

    it('should reset adapter', () => {
      const adapter1 = getConfigAdapter();
      resetConfigAdapter();
      const adapter2 = getConfigAdapter();
      // New instance after reset
      expect(adapter1).not.toBe(adapter2);
    });
  });

  // ==========================================================================
  // FEATURE STATE TESTS
  // ==========================================================================

  describe('getFeatureState', () => {
    it('should return unified feature state', () => {
      const state = orchestratorConfig.getState();

      expect(state).toBeDefined();
      expect(state.orchestrator).toBeDefined();
      expect(state.speech).toBeDefined();
      expect(state.advanced).toBeDefined();
      expect(state.orchestratorFeatures).toBeDefined();
    });

    it('should include orchestrator phase flags', () => {
      const state = orchestratorConfig.getState();

      expect(state.orchestrator.enableAnalysis).toBe(true);
      expect(state.orchestrator.enableIntelligence).toBe(true);
      expect(typeof state.orchestrator.enableHumanization).toBe('boolean');
    });

    it('should include speech features', () => {
      const state = orchestratorConfig.getState();

      expect(typeof state.speech.disfluency).toBe('boolean');
      expect(typeof state.speech.hedging).toBe('boolean');
      expect(typeof state.speech.backchannel).toBe('boolean');
      expect(typeof state.speech.memory).toBe('boolean');
      expect(typeof state.speech.questions).toBe('boolean');
      expect(typeof state.speech.emotional).toBe('boolean');
    });

    it('should include advanced features', () => {
      const state = orchestratorConfig.getState();

      expect(typeof state.advanced.voicePrint).toBe('boolean');
      expect(typeof state.advanced.crossSessionMemory).toBe('boolean');
      expect(typeof state.advanced.breathingSync).toBe('boolean');
      expect(typeof state.advanced.selfCorrection).toBe('boolean');
    });

    it('should include orchestrator-specific features', () => {
      const state = orchestratorConfig.getState();

      expect(typeof state.orchestratorFeatures.speechNaturalization).toBe('boolean');
      expect(typeof state.orchestratorFeatures.vocalHumanization).toBe('boolean');
      expect(typeof state.orchestratorFeatures.advancedHumanization).toBe('boolean');
      expect(typeof state.orchestratorFeatures.deepHumanization).toBe('boolean');
      expect(typeof state.orchestratorFeatures.sessionIntelligence).toBe('boolean');
      expect(typeof state.orchestratorFeatures.betterThanHuman).toBe('boolean');
      expect(typeof state.orchestratorFeatures.contentDeliveryPacing).toBe('boolean');
      expect(typeof state.orchestratorFeatures.silencePresence).toBe('boolean');
    });
  });

  // ==========================================================================
  // BUILD CONFIG TESTS
  // ==========================================================================

  describe('buildOrchestratorConfig', () => {
    it('should build valid orchestrator config', () => {
      const config = orchestratorConfig.build();

      expect(config).toBeDefined();
      expect(typeof config.enableAnalysis).toBe('boolean');
      expect(typeof config.enableIntelligence).toBe('boolean');
      expect(typeof config.enableHumanization).toBe('boolean');
      expect(config.features).toBeDefined();
      expect(typeof config.maxHumanizationsPerResponse).toBe('number');
      expect(typeof config.maxPriorityActions).toBe('number');
      expect(typeof config.debug).toBe('boolean');
    });

    it('should include all feature flags', () => {
      const config = orchestratorConfig.build();

      const expectedFeatures = [
        'speechNaturalization',
        'vocalHumanization',
        'advancedHumanization',
        'deepHumanization',
        'sessionIntelligence',
        'betterThanHuman',
        'contentDeliveryPacing',
        'silencePresence',
      ];

      for (const feature of expectedFeatures) {
        expect(config.features).toHaveProperty(feature);
      }
    });
  });

  // ==========================================================================
  // FEATURE TOGGLE TESTS
  // ==========================================================================

  describe('feature toggles', () => {
    it('should enable a feature', () => {
      orchestratorConfig.disable('contentDeliveryPacing');
      expect(orchestratorConfig.isEnabled('contentDeliveryPacing')).toBe(false);

      orchestratorConfig.enable('contentDeliveryPacing');
      expect(orchestratorConfig.isEnabled('contentDeliveryPacing')).toBe(true);
    });

    it('should disable a feature', () => {
      orchestratorConfig.enable('silencePresence');
      expect(orchestratorConfig.isEnabled('silencePresence')).toBe(true);

      orchestratorConfig.disable('silencePresence');
      expect(orchestratorConfig.isEnabled('silencePresence')).toBe(false);
    });

    it('should check if feature is enabled', () => {
      const result = orchestratorConfig.isEnabled('speechNaturalization');
      expect(typeof result).toBe('boolean');
    });
  });

  // ==========================================================================
  // PRESET TESTS
  // ==========================================================================

  describe('presets', () => {
    const presets: UnifiedPreset[] = [
      'default',
      'minimal',
      'conservative',
      'expressive',
      'therapeutic',
      'expert',
      'warm',
      'conversational',
      'disabled',
    ];

    for (const preset of presets) {
      it(`should apply ${preset} preset`, () => {
        orchestratorConfig.applyPreset(preset);
        const state = orchestratorConfig.getState();

        expect(state).toBeDefined();
        // State should have changed based on preset
      });
    }

    it('should disable all features with disabled preset', () => {
      orchestratorConfig.applyPreset('disabled');
      const state = orchestratorConfig.getState();

      expect(state.orchestratorFeatures.speechNaturalization).toBe(false);
      expect(state.orchestratorFeatures.vocalHumanization).toBe(false);
      expect(state.orchestratorFeatures.advancedHumanization).toBe(false);
      expect(state.orchestratorFeatures.deepHumanization).toBe(false);
    });

    it('should enable minimal features with minimal preset', () => {
      orchestratorConfig.applyPreset('minimal');
      const state = orchestratorConfig.getState();

      // Basic features should be enabled
      expect(state.orchestratorFeatures.speechNaturalization).toBe(true);
      expect(state.orchestratorFeatures.vocalHumanization).toBe(true);

      // Advanced features should be disabled for speed
      expect(state.orchestratorFeatures.advancedHumanization).toBe(false);
      expect(state.orchestratorFeatures.deepHumanization).toBe(false);
    });
  });

  // ==========================================================================
  // PERSONA TESTS
  // ==========================================================================

  describe('persona-specific config', () => {
    it('should set persona', () => {
      orchestratorConfig.setPersona('ferni');
      // Should not throw
    });

    it('should get recommended preset for personas', () => {
      const presetMap: Record<string, UnifiedPreset> = {
        ferni: 'therapeutic',
        'nayan-patel': 'expert',
        'peter-john': 'conversational',
        'maya-santos': 'warm',
        unknown: 'default',
      };

      for (const [personaId, expectedPreset] of Object.entries(presetMap)) {
        const preset = orchestratorConfig.getRecommendedPreset(personaId);
        expect(preset).toBe(expectedPreset);
      }
    });
  });

  // ==========================================================================
  // PROBABILITY TESTS
  // ==========================================================================

  describe('probabilities', () => {
    it('should get probability for features', () => {
      const features = [
        'selfCorrection',
        'disfluency',
        'hedging',
        'backchannel',
        'memory',
        'questions',
      ] as const;

      for (const feature of features) {
        const probability = orchestratorConfig.getProbability(feature);
        expect(typeof probability).toBe('number');
        expect(probability).toBeGreaterThanOrEqual(0);
        expect(probability).toBeLessThanOrEqual(1);
      }
    });
  });

  // ==========================================================================
  // DEBUG TESTS
  // ==========================================================================

  describe('debug', () => {
    it('should get debug state', () => {
      const debug = orchestratorConfig.debug();

      expect(debug).toBeDefined();
      expect(debug.featureState).toBeDefined();
      expect(debug.orchestratorConfig).toBeDefined();
      expect(debug.humanizingConfig).toBeDefined();
      expect(debug.advancedConfig).toBeDefined();
      expect(debug.overrides).toBeDefined();
    });
  });

  // ==========================================================================
  // INTEGRATION TESTS
  // ==========================================================================

  describe('integration with existing configs', () => {
    it('should reflect changes from humanization config', () => {
      // Disable self-correction in underlying config
      humanizationConfig.setEnabled('selfCorrection', false);

      const state = orchestratorConfig.getState();
      expect(state.advanced.selfCorrection).toBe(false);
    });

    it('should reflect preset changes from underlying config', () => {
      // Apply minimal preset to underlying config
      humanizationConfig.applyPreset('minimal');

      const state = orchestratorConfig.getState();
      // Should reflect the minimal preset features
      expect(typeof state.advanced.breathingSync).toBe('boolean');
    });
  });
});

// ============================================================================
// CONVENIENCE EXPORT TESTS
// ============================================================================

describe('orchestratorConfig convenience API', () => {
  beforeEach(() => {
    resetConfigAdapter();
  });

  it('should provide getState', () => {
    expect(typeof orchestratorConfig.getState).toBe('function');
  });

  it('should provide build', () => {
    expect(typeof orchestratorConfig.build).toBe('function');
  });

  it('should provide isEnabled', () => {
    expect(typeof orchestratorConfig.isEnabled).toBe('function');
  });

  it('should provide enable', () => {
    expect(typeof orchestratorConfig.enable).toBe('function');
  });

  it('should provide disable', () => {
    expect(typeof orchestratorConfig.disable).toBe('function');
  });

  it('should provide applyPreset', () => {
    expect(typeof orchestratorConfig.applyPreset).toBe('function');
  });

  it('should provide setPersona', () => {
    expect(typeof orchestratorConfig.setPersona).toBe('function');
  });

  it('should provide getRecommendedPreset', () => {
    expect(typeof orchestratorConfig.getRecommendedPreset).toBe('function');
  });

  it('should provide getProbability', () => {
    expect(typeof orchestratorConfig.getProbability).toBe('function');
  });

  it('should provide reset', () => {
    expect(typeof orchestratorConfig.reset).toBe('function');
  });

  it('should provide debug', () => {
    expect(typeof orchestratorConfig.debug).toBe('function');
  });
});
