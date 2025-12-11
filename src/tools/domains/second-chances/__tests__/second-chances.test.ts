/**
 * Second Chances Domain Tests
 *
 * Tests for the second chances domain tools - fresh starts, reinvention,
 * and rebuilding after setbacks.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { ServiceRegistry, ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

describe('Second Chances Domain', () => {
  let mockContext: ToolContext;
  let tools: ToolDefinition[];

  beforeEach(async () => {
    mockContext = {
      userId: 'test-user',
      agentId: 'ferni',
      agentDisplayName: 'Ferni',
      services: {
        has: () => false,
        get: () => {
          throw new Error('Service not available');
        },
        getOptional: () => undefined,
      } as ServiceRegistry,
    };

    // Await the tool definitions once for all tests
    tools = await getToolDefinitions();
  });

  describe('getToolDefinitions', () => {
    it('should return all second chances tools', () => {
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.every((t: ToolDefinition) => t.domain === 'second-chances')).toBe(true);
    });

    it('should include assessment tools', () => {
      const assessmentTools = tools.filter((t: ToolDefinition) =>
        ['assessReadinessForChange', 'identifyWhatToKeep', 'acknowledgeWhatWas'].includes(t.id)
      );

      expect(assessmentTools.length).toBe(3);
    });

    it('should include story work tools', () => {
      const storyTools = tools.filter((t: ToolDefinition) =>
        ['reframeNarrative', 'findTheLessons'].includes(t.id)
      );

      expect(storyTools.length).toBe(2);
    });

    it('should include planning tools', () => {
      const planningTools = tools.filter((t: ToolDefinition) =>
        ['defineFirstStep', 'createComebackPlan', 'identifySupports'].includes(t.id)
      );

      expect(planningTools.length).toBe(3);
    });

    it('should include emotional processing tools', () => {
      const emotionalTools = tools.filter((t: ToolDefinition) =>
        ['processGriefForWhatWas', 'buildCourageForWhatNext', 'celebrateTinyWins'].includes(t.id)
      );

      expect(emotionalTools.length).toBe(3);
    });

    it('should include companion tools', () => {
      const companionTools = tools.filter((t: ToolDefinition) =>
        ['checkInOnJourney', 'holdHopeWhenCant', 'remindOfProgress'].includes(t.id)
      );

      expect(companionTools.length).toBe(3);
    });

    it('should include wisdom tool', () => {
      const wisdomTool = tools.find((t: ToolDefinition) => t.id === 'shareSecondChanceWisdom');

      expect(wisdomTool).toBeDefined();
    });
  });

  describe('assessReadinessForChange', () => {
    it('should create a valid tool', () => {
      const def = tools.find((t: ToolDefinition) => t.id === 'assessReadinessForChange');

      expect(def).toBeDefined();
      expect(def?.name).toBe('Assess Readiness for Change');

      const tool = def?.create(mockContext);
      expect(tool).toBeDefined();
      expect(tool.description).toContain('readiness');
    });
  });

  describe('holdHopeWhenCant', () => {
    it('should create a valid tool', () => {
      const def = tools.find((t: ToolDefinition) => t.id === 'holdHopeWhenCant');

      expect(def).toBeDefined();
      expect(def?.name).toBe("Hold Hope When Can't");

      const tool = def?.create(mockContext);
      expect(tool).toBeDefined();
      expect(tool.description).toContain('hope');
    });
  });

  describe('celebrateTinyWins', () => {
    it('should create a valid tool', () => {
      const def = tools.find((t: ToolDefinition) => t.id === 'celebrateTinyWins');

      expect(def).toBeDefined();
      expect(def?.name).toBe('Celebrate Tiny Wins');

      const tool = def?.create(mockContext);
      expect(tool).toBeDefined();
      expect(tool.description).toContain('progress');
    });
  });

  describe('tool creation', () => {
    it('should create all tools without errors', () => {
      for (const def of tools) {
        expect(() => def.create(mockContext)).not.toThrow();
      }
    });

    it('should tag all tools appropriately', () => {
      for (const def of tools) {
        expect(def.tags).toBeDefined();
        expect(def.tags).toContain('second-chances');
      }
    });
  });
});
