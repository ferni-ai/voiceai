/**
 * Leave Message Tool
 *
 * Enables family phone callers to leave voice messages for their sponsor
 * that Ferni will deliver during the sponsor's next conversation.
 *
 * Example conversation:
 * - Mom: "Tell Seth I'm thinking of him"
 * - Ferni: "I'll make sure Seth knows you're thinking of him."
 *
 * Later:
 * - Seth talks to Ferni
 * - Ferni: "Your mom left you a message earlier. She said: 'I'm thinking of you.'"
 *
 * @module tools/domains/family/leave-message-tool
 */
import type { ToolDefinition } from '../../registry/types.js';
export declare const leaveMessageToolDef: ToolDefinition;
export declare const checkMessagesToolDef: ToolDefinition;
export declare const coordinatedReminderToolDef: ToolDefinition;
export declare function getToolDefinitions(): ToolDefinition[];
//# sourceMappingURL=leave-message-tool.d.ts.map