/**
 * Function Calling Configuration
 *
 * Centralized configuration for Gemini function calling following Google Vertex AI best practices.
 * @see https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling
 *
 * KEY CONCEPTS:
 * - toolConfig.functionCallingConfig controls HOW the model uses tools
 * - mode: 'AUTO' (default), 'ANY' (force tool use), 'NONE' (disable)
 * - allowedFunctionNames: Constrain which tools the model can call
 *
 * USAGE:
 * ```typescript
 * import { getFunctionCallingConfig, HIGH_STAKES_TOOLS } from './function-calling-config.js';
 *
 * const config = getFunctionCallingConfig('production');
 * // Use config.toolConfig when creating RealtimeModel
 * ```
 */
/**
 * Function calling mode as per Vertex AI docs
 */
export type FunctionCallingMode = 'AUTO' | 'ANY' | 'NONE';
/**
 * Configuration for function calling behavior
 */
export interface FunctionCallingConfig {
    /** The calling mode */
    mode: FunctionCallingMode;
    /**
     * Optional: Restrict which functions can be called.
     * If not specified, all registered functions are available.
     */
    allowedFunctionNames?: string[];
}
/**
 * Full tool configuration for Gemini
 */
export interface GeminiToolConfig {
    functionCallingConfig: FunctionCallingConfig;
}
/**
 * Environment/context for configuration selection
 */
export type ConfigEnvironment = 'production' | 'testing' | 'crisis' | 'onboarding' | 'minimal';
/**
 * Tools that have significant consequences and should require confirmation.
 *
 * Per Google docs:
 * "If the model proposes the invocation of a function that would send an order,
 * update a database, or otherwise have significant consequences, validate the
 * function call with the user before executing it."
 */
export declare const HIGH_STAKES_TOOLS: ReadonlySet<string>;
/**
 * Tools that should be confirmed with extra care (double confirmation)
 */
export declare const CRITICAL_TOOLS: ReadonlySet<string>;
/**
 * Check if a tool requires user confirmation before execution
 */
export declare function requiresConfirmation(toolId: string): boolean;
/**
 * Check if a tool requires extra confirmation (critical action)
 */
export declare function requiresCriticalConfirmation(toolId: string): boolean;
/**
 * Get function calling configuration for an environment
 */
export declare function getFunctionCallingConfig(environment: ConfigEnvironment): GeminiToolConfig;
/**
 * Build tool config based on runtime context
 */
export declare function buildToolConfig(options: {
    /** Base environment */
    environment?: ConfigEnvironment;
    /** Override mode */
    modeOverride?: FunctionCallingMode;
    /** Additional allowed tools (merged with environment) */
    additionalTools?: string[];
    /** Tools to exclude */
    excludeTools?: string[];
    /** Is user in crisis? */
    isCrisis?: boolean;
    /** Is this a new user? */
    isNewUser?: boolean;
}): GeminiToolConfig;
/**
 * Thought signature instructions to append to system prompts.
 *
 * Per Google docs:
 * "Thought signatures should always be used with function calling for best results."
 */
export declare const THOUGHT_SIGNATURE_PROTOCOL = "\n## Tool Usage Protocol\n\nWhen using tools to help the user:\n\n1. **Understand Intent**: Consider what the user actually needs\n2. **Select Appropriately**: Choose the most relevant tool for the situation\n3. **Execute Cleanly**: Call the tool with correct, complete parameters\n4. **Respond Naturally**: Use the result to craft a helpful, conversational response\n\n### Important Guidelines:\n- NEVER announce that you're calling a tool (\"Let me use the playMusic function...\")\n- NEVER speak function names, parameters, or technical details aloud\n- ALWAYS call tools silently and respond with the results naturally\n- If a tool fails, acknowledge it gracefully and offer alternatives\n- For high-stakes actions (sending messages, scheduling, payments), confirm with the user first\n\n### Example Flow:\nUser: \"Play some relaxing jazz\"\n[Internal: User wants music. Call playMusic with query \"relaxing jazz\"]\nResponse: \"Here's some smooth jazz to help you unwind.\"\n\nNOT: \"I'll call the playMusic function with query relaxing jazz for you.\"\n";
/**
 * Get thought signature instructions for a persona
 */
export declare function getThoughtSignatureProtocol(personaId?: string): string;
declare const _default: {
    getFunctionCallingConfig: typeof getFunctionCallingConfig;
    buildToolConfig: typeof buildToolConfig;
    requiresConfirmation: typeof requiresConfirmation;
    requiresCriticalConfirmation: typeof requiresCriticalConfirmation;
    getThoughtSignatureProtocol: typeof getThoughtSignatureProtocol;
    HIGH_STAKES_TOOLS: ReadonlySet<string>;
    CRITICAL_TOOLS: ReadonlySet<string>;
    THOUGHT_SIGNATURE_PROTOCOL: string;
};
export default _default;
//# sourceMappingURL=function-calling-config.d.ts.map