/**
 * MCP Tool Integration for Agent Extensibility
 *
 * This module bridges MCP servers with the tool builder system.
 * It loads MCP tools from persona bundles and converts them into
 * LiveKit-compatible tool definitions.
 *
 * @module personas/bundles/mcp-integration
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  connectToMCPServer,
  disconnectAllMCPServers,
  disconnectFromMCPServer,
  getAutoConnectServers,
  getMCPConfig,
  getMCPConnection,
  getAllMCPConnections,
  callMCPTool,
  type MCPConnection,
} from './mcp-loader.js';
import type { BundleMCPConfig, BundleMCPServer } from './types/commands.js';

const log = getLogger();

// ============================================================================
// MCP TOOL INTEGRATION
// ============================================================================

/**
 * MCP tool definition compatible with the builder system
 */
export interface MCPToolDefinition {
  /** Tool name (prefixed with server ID) */
  name: string;
  /** Tool description from MCP server */
  description: string;
  /** JSON Schema for parameters */
  inputSchema?: unknown;
  /** Server ID this tool belongs to */
  serverId: string;
  /** Original tool name on the MCP server */
  originalName: string;
}

/**
 * Load MCP tools for a persona
 *
 * This connects to all auto-connect MCP servers defined in the persona's
 * mcp.json and returns tool definitions that can be integrated with the
 * main tool builder.
 */
export async function loadMCPToolsForPersona(
  personaId: string,
  bundlePath?: string
): Promise<MCPToolDefinition[]> {
  try {
    // Get MCP config (uses bundlePath if provided, otherwise looks up by personaId)
    let mcpConfig: BundleMCPConfig | null = null;

    if (bundlePath) {
      mcpConfig = await getMCPConfig(bundlePath);
    } else {
      // Try to get bundle path from loader
      const { loadBundleById } = await import('./loader.js');
      const bundle = await loadBundleById(personaId);
      if (bundle?.bundlePath) {
        mcpConfig = await getMCPConfig(bundle.bundlePath);
      }
    }

    if (!mcpConfig) {
      log.debug({ personaId }, 'No MCP config found for persona');
      return [];
    }

    const autoConnectServers = getAutoConnectServers(mcpConfig);
    if (autoConnectServers.length === 0) {
      log.debug({ personaId }, 'No auto-connect MCP servers configured');
      return [];
    }

    const tools: MCPToolDefinition[] = [];

    // Connect to each server and collect tools
    for (const server of autoConnectServers) {
      try {
        const connection = await connectToMCPServer(server);

        if (connection.status === 'connected' && connection.tools) {
          for (const tool of connection.tools) {
            tools.push({
              name: `mcp_${server.id}_${tool.name}`,
              description: tool.description || `MCP tool: ${tool.name}`,
              inputSchema: tool.inputSchema,
              serverId: server.id,
              originalName: tool.name,
            });
          }

          log.info(
            { personaId, serverId: server.id, toolCount: connection.tools.length },
            'MCP server tools loaded'
          );
        } else if (connection.status === 'error') {
          log.warn(
            { personaId, serverId: server.id, error: connection.error },
            'MCP server connection failed, skipping'
          );
        }
      } catch (error) {
        log.error(
          { personaId, serverId: server.id, error: String(error) },
          'Failed to connect to MCP server'
        );
      }
    }

    log.info(
      { personaId, totalTools: tools.length, servers: autoConnectServers.length },
      'MCP tools loaded for persona'
    );

    return tools;
  } catch (error) {
    log.error({ personaId, error: String(error) }, 'Failed to load MCP tools');
    return [];
  }
}

/**
 * Build LiveKit-compatible tools from MCP tool definitions
 *
 * This creates llm.tool() instances that delegate to MCP servers
 */
export async function buildMCPTools(
  personaId: string,
  bundlePath?: string
): Promise<Record<string, unknown>> {
  const mcpToolDefs = await loadMCPToolsForPersona(personaId, bundlePath);

  if (mcpToolDefs.length === 0) {
    return {};
  }

  try {
    const { llm } = await import('@livekit/agents');
    const { z } = await import('zod');

    const tools: Record<string, unknown> = {};

    for (const toolDef of mcpToolDefs) {
      // Create a generic parameter schema that accepts any object
      // The MCP server handles validation based on inputSchema
      const paramSchema = z.object({}).passthrough();

      tools[toolDef.name] = llm.tool({
        description: toolDef.description,
        parameters: paramSchema,
        execute: async (params: Record<string, unknown>) => {
          try {
            const result = await callMCPTool(
              toolDef.serverId,
              toolDef.originalName,
              params
            );

            // Return result as string for the LLM
            if (typeof result === 'string') {
              return result;
            }
            return JSON.stringify(result);
          } catch (error) {
            log.error(
              {
                serverId: toolDef.serverId,
                toolName: toolDef.originalName,
                error: String(error),
              },
              'MCP tool execution failed'
            );
            return `I encountered an issue while using this tool. Let me try a different approach.`;
          }
        },
      });
    }

    log.info(
      { personaId, mcpToolCount: Object.keys(tools).length },
      'MCP tools built for persona'
    );

    return tools;
  } catch (error) {
    log.error({ personaId, error: String(error) }, 'Failed to build MCP tools');
    return {};
  }
}

// ============================================================================
// CONNECTION LIFECYCLE MANAGEMENT
// ============================================================================

/**
 * Initialize MCP connections for a persona
 *
 * Call this when a session starts to connect to all auto-connect servers
 */
export async function initializeMCPConnections(
  personaId: string,
  bundlePath?: string
): Promise<{ connected: string[]; failed: string[] }> {
  const result = { connected: [] as string[], failed: [] as string[] };

  try {
    let mcpConfig: BundleMCPConfig | null = null;

    if (bundlePath) {
      mcpConfig = await getMCPConfig(bundlePath);
    } else {
      const { loadBundleById } = await import('./loader.js');
      const bundle = await loadBundleById(personaId);
      if (bundle?.bundlePath) {
        mcpConfig = await getMCPConfig(bundle.bundlePath);
      }
    }

    if (!mcpConfig) {
      return result;
    }

    const autoConnectServers = getAutoConnectServers(mcpConfig);

    for (const server of autoConnectServers) {
      try {
        const connection = await connectToMCPServer(server);
        if (connection.status === 'connected') {
          result.connected.push(server.id);
        } else {
          result.failed.push(server.id);
        }
      } catch {
        result.failed.push(server.id);
      }
    }

    log.info(
      {
        personaId,
        connected: result.connected.length,
        failed: result.failed.length,
      },
      'MCP connections initialized'
    );
  } catch (error) {
    log.error({ personaId, error: String(error) }, 'Failed to initialize MCP connections');
  }

  return result;
}

/**
 * Cleanup MCP connections
 *
 * Call this when a session ends or when switching personas
 */
export async function cleanupMCPConnections(): Promise<void> {
  try {
    await disconnectAllMCPServers();
    log.info('MCP connections cleaned up');
  } catch (error) {
    log.error({ error: String(error) }, 'Error cleaning up MCP connections');
  }
}

/**
 * Get current MCP connection status
 *
 * Returns status of all active MCP connections from the mcp-loader.
 */
export function getMCPConnectionStatus(): Array<{
  serverId: string;
  status: string;
  toolCount: number;
  error?: string;
}> {
  try {
    const connections = getAllMCPConnections();

    return connections.map((conn) => ({
      serverId: conn.serverId,
      status: conn.status,
      toolCount: conn.tools?.length ?? 0,
      error: conn.error,
    }));
  } catch (error) {
    log.warn({ error: String(error) }, 'Error getting MCP connection status');
    return [];
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  loadMCPToolsForPersona,
  buildMCPTools,
  initializeMCPConnections,
  cleanupMCPConnections,
  getMCPConnectionStatus,
};

// Re-export MCP loader functions for convenience
export {
  connectToMCPServer,
  disconnectFromMCPServer,
  disconnectAllMCPServers,
  getMCPConnection,
  callMCPTool,
};
