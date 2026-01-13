/**
 * Group Conversation Domain Tools
 *
 * Tools for multi-participant voice conversations:
 * - Team Roundtables (multiple AI personas)
 * - Conference Calls (user + agent + external person via SIP)
 *
 * DOMAIN: group-conversation
 *
 * Example voice commands:
 * - "Start a roundtable with Peter and Maya about my career"
 * - "Call my friend Sarah and let's all chat together"
 * - "End this group conversation"
 */
import type { ToolDefinition } from '../../registry/types.js';
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map