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
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getLogger } from '../../utils/safe-logger.js';
const log = getLogger();
// ============================================================================
// LOADER
// ============================================================================
let cachedConfig = null;
let cachedEnhanced = null;
function loadEnhancedConfig() {
    if (cachedEnhanced)
        return cachedEnhanced;
    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const enhancedPath = join(__dirname, '../config/enhanced-descriptions.json');
        const content = readFileSync(enhancedPath, 'utf-8');
        cachedEnhanced = JSON.parse(content);
        log.debug({ enhancedCount: Object.keys(cachedEnhanced.enhanced).length }, 'Enhanced tool descriptions loaded (Vertex AI best practices)');
        return cachedEnhanced;
    }
    catch {
        // Enhanced descriptions are optional
        return { enhanced: {} };
    }
}
function loadConfig() {
    if (cachedConfig)
        return cachedConfig;
    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const configPath = join(__dirname, '../config/tool-descriptions.json');
        const content = readFileSync(configPath, 'utf-8');
        cachedConfig = JSON.parse(content);
        log.debug({ toolCount: Object.keys(cachedConfig.tools).length }, 'Tool descriptions loaded');
        return cachedConfig;
    }
    catch (error) {
        log.warn({ error: String(error) }, 'Failed to load tool-descriptions.json, using fallbacks');
        // Return empty config - will use fallbacks
        return {
            version: 0,
            lastUpdated: '',
            defaults: { prefix: '', suffix: '' },
            tools: {},
        };
    }
}
// ============================================================================
// PUBLIC API
// ============================================================================
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
export function getToolDescription(toolId) {
    // First check enhanced descriptions (Vertex AI best practices)
    const enhanced = loadEnhancedConfig();
    if (enhanced.enhanced[toolId]?.description) {
        return enhanced.enhanced[toolId].description;
    }
    // Then check standard descriptions
    const config = loadConfig();
    const tool = config.tools[toolId];
    if (tool?.description) {
        // Apply prefix/suffix if configured
        const { prefix, suffix } = config.defaults;
        let description = tool.description;
        if (prefix)
            description = `${prefix} ${description}`;
        if (suffix)
            description = `${description} ${suffix}`;
        return description;
    }
    // Fallback: generate a reasonable description
    log.debug({ toolId }, 'Tool description not found, using fallback');
    return `Executes ${toolId}. Call when appropriate based on user request.`;
}
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
export function getParameterDescription(toolId, paramName) {
    // First check enhanced descriptions
    const enhanced = loadEnhancedConfig();
    if (enhanced.enhanced[toolId]?.parameters?.[paramName]) {
        return enhanced.enhanced[toolId].parameters[paramName];
    }
    // Then check standard descriptions
    const config = loadConfig();
    const tool = config.tools[toolId];
    if (tool?.parameters?.[paramName]) {
        return tool.parameters[paramName];
    }
    // Fallback
    log.debug({ toolId, paramName }, 'Parameter description not found, using fallback');
    return `The ${paramName} value`;
}
/**
 * Check if a tool has enhanced descriptions (Vertex AI optimized)
 */
export function hasEnhancedDescription(toolId) {
    const enhanced = loadEnhancedConfig();
    return toolId in enhanced.enhanced;
}
/**
 * Get all tools with enhanced descriptions
 */
export function getEnhancedToolIds() {
    const enhanced = loadEnhancedConfig();
    return Object.keys(enhanced.enhanced);
}
/**
 * Checks if a tool has a centralized description
 */
export function hasToolDescription(toolId) {
    const config = loadConfig();
    return toolId in config.tools;
}
/**
 * Gets all tool IDs that have centralized descriptions
 */
export function getRegisteredToolIds() {
    const config = loadConfig();
    return Object.keys(config.tools);
}
/**
 * Updates a tool description at runtime (for testing/debugging)
 * Note: This does NOT persist to the JSON file
 */
export function setToolDescription(toolId, description) {
    const config = loadConfig();
    if (!config.tools[toolId]) {
        config.tools[toolId] = { description, parameters: {} };
    }
    else {
        config.tools[toolId].description = description;
    }
}
/**
 * Reloads the config from disk (useful if JSON was updated)
 */
export function reloadToolDescriptions() {
    cachedConfig = null;
    loadConfig();
    log.info('Tool descriptions reloaded from disk');
}
// ============================================================================
// MIGRATION HELPER
// ============================================================================
/**
 * Helper to migrate existing tools to use centralized descriptions.
 * Returns the old inline description so it can be moved to JSON.
 *
 * Usage during migration:
 * 1. Run this to get all inline descriptions
 * 2. Add them to tool-descriptions.json
 * 3. Update code to use getToolDescription()
 */
export function extractInlineDescription(description, toolId) {
    log.info({ toolId, description }, 'Extracted inline description for migration');
}
//# sourceMappingURL=tool-descriptions.js.map