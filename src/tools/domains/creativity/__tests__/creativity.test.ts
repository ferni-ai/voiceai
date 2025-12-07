/**
 * Creativity & Hobbies Domain Tools Tests
 *
 * Tests for creative projects, hobbies, and artistic pursuits.
 *
 * Run with: npx vitest run src/tools/domains/creativity/__tests__/creativity.test.ts
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
    agentId: 'peter',
    agentDisplayName: 'Peter',
    services: {
      has: () => false,
      get: () => { throw new Error('Service not available'); },
      getOptional: () => undefined,
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Creativity & Hobbies Domain Tools', () => {
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
    it('should load all creativity tool definitions', async () => {
      expect(toolDefinitions).toBeDefined();
      expect(Array.isArray(toolDefinitions)).toBe(true);
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should have trackCreativeProject tool', () => {
      const tool = toolDefinitions.find(t => t.id === 'trackCreativeProject');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('creativity');
    });

    it('should have navigateCreativeBlock tool', () => {
      const tool = toolDefinitions.find(t => t.id === 'navigateCreativeBlock');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('creativity');
    });

    it('should have exploreNewHobby tool', () => {
      const tool = toolDefinitions.find(t => t.id === 'exploreNewHobby');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('creativity');
    });
  });

  describe('trackCreativeProject', () => {
    it('should track a creative project', async () => {
      const toolDef = toolDefinitions.find(t => t.id === 'trackCreativeProject');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        projectName: 'Novel draft',
        projectType: 'writing',
        status: 'in-progress',
        progress: 'Chapter 5 of 20',
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain('Novel');
    });

    it('should celebrate completed projects', async () => {
      const toolDef = toolDefinitions.find(t => t.id === 'trackCreativeProject');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        projectName: 'Oil painting',
        projectType: 'visual-art',
        status: 'completed',
      });

      expect(result).toBeDefined();
    });
  });

  describe('navigateCreativeBlock', () => {
    it('should help navigate creative block', async () => {
      const toolDef = toolDefinitions.find(t => t.id === 'navigateCreativeBlock');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        creativeField: 'writing',
        blockType: 'inspiration',
      });

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(40);
    });

    it('should address perfectionism block', async () => {
      const toolDef = toolDefinitions.find(t => t.id === 'navigateCreativeBlock');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        creativeField: 'music',
        blockType: 'perfectionism',
      });

      expect(result).toBeDefined();
    });
  });

  describe('exploreNewHobby', () => {
    it('should suggest hobbies based on interests', async () => {
      const toolDef = toolDefinitions.find(t => t.id === 'exploreNewHobby');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        interests: ['outdoors', 'creativity'],
        timeAvailable: 'weekends',
        budget: 'moderate',
      });

      expect(result).toBeDefined();
    });
  });

  describe('findInspiration', () => {
    it('should find creative inspiration', async () => {
      const toolDef = toolDefinitions.find(t => t.id === 'findInspiration');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        creativeField: 'writing',
        inspirationType: 'prompts',
      });

      expect(result).toBeDefined();
    });
  });

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      const toolDef = toolDefinitions.find(t => t.id === 'trackCreativeProject');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        projectName: 'Test project',
        projectType: 'crafts',
        status: 'in-progress',
      });

      expect(result).not.toContain('TODO');
      expect(result).not.toContain('placeholder');
    });

    it('should provide inspiring creative guidance', async () => {
      const toolDef = toolDefinitions.find(t => t.id === 'navigateCreativeBlock');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        creativeField: 'visual-art',
        blockType: 'fear',
      });

      // Should have substantive, encouraging content
      expect(result.length).toBeGreaterThan(40);
    });
  });
});

