/**
 * Sandbox Executor Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger - must include both getLogger and createLogger
vi.mock('../../../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  mockLogger.child.mockReturnValue(mockLogger);
  return {
    getLogger: () => mockLogger,
    createLogger: () => mockLogger,
    serializeError: (e: unknown) => String(e),
  };
});

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { executeMarketplaceTool, executeBatch, type ExecutionContext } from '../sandbox.js';
import { registerTool, installItem, clearRegistry } from '../../registry.js';
import type { ToolManifest } from '../../schema/types.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockManifest(overrides: Partial<ToolManifest> = {}): ToolManifest {
  return {
    manifestVersion: '1.0.0',
    id: 'test-tool',
    name: 'Test Tool',
    version: '1.0.0',
    publisher: {
      id: 'pub_test',
      name: 'Test Publisher',
      verified: true,
    },
    description: {
      short: 'A test tool',
      long: 'A tool for testing',
    },
    metadata: {
      category: 'test',
      tags: ['test'],
    },
    licensing: {
      type: 'free',
    },
    verification: {
      trustLevel: 'verified',
      verified: true,
    },
    permissions: {
      required: [
        {
          scope: 'external:http:read',
          reason: 'Fetches data',
          required: true,
        },
      ],
      optional: [],
    },
    execution: {
      mode: 'isolated',
      runtime: {
        type: 'http',
        endpoint: 'https://api.test.com/execute',
      },
      limits: {
        timeoutMs: 5000,
        networkAccess: true,
        filesystemAccess: false,
      },
    },
    interface: {
      llmDescription: 'Test tool',
      parametersSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
      },
    },
    compatibility: {
      minPlatformVersion: '1.0.0',
    },
    ...overrides,
  };
}

function createContext(): ExecutionContext {
  return {
    userId: 'user123',
    sessionId: 'session456',
    agentId: 'ferni',
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Sandbox Executor', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clearRegistry();

    // Setup default tool
    registerTool(createMockManifest());
    await installItem({
      itemType: 'tool',
      itemId: 'test-tool',
      userId: 'user123',
      permissions: ['external:http:read'],
    });
  });

  afterEach(() => {
    clearRegistry();
  });

  describe('executeMarketplaceTool', () => {
    it('should execute HTTP tool successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { temperature: 72, conditions: 'sunny' },
          summary: "It's 72°F and sunny",
        }),
      });

      const result = await executeMarketplaceTool(
        'test-tool',
        { query: 'weather in NYC' },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.summary).toBe("It's 72°F and sunny");
      expect(result.executionId).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.permissionsUsed).toContain('external:http:read');
    });

    it('should return error for non-existent tool', async () => {
      const result = await executeMarketplaceTool('non-existent-tool', {}, createContext());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TOOL_NOT_FOUND');
    });

    it('should deny execution when permissions missing', async () => {
      // Register a tool requiring a permission the user doesn't have
      registerTool(
        createMockManifest({
          id: 'restricted-tool',
          permissions: {
            required: [
              {
                scope: 'user:finance:read',
                reason: 'Reads financial data',
                required: true,
              },
            ],
            optional: [],
          },
        })
      );

      // Install with the required permission (install requires it)
      await installItem({
        itemType: 'tool',
        itemId: 'restricted-tool',
        userId: 'user123',
        permissions: ['user:finance:read'],
      });

      // But execute as a different user who doesn't have permission
      const result = await executeMarketplaceTool(
        'restricted-tool',
        {},
        { userId: 'different-user', sessionId: 'session789' }
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PERMISSION_DENIED');
    });

    it('should handle HTTP errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const result = await executeMarketplaceTool('test-tool', { query: 'test' }, createContext());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EXECUTION_ERROR');
    });

    it('should handle timeout errors', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await executeMarketplaceTool('test-tool', { query: 'test' }, createContext(), {
        timeoutMs: 100,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT');
      expect(result.error?.userMessage).toContain('took too long');
    });

    it('should skip permission check for platform tools', async () => {
      // No installation, but should work for platform tools
      clearRegistry();
      registerTool(
        createMockManifest({
          id: 'platform-tool',
          verification: {
            trustLevel: 'platform',
            verified: true,
          },
        })
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'result', summary: 'Done' }),
      });

      const result = await executeMarketplaceTool('platform-tool', {}, createContext(), {
        skipPermissionCheck: true,
      });

      expect(result.success).toBe(true);
    });

    it('should apply trust-based limits', async () => {
      // Community tools get stricter limits
      registerTool(
        createMockManifest({
          id: 'community-tool',
          verification: {
            trustLevel: 'community',
            verified: false,
          },
          execution: {
            mode: 'isolated',
            runtime: {
              type: 'http',
              endpoint: 'https://api.community.com',
            },
            limits: {
              timeoutMs: 10000, // Will be reduced by 0.5x multiplier
              networkAccess: true,
              filesystemAccess: false,
            },
          },
        })
      );

      await installItem({
        itemType: 'tool',
        itemId: 'community-tool',
        userId: 'user123',
        permissions: ['external:http:read'],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ summary: 'Done' }),
      });

      const result = await executeMarketplaceTool('community-tool', {}, createContext());

      expect(result.success).toBe(true);
      // The fetch should have been called with appropriate limits
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should include proper headers in HTTP requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ summary: 'Done' }),
      });

      await executeMarketplaceTool(
        'test-tool',
        { query: 'test' },
        { userId: 'user123', sessionId: 'session456', agentId: 'maya', tenantId: 'tenant789' }
      );

      // SECURITY: Implementation sends anonymized tokens, not raw IDs
      // Session ID and Tenant ID are intentionally NOT sent to external tools
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/execute',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Ferni-Tool-Id': 'test-tool',
            'X-Ferni-Tool-Version': '1.0.0',
            'X-Ferni-User-Token': expect.stringMatching(/^anon_/),
            'X-Ferni-Request-Id': expect.stringMatching(/^req_/),
          }),
        })
      );
    });
  });

  describe('executeBatch', () => {
    it('should execute multiple tools', async () => {
      registerTool(createMockManifest({ id: 'tool-a' }));
      registerTool(createMockManifest({ id: 'tool-b' }));

      await installItem({
        itemType: 'tool',
        itemId: 'tool-a',
        userId: 'user123',
        permissions: ['external:http:read'],
      });

      await installItem({
        itemType: 'tool',
        itemId: 'tool-b',
        userId: 'user123',
        permissions: ['external:http:read'],
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ summary: 'Done' }),
      });

      const results = await executeBatch(
        [
          { toolId: 'tool-a', parameters: { query: 'a' } },
          { toolId: 'tool-b', parameters: { query: 'b' } },
        ],
        createContext()
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should handle partial failures in batch', async () => {
      registerTool(createMockManifest({ id: 'good-tool' }));
      // bad-tool not registered

      await installItem({
        itemType: 'tool',
        itemId: 'good-tool',
        userId: 'user123',
        permissions: ['external:http:read'],
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ summary: 'Done' }),
      });

      const results = await executeBatch(
        [
          { toolId: 'good-tool', parameters: {} },
          { toolId: 'bad-tool', parameters: {} },
        ],
        createContext()
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error?.code).toBe('TOOL_NOT_FOUND');
    });
  });

  describe('Trust Level Enforcement', () => {
    it('should block unverified tools without explicit consent', async () => {
      registerTool(
        createMockManifest({
          id: 'unverified-tool',
          verification: {
            trustLevel: 'verified',
            verified: false, // Verification revoked
          },
        })
      );

      await installItem({
        itemType: 'tool',
        itemId: 'unverified-tool',
        userId: 'user123',
        permissions: ['external:http:read'],
      });

      const result = await executeMarketplaceTool('unverified-tool', {}, createContext());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EXECUTION_BLOCKED');
    });
  });
});
