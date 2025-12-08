/**
 * Home & Living Domain Tools Tests
 *
 * Tests for home organization, maintenance, moving, and living spaces.
 *
 * Run with: npx vitest run src/tools/domains/home/__tests__/home.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import { getToolDefinitions } from '../index.js';
import type { ToolDefinition, ToolContext } from '../../../registry/types.js';

// ============================================================================
// TEST CONTEXT
// ============================================================================

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'jordan',
    agentDisplayName: 'Jordan',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available');
      },
      getOptional: () => undefined,
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Home & Living Domain Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Loading', () => {
    it('should load all home tool definitions', async () => {
      expect(toolDefinitions).toBeDefined();
      expect(Array.isArray(toolDefinitions)).toBe(true);
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should have coachDecluttering tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'coachDecluttering');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('home');
    });

    it('should have planMove tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'planMove');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('home');
    });

    it('should have remindHomeMaintenance tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'remindHomeMaintenance');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('home');
    });
  });

  describe('coachDecluttering', () => {
    it('should coach on decluttering a room', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'coachDecluttering');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        area: 'closet',
        overwhelmLevel: 'moderate',
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(100);
    });

    it('should handle high overwhelm gracefully', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'coachDecluttering');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        area: 'whole-house',
        overwhelmLevel: 'severe',
      });

      expect(result).toBeDefined();
      // Should be supportive, not overwhelming
      expect(result.length).toBeGreaterThan(50);
    });
  });

  describe('planMove', () => {
    it('should help plan a move', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'planMove');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        moveType: 'local',
        timeline: '4-weeks',
      });

      expect(result).toBeDefined();
      expect(result.toLowerCase().includes('move') || result.toLowerCase().includes('pack')).toBe(
        true
      );
    });

    it('should plan a long-distance move', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'planMove');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        moveType: 'long-distance',
        timeline: '8-weeks',
      });

      expect(result).toBeDefined();
    });
  });

  describe('remindHomeMaintenance', () => {
    it('should remind about home maintenance', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'remindHomeMaintenance');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        season: 'spring',
      });

      expect(result).toBeDefined();
    });
  });

  describe('organizeSpace', () => {
    it('should help organize a space', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'organizeSpace');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        space: 'kitchen',
        challenge: 'Not enough storage',
      });

      expect(result).toBeDefined();
    });
  });

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'coachDecluttering');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        area: 'garage',
        overwhelmLevel: 'mild',
      });

      expect(result).not.toContain('TODO');
      expect(result).not.toContain('placeholder');
    });

    it('should provide actionable advice', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'planMove');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        moveType: 'local',
        timeline: '2-weeks',
      });

      // Should have substantive content
      expect(result.length).toBeGreaterThan(200);
    });
  });
});
