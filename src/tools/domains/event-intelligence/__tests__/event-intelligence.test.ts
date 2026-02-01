/**
 * Event Intelligence Domain Tests
 *
 * Tests the "Better Than Human" event planning capabilities.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getToolDefinitions } from '../index.js';

vi.mock('../../../../services/superhuman/event-intelligence-services.js', () => ({
  recordEventPattern: vi.fn(),
  getEventPatterns: vi.fn().mockResolvedValue([]),
  recordGuestProfile: vi.fn(),
  getGuestProfiles: vi.fn().mockResolvedValue([]),
  recordMilestoneDetection: vi.fn(),
  getDetectedMilestones: vi.fn().mockResolvedValue([]),
  recordEventMeaning: vi.fn(),
  getEventMeanings: vi.fn().mockResolvedValue([]),
  recordCelebration: vi.fn(),
  getCelebrationBalance: vi
    .fn()
    .mockResolvedValue({
      total: 0,
      forSelf: 0,
      forOthers: 0,
      bySize: { micro: 0, small: 0, medium: 0, large: 0 },
    }),
  recordTransitionSignal: vi.fn(),
  getAnticipatedTransitions: vi.fn().mockResolvedValue([]),
  checkPlanningReadiness: vi
    .fn()
    .mockResolvedValue({
      overall: 'green',
      financial: 'green',
      calendar: 'green',
      energy: 'green',
      emotional: 'green',
      concerns: [],
      suggestions: [],
    }),
}));

describe('event-intelligence domain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export tool definitions', async () => {
    const tools = await getToolDefinitions();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('should include all superhuman planning tools', async () => {
    const tools = await getToolDefinitions();
    const toolIds = tools.map((t) => t.id);

    expect(toolIds).toContain('recallEventPatterns');
    expect(toolIds).toContain('getGuestInsights');
    expect(toolIds).toContain('detectMilestones');
    expect(toolIds).toContain('captureEventMeaning');
    expect(toolIds).toContain('checkCelebrationHealth');
    expect(toolIds).toContain('anticipateTransition');
    expect(toolIds).toContain('checkPlanningReadiness');
  });

  it('should have all tools in event-intelligence domain', async () => {
    const tools = await getToolDefinitions();
    for (const tool of tools) {
      expect(tool.domain).toBe('event-intelligence');
    }
  });

  it('should have superhuman-events tag on all tools', async () => {
    const tools = await getToolDefinitions();
    for (const tool of tools) {
      expect(tool.tags).toContain('superhuman-events');
    }
  });
});
