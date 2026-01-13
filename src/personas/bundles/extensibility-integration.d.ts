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
import type { BundleCommand, BundleAssets, HookEventType, HookExecutionContext, HookExecutionResult } from './types/commands.js';
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
 * Clear bundle cache (useful for hot-reloading)
 */
export declare function clearBundleCache(personaId?: string): void;
/**
 * Execute a hook for a persona at a specific lifecycle point
 *
 * Returns the hook result (prompt to inject, or null if no hook)
 */
export declare function executeHook(event: HookEventType, ctx: ExtensibilityContext & Partial<HookExecutionContext>): Promise<HookExecutionResult | null>;
/**
 * Get the prompt from a hook (if it's a prompt-type hook)
 */
export declare function getHookPrompt(event: HookEventType, personaId: string): Promise<string | null>;
/**
 * Check if a persona has a specific hook enabled
 */
export declare function hasHook(event: HookEventType, personaId: string): Promise<boolean>;
/**
 * Get local tools for a persona, formatted for the LLM
 *
 * Returns tool definitions that can be merged with the main tool registry
 */
export declare function getLocalToolDefinitions(personaId: string): Promise<Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}>>;
/**
 * Execute a local tool by name
 */
export declare function executeLocalTool(personaId: string, toolName: string, params: Record<string, unknown>, ctx: {
    userId?: string;
    sessionId?: string;
}): Promise<{
    success: boolean;
    result?: unknown;
    error?: string;
}>;
/**
 * Check if a tool name is a local tool for this persona
 */
export declare function isLocalTool(personaId: string, toolName: string): Promise<boolean>;
/**
 * Get all commands for a persona
 */
export declare function getCommands(personaId: string): Promise<BundleCommand[]>;
/**
 * Get a specific command by ID or name
 */
export declare function getCommand(personaId: string, commandIdOrName: string): Promise<BundleCommand | null>;
/**
 * Execute a command, returning the prompt to inject
 */
export declare function executeCommand(personaId: string, commandIdOrName: string, args: Record<string, string> | undefined, ctx: {
    userId?: string;
    sessionId?: string;
}): Promise<{
    success: boolean;
    prompt?: string;
    error?: string;
}>;
/**
 * Get assets (theme, sounds, icons) for a persona
 */
export declare function getAssets(personaId: string): Promise<BundleAssets | null>;
/**
 * Get theme CSS variables for a persona
 */
export declare function getThemeCSS(personaId: string, prefix?: string): Promise<string | null>;
/**
 * Called when a session starts - executes session_start hook
 */
export declare function onSessionStart(ctx: ExtensibilityContext): Promise<string | null>;
/**
 * Called before generating a response - executes before_response hook
 */
export declare function onBeforeResponse(ctx: ExtensibilityContext): Promise<string | null>;
/**
 * Called after generating a response - executes after_response hook
 */
export declare function onAfterResponse(ctx: ExtensibilityContext): Promise<void>;
/**
 * Called before a tool is executed - executes before_tool_call hook
 */
export declare function onBeforeToolCall(ctx: ExtensibilityContext & {
    toolName: string;
    toolParams: Record<string, unknown>;
}): Promise<string | null>;
/**
 * Called after a tool is executed - executes after_tool_call hook
 */
export declare function onAfterToolCall(ctx: ExtensibilityContext & {
    toolName: string;
    toolResult: unknown;
}): Promise<void>;
/**
 * Called when a handoff occurs - executes on_handoff hook
 */
export declare function onHandoff(ctx: ExtensibilityContext & {
    targetPersonaId: string;
}): Promise<void>;
/**
 * Called when a session ends - executes session_end hook
 */
export declare function onSessionEnd(ctx: ExtensibilityContext): Promise<void>;
declare const _default: {
    clearBundleCache: typeof clearBundleCache;
    executeHook: typeof executeHook;
    getHookPrompt: typeof getHookPrompt;
    hasHook: typeof hasHook;
    onSessionStart: typeof onSessionStart;
    onBeforeResponse: typeof onBeforeResponse;
    onAfterResponse: typeof onAfterResponse;
    onBeforeToolCall: typeof onBeforeToolCall;
    onAfterToolCall: typeof onAfterToolCall;
    onHandoff: typeof onHandoff;
    onSessionEnd: typeof onSessionEnd;
    getLocalToolDefinitions: typeof getLocalToolDefinitions;
    executeLocalTool: typeof executeLocalTool;
    isLocalTool: typeof isLocalTool;
    getCommands: typeof getCommands;
    getCommand: typeof getCommand;
    executeCommand: typeof executeCommand;
    getAssets: typeof getAssets;
    getThemeCSS: typeof getThemeCSS;
};
export default _default;
//# sourceMappingURL=extensibility-integration.d.ts.map