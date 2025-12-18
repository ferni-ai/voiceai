/**
 * Reflection Games Domain Tools Tests
 * Run with: npx vitest run src/tools/domains/reflection-games/__tests__/reflection-games.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS (before imports)
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
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Not available');
      },
      getOptional: () => undefined,
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Reflection Games Domain Tools', () => {
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
    it('should load tool definitions', () => {
      expect(toolDefinitions).toBeDefined();
      expect(Array.isArray(toolDefinitions)).toBe(true);
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should have startReflectionGame tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'startReflectionGame');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('reflection-games');
    });

    it('should have tool with execute function', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'startReflectionGame');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(typeof tool.execute).toBe('function');
    });
  });

  describe('startReflectionGame Tool', () => {
    it('should execute two_truths_dream game', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'startReflectionGame');
      const tool = toolDef!.create(mockContext);
      const result = (await tool.execute({ game: 'two_truths_dream' })) as {
        success: boolean;
        game: string;
        prompt: string;
      };
      expect(result.success).toBe(true);
      expect(result.game).toBe('two_truths_dream');
      expect(result.prompt).toContain('Two Truths and a Dream');
    });

    it('should execute values_auction game', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'startReflectionGame');
      const tool = toolDef!.create(mockContext);
      const result = (await tool.execute({ game: 'values_auction' })) as {
        success: boolean;
        game: string;
        prompt: string;
      };
      expect(result.success).toBe(true);
      expect(result.game).toBe('values_auction');
      expect(result.prompt).toContain('$100');
    });

    it('should execute rose_thorn_bud game', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'startReflectionGame');
      const tool = toolDef!.create(mockContext);
      const result = (await tool.execute({ game: 'rose_thorn_bud' })) as {
        success: boolean;
        game: string;
        prompt: string;
      };
      expect(result.success).toBe(true);
      expect(result.game).toBe('rose_thorn_bud');
      expect(result.prompt).toContain('Rose, Thorn, Bud');
    });

    it('should include topic in prompt when provided', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'startReflectionGame');
      const tool = toolDef!.create(mockContext);
      const result = (await tool.execute({ game: 'gratitude_chain', topic: 'family' })) as {
        success: boolean;
        prompt: string;
      };
      expect(result.success).toBe(true);
      expect(result.prompt).toContain('family');
    });
  });
});
