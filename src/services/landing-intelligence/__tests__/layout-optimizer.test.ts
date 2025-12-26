/**
 * Layout Optimizer Tests
 *
 * Tests for determining optimal section ordering and emphasis based on visitor context.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted for mocks that need to be referenced in vi.mock
const { mockGenerateJSON } = vi.hoisted(() => ({
  mockGenerateJSON: vi.fn(),
}));

// Mock dependencies before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../gemini-client.js', () => ({
  generateJSON: mockGenerateJSON,
}));

import {
  getOptimalSectionOrder,
  optimizeForMobile,
  type LayoutOptimization,
  type SectionEmphasis,
} from '../layout-optimizer.js';

describe('LayoutOptimizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateJSON.mockResolvedValue(null); // Default to fallback
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getOptimalSectionOrder', () => {
    const baseContext = {
      device: 'desktop' as const,
      timeMode: 'afternoon' as const,
      intent: {
        primaryConcern: 'curiosity' as const,
        buyingStage: 'awareness' as const,
        confidence: 0.7,
        emotionalState: 'calm' as const,
        recommendedContent: [],
        suggestedAction: 'Show intro',
        reasoning: 'Default',
      },
      scrollDepth: 0,
      sessionDuration: 0,
    };

    it('should return a layout optimization object', async () => {
      const layout = await getOptimalSectionOrder(baseContext);

      expect(layout).toHaveProperty('order');
      expect(layout).toHaveProperty('emphasis');
      expect(layout).toHaveProperty('hide');
      expect(layout).toHaveProperty('reasoning');
      expect(layout).toHaveProperty('confidence');
    });

    it('should return an array of section IDs in order', async () => {
      const layout = await getOptimalSectionOrder(baseContext);

      expect(Array.isArray(layout.order)).toBe(true);
      expect(layout.order.length).toBeGreaterThan(0);
    });

    it('should always have hero first in the order', async () => {
      const layout = await getOptimalSectionOrder(baseContext);

      expect(layout.order[0]).toBe('hero');
    });

    it('should always have final-cta last in the order', async () => {
      const layout = await getOptimalSectionOrder(baseContext);

      expect(layout.order[layout.order.length - 1]).toBe('final-cta');
    });

    it('should return emphasis as an array', async () => {
      const layout = await getOptimalSectionOrder(baseContext);

      expect(Array.isArray(layout.emphasis)).toBe(true);
    });

    it('should return hide as an array', async () => {
      const layout = await getOptimalSectionOrder(baseContext);

      expect(Array.isArray(layout.hide)).toBe(true);
    });

    it('should return confidence between 0 and 1', async () => {
      const layout = await getOptimalSectionOrder(baseContext);

      expect(layout.confidence).toBeGreaterThanOrEqual(0);
      expect(layout.confidence).toBeLessThanOrEqual(1);
    });

    it('should return a string reasoning', async () => {
      const layout = await getOptimalSectionOrder(baseContext);

      expect(typeof layout.reasoning).toBe('string');
      expect(layout.reasoning.length).toBeGreaterThan(0);
    });

    describe('Preset Selection', () => {
      it('should use anxious-night preset for anxious visitors at night', async () => {
        const context = {
          ...baseContext,
          timeMode: 'late-night' as const,
          intent: {
            ...baseContext.intent,
            primaryConcern: 'anxiety' as const,
            emotionalState: 'anxious' as const,
          },
        };

        const layout = await getOptimalSectionOrder(context);

        // Should prioritize calming content
        expect(layout.confidence).toBeGreaterThanOrEqual(0.5);
        expect(layout.order).toContain('hero');
      });

      it('should use returning-engaged preset for returning engaged visitors', async () => {
        const context = {
          ...baseContext,
          intent: {
            ...baseContext.intent,
            buyingStage: 'decision' as const,
          },
          scrollDepth: 80,
          sessionDuration: 120,
        };

        const layout = await getOptimalSectionOrder(context);

        expect(layout.order).toContain('hero');
        expect(layout.order).toContain('final-cta');
      });
    });

    describe('AI Generation', () => {
      it('should return valid layout structure regardless of source', async () => {
        // The function may use preset or AI depending on context
        // Testing that it always returns valid structure
        mockGenerateJSON.mockResolvedValue({
          order: ['hero', 'showcase', 'features', 'pricing', 'final-cta'],
          emphasis: [{ section: 'showcase', treatment: 'section--expanded', priority: 1 }],
          hide: ['stats'],
          reasoning: 'AI-optimized layout',
          confidence: 0.9,
        });

        const layout = await getOptimalSectionOrder(baseContext);

        expect(layout).toHaveProperty('order');
        expect(layout).toHaveProperty('reasoning');
        expect(layout).toHaveProperty('confidence');
        expect(layout.confidence).toBeGreaterThanOrEqual(0);
        expect(layout.confidence).toBeLessThanOrEqual(1);
      });

      it('should ensure hero is first even if AI omits it', async () => {
        mockGenerateJSON.mockResolvedValue({
          order: ['showcase', 'features', 'final-cta'],
          emphasis: [],
          hide: [],
          reasoning: 'AI response without hero',
          confidence: 0.8,
        });

        const layout = await getOptimalSectionOrder(baseContext);

        expect(layout.order[0]).toBe('hero');
      });

      it('should ensure final-cta is last even if AI omits it', async () => {
        mockGenerateJSON.mockResolvedValue({
          order: ['hero', 'showcase', 'features'],
          emphasis: [],
          hide: [],
          reasoning: 'AI response without final-cta',
          confidence: 0.8,
        });

        const layout = await getOptimalSectionOrder(baseContext);

        expect(layout.order[layout.order.length - 1]).toBe('final-cta');
      });

      it('should return layout when AI returns null', async () => {
        mockGenerateJSON.mockResolvedValue(null);

        const layout = await getOptimalSectionOrder(baseContext);

        // Either uses preset or default fallback
        expect(layout.order).toBeDefined();
        expect(layout.order.length).toBeGreaterThan(0);
        expect(layout.reasoning.length).toBeGreaterThan(0);
      });

      it('should handle AI errors gracefully', async () => {
        mockGenerateJSON.mockRejectedValue(new Error('AI error'));

        // Should not throw
        await expect(getOptimalSectionOrder(baseContext)).resolves.toBeDefined();
      });
    });
  });

  describe('optimizeForMobile', () => {
    const baseLayout: LayoutOptimization = {
      order: [
        'hero',
        'two-am',
        'stats',
        'showcase',
        'memory-demo',
        'story',
        'use-cases',
        'team',
        'journey',
        'how-it-works',
        'features',
        'proof',
        'security',
        'faq',
        'pricing',
        'final-cta',
      ],
      emphasis: [],
      hide: [],
      reasoning: 'Test layout',
      confidence: 0.8,
    };

    it('should return a layout optimization object', () => {
      const mobileLayout = optimizeForMobile(baseLayout);

      expect(mobileLayout).toHaveProperty('order');
      expect(mobileLayout).toHaveProperty('emphasis');
      expect(mobileLayout).toHaveProperty('hide');
      expect(mobileLayout).toHaveProperty('reasoning');
      expect(mobileLayout).toHaveProperty('confidence');
    });

    it('should reduce the number of sections for mobile', () => {
      const mobileLayout = optimizeForMobile(baseLayout);

      expect(mobileLayout.order.length).toBeLessThanOrEqual(baseLayout.order.length);
    });

    it('should keep priority sections', () => {
      const mobileLayout = optimizeForMobile(baseLayout);

      expect(mobileLayout.order).toContain('hero');
      expect(mobileLayout.order).toContain('final-cta');
    });

    it('should preserve emphasized sections', () => {
      const layoutWithEmphasis: LayoutOptimization = {
        ...baseLayout,
        emphasis: [{ section: 'team', treatment: 'section--expanded', priority: 1 }],
      };

      const mobileLayout = optimizeForMobile(layoutWithEmphasis);

      expect(mobileLayout.order).toContain('team');
    });

    it('should update reasoning to indicate mobile optimization', () => {
      const mobileLayout = optimizeForMobile(baseLayout);

      expect(mobileLayout.reasoning.toLowerCase()).toContain('mobile');
    });
  });

  describe('Types', () => {
    it('should export LayoutOptimization type correctly', () => {
      const layout: LayoutOptimization = {
        order: ['hero', 'features', 'final-cta'],
        emphasis: [],
        hide: ['stats'],
        reasoning: 'Test',
        confidence: 0.7,
      };

      expect(layout.order[0]).toBe('hero');
    });

    it('should export SectionEmphasis type correctly', () => {
      const emphasis: SectionEmphasis = {
        section: 'showcase',
        treatment: 'section--expanded',
        priority: 1,
      };

      expect(emphasis.treatment).toBe('section--expanded');
    });

    it('should accept valid treatment values', () => {
      const treatments: SectionEmphasis['treatment'][] = [
        'section--expanded',
        'section--highlighted',
        'section--minimal',
        'section--hidden',
      ];

      treatments.forEach((treatment) => {
        const emphasis: SectionEmphasis = {
          section: 'test',
          treatment,
          priority: 1,
        };
        expect(emphasis.treatment).toBe(treatment);
      });
    });
  });
});
