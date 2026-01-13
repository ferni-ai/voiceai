/**
 * Model Configuration Service
 *
 * Manages configurable LLM and TTS parameters per persona:
 * - System prompts (editable from admin dashboard)
 * - Gemini model parameters (temperature, topK, topP, etc.)
 * - Model selection
 * - Tool configuration (limits, domains, debug mode)
 *
 * Configurations are persisted in the data/ directory for
 * immediate availability without database dependencies.
 *
 * @module services/model-config
 */
/**
 * Gemini model configuration parameters
 */
export interface GeminiModelConfig {
    /** Model ID (e.g., 'gemini-2.0-flash-exp', 'gemini-1.5-pro-latest') */
    model: string;
    /** Temperature (0.0 - 2.0, default: 0.8) - Controls randomness */
    temperature: number;
    /** Top-K (1 - 100, optional) - Limits vocabulary selection */
    topK?: number;
    /** Top-P (0.0 - 1.0, optional) - Nucleus sampling threshold */
    topP?: number;
    /** Max output tokens (optional) */
    maxOutputTokens?: number;
    /** Language code (default: 'en-US') */
    language: string;
}
/**
 * Tool configuration for debugging and optimization
 */
export interface ToolConfig {
    /** Enable verbose tool debug logging */
    debugMode: boolean;
    /** Maximum number of tools to pass to the LLM (0 = unlimited) */
    maxTools: number;
    /** Tool domains to enable (empty = all domains) */
    enabledDomains: string[];
    /** Specific tool IDs to exclude */
    excludedTools: string[];
    /** Specific tool IDs to include (overrides domain filtering if set) */
    includedTools: string[];
    /** Log tool schemas sent to Gemini */
    logToolSchemas: boolean;
    /** Log tool execution results */
    logToolResults: boolean;
    /** Use orchestrator for tool selection (false = use FerniAgent internal tools) */
    useOrchestrator: boolean;
}
/**
 * Available tool domains
 */
export declare const AVAILABLE_TOOL_DOMAINS: {
    id: string;
    name: string;
    description: string;
}[];
/**
 * Full persona model configuration
 */
export interface PersonaModelConfig {
    /** Persona ID */
    personaId: string;
    /** Custom system prompt (overrides bundle prompt if set) */
    systemPromptOverride?: string;
    /** Whether to use the override (allows toggling without losing the text) */
    useSystemPromptOverride: boolean;
    /** Gemini/LLM configuration */
    gemini: GeminiModelConfig;
    /** Tool configuration */
    tools: ToolConfig;
    /** Last updated timestamp */
    updatedAt: string;
    /** Who made the last update */
    updatedBy?: string;
}
/**
 * All model configurations
 */
export interface ModelConfigStore {
    /** Global defaults (used when no persona-specific config exists) */
    defaults: GeminiModelConfig;
    /** Global tool configuration defaults */
    toolDefaults: ToolConfig;
    /** Per-persona configurations */
    personas: Record<string, PersonaModelConfig>;
    /** Version for migration support */
    version: number;
}
/**
 * All LLM configuration comes from gemini-config.ts which reads from .env
 * This file re-exports for backward compatibility
 */
import { USE_VERTEX_AI, GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, GEMINI_API_KEY, GEMINI_MODEL, GEMINI_TEMPERATURE, GEMINI_MAX_OUTPUT_TOKENS, GEMINI_LANGUAGE, LLM_TIMEOUT_MS, LLM_SHORT_TIMEOUT_MS, getGeminiClient, isGeminiConfigured, getDefaultModel as getDefaultModelFromConfig, getLLMTimeout, getShortLLMTimeout } from '../config/gemini-config.js';
export { USE_VERTEX_AI, GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, GEMINI_MODEL, GEMINI_TEMPERATURE, GEMINI_MAX_OUTPUT_TOKENS, GEMINI_LANGUAGE, LLM_TIMEOUT_MS, LLM_SHORT_TIMEOUT_MS, isGeminiConfigured, getDefaultModelFromConfig, getLLMTimeout, getShortLLMTimeout, };
export { GEMINI_API_KEY as GOOGLE_API_KEY };
export { getGeminiClient as createGeminiClient };
/**
 * Default Gemini configuration - reads from .env
 */
export declare const DEFAULT_GEMINI_CONFIG: GeminiModelConfig;
/**
 * Default tool configuration
 */
export declare const DEFAULT_TOOL_CONFIG: ToolConfig;
/**
 * Available Gemini models
 */
export declare const AVAILABLE_MODELS: {
    id: string;
    name: string;
    description: string;
}[];
/**
 * Get global default Gemini configuration
 */
export declare function getDefaultGeminiConfig(): GeminiModelConfig;
/**
 * Set global default Gemini configuration
 */
export declare function setDefaultGeminiConfig(config: Partial<GeminiModelConfig>, updatedBy?: string): void;
/**
 * Get persona-specific model configuration
 * Falls back to defaults if no persona config exists
 */
export declare function getPersonaModelConfig(personaId: string): PersonaModelConfig;
/**
 * Set persona-specific model configuration
 */
export declare function setPersonaModelConfig(personaId: string, config: Partial<Omit<PersonaModelConfig, 'personaId' | 'updatedAt'>>, updatedBy?: string): PersonaModelConfig;
/**
 * Delete persona-specific config (reverts to defaults)
 */
export declare function deletePersonaModelConfig(personaId: string): boolean;
/**
 * Get all persona configurations
 */
export declare function getAllPersonaConfigs(): Record<string, PersonaModelConfig>;
/**
 * Get full config store (for admin dashboard)
 */
export declare function getFullConfigStore(): ModelConfigStore;
/**
 * Reset all configurations to defaults
 */
export declare function resetAllConfigs(): void;
/**
 * Get global default tool configuration
 */
export declare function getDefaultToolConfig(): ToolConfig;
/**
 * Set global default tool configuration
 */
export declare function setDefaultToolConfig(config: Partial<ToolConfig>, updatedBy?: string): void;
/**
 * Get tool configuration for a persona
 * Falls back to global defaults if no persona-specific config
 */
export declare function getToolConfig(personaId: string): ToolConfig;
/**
 * Set tool configuration for a persona
 */
export declare function setToolConfig(personaId: string, config: Partial<ToolConfig>, updatedBy?: string): ToolConfig;
/**
 * Get effective system prompt for a persona
 * Returns override if enabled, otherwise returns null (caller should use bundle prompt)
 */
export declare function getEffectiveSystemPromptOverride(personaId: string): string | null;
/**
 * Update just the system prompt for a persona
 */
export declare function setPersonaSystemPrompt(personaId: string, systemPrompt: string, enabled: boolean, updatedBy?: string): void;
/**
 * Validate Gemini config values are within acceptable ranges
 */
export declare function validateGeminiConfig(config: Partial<GeminiModelConfig>): {
    valid: boolean;
    errors: string[];
};
/**
 * Get the default model name from config.
 * Use this instead of hardcoding model names!
 *
 * @example
 * // Instead of: model: 'gemini-2.0-flash-exp'
 * // Use: model: getDefaultModel()
 */
export declare function getDefaultModel(): string;
/**
 * Get the default model for a specific persona, falling back to global default.
 */
export declare function getModelForPersona(personaId?: string): string;
export declare const modelConfig: {
    getDefault: typeof getDefaultGeminiConfig;
    getDefaults: typeof getDefaultGeminiConfig;
    setDefault: typeof setDefaultGeminiConfig;
    getPersona: typeof getPersonaModelConfig;
    setPersona: typeof setPersonaModelConfig;
    deletePersona: typeof deletePersonaModelConfig;
    getAllPersonas: typeof getAllPersonaConfigs;
    getStore: typeof getFullConfigStore;
    resetAll: typeof resetAllConfigs;
    getSystemPromptOverride: typeof getEffectiveSystemPromptOverride;
    setSystemPrompt: typeof setPersonaSystemPrompt;
    validate: typeof validateGeminiConfig;
    availableModels: {
        id: string;
        name: string;
        description: string;
    }[];
    getToolConfig: typeof getToolConfig;
    setToolConfig: typeof setToolConfig;
    getDefaultToolConfig: typeof getDefaultToolConfig;
    setDefaultToolConfig: typeof setDefaultToolConfig;
    availableToolDomains: {
        id: string;
        name: string;
        description: string;
    }[];
    getDefaultModel: typeof getDefaultModel;
    getModelForPersona: typeof getModelForPersona;
    createGeminiClient: typeof getGeminiClient;
    getLLMTimeout: typeof getLLMTimeout;
    getShortLLMTimeout: typeof getShortLLMTimeout;
    USE_VERTEX_AI: boolean;
    GOOGLE_CLOUD_PROJECT: string | undefined;
    GOOGLE_CLOUD_LOCATION: string;
    GOOGLE_API_KEY: string | undefined;
    GEMINI_MODEL: string;
    GEMINI_TEMPERATURE: number;
};
export default modelConfig;
//# sourceMappingURL=model-config.d.ts.map