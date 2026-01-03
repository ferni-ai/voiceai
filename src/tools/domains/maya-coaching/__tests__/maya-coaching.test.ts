/**
 * Maya's Superhuman Coaching Tools Tests
 *
 * Tests the "Better Than Human" habit coaching capabilities unique to Maya.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getToolDefinitions } from '../index.js';

// Mock the superhuman services
vi.mock('../../../../services/superhuman/maya-coaching-services.js', () => ({
  recordHabitDNA: vi.fn(),
  getHabitDNA: vi.fn().mockResolvedValue(null),
  recordFrictionPoint: vi.fn(),
  getFrictionPoints: vi.fn().mockResolvedValue([]),
  recordTendencySignal: vi.fn(),
  getTendencyProfile: vi.fn().mockResolvedValue(null),
  recordKeystoneObservation: vi.fn(),
  getKeystoneHabits: vi.fn().mockResolvedValue([]),
  recordIdentityStatement: vi.fn(),
  getIdentityEvolution: vi.fn().mockResolvedValue([]),
  recordSetbackPattern: vi.fn(),
  getSetbackPatterns: vi.fn().mockResolvedValue([]),
  recordHabitAutopsy: vi.fn(),
  getHabitAutopsies: vi.fn().mockResolvedValue([]),
}));

describe('maya-coaching domain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export tool definitions', async () => {
    const tools = await getToolDefinitions();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('should include all superhuman coaching tools', async () => {
    const tools = await getToolDefinitions();
    const toolIds = tools.map((t) => t.id);

    expect(toolIds).toContain('trackHabitDNA');
    expect(toolIds).toContain('mapFriction');
    expect(toolIds).toContain('assessTendency');
    expect(toolIds).toContain('detectKeystone');
    expect(toolIds).toContain('trackIdentityShift');
    expect(toolIds).toContain('analyzeSetbackPattern');
    expect(toolIds).toContain('conductHabitAutopsy');
  });

  it('should have all tools in maya-coaching domain', async () => {
    const tools = await getToolDefinitions();

    for (const tool of tools) {
      expect(tool.domain).toBe('maya-coaching');
    }
  });

  it('should have maya-specialty tag on all tools', async () => {
    const tools = await getToolDefinitions();

    for (const tool of tools) {
      expect(tool.tags).toContain('maya-specialty');
    }
  });

  describe('trackHabitDNA tool', () => {
    it('should have correct structure', async () => {
      const tools = await getToolDefinitions();
      const habitDNA = tools.find((t) => t.id === 'trackHabitDNA');

      expect(habitDNA).toBeDefined();
      expect(habitDNA?.name).toBe('Track Habit DNA');
      expect(habitDNA?.description).toContain('genetic profile');
    });
  });

  describe('mapFriction tool', () => {
    it('should have correct structure', async () => {
      const tools = await getToolDefinitions();
      const mapFriction = tools.find((t) => t.id === 'mapFriction');

      expect(mapFriction).toBeDefined();
      expect(mapFriction?.name).toBe('Map Friction');
      expect(mapFriction?.description).toContain('friction');
    });
  });

  describe('assessTendency tool', () => {
    it('should have correct structure', async () => {
      const tools = await getToolDefinitions();
      const tendency = tools.find((t) => t.id === 'assessTendency');

      expect(tendency).toBeDefined();
      expect(tendency?.name).toBe('Assess Tendency');
      expect(tendency?.description).toContain('Four Tendency');
    });
  });

  describe('detectKeystone tool', () => {
    it('should have correct structure', async () => {
      const tools = await getToolDefinitions();
      const keystone = tools.find((t) => t.id === 'detectKeystone');

      expect(keystone).toBeDefined();
      expect(keystone?.name).toBe('Detect Keystone');
      expect(keystone?.description).toContain('keystone');
    });
  });

  describe('trackIdentityShift tool', () => {
    it('should have correct structure', async () => {
      const tools = await getToolDefinitions();
      const identity = tools.find((t) => t.id === 'trackIdentityShift');

      expect(identity).toBeDefined();
      expect(identity?.name).toBe('Track Identity Shift');
      expect(identity?.description).toContain('identity');
    });
  });

  describe('analyzeSetbackPattern tool', () => {
    it('should have correct structure', async () => {
      const tools = await getToolDefinitions();
      const setback = tools.find((t) => t.id === 'analyzeSetbackPattern');

      expect(setback).toBeDefined();
      expect(setback?.name).toBe('Analyze Setback Pattern');
      expect(setback?.description).toContain('setback');
    });
  });

  describe('conductHabitAutopsy tool', () => {
    it('should have correct structure', async () => {
      const tools = await getToolDefinitions();
      const autopsy = tools.find((t) => t.id === 'conductHabitAutopsy');

      expect(autopsy).toBeDefined();
      expect(autopsy?.name).toBe('Conduct Habit Autopsy');
      expect(autopsy?.description).toContain('post-mortem');
    });
  });
});
