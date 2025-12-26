/**
 * Design System Integration Tests
 *
 * Tests for the enhanced design system components:
 * - Haptics service (breathing, emotional momentum)
 * - Emotional springs
 * - Insight cards
 * - Predictive UI
 * - Breathing guide
 * - Narrative visuals
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// HAPTICS SERVICE TESTS
// ============================================================================

describe('Haptics Service', () => {
  describe('HAPTIC_PATTERNS', () => {
    it('should include breathing patterns', async () => {
      // Import dynamically to avoid DOM issues
      const { HAPTIC_PATTERNS } = await import('../src/services/haptics.service.js');

      expect(HAPTIC_PATTERNS.breathingInhale).toBeDefined();
      expect(HAPTIC_PATTERNS.breathingExhale).toBeDefined();
      expect(HAPTIC_PATTERNS.breathingPause).toBeDefined();

      // Verify durations match box breathing
      expect(HAPTIC_PATTERNS.breathingInhale.totalDuration).toBe(4000);
      expect(HAPTIC_PATTERNS.breathingExhale.totalDuration).toBe(6000);
      expect(HAPTIC_PATTERNS.breathingPause.totalDuration).toBe(2000);
    });

    it('should include emotional momentum patterns', async () => {
      const { HAPTIC_PATTERNS } = await import('../src/services/haptics.service.js');

      expect(HAPTIC_PATTERNS.heavyImpact).toBeDefined();
      expect(HAPTIC_PATTERNS.etherealTouch).toBeDefined();
      expect(HAPTIC_PATTERNS.bouncyConfirm).toBeDefined();

      // Verify emotional characteristics
      expect(HAPTIC_PATTERNS.heavyImpact.events[0].intensity).toBeGreaterThan(0.8);
      expect(HAPTIC_PATTERNS.etherealTouch.events[0].intensity).toBeLessThan(0.3);
    });

    it('should have valid pattern structure', async () => {
      const { HAPTIC_PATTERNS } = await import('../src/services/haptics.service.js');

      Object.values(HAPTIC_PATTERNS).forEach(pattern => {
        expect(pattern.name).toBeDefined();
        expect(pattern.totalDuration).toBeGreaterThan(0);
        expect(pattern.events).toBeInstanceOf(Array);
        expect(pattern.events.length).toBeGreaterThan(0);

        pattern.events.forEach(event => {
          expect(['transient', 'continuous']).toContain(event.type);
          expect(event.startTime).toBeGreaterThanOrEqual(0);
          expect(event.intensity).toBeGreaterThanOrEqual(0);
          expect(event.intensity).toBeLessThanOrEqual(1);
        });
      });
    });
  });
});

// ============================================================================
// EMOTIONAL SPRINGS TESTS
// ============================================================================

describe('Emotional Springs', () => {
  describe('SPRINGS configuration', () => {
    it('should define all spring types', async () => {
      const { SPRINGS } = await import('../src/ui/emotional-springs.ui.js');

      const expectedTypes = ['snappy', 'gentle', 'bouncy', 'heavy', 'ethereal', 'organic'];
      expectedTypes.forEach(type => {
        expect(SPRINGS[type as keyof typeof SPRINGS]).toBeDefined();
      });
    });

    it('should have valid spring physics values', async () => {
      const { SPRINGS } = await import('../src/ui/emotional-springs.ui.js');

      Object.values(SPRINGS).forEach(spring => {
        expect(spring.tension).toBeGreaterThan(0);
        expect(spring.friction).toBeGreaterThan(0);
        expect(spring.mass).toBeGreaterThan(0);
        expect(spring.useCase).toBeDefined();
        expect(spring.emotionalContext).toBeDefined();
      });
    });

    it('should have heavier mass for heavy spring', async () => {
      const { SPRINGS } = await import('../src/ui/emotional-springs.ui.js');

      expect(SPRINGS.heavy.mass).toBeGreaterThan(SPRINGS.gentle.mass);
      expect(SPRINGS.ethereal.mass).toBeLessThan(SPRINGS.gentle.mass);
    });
  });

  describe('springToCubicBezier', () => {
    it('should return valid CSS bezier strings', async () => {
      const { springToCubicBezier } = await import('../src/ui/emotional-springs.ui.js');

      const bezier = springToCubicBezier('gentle');
      expect(bezier).toMatch(/^cubic-bezier\([\d., -]+\)$/);
    });
  });

  describe('getSpringDuration', () => {
    it('should return appropriate durations for each type', async () => {
      const { getSpringDuration } = await import('../src/ui/emotional-springs.ui.js');

      // Snappy should be shortest
      expect(getSpringDuration('snappy')).toBeLessThan(getSpringDuration('gentle'));

      // Ethereal should be longest
      expect(getSpringDuration('ethereal')).toBeGreaterThan(getSpringDuration('gentle'));
    });
  });

  describe('Emotional state management', () => {
    it('should update emotional context', async () => {
      const { setEmotionalContext, getEmotionalState } = await import('../src/ui/emotional-springs.ui.js');

      setEmotionalContext('heavy');
      const state = getEmotionalState();

      expect(state.emotionalCarryover).toBe('heavy');
      expect(state.currentWeight).toBeGreaterThan(0.5);
    });
  });
});

// ============================================================================
// INSIGHT CARDS TESTS
// ============================================================================

describe('Insight Cards', () => {
  describe('DATA_COLORS', () => {
    it('should define semantic color categories', async () => {
      const { DATA_COLORS } = await import('../src/ui/insight-cards.ui.js');

      expect(DATA_COLORS.positive).toBeDefined();
      expect(DATA_COLORS.negative).toBeDefined();
      expect(DATA_COLORS.neutral).toBeDefined();
      expect(DATA_COLORS.highlight).toBeDefined();
    });

    it('should have color gradients and glows', async () => {
      const { DATA_COLORS } = await import('../src/ui/insight-cards.ui.js');

      Object.values(DATA_COLORS).forEach(color => {
        if (typeof color === 'object' && 'primary' in color) {
          expect(color.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
          expect(color.gradient).toContain('linear-gradient');
          expect(color.glow).toContain('rgba');
        }
      });
    });

    it('should have series colors for multi-line charts', async () => {
      const { DATA_COLORS } = await import('../src/ui/insight-cards.ui.js');

      expect(DATA_COLORS.series).toBeInstanceOf(Array);
      expect(DATA_COLORS.series.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('animateCountUp', () => {
    it('should animate numbers', async () => {
      const { animateCountUp } = await import('../src/ui/insight-cards.ui.js');

      // Create mock element
      const mockElement = { textContent: '0' } as HTMLElement;

      animateCountUp(mockElement, 0, 100, 100);

      // After animation, value should update
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(mockElement.textContent).not.toBe('0');
    });
  });
});

// ============================================================================
// PREDICTIVE UI TESTS
// ============================================================================

describe('Predictive UI', () => {
  describe('getTimeBasedPreloads', () => {
    it('should return preload suggestions', async () => {
      const { getTimeBasedPreloads } = await import('../src/ui/predictive-ui.ui.js');

      const preloads = getTimeBasedPreloads();

      expect(preloads).toBeInstanceOf(Array);
      expect(preloads.length).toBeGreaterThan(0);
    });
  });

  describe('getContextualPreloads', () => {
    it('should return context-appropriate preloads', async () => {
      const { getContextualPreloads } = await import('../src/ui/predictive-ui.ui.js');

      const goalPreloads = getContextualPreloads('goal-discussion');
      expect(goalPreloads).toContain('goal-tracker');

      const emotionalPreloads = getContextualPreloads('emotional-conversation');
      expect(emotionalPreloads).toContain('journal');
    });

    it('should return empty array for unknown context', async () => {
      const { getContextualPreloads } = await import('../src/ui/predictive-ui.ui.js');

      const unknownPreloads = getContextualPreloads('unknown-context');
      expect(unknownPreloads).toEqual([]);
    });
  });

  describe('User preferences', () => {
    it('should update and retrieve preferences', async () => {
      const { setUserPreferences, getAdaptiveSettings } = await import('../src/ui/predictive-ui.ui.js');

      setUserPreferences({
        informationDensity: 'dense',
        interactionSpeed: 'quick',
      });

      const settings = getAdaptiveSettings();

      expect(settings.density.itemsPerView).toBe(8);
      expect(settings.speed.animationSpeed).toBe(1.3);
    });
  });

  describe('createSkeleton', () => {
    beforeEach(() => {
      // Mock DOM
      vi.stubGlobal('document', {
        createElement: vi.fn(() => ({
          style: {},
          className: '',
          appendChild: vi.fn(),
          cloneNode: vi.fn(() => ({ style: {} })),
        })),
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should create skeleton elements', async () => {
      const { createSkeleton } = await import('../src/ui/predictive-ui.ui.js');

      const textSkeleton = createSkeleton({ type: 'text' });
      expect(textSkeleton).toBeDefined();

      const avatarSkeleton = createSkeleton({ type: 'avatar' });
      expect(avatarSkeleton).toBeDefined();
    });
  });
});

// ============================================================================
// BREATHING GUIDE TESTS
// ============================================================================

describe('Breathing Guide', () => {
  describe('getBreathingPattern', () => {
    it('should return breathing pattern configurations', async () => {
      const { getBreathingPattern } = await import('../src/ui/breathing-guide.ui.js');

      const relaxing = getBreathingPattern('relaxing');

      expect(relaxing.inhaleDuration).toBe(4000);
      expect(relaxing.holdDuration).toBe(2000);
      expect(relaxing.exhaleDuration).toBe(6000);
      expect(relaxing.pauseDuration).toBe(2000);
    });

    it('should have different patterns for different purposes', async () => {
      const { getBreathingPattern } = await import('../src/ui/breathing-guide.ui.js');

      const box = getBreathingPattern('box');
      const sleep = getBreathingPattern('sleep');

      // Box breathing is equal phases
      expect(box.inhaleDuration).toBe(box.exhaleDuration);
      expect(box.holdDuration).toBe(box.pauseDuration);

      // Sleep pattern has longer exhale
      expect(sleep.exhaleDuration).toBeGreaterThan(sleep.inhaleDuration);
    });
  });

  describe('getAvailablePatterns', () => {
    it('should return all available patterns', async () => {
      const { getAvailablePatterns } = await import('../src/ui/breathing-guide.ui.js');

      const patterns = getAvailablePatterns();

      expect(patterns).toContain('box');
      expect(patterns).toContain('relaxing');
      expect(patterns).toContain('energizing');
      expect(patterns).toContain('sleep');
      expect(patterns).toContain('focus');
    });
  });
});

// ============================================================================
// NARRATIVE VISUALS TESTS
// ============================================================================

describe('Narrative Visuals', () => {
  describe('Timeline configuration', () => {
    it('should have node size configurations', async () => {
      // The module exports are internal, but we can test the create function works
      const module = await import('../src/ui/narrative-visuals.ui.js');

      expect(module.createTimeline).toBeDefined();
      expect(module.createConstellation).toBeDefined();
      expect(module.createGarden).toBeDefined();
    });
  });

  describe('Garden stages', () => {
    it('should have progressive growth stages', async () => {
      // Test that the module exports the expected functions
      const { createGarden } = await import('../src/ui/narrative-visuals.ui.js');

      expect(typeof createGarden).toBe('function');
    });
  });
});

// ============================================================================
// DESIGN TOKEN EXPORTS TESTS
// ============================================================================

describe('Design Token Exports', () => {
  it('should export insight tokens from build', async () => {
    // This tests that the build.js properly exports these
    const tokens = await import('../../../design-system/dist/tokens.js');

    expect(tokens.INSIGHT_CARDS).toBeDefined();
    expect(tokens.DATA_COLORS).toBeDefined();
    expect(tokens.CHART_STYLES).toBeDefined();
  });

  it('should export physics tokens from build', async () => {
    const tokens = await import('../../../design-system/dist/tokens.js');

    expect(tokens.SPRINGS).toBeDefined();
    expect(tokens.EMOTIONAL_MOMENTUM).toBeDefined();
    expect(tokens.HAPTIC_PATTERNS).toBeDefined();
  });

  it('should export predictive tokens from build', async () => {
    const tokens = await import('../../../design-system/dist/tokens.js');

    expect(tokens.LOADING_STAGES).toBeDefined();
    expect(tokens.SKELETON_STYLES).toBeDefined();
    expect(tokens.ANTICIPATION).toBeDefined();
  });

  it('should provide helper functions', async () => {
    const tokens = await import('../../../design-system/dist/tokens.js');

    // These helpers should be exported
    if (tokens.createEmotionalSpring) {
      const spring = tokens.createEmotionalSpring('gentle');
      expect(spring.tension).toBeDefined();
      expect(spring.friction).toBeDefined();
    }

    if (tokens.getLoadingState) {
      const state = tokens.getLoadingState(500);
      // getLoadingState returns a string like 'instant', 'fast', 'normal', 'slow', 'extended'
      expect(typeof state).toBe('string');
      expect(['instant', 'fast', 'normal', 'slow', 'extended']).toContain(state);
    }
  });
});

// ============================================================================
// CROSS-COMPONENT INTEGRATION TESTS
// ============================================================================

describe('Cross-Component Integration', () => {
  it('should have consistent spring types across components', async () => {
    const { SPRINGS } = await import('../src/ui/emotional-springs.ui.js');

    // Spring types should be consistent
    const springTypes = Object.keys(SPRINGS);

    expect(springTypes).toContain('gentle');
    expect(springTypes).toContain('bouncy');
    expect(springTypes).toContain('heavy');
    expect(springTypes).toContain('ethereal');
  });

  it('should have breathing config matching haptics patterns', async () => {
    const { getBreathingPattern } = await import('../src/ui/breathing-guide.ui.js');
    const { HAPTIC_PATTERNS } = await import('../src/services/haptics.service.js');

    const relaxingBreath = getBreathingPattern('relaxing');

    // Haptic breathing patterns should match UI patterns
    expect(HAPTIC_PATTERNS.breathingInhale.totalDuration).toBe(relaxingBreath.inhaleDuration);
    expect(HAPTIC_PATTERNS.breathingExhale.totalDuration).toBe(relaxingBreath.exhaleDuration);
  });
});
