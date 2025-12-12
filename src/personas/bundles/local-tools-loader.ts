/**
 * Agent Local Tools Loader
 *
 * Loads agent-specific tools from the tools/ directory.
 * These tools are bundled with the agent and extend its capabilities
 * beyond the standard Ferni tool registry.
 *
 * Tool types:
 * - prompt: Injects a prompt into the conversation (simplest)
 * - script: Runs a TypeScript/JavaScript file
 * - webhook: Calls an external HTTP endpoint
 * - mcp: Delegates to an MCP server (Phase 5)
 *
 * Example tool file (tools/calculate-streak.json):
 * ```json
 * {
 *   "id": "calculate-streak",
 *   "name": "calculateStreak",
 *   "description": "Calculate the user's current streak for a habit",
 *   "type": "prompt",
 *   "parameters": {
 *     "type": "object",
 *     "properties": {
 *       "habitName": { "type": "string", "description": "The habit to check" }
 *     },
 *     "required": ["habitName"]
 *   },
 *   "prompt": "Calculate and display the streak for {{habitName}}. Show encouraging message based on streak length."
 * }
 * ```
 *
 * @module personas/bundles/local-tools-loader
 */

import { readFile, readdir, stat } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { getLogger } from '../../utils/safe-logger.js';
import type { BundleLocalTool, BundleLocalToolsIndex } from './types/commands.js';

const log = getLogger();

// ============================================================================
// TOOL LOADER
// ============================================================================

/**
 * Load a single tool from a JSON file
 */
export async function loadLocalTool(filePath: string): Promise<BundleLocalTool | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const tool = JSON.parse(content) as BundleLocalTool;

    // Validate required fields
    if (!tool.id || !tool.name || !tool.description || !tool.type) {
      log.warn({ filePath }, 'Invalid tool: missing required fields');
      return null;
    }

    // Validate type
    const validTypes = ['prompt', 'script', 'webhook', 'mcp'];
    if (!validTypes.includes(tool.type)) {
      log.warn({ filePath, type: tool.type }, 'Invalid tool type');
      return null;
    }

    tool.filePath = filePath;
    return tool;
  } catch (error) {
    log.error({ error, filePath }, 'Failed to load local tool');
    return null;
  }
}

/**
 * Load all tools from a tools directory
 */
export async function loadLocalTools(toolsDir: string): Promise<BundleLocalTool[]> {
  const tools: BundleLocalTool[] = [];

  try {
    // Check if directory exists
    const dirStat = await stat(toolsDir).catch(() => null);
    if (!dirStat?.isDirectory()) {
      return tools;
    }

    // Check for index file first
    const indexPath = join(toolsDir, '_index.json');
    const indexStat = await stat(indexPath).catch(() => null);

    if (indexStat?.isFile()) {
      // Load from index
      const indexContent = await readFile(indexPath, 'utf-8');
      const index: BundleLocalToolsIndex = JSON.parse(indexContent);

      for (const ref of index.tools) {
        if (ref.enabled === false) continue;

        const toolPath = join(toolsDir, ref.file);
        const tool = await loadLocalTool(toolPath);
        if (tool) {
          // Override with index metadata
          tool.name = ref.name || tool.name;
          tool.description = ref.description || tool.description;
          tools.push(tool);
        }
      }
    } else {
      // Scan directory for JSON files
      const files = await readdir(toolsDir);
      for (const file of files) {
        if (!file.endsWith('.json') || file.startsWith('_')) continue;

        const toolPath = join(toolsDir, file);
        const tool = await loadLocalTool(toolPath);
        if (tool) {
          tools.push(tool);
        }
      }
    }

    log.info({ toolsDir, count: tools.length }, 'Loaded agent local tools');
    return tools;
  } catch (error) {
    log.error({ error, toolsDir }, 'Failed to load local tools');
    return tools;
  }
}

/**
 * Load local tools for a persona bundle
 */
export async function loadBundleLocalTools(bundlePath: string): Promise<BundleLocalTool[]> {
  const toolsDir = join(bundlePath, 'tools');
  return loadLocalTools(toolsDir);
}

// ============================================================================
// TOOL EXECUTION
// ============================================================================

export interface LocalToolExecutionContext {
  tool: BundleLocalTool;
  params: Record<string, unknown>;
  userId: string;
  sessionId: string;
  personaId: string;
}

export interface LocalToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Execute a prompt-type tool (returns the rendered prompt)
 */
function executePromptTool(tool: BundleLocalTool, params: Record<string, unknown>): string {
  let prompt = tool.prompt || '';

  // Substitute {{param}} placeholders
  for (const [key, value] of Object.entries(params)) {
    const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    prompt = prompt.replace(placeholder, String(value));
  }

  return prompt.trim();
}

/**
 * Execute a webhook-type tool
 */
async function executeWebhookTool(
  tool: BundleLocalTool,
  params: Record<string, unknown>,
  context: LocalToolExecutionContext
): Promise<unknown> {
  if (!tool.webhook) {
    throw new Error('Webhook URL not configured');
  }

  const response = await fetch(tool.webhook, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tool: tool.id,
      params,
      context: {
        userId: context.userId,
        sessionId: context.sessionId,
        personaId: context.personaId,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function getBundlePathFromToolFilePath(filePath: string | undefined): string | null {
  if (!filePath) return null;
  // Expected shape: <bundlePath>/tools/<tool>.json
  // So bundlePath is parent of the "tools" directory.
  const toolsDir = dirname(filePath);
  return dirname(toolsDir);
}

async function executeScriptTool(
  tool: BundleLocalTool,
  params: Record<string, unknown>,
  context: LocalToolExecutionContext
): Promise<unknown> {
  if (!tool.script) {
    throw new Error('Script path not configured');
  }

  if (!tool.filePath) {
    throw new Error('Tool filePath missing (cannot resolve script location safely)');
  }

  const bundlePath = getBundlePathFromToolFilePath(tool.filePath);
  if (!bundlePath) {
    throw new Error('Could not resolve bundle path for script tool');
  }

  // Resolve script relative to the tool JSON file directory
  const scriptPath = resolve(dirname(tool.filePath), tool.script);

  // Basic safety: only allow scripts inside the bundle directory
  const normalizedBundle = resolve(bundlePath);
  const normalizedScript = resolve(scriptPath);
  if (!normalizedScript.startsWith(normalizedBundle + '/')) {
    throw new Error('Script path escapes bundle directory (blocked)');
  }

  // Only allow JS modules (TypeScript would require a sandbox/runner)
  if (!normalizedScript.endsWith('.js') && !normalizedScript.endsWith('.mjs')) {
    throw new Error('Script tools must reference a .js or .mjs module');
  }

  const mod = (await import(pathToFileURL(normalizedScript).toString())) as unknown;

  const runFn =
    typeof (mod as { run?: unknown }).run === 'function'
      ? ((mod as { run: (p: unknown, c: unknown) => unknown }).run as (
          p: unknown,
          c: unknown
        ) => unknown)
      : typeof (mod as { default?: unknown }).default === 'function'
        ? ((mod as { default: (p: unknown, c: unknown) => unknown }).default as (
            p: unknown,
            c: unknown
          ) => unknown)
        : null;

  if (!runFn) {
    throw new Error(
      'Script module must export a run(params, context) function (or default export)'
    );
  }

  // Enforce a soft timeout (non-cancelable) to prevent hangs
  const timeoutMs = 15000;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error('Script tool timed out')), timeoutMs);
  });

  return await Promise.race([Promise.resolve(runFn(params, context)), timeoutPromise]);
}

async function executeMcpTool(
  tool: BundleLocalTool,
  params: Record<string, unknown>
): Promise<unknown> {
  if (!tool.mcp?.server || !tool.mcp.tool) {
    throw new Error('MCP tool reference not configured');
  }

  if (!tool.filePath) {
    throw new Error('Tool filePath missing (cannot resolve MCP config location)');
  }

  const bundlePath = getBundlePathFromToolFilePath(tool.filePath);
  if (!bundlePath) {
    throw new Error('Could not resolve bundle path for MCP tool');
  }

  const { connectToMCPServer, findServer, getMCPConfig, callMCPTool } =
    await import('./mcp-loader.js');

  const config = await getMCPConfig(bundlePath);
  const server = findServer(config, tool.mcp.server);
  if (!server) {
    throw new Error(`MCP server not found in bundle config: ${tool.mcp.server}`);
  }

  const connection = await connectToMCPServer(server);
  if (connection.status !== 'connected') {
    throw new Error(connection.error || `MCP server connection failed: ${server.id}`);
  }

  return await callMCPTool(server.id, tool.mcp.tool, params);
}

/**
 * Execute a local tool
 */
export async function executeLocalTool(
  context: LocalToolExecutionContext
): Promise<LocalToolExecutionResult> {
  const { tool, params } = context;

  try {
    switch (tool.type) {
      case 'prompt': {
        const result = executePromptTool(tool, params);
        return { success: true, result };
      }

      case 'webhook': {
        const result = await executeWebhookTool(tool, params, context);
        return { success: true, result };
      }

      case 'script': {
        const result = await executeScriptTool(tool, params, context);
        return { success: true, result };
      }

      case 'mcp': {
        const result = await executeMcpTool(tool, params);
        return { success: true, result };
      }

      default:
        return {
          success: false,
          error: `Unknown tool type: ${tool.type}`,
        };
    }
  } catch (error) {
    log.error({ error, toolId: tool.id }, 'Failed to execute local tool');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// TOOL CACHE
// ============================================================================

const toolCache = new Map<string, BundleLocalTool[]>();

/**
 * Get local tools for a bundle (with caching)
 */
export async function getLocalTools(
  bundlePath: string,
  forceReload = false
): Promise<BundleLocalTool[]> {
  if (!forceReload && toolCache.has(bundlePath)) {
    return toolCache.get(bundlePath)!;
  }

  const tools = await loadBundleLocalTools(bundlePath);
  toolCache.set(bundlePath, tools);
  return tools;
}

/**
 * Clear tool cache for a bundle
 */
export function clearLocalToolCache(bundlePath?: string): void {
  if (bundlePath) {
    toolCache.delete(bundlePath);
  } else {
    toolCache.clear();
  }
}

/**
 * Find a tool by ID
 */
export async function findLocalTool(
  bundlePath: string,
  toolId: string
): Promise<BundleLocalTool | null> {
  const tools = await getLocalTools(bundlePath);
  return tools.find((t) => t.id === toolId) || null;
}

// ============================================================================
// TOOL REGISTRY INTEGRATION
// ============================================================================

/**
 * Convert a local tool to a function definition for LLM tool calling
 */
export function localToolToFunctionDefinition(tool: BundleLocalTool): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters || {
      type: 'object',
      properties: {},
    },
  };
}

/**
 * Get function definitions for all local tools
 */
export async function getLocalToolDefinitions(
  bundlePath: string
): Promise<Array<{ name: string; description: string; parameters: Record<string, unknown> }>> {
  const tools = await getLocalTools(bundlePath);
  return tools.map(localToolToFunctionDefinition);
}

export default {
  loadLocalTool,
  loadLocalTools,
  loadBundleLocalTools,
  executeLocalTool,
  getLocalTools,
  clearLocalToolCache,
  findLocalTool,
  localToolToFunctionDefinition,
  getLocalToolDefinitions,
};
