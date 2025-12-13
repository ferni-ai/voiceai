/**
 * Tool Proxy Integration Tests
 *
 * Tests the tool proxy's ability to route execution to the Tool Service.
 * Run with: pnpm test -- tool-proxy.integration
 *
 * Note: For full E2E testing, start the Tool Service first:
 *   PORT=50051 node dist/services/tool-service/server.js
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger before imports
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

// Mock fetch for unit tests (no actual HTTP calls)
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  createProxiedTool,
  createProxiedToolSet,
  getToolProxyConfig,
  type ProxiedToolContext,
  type ToolProxyConfig,
} from '../tool-proxy.js';
import type { ToolDefinition, ToolContext, Tool } from '../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockToolDef(id: string, overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    id,
    name: id,
    description: `Test tool: ${id}`,
    domain: 'test' as any,
    create: (ctx: ToolContext) => {
      return {
        description: `Test tool: ${id}`,
        parameters: z.object({}),
        execute: async () => `Local result from ${id}`,
      } as Tool;
    },
    ...overrides,
  };
}

function createMockContext(): ProxiedToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    sessionId: 'test-session-456',
    subscriptionTier: 'free',
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
// UNIT TESTS
// ============================================================================

describe('Tool Proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getToolProxyConfig', () => {
    it('should return default config when no env vars set', () => {
      const config = getToolProxyConfig();

      expect(config.mode).toBe('local');
      expect(config.serviceUrl).toBe('http://localhost:50051');
      expect(config.timeout).toBe(30000);
      expect(config.localOverrides).toContain('meetTheTeam');
    });

    it('should use environment variables when set', () => {
      const originalMode = process.env.TOOL_EXECUTION_MODE;
      const originalUrl = process.env.TOOL_SERVICE_URL;

      process.env.TOOL_EXECUTION_MODE = 'remote';
      process.env.TOOL_SERVICE_URL = 'http://tool-service:8080';

      try {
        const config = getToolProxyConfig();
        expect(config.mode).toBe('remote');
        expect(config.serviceUrl).toBe('http://tool-service:8080');
      } finally {
        if (originalMode) process.env.TOOL_EXECUTION_MODE = originalMode;
        else delete process.env.TOOL_EXECUTION_MODE;
        if (originalUrl) process.env.TOOL_SERVICE_URL = originalUrl;
        else delete process.env.TOOL_SERVICE_URL;
      }
    });
  });

  describe('createProxiedTool', () => {
    it('should return local tool in local mode', () => {
      const toolDef = createMockToolDef('testTool');
      const ctx = createMockContext();
      const config: ToolProxyConfig = { mode: 'local' };

      const tool = createProxiedTool(toolDef, ctx, config);

      expect(tool).toBeDefined();
      expect(tool.description).toContain('testTool');
    });

    it('should create remote proxy in remote mode', () => {
      const toolDef = createMockToolDef('testTool');
      const ctx = createMockContext();
      const config: ToolProxyConfig = {
        mode: 'remote',
        serviceUrl: 'http://localhost:50051',
      };

      const tool = createProxiedTool(toolDef, ctx, config);

      expect(tool).toBeDefined();
      expect(tool.description).toBe('Test tool: testTool');
    });

    it('should respect localOverrides in remote mode', () => {
      const toolDef = createMockToolDef('handoffToMaya');
      const ctx = createMockContext();
      const config: ToolProxyConfig = {
        mode: 'remote',
        serviceUrl: 'http://localhost:50051',
        localOverrides: ['handoffToMaya'],
      };

      const tool = createProxiedTool(toolDef, ctx, config);

      // Should use local execution for handoff tools
      expect(tool).toBeDefined();
    });
  });

  describe('Remote Tool Execution', () => {
    it('should call Tool Service on remote execution', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'EXECUTION_STATUS_SUCCESS',
          result: {
            data: { value: 'test' },
            summary: 'Tool executed successfully',
          },
          metadata: {
            executionTimeMs: 50,
            cacheStatus: 'CACHE_STATUS_MISS',
          },
        }),
      });

      const toolDef = createMockToolDef('testTool');
      const ctx = createMockContext();
      const config: ToolProxyConfig = {
        mode: 'remote',
        serviceUrl: 'http://localhost:50051',
      };

      const tool = createProxiedTool(toolDef, ctx, config);
      const result = await tool.execute({ param: 'value' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:50051/ferni.tools.v1.ToolService/Execute',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      expect(result).toBe('Tool executed successfully');
    });

    it('should return user-friendly message on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const toolDef = createMockToolDef('testTool');
      const ctx = createMockContext();
      const config: ToolProxyConfig = {
        mode: 'remote',
        serviceUrl: 'http://localhost:50051',
      };

      const tool = createProxiedTool(toolDef, ctx, config);
      const result = await tool.execute({});

      expect(result).toBe('I had trouble with that. Let me try a different approach.');
    });

    it('should handle timeout errors gracefully', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const toolDef = createMockToolDef('testTool');
      const ctx = createMockContext();
      const config: ToolProxyConfig = {
        mode: 'remote',
        serviceUrl: 'http://localhost:50051',
        timeout: 100,
      };

      const tool = createProxiedTool(toolDef, ctx, config);
      const result = await tool.execute({});

      expect(result).toBe('That took too long. Let me try a simpler approach.');
    });

    it('should fallback to local execution in hybrid mode on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const toolDef = createMockToolDef('testTool');
      const ctx = createMockContext();
      const config: ToolProxyConfig = {
        mode: 'hybrid',
        serviceUrl: 'http://localhost:50051',
      };

      const tool = createProxiedTool(toolDef, ctx, config);
      const result = await tool.execute({});

      // Should fallback to local execution
      expect(result).toBe('Local result from testTool');
    });

    it('should return error userMessage when tool execution fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'EXECUTION_STATUS_FAILED',
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'User not authorized',
            userMessage: 'You need to upgrade your plan for this feature.',
            retryable: false,
          },
        }),
      });

      const toolDef = createMockToolDef('premiumTool');
      const ctx = createMockContext();
      const config: ToolProxyConfig = {
        mode: 'remote',
        serviceUrl: 'http://localhost:50051',
      };

      const tool = createProxiedTool(toolDef, ctx, config);
      const result = await tool.execute({});

      expect(result).toBe('You need to upgrade your plan for this feature.');
    });
  });

  describe('createProxiedToolSet', () => {
    it('should return original tools in local mode', async () => {
      const tools: Record<string, Tool> = {
        tool1: { description: 'Tool 1', parameters: z.object({}), execute: async () => 'result1' } as Tool,
        tool2: { description: 'Tool 2', parameters: z.object({}), execute: async () => 'result2' } as Tool,
      };
      const defs = [createMockToolDef('tool1'), createMockToolDef('tool2')];
      const ctx = createMockContext();
      const config: ToolProxyConfig = { mode: 'local' };

      const result = await createProxiedToolSet(tools, defs, ctx, config);

      expect(result).toBe(tools); // Same reference, no proxying
    });

    it('should proxy tools in remote mode', async () => {
      const tools: Record<string, Tool> = {
        tool1: { description: 'Tool 1', parameters: z.object({}), execute: async () => 'result1' } as Tool,
        tool2: { description: 'Tool 2', parameters: z.object({}), execute: async () => 'result2' } as Tool,
      };
      const defs = [createMockToolDef('tool1'), createMockToolDef('tool2')];
      const ctx = createMockContext();
      const config: ToolProxyConfig = {
        mode: 'remote',
        serviceUrl: 'http://localhost:50051',
      };

      const result = await createProxiedToolSet(tools, defs, ctx, config);

      expect(Object.keys(result)).toEqual(['tool1', 'tool2']);
      // Proxied tools have different implementation
      expect(result.tool1).not.toBe(tools.tool1);
    });
  });
});
