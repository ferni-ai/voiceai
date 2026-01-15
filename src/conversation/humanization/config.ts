/**
 * Humanization Configuration
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Centralized configuration for all humanization features.
 * These values can be tuned based on analytics and A/B testing.
 *
 * @module @ferni/humanization/config
 */

import { createLogger } from '../../utils/safe-logger.js';

const logger = createLogger({ module: 'HumanizationConfig' });

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface HumanizationConfig {
  // Global settings
  enabled: boolean;
  debugMode: boolean;

  // Feature toggles
  features: {
    voicePrint: boolean;
    crossSessionMemory: boolean;
    breathingSync: boolean;
    emotionalLeading: boolean;
    ambientAwareness: boolean;
    selfCorrection: boolean;
    disfluency: boolean;
    fillerWords: boolean;
    hedging: boolean;
    catchingYourself: boolean;
    phoneticMirroring: boolean;
    vocalFatigue: boolean;
    comfortProgression: boolean;
  };

  // Probability thresholds (0-1)
  probabilities: {
    // Phase 1: Speech Naturalizers
    selfCorrection: number; // Default: 0.15
    disfluency: number; // Default: 0.10
    fillerWords: number; // Default: 0.12
    hedging: number; // Default: 0.20
    catchingYourself: number; // Default: 0.08

    // Phase 2: Voice Learning
    voiceStateInsight: number; // Default: 0.70
    crossSessionAck: number; // Default: 0.80

    // Phase 3: Emotional Features
    emotionalLeading: number; // Default: 0.60
    breathingSync: number; // Default: 0.50
    ambientAck: number; // Default: 0.70
  };

  // Confidence thresholds
  confidenceThresholds: {
    voicePrint: number; // Min confidence to use voice print (default: 0.6)
    breathing: number; // Min confidence for breath detection (default: 0.4)
    emotion: number; // Min confidence for emotion detection (default: 0.5)
    ambient: number; // Min confidence for ambient detection (default: 0.6)
  };

  // Timing thresholds (ms)
  timing: {
    minTimeBetweenDisfluencies: number; // Default: 30000
    minTimeBetweenSelfCorrections: number; // Default: 45000
    minTimeBetweenAmbientAcks: number; // Default: 120000
    voiceInsightCooldown: number; // Default: 300000 (5 min)
    crossSessionAckCooldown: number; // Default: 600000 (10 min)
  };

  // Comfort-gated thresholds
  comfortThresholds: {
    allowHedging: number; // Default: 0.25
    allowSelfCorrection: number; // Default: 0.30
    allowDisfluency: number; // Default: 0.35
    allowFillerWords: number; // Default: 0.40
    allowEmotionalLeading: number; // Default: 0.50
    allowVoiceInsights: number; // Default: 0.55
    allowBreathingSync: number; // Default: 0.60
    allowDeepVulnerability: number; // Default: 0.75
  };

  // Voice print settings
  voicePrint: {
    sampleCountForCalibration: number; // Default: 5
    deviationThresholdForInsight: number; // Default: 0.15
    significantDeviationThreshold: number; // Default: 0.30
  };

  // Breathing sync settings
  breathingSync: {
    minConfidence: number; // Default: 0.4
    maxSyncStrength: number; // Default: 0.8
    adaptationRate: number; // Default: 0.3 (EMA alpha)
    naturalBreathsPerMinute: number; // Default: 14
  };

  // Emotional leading settings
  emotionalLeading: {
    maxLeadingIntensity: number; // Default: 0.3
    leadingStepSize: number; // Default: 0.1
    minTurnsBeforeLeading: number; // Default: 3
  };

  // Analytics settings
  analytics: {
    enabled: boolean;
    sampleRate: number; // 0-1, percentage of events to log
    maxEventsInMemory: number; // Default: 10000
  };
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_HUMANIZATION_CONFIG: HumanizationConfig = {
  enabled: true,
  debugMode: false,

  features: {
    voicePrint: true,
    crossSessionMemory: true,
    breathingSync: true,
    emotionalLeading: true,
    ambientAwareness: true,
    selfCorrection: true,
    disfluency: true,
    fillerWords: true,
    hedging: true,
    catchingYourself: true,
    phoneticMirroring: true,
    vocalFatigue: true,
    comfortProgression: true,
  },

  // ENHANCED: Bumped probabilities for more human-like speech (Jan 2026)
  // Previous values were too conservative - humans use these patterns much more often
  probabilities: {
    selfCorrection: 0.25, // Was 0.15 - "Wait, let me rephrase that"
    disfluency: 0.18, // Was 0.10 - "Um", "well", natural pauses
    fillerWords: 0.15, // Was 0.12 - "You know", "like"
    hedging: 0.28, // Was 0.20 - "I think", "maybe"
    catchingYourself: 0.15, // Was 0.08 - "Actually, let me back up"
    voiceStateInsight: 0.85, // Was 0.70 - Notice voice changes
    crossSessionAck: 0.9, // Was 0.80 - Remember across sessions
    emotionalLeading: 0.75, // Was 0.60 - Lead emotional trajectory
    breathingSync: 0.65, // Was 0.50 - Sync breathing patterns
    ambientAck: 0.8, // Was 0.70 - Notice ambient context
  },

  confidenceThresholds: {
    voicePrint: 0.6,
    breathing: 0.4,
    emotion: 0.5,
    ambient: 0.6,
  },

  timing: {
    minTimeBetweenDisfluencies: 30000,
    minTimeBetweenSelfCorrections: 45000,
    minTimeBetweenAmbientAcks: 120000,
    voiceInsightCooldown: 300000,
    crossSessionAckCooldown: 600000,
  },

  // ENHANCED: Lowered comfort thresholds for faster humanization (Jan 2026)
  // Humans show natural speech patterns from the start, not after "warming up"
  comfortThresholds: {
    allowHedging: 0.15, // Was 0.25 - Hedging is natural from turn 1
    allowSelfCorrection: 0.2, // Was 0.30 - Self-correction is human
    allowDisfluency: 0.25, // Was 0.35 - Natural pauses earlier
    allowFillerWords: 0.3, // Was 0.40 - Filler words are natural
    allowEmotionalLeading: 0.35, // Was 0.50 - Lead emotions sooner
    allowVoiceInsights: 0.4, // Was 0.55 - Notice voice changes sooner
    allowBreathingSync: 0.45, // Was 0.60 - Sync breathing sooner
    allowDeepVulnerability: 0.65, // Was 0.75 - Still requires trust
  },

  voicePrint: {
    sampleCountForCalibration: 5,
    deviationThresholdForInsight: 0.15,
    significantDeviationThreshold: 0.3,
  },

  breathingSync: {
    minConfidence: 0.4,
    maxSyncStrength: 0.8,
    adaptationRate: 0.3,
    naturalBreathsPerMinute: 14,
  },

  emotionalLeading: {
    maxLeadingIntensity: 0.3,
    leadingStepSize: 0.1,
    minTurnsBeforeLeading: 3,
  },

  analytics: {
    enabled: true,
    sampleRate: 1.0, // Log all events by default
    maxEventsInMemory: 10000,
  },
};

// ============================================================================
// PRESET CONFIGURATIONS
// ============================================================================

/**
 * Conservative preset - fewer humanizations, higher thresholds
 * Good for new users or formal contexts
 */
export const CONSERVATIVE_CONFIG: Partial<HumanizationConfig> = {
  probabilities: {
    selfCorrection: 0.08,
    disfluency: 0.05,
    fillerWords: 0.06,
    hedging: 0.12,
    catchingYourself: 0.04,
    voiceStateInsight: 0.5,
    crossSessionAck: 0.6,
    emotionalLeading: 0.4,
    breathingSync: 0.3,
    ambientAck: 0.5,
  },
  confidenceThresholds: {
    voicePrint: 0.75,
    breathing: 0.6,
    emotion: 0.65,
    ambient: 0.75,
  },
};

/**
 * Expressive preset - more humanizations, lower thresholds
 * Good for established relationships
 */
export const EXPRESSIVE_CONFIG: Partial<HumanizationConfig> = {
  probabilities: {
    selfCorrection: 0.22,
    disfluency: 0.15,
    fillerWords: 0.18,
    hedging: 0.28,
    catchingYourself: 0.12,
    voiceStateInsight: 0.85,
    crossSessionAck: 0.9,
    emotionalLeading: 0.75,
    breathingSync: 0.7,
    ambientAck: 0.85,
  },
  confidenceThresholds: {
    voicePrint: 0.5,
    breathing: 0.35,
    emotion: 0.4,
    ambient: 0.5,
  },
};

/**
 * Minimal preset - essential humanizations only
 * Good for low-latency or performance-sensitive scenarios
 */
export const MINIMAL_CONFIG: Partial<HumanizationConfig> = {
  features: {
    voicePrint: true,
    crossSessionMemory: true,
    breathingSync: false,
    emotionalLeading: false,
    ambientAwareness: false,
    selfCorrection: true,
    disfluency: false,
    fillerWords: false,
    hedging: true,
    catchingYourself: false,
    phoneticMirroring: false,
    vocalFatigue: false,
    comfortProgression: true,
  },
  probabilities: {
    selfCorrection: 0.1,
    disfluency: 0,
    fillerWords: 0,
    hedging: 0.15,
    catchingYourself: 0,
    voiceStateInsight: 0.6,
    crossSessionAck: 0.7,
    emotionalLeading: 0,
    breathingSync: 0,
    ambientAck: 0,
  },
};

// ============================================================================
// RUNTIME CONFIGURATION MANAGER
// ============================================================================

class HumanizationConfigManager {
  private config: HumanizationConfig;
  private overrides: Partial<HumanizationConfig> = {};

  constructor(baseConfig: HumanizationConfig = DEFAULT_HUMANIZATION_CONFIG) {
    this.config = { ...baseConfig };
    logger.debug('HumanizationConfigManager initialized');
  }

  /**
   * Get current configuration
   */
  getConfig(): HumanizationConfig {
    return this.mergeConfigs(this.config, this.overrides);
  }

  /**
   * Get a specific probability
   */
  getProbability(key: keyof HumanizationConfig['probabilities']): number {
    const config = this.getConfig();
    return config.probabilities[key];
  }

  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(feature: keyof HumanizationConfig['features']): boolean {
    const config = this.getConfig();
    return config.enabled && config.features[feature];
  }

  /**
   * Get confidence threshold
   */
  getConfidenceThreshold(key: keyof HumanizationConfig['confidenceThresholds']): number {
    const config = this.getConfig();
    return config.confidenceThresholds[key];
  }

  /**
   * Get comfort threshold for a behavior
   */
  getComfortThreshold(behavior: keyof HumanizationConfig['comfortThresholds']): number {
    const config = this.getConfig();
    return config.comfortThresholds[behavior];
  }

  /**
   * Apply a preset configuration
   */
  applyPreset(preset: 'conservative' | 'expressive' | 'minimal'): void {
    const presets: Record<string, Partial<HumanizationConfig>> = {
      conservative: CONSERVATIVE_CONFIG,
      expressive: EXPRESSIVE_CONFIG,
      minimal: MINIMAL_CONFIG,
    };

    this.overrides = presets[preset] || {};
    logger.info({ preset }, '🎛️ Humanization preset applied');
  }

  /**
   * Set runtime overrides
   */
  setOverrides(overrides: Partial<HumanizationConfig>): void {
    this.overrides = overrides;
    logger.info({ keys: Object.keys(overrides) }, '🎛️ Humanization overrides set');
  }

  /**
   * Update a specific probability at runtime
   */
  setProbability(key: keyof HumanizationConfig['probabilities'], value: number): void {
    if (!this.overrides.probabilities) {
      this.overrides.probabilities = {} as HumanizationConfig['probabilities'];
    }
    this.overrides.probabilities[key] = Math.max(0, Math.min(1, value));
    logger.debug({ key, value }, '🎛️ Probability updated');
  }

  /**
   * Enable/disable a feature at runtime
   */
  setFeatureEnabled(feature: keyof HumanizationConfig['features'], enabled: boolean): void {
    if (!this.overrides.features) {
      this.overrides.features = {} as HumanizationConfig['features'];
    }
    this.overrides.features[feature] = enabled;
    logger.debug({ feature, enabled }, '🎛️ Feature toggle updated');
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.config = { ...DEFAULT_HUMANIZATION_CONFIG };
    this.overrides = {};
    logger.info('🎛️ Humanization config reset to defaults');
  }

  /**
   * Export current config for debugging/persistence
   */
  exportConfig(): HumanizationConfig {
    return this.getConfig();
  }

  /**
   * Import config (for persistence)
   */
  importConfig(config: Partial<HumanizationConfig>): void {
    this.overrides = config;
    logger.info('🎛️ Humanization config imported');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private mergeConfigs(
    base: HumanizationConfig,
    overrides: Partial<HumanizationConfig>
  ): HumanizationConfig {
    return {
      ...base,
      ...overrides,
      features: { ...base.features, ...overrides.features },
      probabilities: { ...base.probabilities, ...overrides.probabilities },
      confidenceThresholds: {
        ...base.confidenceThresholds,
        ...overrides.confidenceThresholds,
      },
      timing: { ...base.timing, ...overrides.timing },
      comfortThresholds: { ...base.comfortThresholds, ...overrides.comfortThresholds },
      voicePrint: { ...base.voicePrint, ...overrides.voicePrint },
      breathingSync: { ...base.breathingSync, ...overrides.breathingSync },
      emotionalLeading: { ...base.emotionalLeading, ...overrides.emotionalLeading },
      analytics: { ...base.analytics, ...overrides.analytics },
    };
  }
}

// ============================================================================
// SINGLETON & EXPORTS
// ============================================================================

let configInstance: HumanizationConfigManager | null = null;

export function getHumanizationConfig(): HumanizationConfigManager {
  if (!configInstance) {
    configInstance = new HumanizationConfigManager();
  }
  return configInstance;
}

export function resetHumanizationConfig(): void {
  if (configInstance) {
    configInstance.reset();
  }
  configInstance = null;
}

// Convenience exports
export const humanizationConfig = {
  get: () => getHumanizationConfig().getConfig(),
  getProbability: (key: keyof HumanizationConfig['probabilities']) =>
    getHumanizationConfig().getProbability(key),
  isEnabled: (feature: keyof HumanizationConfig['features']) =>
    getHumanizationConfig().isFeatureEnabled(feature),
  applyPreset: (preset: 'conservative' | 'expressive' | 'minimal') =>
    getHumanizationConfig().applyPreset(preset),
  setProbability: (key: keyof HumanizationConfig['probabilities'], value: number) =>
    getHumanizationConfig().setProbability(key, value),
  setEnabled: (feature: keyof HumanizationConfig['features'], enabled: boolean) =>
    getHumanizationConfig().setFeatureEnabled(feature, enabled),
  reset: () => resetHumanizationConfig(),
};

export type { HumanizationConfigManager };
