/**
 * Effect Feature Flags
 *
 * Feature flag integration for gradual rollout of the effects system.
 *
 * @module @ferni/conversation/effects/feature-flags
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'EffectFeatureFlags' });

// ============================================================================
// TYPES
// ============================================================================

export interface EffectFeatureConfig {
  /** Is the composable effects system enabled? */
  composableEffectsEnabled: boolean;

  /** Individual effect toggles */
  effects: {
    breathSound: boolean;
    physicalPresence: boolean;
    spontaneousThought: boolean;
    firstTurnNotice: boolean;
    excitementInterruption: boolean;
    liveReaction: boolean;
    playfulness: boolean;
    speechFiller: boolean;
  };

  /** Rollout percentage (0-100) */
  rolloutPercentage: number;

  /** Personas with effects enabled */
  enabledPersonas: string[];

  /** User IDs in the experiment */
  experimentUserIds: string[];
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: EffectFeatureConfig = {
  composableEffectsEnabled: true, // Enabled by default

  effects: {
    breathSound: true,
    physicalPresence: true,
    spontaneousThought: true,
    firstTurnNotice: true,
    excitementInterruption: true,
    liveReaction: true,
    playfulness: true,
    speechFiller: true,
  },

  rolloutPercentage: 100, // 100% rollout
  enabledPersonas: ['ferni', 'peter-john', 'maya-santos', 'alex-chen', 'jordan-taylor', 'nayan-patel'],
  experimentUserIds: [], // Empty = everyone
};

// ============================================================================
// FEATURE FLAG MANAGER
// ============================================================================

class EffectFeatureFlags {
  private config: EffectFeatureConfig;

  constructor(initialConfig?: Partial<EffectFeatureConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...initialConfig };
  }

  /**
   * Check if composable effects system is enabled
   */
  isEnabled(): boolean {
    return this.config.composableEffectsEnabled;
  }

  /**
   * Check if a specific effect is enabled
   */
  isEffectEnabled(effectId: string): boolean {
    if (!this.config.composableEffectsEnabled) return false;

    const normalizedId = effectId.replace(/_/g, '') as keyof typeof this.config.effects;
    
    // Map effect IDs to config keys
    const effectMap: Record<string, keyof typeof this.config.effects> = {
      breath_sound: 'breathSound',
      physical_presence: 'physicalPresence',
      spontaneous_thought: 'spontaneousThought',
      first_turn_notice: 'firstTurnNotice',
      excitement_interruption: 'excitementInterruption',
      live_reaction: 'liveReaction',
      playfulness: 'playfulness',
      speech_filler: 'speechFiller',
    };

    const configKey = effectMap[effectId];
    if (configKey && configKey in this.config.effects) {
      return this.config.effects[configKey];
    }

    // Unknown effects are enabled by default
    return true;
  }

  /**
   * Check if effects are enabled for a specific user
   */
  isEnabledForUser(userId: string): boolean {
    if (!this.config.composableEffectsEnabled) return false;

    // If experiment user IDs are specified, check if user is in the list
    if (this.config.experimentUserIds.length > 0) {
      return this.config.experimentUserIds.includes(userId);
    }

    // Otherwise, use rollout percentage
    const hash = this.hashUserId(userId);
    return hash < this.config.rolloutPercentage;
  }

  /**
   * Check if effects are enabled for a specific persona
   */
  isEnabledForPersona(personaId: string): boolean {
    if (!this.config.composableEffectsEnabled) return false;

    if (this.config.enabledPersonas.length === 0) return true;
    return this.config.enabledPersonas.includes(personaId);
  }

  /**
   * Full check: is the effect system enabled for this context?
   */
  shouldApplyEffects(context: {
    userId?: string;
    personaId: string;
    sessionId: string;
  }): boolean {
    if (!this.isEnabled()) return false;

    // Check persona
    if (!this.isEnabledForPersona(context.personaId)) {
      log.debug({ personaId: context.personaId }, 'Effects disabled for persona');
      return false;
    }

    // Check user if provided
    if (context.userId && !this.isEnabledForUser(context.userId)) {
      log.debug({ userId: context.userId }, 'Effects disabled for user');
      return false;
    }

    return true;
  }

  /**
   * Update feature flag config
   */
  updateConfig(updates: Partial<EffectFeatureConfig>): void {
    this.config = { ...this.config, ...updates };
    log.info({ updates }, 'Effect feature flags updated');
  }

  /**
   * Get current config
   */
  getConfig(): EffectFeatureConfig {
    return { ...this.config };
  }

  /**
   * Simple hash function for consistent user assignment
   */
  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) % 100;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let featureFlags: EffectFeatureFlags | null = null;

export function getEffectFeatureFlags(): EffectFeatureFlags {
  if (!featureFlags) {
    featureFlags = new EffectFeatureFlags();
  }
  return featureFlags;
}

export function resetEffectFeatureFlags(): void {
  featureFlags = null;
}

export function configureEffectFeatureFlags(config: Partial<EffectFeatureConfig>): void {
  getEffectFeatureFlags().updateConfig(config);
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const effectFlags = {
  isEnabled: () => getEffectFeatureFlags().isEnabled(),
  isEffectEnabled: (effectId: string) => getEffectFeatureFlags().isEffectEnabled(effectId),
  isEnabledForUser: (userId: string) => getEffectFeatureFlags().isEnabledForUser(userId),
  isEnabledForPersona: (personaId: string) => getEffectFeatureFlags().isEnabledForPersona(personaId),
  shouldApplyEffects: (context: { userId?: string; personaId: string; sessionId: string }) =>
    getEffectFeatureFlags().shouldApplyEffects(context),
  configure: (config: Partial<EffectFeatureConfig>) => configureEffectFeatureFlags(config),
  getConfig: () => getEffectFeatureFlags().getConfig(),
};

