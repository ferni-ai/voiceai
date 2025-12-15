/**
 * Effect Coordinator Tests
 *
 * Integration tests for the composable effects system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  getEffectCoordinator,
  resetAllEffectCoordinators,
  registerDefaultEffects,
  effectMetrics,
  effectFlags,
} from '../index.js';

// ============================================================================
// EFFECT COORDINATOR TESTS
// ============================================================================

describe('EffectCoordinator', () => {
  beforeEach(() => {
    resetAllEffectCoordinators();
  });

  afterEach(() => {
    resetAllEffectCoordinators();
  });

  describe('initialization', () => {
    it('should create a coordinator instance', () => {
      const coordinator = getEffectCoordinator('test-session', 'ferni');
      expect(coordinator).toBeDefined();
    });

    it('should return same instance for same session', () => {
      const coordinator1 = getEffectCoordinator('test-session', 'ferni');
      const coordinator2 = getEffectCoordinator('test-session', 'ferni');
      expect(coordinator1).toBe(coordinator2);
    });

    it('should create different instances for different sessions', () => {
      const coordinator1 = getEffectCoordinator('session-1', 'ferni');
      const coordinator2 = getEffectCoordinator('session-2', 'ferni');
      expect(coordinator1).not.toBe(coordinator2);
    });
  });

  describe('effect registration', () => {
    it('should register default effects', () => {
      const coordinator = getEffectCoordinator('test-session', 'ferni');
      registerDefaultEffects(coordinator, 'ferni');

      const effects = coordinator.getEffects();
      expect(effects.length).toBeGreaterThan(0);
    });

    it('should not register duplicate effects', () => {
      const coordinator = getEffectCoordinator('test-session', 'ferni');
      registerDefaultEffects(coordinator, 'ferni');
      const countBefore = coordinator.getEffects().length;
      
      registerDefaultEffects(coordinator, 'ferni');
      const countAfter = coordinator.getEffects().length;
      
      expect(countAfter).toBe(countBefore);
    });
  });
});

// ============================================================================
// METRICS TESTS
// ============================================================================

describe('effectMetrics', () => {
  it('should return metrics summary', () => {
    const summary = effectMetrics.getSummary();
    expect(summary).toBeDefined();
    expect(typeof summary.totalEffectsApplied).toBe('number');
    expect(typeof summary.totalEffectsSkipped).toBe('number');
  });

  it('should export to prometheus format', () => {
    const prometheus = effectMetrics.toPrometheus();
    expect(prometheus).toContain('ferni_effects');
  });
});

// ============================================================================
// FEATURE FLAGS TESTS
// ============================================================================

describe('effectFlags', () => {
  it('should return enabled status', () => {
    expect(typeof effectFlags.isEnabled()).toBe('boolean');
  });

  it('should check effect enablement', () => {
    expect(typeof effectFlags.isEffectEnabled('breath_sound')).toBe('boolean');
  });

  it('should check persona enablement', () => {
    expect(effectFlags.isEnabledForPersona('ferni')).toBe(true);
  });

  it('should return config', () => {
    const config = effectFlags.getConfig();
    expect(config).toBeDefined();
    expect(config.effects).toBeDefined();
    expect(typeof config.rolloutPercentage).toBe('number');
  });
});

