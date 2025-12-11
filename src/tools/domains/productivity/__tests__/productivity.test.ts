/**
 * Productivity Domain Tools Tests
 *
 * Tests for tasks, notes, routines, and shopping lists tools.
 *
 * Run with: npx vitest run src/tools/domains/productivity/__tests__/productivity.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../../../services/productivity-store.js', () => ({
  getProductivityStore: () => ({
    tasks: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    },
    notes: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    },
    routines: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    },
  }),
}));

import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'alex',
    agentDisplayName: 'Alex',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available');
      },
      getOptional: () => undefined,
    },
  };
}

describe('Productivity Domain Tools', () => {
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
    it('should load tool definitions', async () => {
      expect(toolDefinitions).toBeDefined();
      expect(Array.isArray(toolDefinitions)).toBe(true);
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });
    it('should have correct domain', () => {
      for (const tool of toolDefinitions) {
        expect(tool.domain).toBe('productivity');
      }
    });
  });

  describe('Tool Creation', () => {
    it('should create tool instances', () => {
      for (const toolDef of toolDefinitions) {
        const tool = toolDef.create(mockContext);
        expect(tool).toBeDefined();
        expect(typeof tool.execute).toBe('function');
      }
    });
  });
});
