/**
 * Learning & Education Domain Tools Tests
 *
 * Tests for skill development, learning strategies, and educational guidance.
 *
 * Run with: npx vitest run src/tools/domains/learning/__tests__/learning.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  safeLog: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
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

import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

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

describe('Learning & Education Domain Tools', () => {
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
    it('should load all learning tool definitions', async () => {
      expect(toolDefinitions).toBeDefined();
      expect(Array.isArray(toolDefinitions)).toBe(true);
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should have setLearningGoal tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'setLearningGoal');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('learning');
    });

    it('should have trackLearningProgress tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'trackLearningProgress');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('learning');
    });

    it('should have overcomeLearningBlock tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'overcomeLearningBlock');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('learning');
    });
  });

  describe('setLearningGoal', () => {
    it('should set a learning goal for a new skill', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'setLearningGoal');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        skill: 'Python programming',
        targetLevel: 'intermediate',
        timeline: '3 months',
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(100);
    });

    it('should set a goal for language learning', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'setLearningGoal');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        skill: 'Spanish',
        targetLevel: 'conversational',
      });

      expect(result).toBeDefined();
    });
  });

  describe('trackLearningProgress', () => {
    it('should track learning progress', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'trackLearningProgress');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        skill: 'Mathematics',
        currentStatus: 'Completed chapter 3',
      });

      expect(result).toBeDefined();
    });
  });

  describe('overcomeLearningBlock', () => {
    it('should help overcome learning blockers', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'overcomeLearningBlock');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        blockType: 'procrastination',
        context: 'Keep putting off studying',
      });

      expect(result).toBeDefined();
    });

    it('should help with motivation issues', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'overcomeLearningBlock');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        blockType: 'motivation',
        context: 'Lost interest in the topic',
      });

      expect(result).toBeDefined();
    });
  });

  describe('recommendResource', () => {
    it('should recommend learning resources', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'recommendResource');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        topic: 'Machine Learning',
        resourceType: 'course',
      });

      expect(result).toBeDefined();
    });
  });

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'setLearningGoal');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        skill: 'Guitar',
        targetLevel: 'beginner',
      });

      expect(result).not.toContain('TODO');
      expect(result).not.toContain('placeholder');
    });

    it('should provide structured learning guidance', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'setLearningGoal');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        skill: 'Public speaking',
        targetLevel: 'confident',
      });

      // Should have substantive content
      expect(result.length).toBeGreaterThan(100);
    });
  });
});
