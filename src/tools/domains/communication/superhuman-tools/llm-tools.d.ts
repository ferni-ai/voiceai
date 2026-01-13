/**
 * LLM-Callable Superhuman Communication Tools
 *
 * These tools let Alex actively USE her superhuman capabilities
 * when the user needs them, not just passively inject context.
 *
 * @module tools/domains/communication/superhuman-tools/llm-tools
 */
import { llm } from '@livekit/agents';
import type { ToolDefinition } from '../../../registry/types.js';
export declare function createSuperhumanCommunicationTools(): {
    recallConversation: llm.FunctionTool<{
        userId: string;
        contactName: string;
        topic?: string | undefined;
    }, unknown, string>;
    checkRelationshipHealth: llm.FunctionTool<{
        userId: string;
        contactName: string;
    }, unknown, string>;
    getRelationshipsNeedingAttention: llm.FunctionTool<{
        userId: string;
    }, unknown, string>;
    predictMessageReception: llm.FunctionTool<{
        userId: string;
        message: string;
        contactName: string;
    }, unknown, string>;
    getApologyAdvice: llm.FunctionTool<{
        userId: string;
        contactName: string;
        whatFor?: string | undefined;
    }, unknown, string>;
    analyzeConflict: llm.FunctionTool<{
        userId: string;
        description: string;
        thingsTheySaid?: string[] | undefined;
        thingsOtherSaid?: string[] | undefined;
    }, unknown, string>;
    getCommunicationDebts: llm.FunctionTool<{
        userId: string;
    }, unknown, string>;
    markCommunicationDone: llm.FunctionTool<{
        userId: string;
        contactName: string;
    }, unknown, string>;
    getObjectivePerspective: llm.FunctionTool<{
        userId: string;
        theirStory: string;
        otherPersonName: string;
    }, unknown, string>;
    shouldISendThis: llm.FunctionTool<{
        userId: string;
        situation: string;
        contactName?: string | undefined;
    }, unknown, string>;
    holdMessageForLater: llm.FunctionTool<{
        userId: string;
        message: string;
        contactName: string;
        holdHours: number;
    }, unknown, string>;
    translateMyNeed: llm.FunctionTool<{
        userId: string;
        complaint: string;
        aboutPerson?: string | undefined;
    }, unknown, string>;
    whatAmIAvoiding: llm.FunctionTool<{
        userId: string;
    }, unknown, string>;
};
/**
 * Get properly structured tool definitions for the registry.
 * Wraps each llm.tool() in a ToolDefinition with id, name, domain, and create function.
 */
export declare function getToolDefinitions(): ToolDefinition[];
export declare const domain = "superhuman-communication";
export declare const definitions: {
    domain: string;
    getToolDefinitions: typeof getToolDefinitions;
    description: string;
};
export default definitions;
//# sourceMappingURL=llm-tools.d.ts.map