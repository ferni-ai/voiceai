/**
 * Tool Fillers - SSML Pauses During Tool Execution
 *
 * DEPRECATED: Static verbal phrases have been replaced by LLM behavioral guidance.
 * See: src/intelligence/context-builders/humanization/dynamic-speech-guidance.ts
 *
 * This module now only provides SSML pause tags (no spoken content).
 * The LLM will generate natural speech based on context, not static phrases.
 *
 * @module tool-fillers
 */
/**
 * Tool fillers now only return SSML pauses (no spoken content).
 * The LLM handles natural speech via behavioral guidance.
 */
export declare const TOOL_FILLERS: Record<string, Record<string, string[]>>;
/**
 * Check if a tool is considered "long-running" and should get a verbal filler
 *
 * @param toolName - The name of the tool being executed
 * @returns true if the tool typically takes >500ms
 */
export declare function isLongRunningTool(toolName: string): boolean;
/**
 * Get verbal filler for a specific tool and persona
 *
 * Use this function when a long-running tool is about to execute.
 * Call session.say() with the returned phrase to prevent dead air.
 *
 * @param toolName - The name of the tool being executed
 * @param personaId - The current persona ID
 * @returns SSML-formatted filler phrase, or null if not a long-running tool
 *
 * @example
 * const filler = getToolFiller('getCalendarEvents', 'ferni');
 * if (filler) {
 *   session.say(filler, { allowInterruptions: true });
 * }
 */
export declare function getToolFiller(toolName: string, personaId: string): string | null;
declare const _default: {
    TOOL_FILLERS: Record<string, Record<string, string[]>>;
    getToolFiller: typeof getToolFiller;
    isLongRunningTool: typeof isLongRunningTool;
};
export default _default;
//# sourceMappingURL=tool-fillers.d.ts.map