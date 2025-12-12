/**
 * Local Tools Loader - Execution Tests
 *
 * Ensures local tools of type:
 * - script: executes a bundled JS module safely
 * - mcp: delegates to MCP loader integration
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

const mockGetMCPConfig = vi.fn(async () => ({
  servers: [{ id: 'srv1', transport: 'stdio', command: 'node' }],
}));
const mockFindServer = vi.fn((_cfg: unknown, serverId: string) =>
  serverId === 'srv1' ? ({ id: 'srv1', transport: 'stdio', command: 'node' } as const) : null
);
const mockConnectToMCPServer = vi.fn(async () => ({
  status: 'connected' as const,
  serverId: 'srv1',
}));
const mockCallMCPTool = vi.fn(async () => 'mcp-result');

vi.mock('../personas/bundles/mcp-loader.js', () => ({
  getMCPConfig: (...args: unknown[]) => mockGetMCPConfig(...args),
  findServer: (...args: unknown[]) => mockFindServer(...args),
  connectToMCPServer: (...args: unknown[]) => mockConnectToMCPServer(...args),
  callMCPTool: (...args: unknown[]) => mockCallMCPTool(...args),
}));

import { executeLocalTool } from '../personas/bundles/local-tools-loader.js';

describe('Local tools execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes a script tool from inside the bundle', async () => {
    const toolFilePath =
      '/Users/sethford/Documents/voiceai/src/personas/bundles/__tests__/fixtures/test-bundle/tools/tool.json';

    const result = await executeLocalTool({
      tool: {
        id: 'echo',
        name: 'echo',
        description: 'echo params',
        type: 'script',
        parameters: { type: 'object', properties: {} },
        script: './echo.mjs',
        filePath: toolFilePath,
      },
      params: { a: 1 },
      userId: 'user-1',
      sessionId: 'session-1',
      personaId: 'ferni',
    });

    expect(result.success).toBe(true);
    expect(result.result).toEqual(
      expect.objectContaining({
        ok: true,
        params: { a: 1 },
        context: expect.objectContaining({
          userId: 'user-1',
          sessionId: 'session-1',
          personaId: 'ferni',
          toolId: 'echo',
        }),
      })
    );
  });

  it('delegates MCP tool execution through mcp-loader', async () => {
    const toolFilePath =
      '/Users/sethford/Documents/voiceai/src/personas/bundles/__tests__/fixtures/test-bundle/tools/tool.json';

    const result = await executeLocalTool({
      tool: {
        id: 'mcpTool',
        name: 'mcpTool',
        description: 'mcp tool',
        type: 'mcp',
        parameters: { type: 'object', properties: {} },
        mcp: { server: 'srv1', tool: 'do_thing' },
        filePath: toolFilePath,
      },
      params: { q: 'x' },
      userId: 'user-1',
      sessionId: 'session-1',
      personaId: 'ferni',
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe('mcp-result');
    expect(mockCallMCPTool).toHaveBeenCalledWith('srv1', 'do_thing', { q: 'x' });
  });
});
