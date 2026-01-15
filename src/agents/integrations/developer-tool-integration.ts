/**
 * Developer Tool Integration for Voice Agent
 *
 * Loads API-registered developer tools into the voice agent's tool registry.
 * This enables tools registered via the Developer Platform API to be callable
 * during voice conversations.
 *
 * Flow:
 *   1. Session starts with publisherId in metadata
 *   2. loadDeveloperTools(publisherId) is called
 *   3. Queries Firestore for enabled developer_tools
 *   4. Converts DeveloperTool → ToolDefinition
 *   5. Registers with toolRegistry
 *   6. LLM can now call these tools during conversation
 *
 * Usage:
 *   import { loadDeveloperTools, unloadDeveloperTools } from './developer-tool-integration.js';
 *
 *   // In session init (after tool refresh)
 *   const toolCount = await loadDeveloperTools(publisherId, sessionId);
 *
 *   // In cleanup (optional, for session-specific unload)
 *   await unloadDeveloperTools(sessionId);
 *
 * @module agents/integrations/developer-tool-integration
 */

import { getLogger } from '../../utils/safe-logger.js';
import { toolRegistry } from '../../tools/registry/index.js';
import type { ToolDefinition, Tool, ToolContext } from '../../tools/registry/types.js';
import type { DeveloperTool } from '../../api/v2/developers/shared/types.js';
import { COLLECTIONS } from '../../api/v2/developers/shared/types.js';

const log = getLogger().child({ module: 'developer-tool-integration' });

// Track which tools were registered per session (for cleanup)
const sessionToolRegistry = new Map<string, string[]>();

// ============================================================================
// TYPES
// ============================================================================

/** Context for loading developer tools */
export interface LoadDeveloperToolsContext {
  publisherId: string;
  sessionId?: string;
  personaId?: string;
}

/** Result of loading developer tools */
export interface LoadDeveloperToolsResult {
  success: boolean;
  toolsLoaded: number;
  toolNames: string[];
  errors?: string[];
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Load API-registered developer tools into the tool registry
 *
 * Call this from session-init-handler.ts after normal tool refresh.
 */
export async function loadDeveloperTools(
  ctx: LoadDeveloperToolsContext
): Promise<LoadDeveloperToolsResult> {
  const { publisherId, sessionId, personaId } = ctx;

  // Only load if publisherId is available (developer platform context)
  if (!publisherId) {
    log.debug({ sessionId }, 'No publisherId - skipping developer tools loading');
    return { success: true, toolsLoaded: 0, toolNames: [] };
  }

  try {
    // Query Firestore for enabled developer tools
    const tools = await fetchDeveloperTools(publisherId, personaId);

    if (tools.length === 0) {
      log.debug({ publisherId, sessionId }, 'No developer tools registered');
      return { success: true, toolsLoaded: 0, toolNames: [] };
    }

    const registeredTools: string[] = [];
    const errors: string[] = [];

    // Convert and register each tool
    for (const devTool of tools) {
      try {
        const toolDef = convertToToolDefinition(devTool);
        toolRegistry.register(toolDef);
        registeredTools.push(devTool.name);

        log.debug(
          { toolName: devTool.name, toolType: devTool.type, publisherId },
          'Registered developer tool'
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push(`${devTool.name}: ${err.message}`);
        log.warn(
          { toolName: devTool.name, error: err.message },
          'Failed to register developer tool'
        );
      }
    }

    // Track registered tools for session cleanup
    if (sessionId) {
      sessionToolRegistry.set(sessionId, registeredTools);
    }

    log.info(
      {
        publisherId,
        sessionId,
        toolsLoaded: registeredTools.length,
        toolNames: registeredTools,
        errorCount: errors.length,
      },
      'Developer tools loaded'
    );

    return {
      success: errors.length === 0,
      toolsLoaded: registeredTools.length,
      toolNames: registeredTools,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, publisherId }, 'Failed to load developer tools');
    return {
      success: false,
      toolsLoaded: 0,
      toolNames: [],
      errors: [err.message],
    };
  }
}

/**
 * Unload session-specific developer tools
 *
 * Call this from cleanup-handler.ts if needed.
 * Note: Tools are registered globally, so this only clears tracking.
 */
export async function unloadDeveloperTools(sessionId: string): Promise<void> {
  const tools = sessionToolRegistry.get(sessionId);
  if (tools) {
    // In a more sophisticated implementation, we might unregister
    // tools that were only used by this session
    sessionToolRegistry.delete(sessionId);
    log.debug({ sessionId, toolCount: tools.length }, 'Cleared developer tool tracking');
  }
}

// ============================================================================
// FIRESTORE QUERY
// ============================================================================

/**
 * Fetch enabled developer tools from Firestore
 */
async function fetchDeveloperTools(
  publisherId: string,
  personaId?: string
): Promise<DeveloperTool[]> {
  const { getFirestore } = await import('../../api/v1/developers/shared/developer-auth.js');
  const db = await getFirestore();

  // Query enabled tools for this publisher
  let query = db
    .collection(COLLECTIONS.TOOLS)
    .where('publisherId', '==', publisherId)
    .where('enabled', '==', true);

  // Optionally filter by personaId if provided
  // Note: Tools without personaId are global and should still be included
  // We need two queries to handle this properly

  const snapshot = await query.get();

  const tools: DeveloperTool[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() as Partial<DeveloperTool>;

    // Skip if personaId is set and doesn't match
    if (data.personaId && personaId && data.personaId !== personaId) {
      continue;
    }

    tools.push({
      id: doc.id,
      publisherId: data.publisherId || publisherId,
      personaId: data.personaId,
      name: data.name || 'unknown',
      displayName: data.displayName || data.name || 'Unknown Tool',
      description: data.description || '',
      llmDescription: data.llmDescription || data.description || '',
      type: data.type || 'webhook',
      config: data.config || {},
      parameters: data.parameters || { type: 'object', properties: {} },
      returns: data.returns,
      enabled: data.enabled ?? true,
      requiresAuth: data.requiresAuth ?? false,
      version: data.version || '1.0.0',
      createdAt: data.createdAt || new Date(),
      updatedAt: data.updatedAt || new Date(),
    });
  }

  return tools;
}

// ============================================================================
// CONVERSION
// ============================================================================

/**
 * Convert a DeveloperTool to a ToolDefinition for the registry
 */
function convertToToolDefinition(devTool: DeveloperTool): ToolDefinition {
  // Create a unique ID that includes the developer prefix
  const toolId = `dev_${devTool.name}`;

  return {
    id: toolId,
    name: devTool.displayName,
    description: devTool.description,
    domain: 'developer-custom',
    category: 'core',
    tags: ['developer-platform', 'api-registered', devTool.type],

    // Factory function to create the executable tool
    create: (_ctx: ToolContext): Tool => {
      return createExecutableTool(devTool);
    },
  };
}

/**
 * Create an executable tool from a DeveloperTool definition
 */
function createExecutableTool(devTool: DeveloperTool): Tool {
  return {
    // Use llmDescription for the LLM (more optimized for AI context)
    description: devTool.llmDescription || devTool.description,

    // Use the parameters schema from the developer's definition
    parameters: devTool.parameters,

    // The execution function
    execute: async (params: Record<string, unknown>): Promise<unknown> => {
      log.debug(
        { toolName: devTool.name, toolType: devTool.type, params },
        'Executing developer tool'
      );

      const startTime = Date.now();

      try {
        let result: unknown;

        switch (devTool.type) {
          case 'webhook':
            result = await executeWebhookTool(devTool, params);
            break;
          case 'mcp':
            result = await executeMCPTool(devTool, params);
            break;
          case 'prompt':
            result = executePromptTool(devTool, params);
            break;
          default:
            throw new Error(`Unknown tool type: ${devTool.type}`);
        }

        const executionTime = Date.now() - startTime;
        log.info({ toolName: devTool.name, executionTime }, 'Developer tool executed successfully');

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.error(
          { toolName: devTool.name, error: err.message },
          'Developer tool execution failed'
        );
        throw err;
      }
    },

    // Tool name for identification
    name: devTool.name,
  };
}

// ============================================================================
// TOOL EXECUTION
// ============================================================================

/**
 * Execute a webhook tool by calling its URL
 */
async function executeWebhookTool(
  tool: DeveloperTool,
  params: Record<string, unknown>
): Promise<unknown> {
  if (!tool.config.url) {
    throw new Error('Webhook URL not configured');
  }

  const method = tool.config.method || 'POST';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(tool.config.headers || {}),
  };

  const response = await fetch(tool.config.url, {
    method,
    headers,
    body: method !== 'GET' ? JSON.stringify(params) : undefined,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return await response.json();
  } else {
    return await response.text();
  }
}

/**
 * Execute an MCP tool by calling the registered MCP server
 */
async function executeMCPTool(
  tool: DeveloperTool,
  params: Record<string, unknown>
): Promise<unknown> {
  if (!tool.config.serverId || !tool.config.toolName) {
    throw new Error('MCP server or tool name not configured');
  }

  // Get the MCP server
  const { getDeveloperMCPServer } = await import('../../services/integrations/developer-mcp-registry.js');
  const server = await getDeveloperMCPServer(tool.config.serverId, tool.publisherId);

  if (!server) {
    throw new Error('MCP server not found');
  }

  // Connect and call
  const { callMCPTool, connectToMCPServer } = await import('../../personas/bundles/mcp-loader.js');

  const bundleServer = {
    id: server.serverId || server.name,
    name: server.name,
    transport: server.transport,
    command: server.command,
    args: server.args,
    url: server.endpoint,
    env: server.env,
    timeout: server.timeout,
  };

  const connection = await connectToMCPServer(bundleServer);
  if (connection.status !== 'connected') {
    throw new Error(`Failed to connect to MCP server: ${connection.error}`);
  }

  return await callMCPTool(bundleServer.id, tool.config.toolName, params);
}

/**
 * Execute a prompt tool by rendering the template
 */
function executePromptTool(tool: DeveloperTool, params: Record<string, unknown>): unknown {
  if (!tool.config.prompt) {
    throw new Error('Prompt not configured');
  }

  // Simple template interpolation
  let renderedPrompt = tool.config.prompt;

  for (const [key, value] of Object.entries(params)) {
    const placeholder = `{{${key}}}`;
    renderedPrompt = renderedPrompt.replace(new RegExp(placeholder, 'g'), String(value));
  }

  return {
    type: 'prompt',
    rendered: renderedPrompt,
    // Prompt tools return context that should be injected into the conversation
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  loadDeveloperTools,
  unloadDeveloperTools,
};
