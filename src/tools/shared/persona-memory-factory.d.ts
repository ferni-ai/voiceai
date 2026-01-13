/**
 * Persona Memory Factory
 *
 * Shared utilities and factory pattern for persona memory tools.
 * Reduces boilerplate while allowing each persona to define unique memory types.
 *
 * Usage:
 *   const tools = getMemoryToolsForPersona('maya');
 *   const allTools = getAllPersonaMemoryTools();
 */
import { llm } from '@livekit/agents';
import type { z } from 'zod';
import { getUserId } from '../utils/tool-helpers.js';
export { getUserId };
export interface MemoryToolConfig {
    personaId: string;
    displayName: string;
    emoji: string;
    memoryTypes: string[];
}
/**
 * Format a response with persona personality
 */
export declare function formatResponse(message: string, options?: {
    emoji?: string;
    excited?: boolean;
    empathetic?: boolean;
}): string;
/**
 * Format ordinal number (1st, 2nd, 3rd, etc.)
 */
export declare function ordinal(n: number): string;
/**
 * Format currency for display
 */
export declare function formatCurrency(amount: number): string;
/**
 * Calculate progress percentage
 */
export declare function progressPercent(current: number, target: number): number;
export declare const PERSONA_MEMORY_CONFIGS: Record<string, MemoryToolConfig>;
/**
 * Create a basic "remember" tool with common structure
 */
export declare function createRememberTool<TParams extends z.ZodRawShape>(config: {
    description: string;
    parameters: z.ZodObject<TParams>;
    execute: (params: z.infer<z.ZodObject<TParams>>, userId: string) => Promise<string>;
}): llm.FunctionTool<z.core.$InferObjectOutput<TParams, {}>, unknown, string>;
/**
 * Create a basic "recall" tool with common structure
 */
export declare function createRecallTool<TParams extends z.ZodRawShape>(config: {
    description: string;
    parameters: z.ZodObject<TParams>;
    execute: (params: z.infer<z.ZodObject<TParams>>, userId: string) => Promise<string>;
}): llm.FunctionTool<z.core.$InferObjectOutput<TParams, {}>, unknown, string>;
/**
 * Get memory tools for a specific persona
 */
export declare function getMemoryToolsForPersona(personaId: string): Promise<Record<string, unknown> | null>;
/**
 * Get all persona memory tools as a flat object
 */
export declare function getAllPersonaMemoryTools(): Promise<Record<string, unknown>>;
/**
 * Get memory tool config for a persona
 */
export declare function getMemoryConfig(personaId: string): MemoryToolConfig | null;
declare const _default: {
    getUserId: typeof getUserId;
    formatResponse: typeof formatResponse;
    ordinal: typeof ordinal;
    formatCurrency: typeof formatCurrency;
    progressPercent: typeof progressPercent;
    createRememberTool: typeof createRememberTool;
    createRecallTool: typeof createRecallTool;
    getMemoryToolsForPersona: typeof getMemoryToolsForPersona;
    getAllPersonaMemoryTools: typeof getAllPersonaMemoryTools;
    getMemoryConfig: typeof getMemoryConfig;
    PERSONA_MEMORY_CONFIGS: Record<string, MemoryToolConfig>;
};
export default _default;
//# sourceMappingURL=persona-memory-factory.d.ts.map