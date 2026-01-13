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
import type { BundleLocalTool } from './types/commands.js';
/**
 * Load a single tool from a JSON file
 */
export declare function loadLocalTool(filePath: string): Promise<BundleLocalTool | null>;
/**
 * Load all tools from a tools directory
 */
export declare function loadLocalTools(toolsDir: string): Promise<BundleLocalTool[]>;
/**
 * Load local tools for a persona bundle
 */
export declare function loadBundleLocalTools(bundlePath: string): Promise<BundleLocalTool[]>;
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
 * Execute a local tool
 */
export declare function executeLocalTool(context: LocalToolExecutionContext): Promise<LocalToolExecutionResult>;
/**
 * Get local tools for a bundle (with caching)
 */
export declare function getLocalTools(bundlePath: string, forceReload?: boolean): Promise<BundleLocalTool[]>;
/**
 * Clear tool cache for a bundle
 */
export declare function clearLocalToolCache(bundlePath?: string): void;
/**
 * Find a tool by ID
 */
export declare function findLocalTool(bundlePath: string, toolId: string): Promise<BundleLocalTool | null>;
/**
 * Convert a local tool to a function definition for LLM tool calling
 */
export declare function localToolToFunctionDefinition(tool: BundleLocalTool): {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
};
/**
 * Get function definitions for all local tools
 */
export declare function getLocalToolDefinitions(bundlePath: string): Promise<Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}>>;
declare const _default: {
    loadLocalTool: typeof loadLocalTool;
    loadLocalTools: typeof loadLocalTools;
    loadBundleLocalTools: typeof loadBundleLocalTools;
    executeLocalTool: typeof executeLocalTool;
    getLocalTools: typeof getLocalTools;
    clearLocalToolCache: typeof clearLocalToolCache;
    findLocalTool: typeof findLocalTool;
    localToolToFunctionDefinition: typeof localToolToFunctionDefinition;
    getLocalToolDefinitions: typeof getLocalToolDefinitions;
};
export default _default;
//# sourceMappingURL=local-tools-loader.d.ts.map