/**
 * Nayan's Superhuman Wisdom Tools Tests
 *
 * Tests the "Better Than Human" wisdom capabilities unique to Nayan.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getToolDefinitions } from '../index.js';

// Mock the superhuman services
vi.mock('../../../../services/superhuman/nayan-wisdom-services.js', () => ({
  recordParadox: vi.fn(),
  getParadoxes: vi.fn().mockResolvedValue([]),
  recordEnoughStatement: vi.fn(),
  getEnoughStatements: vi.fn().mockResolvedValue([]),
  recordIncubatingWisdom: vi.fn(),
  getIncubatingWisdom: vi.fn().mockResolvedValue([]),
}));

describe('nayan-wisdom domain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export tool definitions', async () => {
    const tools = await getToolDefinitions();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('should include all superhuman wisdom tools', async () => {
    const tools = await getToolDefinitions();
    const toolIds = tools.map((t) => t.id);

    expect(toolIds).toContain('holdParadox');
    expect(toolIds).toContain('mortalityPerspective');
    expect(toolIds).toContain('generatePersonalKoan');
    expect(toolIds).toContain('trackEnough');
    expect(toolIds).toContain('ancestralWisdom');
    expect(toolIds).toContain('trackWisdomIncubation');
  });

  it('should have all tools in nayan-wisdom domain', async () => {
    const tools = await getToolDefinitions();

    for (const tool of tools) {
      expect(tool.domain).toBe('nayan-wisdom');
    }
  });

  it('should have nayan-specialty tag on all tools', async () => {
    const tools = await getToolDefinitions();

    for (const tool of tools) {
      expect(tool.tags).toContain('nayan-specialty');
    }
  });

  describe('holdParadox tool', () => {
    it('should have correct structure', async () => {
      const tools = await getToolDefinitions();
      const holdParadox = tools.find((t) => t.id === 'holdParadox');

      expect(holdParadox).toBeDefined();
      expect(holdParadox?.name).toBe('Hold Paradox');
      expect(holdParadox?.description).toContain('contradictory');
    });
  });

  describe('mortalityPerspective tool', () => {
    it('should have correct structure', async () => {
      const tools = await getToolDefinitions();
      const mortalityPerspective = tools.find((t) => t.id === 'mortalityPerspective');

      expect(mortalityPerspective).toBeDefined();
      expect(mortalityPerspective?.name).toBe('Mortality Perspective');
      expect(mortalityPerspective?.description).toContain('mortality');
    });
  });

  describe('generatePersonalKoan tool', () => {
    it('should have correct structure', async () => {
      const tools = await getToolDefinitions();
      const koan = tools.find((t) => t.id === 'generatePersonalKoan');

      expect(koan).toBeDefined();
      expect(koan?.name).toBe('Generate Personal Koan');
      expect(koan?.description).toContain('paradox');
    });
  });

  describe('trackEnough tool', () => {
    it('should have correct structure', async () => {
      const tools = await getToolDefinitions();
      const trackEnough = tools.find((t) => t.id === 'trackEnough');

      expect(trackEnough).toBeDefined();
      expect(trackEnough?.name).toBe('Track Enough');
      expect(trackEnough?.description).toContain('enough');
    });
  });

  describe('ancestralWisdom tool', () => {
    it('should have correct structure', async () => {
      const tools = await getToolDefinitions();
      const ancestral = tools.find((t) => t.id === 'ancestralWisdom');

      expect(ancestral).toBeDefined();
      expect(ancestral?.name).toBe('Ancestral Wisdom');
      expect(ancestral?.description).toContain('ancestors');
    });
  });

  describe('trackWisdomIncubation tool', () => {
    it('should have correct structure', async () => {
      const tools = await getToolDefinitions();
      const incubation = tools.find((t) => t.id === 'trackWisdomIncubation');

      expect(incubation).toBeDefined();
      expect(incubation?.name).toBe('Track Wisdom Incubation');
      expect(incubation?.description).toContain('sit with');
    });
  });
});
