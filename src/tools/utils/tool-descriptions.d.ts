/**
 * Tool Descriptions Loader
 *
 * Centralizes all tool descriptions following Google Vertex AI Function Calling best practices.
 * @see https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling
 *
 * BEST PRACTICES (from Google docs):
 * 1. Function descriptions should clearly describe what the function does
 * 2. Parameter descriptions should be detailed and include examples
 * 3. Use thought signatures with function calling for best results
 * 4. Model decides when to call functions based on descriptions
 *
 * USAGE:
 * ```typescript
 * import { getToolDescription, getParameterDescription } from '../utils/tool-descriptions.js';
 *
 * llm.tool({
 *   description: getToolDescription('playMusic'),
 *   parameters: z.object({
 *     query: z.string().describe(getParameterDescription('playMusic', 'query')),
 *   }),
 * })
 * ```
 */
interface ToolDescriptionEntry {
    description: string;
    parameters?: Record<string, string>;
    file?: string;
    _original?: string;
}
interface ToolDescriptionsConfig {
    version: number;
    lastUpdated: string;
    defaults: {
        prefix: string;
        suffix: string;
    };
    tools: Record<string, ToolDescriptionEntry>;
    _stats?: {
        totalTools: number;
        filesScanned: number;
    };
}
/**
 * Gets the description for a tool (the `description` field in llm.tool())
 *
 * Following Google's best practices:
 * - Descriptions should clearly explain what the function does
 * - Include when to use the function
 * - Describe what the function returns
 *
 * PRIORITY ORDER:
 * 1. Enhanced descriptions (with examples, per Vertex AI best practices)
 * 2. Standard tool-descriptions.json
 * 3. Fallback generation
 *
 * @param toolId - The tool identifier (e.g., 'playMusic', 'rememberAboutUser')
 * @returns The tool description for LLM consumption
 */
export declare function getToolDescription(toolId: string): string;
/**
 * Gets the description for a specific parameter of a tool
 *
 * Following Google's best practices:
 * - Parameter descriptions should be detailed
 * - Include examples of valid values
 * - Explain the format expected
 *
 * PRIORITY ORDER:
 * 1. Enhanced parameter descriptions (with examples)
 * 2. Standard tool-descriptions.json parameters
 * 3. Fallback generation
 *
 * @param toolId - The tool identifier
 * @param paramName - The parameter name
 * @returns The parameter description
 */
export declare function getParameterDescription(toolId: string, paramName: string): string;
/**
 * Check if a tool has enhanced descriptions (Vertex AI optimized)
 */
export declare function hasEnhancedDescription(toolId: string): boolean;
/**
 * Get all tools with enhanced descriptions
 */
export declare function getEnhancedToolIds(): string[];
/**
 * Checks if a tool has a centralized description
 */
export declare function hasToolDescription(toolId: string): boolean;
/**
 * Gets all tool IDs that have centralized descriptions
 */
export declare function getRegisteredToolIds(): string[];
/**
 * Updates a tool description at runtime (for testing/debugging)
 * Note: This does NOT persist to the JSON file
 */
export declare function setToolDescription(toolId: string, description: string): void;
/**
 * Reloads the config from disk (useful if JSON was updated)
 */
export declare function reloadToolDescriptions(): void;
/**
 * Helper to migrate existing tools to use centralized descriptions.
 * Returns the old inline description so it can be moved to JSON.
 *
 * Usage during migration:
 * 1. Run this to get all inline descriptions
 * 2. Add them to tool-descriptions.json
 * 3. Update code to use getToolDescription()
 */
export declare function extractInlineDescription(description: string, toolId: string): void;
export type { ToolDescriptionEntry, ToolDescriptionsConfig };
//# sourceMappingURL=tool-descriptions.d.ts.map