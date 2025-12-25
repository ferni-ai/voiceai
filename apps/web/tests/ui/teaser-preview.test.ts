/**
 * Teaser Preview UI Tests
 *
 * Basic tests for the teaser preview system that transforms empty states
 * into forward-looking visualizations with realistic dummy data.
 *
 * Run with: npx vitest run apps/web/tests/ui/teaser-preview.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Simple mock setup
vi.mock('../../src/config/animation-constants.js', () => ({
  DURATION: { FAST: 100, NORMAL: 200, SLOW: 300, MODERATE: 400, DELIBERATE: 500 },
  EASING: { STANDARD: 'ease-out', SPRING: 'ease-out', GENTLE: 'ease-out' },
  prefersReducedMotion: () => false,
}));

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../src/services/relationship-stage.service.js', () => ({
  relationshipStageService: {
    getStatus: vi.fn().mockReturnValue({
      stage: 'building-trust',
      metrics: {
        totalConversations: 15,
        daysSinceFirstMeeting: 10,
      },
    }),
  },
}));

describe('Teaser Preview UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Module Exports', () => {
    it('should export teaserPreview object', async () => {
      const module = await import('../../src/ui/teaser-preview.ui.js');
      expect(module.teaserPreview).toBeDefined();
    });

    it('should export TeaserType type', async () => {
      const module = await import('../../src/ui/teaser-preview.ui.js');
      // Type exports are compile-time only, but we can check the module loaded
      expect(module).toBeDefined();
    });

    it('should have convenience methods for each teaser type', async () => {
      const module = await import('../../src/ui/teaser-preview.ui.js');
      const tp = module.teaserPreview;
      
      expect(typeof tp.wellbeing).toBe('function');
      expect(typeof tp.patterns).toBe('function');
      expect(typeof tp.predictions).toBe('function');
      expect(typeof tp.habits).toBe('function');
      expect(typeof tp.growthAnalytics).toBe('function');
      expect(typeof tp.yourPeople).toBe('function');
      expect(typeof tp.conversationHighlights).toBe('function');
    });

    it('should have ui property with render method', async () => {
      const module = await import('../../src/ui/teaser-preview.ui.js');
      expect(module.teaserPreview.ui).toBeDefined();
      expect(typeof module.teaserPreview.ui.render).toBe('function');
    });
  });

  describe('Teaser Rendering', () => {
    it('should render wellbeing teaser as HTML string', async () => {
      const module = await import('../../src/ui/teaser-preview.ui.js');
      const html = module.teaserPreview.wellbeing();
      
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    });

    it('should render patterns teaser as HTML string', async () => {
      const module = await import('../../src/ui/teaser-preview.ui.js');
      const html = module.teaserPreview.patterns();
      
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    });

    it('should render predictions teaser as HTML string', async () => {
      const module = await import('../../src/ui/teaser-preview.ui.js');
      const html = module.teaserPreview.predictions();
      
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    });

    it('should render habits teaser as HTML string', async () => {
      const module = await import('../../src/ui/teaser-preview.ui.js');
      const html = module.teaserPreview.habits();
      
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    });
  });

  describe('Teaser Content', () => {
    it('should include teaser-preview class in output', async () => {
      const module = await import('../../src/ui/teaser-preview.ui.js');
      const html = module.teaserPreview.wellbeing();
      
      expect(html).toContain('teaser-preview');
    });

    it('should include preview indicator', async () => {
      const module = await import('../../src/ui/teaser-preview.ui.js');
      const html = module.teaserPreview.patterns();
      
      // Should have some indication this is a preview
      expect(html.toLowerCase()).toMatch(/preview|day|after/);
    });
  });
});

describe('Teaser Preview Integration', () => {
  it('should be importable without errors', async () => {
    const importPromise = import('../../src/ui/teaser-preview.ui.js');
    await expect(importPromise).resolves.toBeDefined();
  });

  it('should return consistent results on multiple calls', async () => {
    const module = await import('../../src/ui/teaser-preview.ui.js');
    const html1 = module.teaserPreview.patterns();
    const html2 = module.teaserPreview.patterns();
    
    expect(html1).toBe(html2);
  });
});
