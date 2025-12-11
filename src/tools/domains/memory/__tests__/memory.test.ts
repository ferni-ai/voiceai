/**
 * Memory Domain Tools Tests
 *
 * Tests for memory persistence, recall, and relationship tracking tools.
 *
 * Run with: npx vitest run src/tools/domains/memory/__tests__/memory.test.ts
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
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock memory service
vi.mock('../../../../memory/index.js', () => ({
  memoryService: {
    remember: vi.fn().mockResolvedValue({ success: true }),
    recall: vi.fn().mockResolvedValue({ success: true, facts: [] }),
    search: vi.fn().mockResolvedValue({ success: true, results: [] }),
    update: vi.fn().mockResolvedValue({ success: true }),
    forget: vi.fn().mockResolvedValue({ success: true }),
    getRelationshipSummary: vi.fn().mockResolvedValue({
      success: true,
      summary: 'Test relationship summary',
    }),
  },
}));

// ============================================================================
// IMPORTS
// ============================================================================

import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
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

describe('Memory Domain Tools', () => {
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

  // --------------------------------------------------------------------------
  // Tool Loading
  // --------------------------------------------------------------------------

  describe('Tool Loading', () => {
    it('should load all memory tool definitions', async () => {
      expect(toolDefinitions).toBeDefined();
      expect(Array.isArray(toolDefinitions)).toBe(true);
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should have rememberAboutUser tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'rememberAboutUser');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('memory');
    });

    it('should have recallFromMemory tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'recallFromMemory');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('memory');
    });

    it('should have recallPreviousConversation tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'recallPreviousConversation');
      expect(tool).toBeDefined();
    });

    it('should have rememberImportantFact tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'rememberImportantFact');
      expect(tool).toBeDefined();
    });

    it('should have getRelationshipSummary tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'getRelationshipSummary');
      expect(tool).toBeDefined();
    });

    it('should have updateMemory tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'updateMemory');
      expect(tool).toBeDefined();
    });

    it('should have forgetMemory tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'forgetMemory');
      expect(tool).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Tool Creation
  // --------------------------------------------------------------------------

  describe('Tool Creation', () => {
    it('should create rememberAboutUser tool instance', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'rememberAboutUser');
      const tool = toolDef!.create(mockContext);

      expect(tool).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(typeof tool.execute).toBe('function');
    });

    it('should create recallFromMemory tool instance', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'recallFromMemory');
      const tool = toolDef!.create(mockContext);

      expect(tool).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(typeof tool.execute).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // Domain Completeness
  // --------------------------------------------------------------------------

  describe('Domain Completeness', () => {
    it('should include all expected memory tools', () => {
      const expectedTools = [
        'rememberAboutUser',
        'recallFromMemory',
        'recallPreviousConversation',
        'rememberImportantFact',
        'getRelationshipSummary',
        'updateMemory',
        'forgetMemory',
      ];

      const loadedToolIds = toolDefinitions.map((t) => t.id);

      for (const expectedTool of expectedTools) {
        expect(loadedToolIds).toContain(expectedTool);
      }
    });

    it('should have proper tool metadata', () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.id).toBeDefined();
        expect(toolDef.name).toBeDefined();
        expect(toolDef.description).toBeDefined();
        expect(toolDef.domain).toBe('memory');
        expect(typeof toolDef.create).toBe('function');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Tool Tags
  // --------------------------------------------------------------------------

  describe('Tool Tags', () => {
    it('should have memory-related tags', () => {
      const toolsWithTags = toolDefinitions.filter((t) => t.tags && t.tags.length > 0);

      // At least some tools should have tags
      expect(toolsWithTags.length).toBeGreaterThan(0);
    });
  });
});
