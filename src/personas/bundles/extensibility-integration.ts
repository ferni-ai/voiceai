/**
 * Agent Extensibility Integration Service
 *
 * This service wires the extensibility system (commands, tools, hooks, assets)
 * into the agent execution flow. It provides:
 *
 * 1. Hook execution at lifecycle points (session_start, before_response, etc.)
 * 2. Local tool loading and merging with the tool registry
 * 3. Asset/theme access for UI customization
 * 4. Command invocation mechanism
 *
 * @module personas/bundles/extensibility-integration
 */

import { getLogger } from '../../utils/safe-logger.js';
import { loadBundleById } from './loader.js';
import type { LoadedPersonaBundle } from './types/loaded.js';
import type {
  BundleCommand,
  BundleLocalTool,
  BundleAgentHooks,
  BundleAssets,
  HookEventType,
  HookExecutionContext,
  HookExecutionResult,
} from './types/commands.js';

const log = getLogger();

// ============================================================================
// EXTENSIBILITY CONTEXT
// ============================================================================

/**
 * Context passed to extensibility operations
 */
export interface ExtensibilityContext {
  personaId: string;
  userId?: string;
  sessionId?: string;
  bundlePath?: string;
}

/**
 * Cached bundle references per persona
 */
const bundleCache = new Map<string, LoadedPersonaBundle>();

/**
 * Get or load a persona bundle (cached)
 */
async function getBundle(personaId: string): Promise<LoadedPersonaBundle | null> {
  if (bundleCache.has(personaId)) {
    return bundleCache.get(personaId)!;
  }

  const bundle = await loadBundleById(personaId);
  if (bundle) {
    bundleCache.set(personaId, bundle);
  }
  return bundle;
}

/**
 * Clear bundle cache (useful for hot-reloading)
 */
export function clearBundleCache(personaId?: string): void {
  if (personaId) {
    bundleCache.delete(personaId);
  } else {
    bundleCache.clear();
  }
}

// ============================================================================
// HOOK EXECUTION
// ============================================================================

/**
 * Execute a hook for a persona at a specific lifecycle point
 *
 * Returns the hook result (prompt to inject, or null if no hook)
 */
export async function executeHook(
  event: HookEventType,
  ctx: ExtensibilityContext & Partial<HookExecutionContext>
): Promise<HookExecutionResult | null> {
  try {
    const bundle = await getBundle(ctx.personaId);
    if (!bundle?.getHooks) {
      return null;
    }

    const hooks = await bundle.getHooks();
    if (!hooks) {
      return null;
    }

    const hook = hooks[event];
    if (!hook || hook.enabled === false) {
      return null;
    }

    log.debug({ event, personaId: ctx.personaId }, 'Executing extensibility hook');

    // NOTE: hooks-loader.js removed - hooks extensibility system not yet implemented
    // Return null to indicate no hook was executed
    log.warn({ event, personaId: ctx.personaId }, 'Hooks system not implemented - skipping');
    return null;
  } catch (error) {
    log.error({ error, event, personaId: ctx.personaId }, 'Failed to execute hook');
    return null;
  }
}

/**
 * Get the prompt from a hook (if it's a prompt-type hook)
 */
export async function getHookPrompt(
  event: HookEventType,
  personaId: string
): Promise<string | null> {
  try {
    const bundle = await getBundle(personaId);
    if (!bundle?.getHooks) {
      return null;
    }

    const hooks = await bundle.getHooks();
    if (!hooks) {
      return null;
    }

    const hook = hooks[event];
    if (!hook || !hook.enabled || hook.type !== 'prompt') {
      return null;
    }

    return hook.prompt || null;
  } catch (error) {
    log.error({ error, event, personaId }, 'Failed to get hook prompt');
    return null;
  }
}

/**
 * Check if a persona has a specific hook enabled
 */
export async function hasHook(event: HookEventType, personaId: string): Promise<boolean> {
  try {
    const bundle = await getBundle(personaId);
    if (!bundle?.getHooks) {
      return false;
    }

    const hooks = await bundle.getHooks();
    if (!hooks) {
      return false;
    }

    const hook = hooks[event];
    return hook?.enabled === true;
  } catch {
    return false;
  }
}

// ============================================================================
// LOCAL TOOLS
// ============================================================================

/**
 * Get local tools for a persona, formatted for the LLM
 *
 * Returns tool definitions that can be merged with the main tool registry
 */
export async function getLocalToolDefinitions(
  personaId: string
): Promise<Array<{ name: string; description: string; parameters: Record<string, unknown> }>> {
  try {
    const bundle = await getBundle(personaId);
    if (!bundle?.getLocalTools) {
      return [];
    }

    const tools = await bundle.getLocalTools();
    if (!tools || tools.length === 0) {
      return [];
    }

    // Convert to LLM tool format
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  } catch (error) {
    log.error({ error, personaId }, 'Failed to get local tool definitions');
    return [];
  }
}

/**
 * Execute a local tool by name
 */
export async function executeLocalTool(
  personaId: string,
  toolName: string,
  params: Record<string, unknown>,
  ctx: { userId?: string; sessionId?: string }
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const bundle = await getBundle(personaId);
    if (!bundle?.getLocalTools) {
      return { success: false, error: 'No local tools available' };
    }

    const tools = await bundle.getLocalTools();
    const tool = tools.find((t) => t.name === toolName);
    if (!tool) {
      return { success: false, error: `Tool not found: ${toolName}` };
    }

    const { executeLocalTool: execTool } = await import('./local-tools-loader.js');
    return await execTool({
      tool,
      params,
      userId: ctx.userId || 'unknown',
      sessionId: ctx.sessionId || 'unknown',
      personaId,
    });
  } catch (error) {
    log.error({ error, personaId, toolName }, 'Failed to execute local tool');
    return { success: false, error: String(error) };
  }
}

/**
 * Check if a tool name is a local tool for this persona
 */
export async function isLocalTool(personaId: string, toolName: string): Promise<boolean> {
  try {
    const bundle = await getBundle(personaId);
    if (!bundle?.getLocalTools) {
      return false;
    }

    const tools = await bundle.getLocalTools();
    return tools.some((t) => t.name === toolName);
  } catch {
    return false;
  }
}

// ============================================================================
// COMMANDS
// ============================================================================

/**
 * Get all commands for a persona
 */
export async function getCommands(personaId: string): Promise<BundleCommand[]> {
  try {
    const bundle = await getBundle(personaId);
    if (!bundle?.getCommands) {
      return [];
    }
    return await bundle.getCommands();
  } catch (error) {
    log.error({ error, personaId }, 'Failed to get commands');
    return [];
  }
}

/**
 * Get a specific command by ID or name
 */
export async function getCommand(
  personaId: string,
  commandIdOrName: string
): Promise<BundleCommand | null> {
  const commands = await getCommands(personaId);
  return (
    commands.find(
      (c) => c.id === commandIdOrName || c.name.toLowerCase() === commandIdOrName.toLowerCase()
    ) || null
  );
}

/**
 * Execute a command, returning the prompt to inject
 */
export async function executeCommand(
  personaId: string,
  commandIdOrName: string,
  args: Record<string, string> = {},
  ctx: { userId?: string; sessionId?: string }
): Promise<{ success: boolean; prompt?: string; error?: string }> {
  try {
    const command = await getCommand(personaId, commandIdOrName);
    if (!command) {
      return { success: false, error: `Command not found: ${commandIdOrName}` };
    }

    const { executeCommand: execCmd } = await import('./command-loader.js');
    const result = await execCmd({
      command,
      args,
      userId: ctx.userId || 'unknown',
      sessionId: ctx.sessionId || 'unknown',
      personaId,
    });

    // Execute on_command hook if present
    await executeHook('on_command', {
      personaId,
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      commandId: command.id,
      commandArgs: args,
    });

    return result;
  } catch (error) {
    log.error({ error, personaId, commandIdOrName }, 'Failed to execute command');
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// ASSETS
// ============================================================================

/**
 * Get assets (theme, sounds, icons) for a persona
 */
export async function getAssets(personaId: string): Promise<BundleAssets | null> {
  try {
    const bundle = await getBundle(personaId);
    if (!bundle?.getAssets) {
      return null;
    }
    return await bundle.getAssets();
  } catch (error) {
    log.error({ error, personaId }, 'Failed to get assets');
    return null;
  }
}

/**
 * Get theme CSS variables for a persona
 */
export async function getThemeCSS(personaId: string, prefix = 'agent'): Promise<string | null> {
  try {
    // NOTE: assets-loader.js removed - theme CSS generation not yet implemented
    // Return null to indicate no CSS was generated
    return null;
  } catch (error) {
    log.error({ error, personaId }, 'Failed to get theme CSS');
    return null;
  }
}

// ============================================================================
// LIFECYCLE INTEGRATION HELPERS
// ============================================================================

/**
 * Called when a session starts - executes session_start hook
 */
export async function onSessionStart(ctx: ExtensibilityContext): Promise<string | null> {
  const result = await executeHook('session_start', ctx);
  return result?.prompt || null;
}

/**
 * Called before generating a response - executes before_response hook
 */
export async function onBeforeResponse(ctx: ExtensibilityContext): Promise<string | null> {
  const result = await executeHook('before_response', ctx);
  return result?.prompt || null;
}

/**
 * Called after generating a response - executes after_response hook
 */
export async function onAfterResponse(ctx: ExtensibilityContext): Promise<void> {
  await executeHook('after_response', ctx);
}

/**
 * Called before a tool is executed - executes before_tool_call hook
 */
export async function onBeforeToolCall(
  ctx: ExtensibilityContext & { toolName: string; toolParams: Record<string, unknown> }
): Promise<string | null> {
  const result = await executeHook('before_tool_call', ctx);
  return result?.prompt || null;
}

/**
 * Called after a tool is executed - executes after_tool_call hook
 */
export async function onAfterToolCall(
  ctx: ExtensibilityContext & { toolName: string; toolResult: unknown }
): Promise<void> {
  await executeHook('after_tool_call', ctx);
}

/**
 * Called when a handoff occurs - executes on_handoff hook
 */
export async function onHandoff(
  ctx: ExtensibilityContext & { targetPersonaId: string }
): Promise<void> {
  await executeHook('on_handoff', ctx);
}

/**
 * Called when a session ends - executes session_end hook
 */
export async function onSessionEnd(ctx: ExtensibilityContext): Promise<void> {
  await executeHook('session_end', ctx);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Cache management
  clearBundleCache,

  // Hook execution
  executeHook,
  getHookPrompt,
  hasHook,

  // Lifecycle helpers
  onSessionStart,
  onBeforeResponse,
  onAfterResponse,
  onBeforeToolCall,
  onAfterToolCall,
  onHandoff,
  onSessionEnd,

  // Local tools
  getLocalToolDefinitions,
  executeLocalTool,
  isLocalTool,

  // Commands
  getCommands,
  getCommand,
  executeCommand,

  // Assets
  getAssets,
  getThemeCSS,
};
