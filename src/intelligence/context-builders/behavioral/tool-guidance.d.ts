/**
 * Tool Guidance System
 *
 * This module provides guidance about WHEN to call tools, rather than
 * injecting all the data into context (which causes leakage).
 *
 * PHILOSOPHY:
 * - Instead of: "[MEMORY: User mentioned their dog Max, birthday is 3/15...]"
 * - We use: Tool `searchMemories` available. Call when referencing past conversations.
 *
 * The model learns to ASK for information rather than having it pre-loaded.
 * This eliminates leakage because the model only gets facts when it explicitly
 * requests them through tool calls.
 *
 * @module intelligence/context-builders/behavioral/tool-guidance
 */
import type { ContextBuilderInput } from '../core/types.js';
/**
 * Categories of tools available to the model
 */
export type ToolCategory = 'memory' | 'calendar' | 'external' | 'persona' | 'music' | 'tasks' | 'biometrics';
export interface ToolAvailability {
    category: ToolCategory;
    toolName: string;
    description: string;
    whenToUse: string;
    available: boolean;
}
/**
 * Get the tools available for this session
 *
 * Note: We list tools as available and let the actual tool implementation
 * handle whether the user has connected the integration. This simplifies
 * the type system and provides consistent guidance.
 */
export declare function getAvailableTools(_input: ContextBuilderInput): Promise<ToolAvailability[]>;
/**
 * Format tool guidance for the prompt.
 *
 * This tells the model WHAT tools are available and WHEN to use them,
 * without pre-loading all the data that might leak.
 */
export declare function formatToolGuidance(tools: ToolAvailability[]): string;
/**
 * Compact tool list for system prompt
 */
export declare function formatToolsCompact(tools: ToolAvailability[]): string;
import type { CallbackSignal } from './signals.js';
/**
 * Analyze context and suggest tools the model might want to use.
 *
 * Instead of pre-loading data, we suggest "you might want to call X".
 */
export declare function suggestTools(input: ContextBuilderInput, availableTools: ToolAvailability[]): CallbackSignal[];
//# sourceMappingURL=tool-guidance.d.ts.map