/**
 * Cameo Domain Tools
 *
 * Tools for team member "pop-in" cameos during conversations.
 * Allows Ferni to bring in team members for quick insights without a full handoff.
 *
 * DOMAIN: cameo
 * TOOLS:
 *   inviteCameo - Invite a team member to pop in with a quick insight
 *   checkCameoOpportunity - Check if a cameo would add value to current conversation
 */
import type { ToolDefinition } from '../../registry/types.js';
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map