/**
 * Agent Extensibility System Tests
 *
 * Tests for the extensibility system that allows marketplace agents to have
 * custom commands, tools, hooks, themes, and MCP integration.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the safe-logger
vi.mock('../../../utils/safe-logger.js', () => ({
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

// =============================================================================
// COMMAND LOADER TESTS
// =============================================================================

describe('Command Loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCommands', () => {
    it('should return empty array for persona without commands', async () => {
      const { getCommands } = await import('../command-loader.js');
      // Use a path that doesn't exist
      const commands = await getCommands('/nonexistent/path');
      expect(commands).toEqual([]);
    });
  });

  describe('renderCommandPrompt', () => {
    const makeCommand = (prompt: string) => ({
      id: 'test',
      name: 'Test',
      description: 'Test command',
      prompt,
      filePath: '/test/path',
    });

    it('should substitute variables in prompt', async () => {
      const { renderCommandPrompt } = await import('../command-loader.js');

      const result = renderCommandPrompt(makeCommand('Hello {{name}}!'), { name: 'World' });
      expect(result).toBe('Hello World!');
    });

    it('should handle multiple variables', async () => {
      const { renderCommandPrompt } = await import('../command-loader.js');

      const result = renderCommandPrompt(
        makeCommand('{{greeting}} {{name}}, welcome to {{place}}!'),
        { greeting: 'Hello', name: 'Alice', place: 'Wonderland' }
      );
      expect(result).toBe('Hello Alice, welcome to Wonderland!');
    });

    it('should remove unfilled placeholders', async () => {
      const { renderCommandPrompt } = await import('../command-loader.js');

      // The function removes unfilled placeholders
      const result = renderCommandPrompt(makeCommand('Hello {{unknown}}!'), {});
      expect(result).toBe('Hello !');
    });
  });

  describe('executeCommand', () => {
    it('should substitute arguments in prompt', async () => {
      const { executeCommand } = await import('../command-loader.js');

      const command = {
        id: 'test-cmd',
        name: 'Test Command',
        description: 'Test',
        prompt: 'Hello {{name}}, your goal is {{goal}}.',
        filePath: '/test/path',
      };

      const result = await executeCommand({
        command,
        args: { name: 'Alice', goal: 'success' },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'moxie',
      });

      expect(result.success).toBe(true);
      expect(result.renderedPrompt).toBe('Hello Alice, your goal is success.');
    });
  });
});

// =============================================================================
// HOOKS LOADER TESTS
// =============================================================================

describe('Hooks Loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeHook', () => {
    it('should execute prompt-type hook', async () => {
      const { executeHook } = await import('../hooks-loader.js');

      const context = {
        event: 'session_start' as const,
        hook: {
          type: 'prompt' as const,
          enabled: true,
          prompt: 'Welcome {{userName}}!',
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'moxie',
        data: { userName: 'Alice' },
      };

      const result = await executeHook(context);
      expect(result.success).toBe(true);
      expect(result.prompt).toBe('Welcome Alice!');
    });

    it('should skip disabled hooks', async () => {
      const { executeHook } = await import('../hooks-loader.js');

      const context = {
        event: 'session_start' as const,
        hook: {
          type: 'prompt' as const,
          enabled: false,
          prompt: 'This should not run',
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'moxie',
      };

      const result = await executeHook(context);
      expect(result.success).toBe(true);
      expect(result.prompt).toBeUndefined();
    });
  });

  describe('hasHook', () => {
    it('should return true for enabled hook', async () => {
      const { hasHook } = await import('../hooks-loader.js');

      const hooks = {
        session_start: {
          type: 'prompt' as const,
          enabled: true,
          prompt: 'Hello',
        },
      };

      expect(hasHook(hooks, 'session_start')).toBe(true);
    });

    it('should return false for disabled hook', async () => {
      const { hasHook } = await import('../hooks-loader.js');

      const hooks = {
        session_start: {
          type: 'prompt' as const,
          enabled: false,
          prompt: 'Hello',
        },
      };

      expect(hasHook(hooks, 'session_start')).toBe(false);
    });

    it('should return false for missing hook', async () => {
      const { hasHook } = await import('../hooks-loader.js');

      const hooks = {
        session_start: {
          type: 'prompt' as const,
          enabled: true,
          prompt: 'Hello',
        },
      };

      expect(hasHook(hooks, 'before_response')).toBe(false);
    });
  });

  describe('getHookPrompt', () => {
    it('should return prompt with substitutions', async () => {
      const { getHookPrompt } = await import('../hooks-loader.js');

      const hooks = {
        before_response: {
          type: 'prompt' as const,
          enabled: true,
          prompt: 'Remember: {{advice}}',
        },
      };

      const prompt = getHookPrompt(hooks, 'before_response', { advice: 'Be kind' });
      expect(prompt).toBe('Remember: Be kind');
    });

    it('should return null for non-prompt hook', async () => {
      const { getHookPrompt } = await import('../hooks-loader.js');

      const hooks = {
        on_handoff: {
          type: 'webhook' as const,
          enabled: true,
          webhook: 'https://example.com',
        },
      };

      const prompt = getHookPrompt(hooks, 'on_handoff');
      expect(prompt).toBeNull();
    });
  });

  describe('shell-type hooks', () => {
    it('should execute shell hook with success', async () => {
      const { executeHook } = await import('../hooks-loader.js');

      const context = {
        event: 'session_start' as const,
        hook: {
          type: 'shell' as const,
          enabled: true,
          command: 'echo "Welcome back!"',
          timeout: 5000,
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'moxie',
      };

      const result = await executeHook(context);
      expect(result.success).toBe(true);
      expect(result.prompt).toBe('Welcome back!');
    });

    it('should fail shell hook with no command', async () => {
      const { executeHook } = await import('../hooks-loader.js');

      const context = {
        event: 'session_start' as const,
        hook: {
          type: 'shell' as const,
          enabled: true,
          // No command provided
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'moxie',
      };

      const result = await executeHook(context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('No command configured');
    });

    it('should fail shell hook with non-zero exit code', async () => {
      const { executeHook } = await import('../hooks-loader.js');

      const context = {
        event: 'session_start' as const,
        hook: {
          type: 'shell' as const,
          enabled: true,
          command: 'exit 1', // Non-zero exit
          timeout: 5000,
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'moxie',
      };

      const result = await executeHook(context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Shell hook failed');
    });

    it('should pass environment variables to shell hook', async () => {
      const { executeHook } = await import('../hooks-loader.js');

      const context = {
        event: 'before_tool_call' as const,
        hook: {
          type: 'shell' as const,
          enabled: true,
          // Echo env vars set by hook executor
          command: 'echo "Event: $HOOK_EVENT, User: $HOOK_USER_ID"',
          timeout: 5000,
        },
        userId: 'test-user',
        sessionId: 'test-session',
        personaId: 'moxie',
        data: { toolName: 'myTool' },
      };

      const result = await executeHook(context);
      expect(result.success).toBe(true);
      expect(result.prompt).toContain('Event: before_tool_call');
      expect(result.prompt).toContain('User: test-user');
    });
  });
});

// =============================================================================
// LOCAL TOOLS LOADER TESTS
// =============================================================================

describe('Local Tools Loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeLocalTool', () => {
    it('should execute prompt-type tool', async () => {
      const { executeLocalTool } = await import('../local-tools-loader.js');

      const tool = {
        id: 'test-tool',
        name: 'testTool',
        description: 'A test tool',
        type: 'prompt' as const,
        prompt: 'Celebration: {{momentType}} achieved!',
        parameters: {},
      };

      const result = await executeLocalTool({
        tool,
        params: { momentType: 'milestone' },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'moxie',
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('Celebration: milestone achieved!');
    });

    it('should return error for script tool without filePath', async () => {
      const { executeLocalTool } = await import('../local-tools-loader.js');

      const tool = {
        id: 'test-tool',
        name: 'testTool',
        description: 'A test tool',
        type: 'script' as const,
        script: '/path/to/script.js',
        parameters: {},
      };

      const result = await executeLocalTool({
        tool,
        params: {},
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'moxie',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('filePath missing');
    });
  });
});

// =============================================================================
// ASSETS LOADER TESTS
// =============================================================================

describe('Assets Loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('themeToCSSVariables', () => {
    it('should convert theme to CSS variables', async () => {
      const { themeToCSSVariables } = await import('../assets-loader.js');

      const theme = {
        id: 'test-theme',
        name: 'Test Theme',
        colors: {
          primary: '#FF6B35',
          secondary: '#F7C59F',
          accent: '#EFEFD0',
          background: '#1A1A2E',
          text: '#FFFFFF',
          muted: '#A3A3A3',
        },
      };

      const css = themeToCSSVariables(theme, 'agent');

      expect(css).toContain('--agent-primary: #FF6B35');
      expect(css).toContain('--agent-secondary: #F7C59F');
      expect(css).toContain('--agent-accent: #EFEFD0');
      expect(css).toContain('--agent-background: #1A1A2E');
      expect(css).toContain('--agent-text: #FFFFFF');
      expect(css).toContain('--agent-muted: #A3A3A3');
    });

    it('should use default prefix (agent)', async () => {
      const { themeToCSSVariables } = await import('../assets-loader.js');

      const theme = {
        id: 'test',
        name: 'Test',
        colors: {
          primary: '#FF0000',
          secondary: '#00FF00',
          accent: '#0000FF',
        },
      };

      // Default prefix is 'agent' when not specified
      const css = themeToCSSVariables(theme);

      expect(css).toContain('--agent-primary: #FF0000');
    });
  });
});

// =============================================================================
// MCP LOADER TESTS
// =============================================================================

describe('MCP Loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAutoConnectServers', () => {
    it('should return servers with autoConnect true or undefined', async () => {
      const { getAutoConnectServers } = await import('../mcp-loader.js');

      const config = {
        servers: [
          { id: 'auto1', name: 'Auto 1', transport: 'stdio' as const, command: 'node' },
          {
            id: 'auto2',
            name: 'Auto 2',
            transport: 'http' as const,
            url: 'https://example.com',
            autoConnect: true,
          },
          {
            id: 'manual',
            name: 'Manual',
            transport: 'http' as const,
            url: 'https://example.com',
            autoConnect: false,
          },
        ],
      };

      const autoServers = getAutoConnectServers(config);
      expect(autoServers).toHaveLength(2);
      expect(autoServers.map((s) => s.id)).toContain('auto1');
      expect(autoServers.map((s) => s.id)).toContain('auto2');
      expect(autoServers.map((s) => s.id)).not.toContain('manual');
    });

    it('should return empty array for null config', async () => {
      const { getAutoConnectServers } = await import('../mcp-loader.js');
      const autoServers = getAutoConnectServers(null);
      expect(autoServers).toEqual([]);
    });
  });

  describe('findServer', () => {
    it('should find server by ID', async () => {
      const { findServer } = await import('../mcp-loader.js');

      const config = {
        servers: [
          {
            id: 'server1',
            name: 'Server 1',
            transport: 'http' as const,
            url: 'https://example1.com',
          },
          {
            id: 'server2',
            name: 'Server 2',
            transport: 'http' as const,
            url: 'https://example2.com',
          },
        ],
      };

      const server = findServer(config, 'server2');
      expect(server).not.toBeNull();
      expect(server?.name).toBe('Server 2');
    });

    it('should return null for unknown server', async () => {
      const { findServer } = await import('../mcp-loader.js');

      const config = {
        servers: [
          {
            id: 'server1',
            name: 'Server 1',
            transport: 'http' as const,
            url: 'https://example.com',
          },
        ],
      };

      const server = findServer(config, 'unknown');
      expect(server).toBeNull();
    });
  });
});

// =============================================================================
// EXTENSIBILITY INTEGRATION TESTS
// =============================================================================

describe('Extensibility Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('clearBundleCache', () => {
    it('should clear bundle cache', async () => {
      const { clearBundleCache } = await import('../extensibility-integration.js');
      // Should not throw
      expect(() => clearBundleCache()).not.toThrow();
      expect(() => clearBundleCache('test-persona')).not.toThrow();
    });
  });

  describe('onSessionStart', () => {
    it('should return null for persona without hooks', async () => {
      const { onSessionStart, clearBundleCache } = await import('../extensibility-integration.js');

      // Clear cache to ensure clean state
      clearBundleCache();

      const result = await onSessionStart({
        personaId: 'nonexistent-persona',
        userId: 'user-123',
        sessionId: 'session-456',
      });

      expect(result).toBeNull();
    });
  });

  describe('hasHook', () => {
    it('should return false for persona without hooks', async () => {
      const { hasHook, clearBundleCache } = await import('../extensibility-integration.js');

      clearBundleCache();

      const result = await hasHook('session_start', 'nonexistent-persona');
      expect(result).toBe(false);
    });
  });

  describe('getCommands', () => {
    it('should return empty array for persona without commands', async () => {
      const { getCommands, clearBundleCache } = await import('../extensibility-integration.js');

      clearBundleCache();

      const commands = await getCommands('nonexistent-persona');
      expect(commands).toEqual([]);
    });
  });

  describe('getAssets', () => {
    it('should return null for persona without assets', async () => {
      const { getAssets, clearBundleCache } = await import('../extensibility-integration.js');

      clearBundleCache();

      const assets = await getAssets('nonexistent-persona');
      expect(assets).toBeNull();
    });
  });
});
