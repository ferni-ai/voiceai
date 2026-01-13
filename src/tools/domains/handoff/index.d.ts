/**
 * Handoff Domain Tools
 *
 * Tools for agent-to-agent handoffs and team coordination.
 * This domain enables multi-agent collaboration.
 *
 * DOMAIN: handoff
 *
 * IMPORTANT: This domain loads tools asynchronously from the AgentRegistry.
 * The getToolDefinitions() function MUST be called after AgentRegistry is initialized.
 *
 * FIX (Jan 2026): Use buildHandoffTools() instead of createHandoffTools().
 * createHandoffTools() returns raw HandoffToolDefinition objects with Zod parameters,
 * which OpenAI Realtime API doesn't understand (it needs JSON Schema).
 * buildHandoffTools() properly wraps tools with llm.tool() which handles the conversion.
 */
import type { ToolDefinition } from '../../registry/types.js';
/**
 * Get handoff tool definitions.
 *
 * FIX BUG: This now returns cached tools if available, or an empty array if not yet loaded.
 * The registry loader calls this asynchronously, so tools will be loaded.
 */
declare function getToolDefinitions(): Promise<ToolDefinition[]>;
export declare const domain = "handoff";
export declare const definitions: ToolDefinition[];
export { getToolDefinitions };
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map