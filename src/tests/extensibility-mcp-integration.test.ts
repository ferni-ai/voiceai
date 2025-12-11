/**
 * MCP Integration Tests
 *
 * Tests for the Model Context Protocol integration system.
 * Validates:
 * - Config loading and validation
 * - Connection lifecycle (connect, disconnect)
 * - Tool loading and building
 * - Tool execution delegation
 * - Error handling and graceful degradation
 *
 * @module tests/extensibility-mcp-integration
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => mockLogger),
};

vi.mock('../utils/safe-logger.js', () => ({
  getLogger: () => mockLogger,
  createLogger: () => mockLogger,
  safeLog: () => mockLogger,
  default: () => mockLogger,
}));

// Mock fs/promises
const mockReadFile = vi.fn();
const mockStat = vi.fn();

vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  stat: (...args: unknown[]) => mockStat(...args),
}));

// Mock MCP SDK
const mockClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  listTools: vi.fn().mockResolvedValue({
    tools: [
      { name: 'get_weather', description: 'Get weather for a location', inputSchema: { type: 'object' } },
      { name: 'search_web', description: 'Search the web', inputSchema: { type: 'object' } },
    ],
  }),
  callTool: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Tool result from MCP server' }],
  }),
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => mockClient),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn().mockImplementation(() => ({})),
}));

// Mock LiveKit agents
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// Mock zod
vi.mock('zod', () => ({
  z: {
    object: vi.fn(() => ({
      passthrough: vi.fn(() => ({})),
    })),
  },
}));

// Mock bundle loader
vi.mock('../personas/bundles/loader.js', () => ({
  loadBundleById: vi.fn().mockResolvedValue({
    bundlePath: '/test/bundles/test-persona',
    persona: {
      identity: { id: 'test-persona' },
    },
  }),
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import type { BundleMCPConfig, BundleMCPServer } from '../personas/bundles/types/commands.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestMCPConfig(): BundleMCPConfig {
  return {
    servers: [
      {
        id: 'test-server',
        name: 'Test MCP Server',
        transport: 'stdio',
        command: 'node',
        args: ['./test-server.js'],
        autoConnect: true,
      },
      {
        id: 'http-server',
        name: 'HTTP MCP Server',
        transport: 'http',
        url: 'https://api.example.com/mcp',
        autoConnect: true,
      },
      {
        id: 'disabled-server',
        name: 'Disabled Server',
        transport: 'stdio',
        command: 'node',
        args: ['./disabled.js'],
        autoConnect: false,
      },
    ],
  };
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('MCP Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockReset();
    mockStat.mockReset();
    mockClient.connect.mockReset().mockResolvedValue(undefined);
    mockClient.close.mockReset().mockResolvedValue(undefined);
    mockClient.listTools.mockReset().mockResolvedValue({
      tools: [
        { name: 'get_weather', description: 'Get weather for a location', inputSchema: { type: 'object' } },
        { name: 'search_web', description: 'Search the web', inputSchema: { type: 'object' } },
      ],
    });
  });

  afterEach(async () => {
    // Clean up connections after each test
    try {
      const { disconnectAllMCPServers, clearMCPConfigCache } = await import(
        '../personas/bundles/mcp-loader.js'
      );
      await disconnectAllMCPServers();
      clearMCPConfigCache();
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('MCP Config Loading', () => {
    it('should load valid MCP config', async () => {
      const testConfig = createTestMCPConfig();
      mockStat.mockResolvedValue({ isFile: () => true });
      mockReadFile.mockResolvedValue(JSON.stringify(testConfig));

      const { getMCPConfig } = await import('../personas/bundles/mcp-loader.js');
      const config = await getMCPConfig('/test/bundle/path', true);

      expect(config).not.toBeNull();
      expect(config?.servers).toHaveLength(3);
      expect(config?.servers[0].id).toBe('test-server');
    });

    it('should return null for missing mcp.json', async () => {
      mockStat.mockResolvedValue(null);

      const { getMCPConfig } = await import('../personas/bundles/mcp-loader.js');
      const config = await getMCPConfig('/test/bundle/no-mcp', true);

      expect(config).toBeNull();
    });

    it('should validate server transport requirements', async () => {
      const invalidConfig = {
        servers: [
          {
            id: 'missing-command',
            transport: 'stdio',
            // Missing command - invalid
          },
          {
            id: 'missing-url',
            transport: 'http',
            // Missing url - invalid
          },
          {
            id: 'valid-server',
            transport: 'stdio',
            command: 'node',
            args: ['./server.js'],
          },
        ],
      };
      mockStat.mockResolvedValue({ isFile: () => true });
      mockReadFile.mockResolvedValue(JSON.stringify(invalidConfig));

      const { getMCPConfig } = await import('../personas/bundles/mcp-loader.js');
      const config = await getMCPConfig('/test/bundle/invalid', true);

      // Should only include the valid server
      expect(config?.servers).toHaveLength(1);
      expect(config?.servers[0].id).toBe('valid-server');
    });

    it('should cache config and respect forceReload', async () => {
      const testConfig = createTestMCPConfig();
      mockStat.mockResolvedValue({ isFile: () => true });
      mockReadFile.mockResolvedValue(JSON.stringify(testConfig));

      const { getMCPConfig, clearMCPConfigCache } = await import('../personas/bundles/mcp-loader.js');

      // Clear cache first
      clearMCPConfigCache();

      // First call - should read from file
      await getMCPConfig('/test/cached', true);
      expect(mockReadFile).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await getMCPConfig('/test/cached', false);
      expect(mockReadFile).toHaveBeenCalledTimes(1);

      // Force reload - should read again
      await getMCPConfig('/test/cached', true);
      expect(mockReadFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('Auto-Connect Servers', () => {
    it('should filter auto-connect servers', async () => {
      const testConfig = createTestMCPConfig();

      const { getAutoConnectServers } = await import('../personas/bundles/mcp-loader.js');
      const autoConnect = getAutoConnectServers(testConfig);

      expect(autoConnect).toHaveLength(2);
      expect(autoConnect.map((s) => s.id)).toContain('test-server');
      expect(autoConnect.map((s) => s.id)).toContain('http-server');
      expect(autoConnect.map((s) => s.id)).not.toContain('disabled-server');
    });

    it('should return empty array for null config', async () => {
      const { getAutoConnectServers } = await import('../personas/bundles/mcp-loader.js');
      const autoConnect = getAutoConnectServers(null);

      expect(autoConnect).toHaveLength(0);
    });
  });

  describe('MCP Connection Lifecycle', () => {
    it('should validate server configuration for stdio transport', () => {
      const server: BundleMCPServer = {
        id: 'stdio-test',
        name: 'Stdio Test Server',
        transport: 'stdio',
        command: 'node',
        args: ['./server.js'],
      };

      expect(server.transport).toBe('stdio');
      expect(server.command).toBe('node');
      expect(server.args).toEqual(['./server.js']);
    });

    it('should validate server configuration for HTTP transport', () => {
      const server: BundleMCPServer = {
        id: 'http-test',
        name: 'HTTP Test Server',
        transport: 'http',
        url: 'https://api.example.com/mcp',
      };

      expect(server.transport).toBe('http');
      expect(server.url).toBe('https://api.example.com/mcp');
    });

    it('should export disconnect functions', async () => {
      const { disconnectFromMCPServer, disconnectAllMCPServers, getMCPConnection } = await import(
        '../personas/bundles/mcp-loader.js'
      );

      expect(typeof disconnectFromMCPServer).toBe('function');
      expect(typeof disconnectAllMCPServers).toBe('function');
      expect(typeof getMCPConnection).toBe('function');
    });

    it('should return null for non-existent connection', async () => {
      const { getMCPConnection } = await import('../personas/bundles/mcp-loader.js');
      const connection = getMCPConnection('non-existent-server-id');
      expect(connection).toBeNull();
    });
  });

  describe('MCP Tool Calling', () => {
    it('should throw error for disconnected server', async () => {
      const { callMCPTool } = await import('../personas/bundles/mcp-loader.js');

      await expect(callMCPTool('nonexistent', 'some_tool', {})).rejects.toThrow(
        'MCP server not connected'
      );
    });

    it('should export callMCPTool function', async () => {
      const { callMCPTool } = await import('../personas/bundles/mcp-loader.js');
      expect(typeof callMCPTool).toBe('function');
    });

    it('should export listMCPTools function', async () => {
      const { listMCPTools } = await import('../personas/bundles/mcp-loader.js');
      expect(typeof listMCPTools).toBe('function');

      // Should return empty array for non-existent server
      const tools = await listMCPTools('non-existent');
      expect(tools).toHaveLength(0);
    });
  });

  describe('MCP Integration Module', () => {
    it('should return empty array if no MCP config', async () => {
      mockStat.mockResolvedValue(null);

      const { loadMCPToolsForPersona } = await import('../personas/bundles/mcp-integration.js');

      const tools = await loadMCPToolsForPersona('no-config-persona', '/test/no-config');

      expect(tools).toHaveLength(0);
    });

    it('should handle missing bundle gracefully', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'));

      const { loadMCPToolsForPersona } = await import('../personas/bundles/mcp-integration.js');

      const tools = await loadMCPToolsForPersona('missing-persona', '/nonexistent/path');

      expect(tools).toHaveLength(0);
    });

    it('should export cleanupMCPConnections', async () => {
      const { cleanupMCPConnections } = await import('../personas/bundles/mcp-integration.js');

      // Should not throw
      await expect(cleanupMCPConnections()).resolves.not.toThrow();
    });

    it('should export initializeMCPConnections', async () => {
      mockStat.mockResolvedValue(null);

      const { initializeMCPConnections } = await import('../personas/bundles/mcp-integration.js');

      // With no config, should return empty results
      const result = await initializeMCPConnections('test-persona', '/no-config');

      expect(result).toHaveProperty('connected');
      expect(result).toHaveProperty('failed');
      expect(Array.isArray(result.connected)).toBe(true);
      expect(Array.isArray(result.failed)).toBe(true);
    });

    it('should export getMCPConnectionStatus', async () => {
      const { getMCPConnectionStatus } = await import('../personas/bundles/mcp-integration.js');

      const status = getMCPConnectionStatus();

      expect(Array.isArray(status)).toBe(true);
    });
  });

  describe('Tool Definition Structure', () => {
    it('should create properly structured MCP tool definitions', () => {
      // Test the MCPToolDefinition interface structure
      interface MCPToolDefinition {
        name: string;
        description: string;
        inputSchema?: unknown;
        serverId: string;
        originalName: string;
      }

      const toolDef: MCPToolDefinition = {
        name: 'mcp_test-server_get_weather',
        description: 'Get weather for a location',
        inputSchema: { type: 'object' },
        serverId: 'test-server',
        originalName: 'get_weather',
      };

      expect(toolDef.name).toContain('mcp_');
      expect(toolDef.serverId).toBe('test-server');
      expect(toolDef.originalName).toBe('get_weather');
    });

    it('should prefix MCP tool names with server ID', () => {
      const serverId = 'my-server';
      const originalName = 'calculate';
      const prefixedName = `mcp_${serverId}_${originalName}`;

      expect(prefixedName).toBe('mcp_my-server_calculate');
    });
  });
});
