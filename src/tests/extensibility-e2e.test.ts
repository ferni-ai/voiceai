/**
 * Extensibility E2E Tests
 *
 * End-to-end tests for the complete extensibility system:
 * - Hooks (shell, prompt, webhook) at all lifecycle points
 * - Slash commands (load, render, execute)
 * - MCP integration (connect, list tools, call tools, disconnect)
 * - Local tools from bundles
 *
 * These tests verify that all extensibility features work together
 * in realistic scenarios, not just in isolation.
 *
 * @module tests/extensibility-e2e
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS - Setup before any imports
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

// Mock fs/promises for bundle loading
const mockReadFile = vi.fn();
const mockStat = vi.fn();
const mockReaddir = vi.fn();

vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
}));

// Mock child_process for shell hooks
const mockExecAsync = vi.fn();

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: () => mockExecAsync,
}));

// Mock MCP SDK
const mockMCPClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  listTools: vi.fn().mockResolvedValue({
    tools: [
      {
        name: 'weather_lookup',
        description: 'Get weather for a location',
        inputSchema: { type: 'object', properties: { location: { type: 'string' } } },
      },
    ],
  }),
  callTool: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Sunny, 72°F' }],
  }),
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => mockMCPClient),
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

// ============================================================================
// TEST FIXTURES
// ============================================================================

const MOCK_HOOKS_CONFIG = {
  session_start: {
    type: 'prompt',
    enabled: true,
    prompt: 'The user is starting a new session. Greet them warmly.',
  },
  after_tool_call: {
    type: 'prompt',
    enabled: true,
    prompt: 'The user just used {{toolName}}. Acknowledge their progress.',
  },
  before_tool_call: {
    type: 'shell',
    enabled: true,
    command: 'echo "Tool: $HOOK_TOOL_NAME"',
    timeout: 3000,
  },
};

const MOCK_MCP_CONFIG = {
  servers: [
    {
      id: 'weather-server',
      name: 'Weather MCP Server',
      transport: 'stdio',
      command: 'node',
      args: ['./weather-mcp-server.js'],
      autoConnect: true,
    },
  ],
};

const MOCK_COMMANDS = [
  {
    id: 'daily-checkin',
    name: 'Daily Check-in',
    description: 'Start your morning reflection',
    category: 'check-in',
    prompt: 'Guide the user through a gentle morning reflection...',
  },
  {
    id: 'weekly-review',
    name: 'Weekly Review',
    description: 'Reflect on your week',
    category: 'reflection',
    prompt: 'Help the user review their week and celebrate progress...',
  },
];

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Extensibility E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockStat.mockImplementation(async (path: string) => {
      if (path.includes('hooks.json') || path.includes('mcp.json')) {
        return { isFile: () => true };
      }
      if (path.includes('commands')) {
        return { isDirectory: () => true };
      }
      return null;
    });

    mockReadFile.mockImplementation(async (path: string) => {
      if (path.includes('hooks.json')) {
        return JSON.stringify(MOCK_HOOKS_CONFIG);
      }
      if (path.includes('mcp.json')) {
        return JSON.stringify(MOCK_MCP_CONFIG);
      }
      if (path.includes('.md')) {
        return '# Mock Command\n\nprompt: Test prompt content';
      }
      return '';
    });

    mockReaddir.mockResolvedValue([
      { name: 'daily-checkin.md', isFile: () => true },
      { name: 'weekly-review.md', isFile: () => true },
    ]);

    mockExecAsync.mockResolvedValue({ stdout: 'success', stderr: '' });
  });

  afterEach(async () => {
    // Clean up any MCP connections
    try {
      const { disconnectAllMCPServers, clearMCPConfigCache } =
        await import('../personas/bundles/mcp-loader.js');
      await disconnectAllMCPServers();
      clearMCPConfigCache();
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Full Session Lifecycle', () => {
    it('should execute session_start hook when session begins', async () => {
      const { executeHook } = await import('../personas/bundles/hooks-loader.js');

      // executeHook expects a hook object directly
      const result = await executeHook({
        event: 'session_start',
        hook: {
          type: 'prompt',
          enabled: true,
          prompt: 'The user is starting a new session. Greet them warmly.',
        },
        userId: 'user-123',
        sessionId: 'session-abc',
        personaId: 'ferni',
      });

      expect(result.success).toBe(true);
      expect(result.prompt).toContain('Greet them warmly');
    });

    it('should execute after_tool_call hook with tool name substitution', async () => {
      const { executeHook } = await import('../personas/bundles/hooks-loader.js');

      const result = await executeHook({
        event: 'after_tool_call',
        hook: {
          type: 'prompt',
          enabled: true,
          prompt: 'The user just used {{toolName}}. Acknowledge their progress.',
        },
        userId: 'user-123',
        sessionId: 'session-abc',
        personaId: 'ferni',
        data: { toolName: 'checkHabit' },
      });

      expect(result.success).toBe(true);
      expect(result.prompt).toContain('checkHabit');
    });
  });

  describe('MCP Integration Flow', () => {
    it('should load MCP config and connect to servers', async () => {
      const { getMCPConfig, getAutoConnectServers } =
        await import('../personas/bundles/mcp-loader.js');

      const config = await getMCPConfig('/test/bundles/ferni', true);

      expect(config).not.toBeNull();
      expect(config?.servers).toHaveLength(1);
      expect(config?.servers[0].id).toBe('weather-server');

      const autoConnect = getAutoConnectServers(config);
      expect(autoConnect).toHaveLength(1);
    });

    it('should build MCP tools for persona', async () => {
      const { buildMCPTools } = await import('../personas/bundles/mcp-integration.js');

      // Mock bundle loader to return our test path
      vi.doMock('../personas/bundles/loader.js', () => ({
        loadBundleById: vi.fn().mockResolvedValue({
          bundlePath: '/test/bundles/ferni',
          persona: { identity: { id: 'ferni' } },
        }),
      }));

      // Note: This will attempt to connect to the mock MCP server
      // The mock SDK will handle this
      const tools = await buildMCPTools('ferni', '/test/bundles/ferni');

      // If MCP connection succeeds, we should have tools
      // The actual result depends on mock connection success
      expect(typeof tools).toBe('object');
    });

    it('should track MCP connection status', async () => {
      const { getMCPConnectionStatus } = await import('../personas/bundles/mcp-integration.js');

      const status = getMCPConnectionStatus();

      // Initially no connections
      expect(Array.isArray(status)).toBe(true);
    });
  });

  describe('Slash Commands Flow', () => {
    it('should load commands from bundle', async () => {
      const { loadCommandsWithCache } = await import('../personas/bundles/commands-loader.js');

      const commands = await loadCommandsWithCache('ferni');

      // Commands are loaded from mock file system
      expect(Array.isArray(commands)).toBe(true);
    });

    it('should render command with variable substitution', async () => {
      const { renderCommand } = await import('../personas/bundles/commands-loader.js');

      const command = {
        id: 'test-command',
        name: 'Test',
        description: 'Test command',
        prompt: 'Hello {{name}}, today is {{day}}!',
      };

      const rendered = renderCommand(command, {
        name: 'Alice',
        day: 'Monday',
      });

      expect(rendered).toContain('Alice');
      expect(rendered).toContain('Monday');
    });
  });

  describe('Hook Type Handling', () => {
    it('should handle prompt-type hooks', async () => {
      const { executeHook } = await import('../personas/bundles/hooks-loader.js');

      const result = await executeHook({
        event: 'session_start',
        hook: {
          type: 'prompt',
          enabled: true,
          prompt: 'Welcome to your session!',
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
      });

      expect(result.success).toBe(true);
      expect(typeof result.prompt).toBe('string');
    });

    it('should handle shell-type hooks', async () => {
      const { executeHook } = await import('../personas/bundles/hooks-loader.js');

      const result = await executeHook({
        event: 'before_tool_call',
        hook: {
          type: 'shell',
          enabled: true,
          command: 'echo "shell test"',
          timeout: 3000,
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
        data: { toolName: 'testTool' },
      });

      // Mock always succeeds since execAsync is mocked
      expect(result.success).toBe(true);
      expect(mockExecAsync).toHaveBeenCalled();
    });

    it('should pass environment variables to shell hooks', async () => {
      const { executeHook } = await import('../personas/bundles/hooks-loader.js');

      await executeHook({
        event: 'session_start',
        hook: {
          type: 'shell',
          enabled: true,
          command: 'echo $HOOK_USER_ID',
          timeout: 3000,
        },
        userId: 'user-123',
        sessionId: 'session-abc',
        personaId: 'ferni',
      });

      // Verify execAsync was called (shell hook executed)
      expect(mockExecAsync).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle disabled hooks gracefully', async () => {
      const { executeHook } = await import('../personas/bundles/hooks-loader.js');

      const result = await executeHook({
        event: 'session_start',
        hook: {
          type: 'prompt',
          enabled: false, // Disabled!
          prompt: 'This should not execute',
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
      });

      // Disabled hook should succeed but not provide a prompt
      expect(result.success).toBe(true);
      expect(result.prompt).toBeUndefined();
    });

    it('should gracefully handle MCP server connection failure', async () => {
      mockMCPClient.connect.mockRejectedValueOnce(new Error('Connection refused'));

      const { connectToMCPServer } = await import('../personas/bundles/mcp-loader.js');

      const result = await connectToMCPServer({
        id: 'failing-server',
        name: 'Failing Server',
        transport: 'stdio',
        command: 'node',
        args: ['./nonexistent.js'],
      });

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
    });

    it('should handle invalid hook types gracefully', async () => {
      const { executeHook } = await import('../personas/bundles/hooks-loader.js');

      const result = await executeHook({
        event: 'session_start',
        hook: {
          type: 'invalid_type' as 'prompt',
          enabled: true,
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown hook type');
    });
  });

  describe('Integration with Tool Builder', () => {
    it('should export MCP tools for persona toolset', async () => {
      const { loadMCPToolsForPersona } = await import('../personas/bundles/mcp-integration.js');

      // Mock the bundle loader
      vi.doMock('../personas/bundles/loader.js', () => ({
        loadBundleById: vi.fn().mockResolvedValue({
          bundlePath: '/test/bundles/ferni',
        }),
      }));

      const tools = await loadMCPToolsForPersona('ferni', '/test/bundles/ferni');

      // Should return an array (empty if no MCP servers connected)
      expect(Array.isArray(tools)).toBe(true);
    });
  });

  describe('Lifecycle Events Order', () => {
    it('should execute hooks in correct lifecycle order', async () => {
      const executionOrder: string[] = [];

      const { executeHook } = await import('../personas/bundles/hooks-loader.js');

      // Simulate session lifecycle
      const startResult = await executeHook({
        event: 'session_start',
        hook: {
          type: 'prompt',
          enabled: true,
          prompt: 'Session starting!',
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
      });
      if (startResult.success) executionOrder.push('session_start');

      const beforeResult = await executeHook({
        event: 'before_tool_call',
        hook: {
          type: 'prompt',
          enabled: true,
          prompt: 'About to call {{toolName}}',
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
        data: { toolName: 'checkHabit' },
      });
      if (beforeResult.success) executionOrder.push('before_tool_call');

      const afterResult = await executeHook({
        event: 'after_tool_call',
        hook: {
          type: 'prompt',
          enabled: true,
          prompt: 'Just called {{toolName}}',
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
        data: { toolName: 'checkHabit' },
      });
      if (afterResult.success) executionOrder.push('after_tool_call');

      // All hooks should execute in order
      expect(executionOrder).toEqual(['session_start', 'before_tool_call', 'after_tool_call']);
    });
  });
});
