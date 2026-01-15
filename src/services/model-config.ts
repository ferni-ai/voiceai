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

import fs from 'fs';
import path from 'path';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'ModelConfig' });

// ============================================================================
// TYPES
// ============================================================================

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
export const AVAILABLE_TOOL_DOMAINS = [
  { id: 'memory', name: 'Memory', description: 'User memory, recall, relationships' },
  { id: 'entertainment', name: 'Entertainment', description: 'Music playback' },
  { id: 'information', name: 'Information', description: 'Weather, news, search' },
  { id: 'handoff', name: 'Handoff', description: 'Agent switching' },
  { id: 'presence', name: 'Presence', description: 'Grounding, breathing, mindfulness' },
  { id: 'proactive', name: 'Proactive', description: 'Reminders, follow-ups' },
  { id: 'crisis', name: 'Crisis', description: 'Emergency support' },
  { id: 'habits', name: 'Habits', description: 'Goal setting, tracking' },
  { id: 'wellness', name: 'Wellness', description: 'Self-care, health' },
  { id: 'connection', name: 'Connection', description: 'Relationship building' },
  { id: 'conversation', name: 'Conversation', description: 'Wrap up, goodbye' },
];

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

// ============================================================================
// ENVIRONMENT CONFIGURATION - imports from gemini-config.ts (SINGLE SOURCE OF TRUTH)
// ============================================================================

/**
 * All LLM configuration comes from gemini-config.ts which reads from .env
 * This file re-exports for backward compatibility
 */

// Import everything from centralized gemini-config.ts
import {
  USE_VERTEX_AI,
  GOOGLE_CLOUD_PROJECT,
  GOOGLE_CLOUD_LOCATION,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  GEMINI_TEMPERATURE,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_LANGUAGE,
  LLM_TIMEOUT_MS,
  LLM_SHORT_TIMEOUT_MS,
  getGeminiClient,
  isGeminiConfigured,
  getDefaultModel as getDefaultModelFromConfig,
  getLLMTimeout,
  getShortLLMTimeout,
} from '../config/gemini-config.js';

// Re-export for external use
export {
  USE_VERTEX_AI,
  GOOGLE_CLOUD_PROJECT,
  GOOGLE_CLOUD_LOCATION,
  GEMINI_MODEL,
  GEMINI_TEMPERATURE,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_LANGUAGE,
  LLM_TIMEOUT_MS,
  LLM_SHORT_TIMEOUT_MS,
  isGeminiConfigured,
  getDefaultModelFromConfig,
  getLLMTimeout,
  getShortLLMTimeout,
};

// Re-export with aliases
export { GEMINI_API_KEY as GOOGLE_API_KEY };
export { getGeminiClient as createGeminiClient };

// ============================================================================
// DEFAULTS (read from env)
// ============================================================================

/**
 * Default Gemini configuration - reads from .env
 */
export const DEFAULT_GEMINI_CONFIG: GeminiModelConfig = {
  model: GEMINI_MODEL,
  temperature: GEMINI_TEMPERATURE,
  topK: undefined, // Let Gemini use its default
  topP: undefined, // Let Gemini use its default
  maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
  language: GEMINI_LANGUAGE,
};

/**
 * Default tool configuration
 */
export const DEFAULT_TOOL_CONFIG: ToolConfig = {
  debugMode: false,
  maxTools: 0, // 0 = unlimited
  enabledDomains: [], // Empty = all domains
  excludedTools: [],
  includedTools: [],
  logToolSchemas: false,
  logToolResults: false,
  useOrchestrator: true,
};

/**
 * Available Gemini models
 */
export const AVAILABLE_MODELS = [
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash (Preview)',
    description: 'Latest model with improved capabilities',
  },
  {
    id: 'gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash (Experimental)',
    description: 'Fast, latest features',
  },
  {
    id: 'gemini-2.0-flash-live-001',
    name: 'Gemini 2.0 Flash Live',
    description: 'Realtime voice optimized',
  },
  { id: 'gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash', description: 'Fast, stable' },
  { id: 'gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro', description: 'Higher quality, slower' },
];

// ============================================================================
// STORAGE
// ============================================================================

const CONFIG_VERSION = 1;

function getConfigPath(): string {
  return path.join(process.cwd(), 'data', 'model-config.json');
}

function ensureDataDir(): void {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * Read model config from disk
 */
function readConfigStore(): ModelConfigStore {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ModelConfigStore;
      // Ensure defaults exist
      if (!data.defaults) {
        data.defaults = DEFAULT_GEMINI_CONFIG;
      }
      if (!data.toolDefaults) {
        data.toolDefaults = DEFAULT_TOOL_CONFIG;
      }
      if (!data.personas) {
        data.personas = {};
      }
      return data;
    }
  } catch (e) {
    log.warn({ error: e }, 'Failed to read model config, using defaults');
  }
  return {
    defaults: DEFAULT_GEMINI_CONFIG,
    toolDefaults: DEFAULT_TOOL_CONFIG,
    personas: {},
    version: CONFIG_VERSION,
  };
}

/**
 * Write model config to disk
 */
function writeConfigStore(config: ModelConfigStore): void {
  ensureDataDir();
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  log.info({ path: configPath }, 'Model config saved');
}

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

let configCache: ModelConfigStore | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 5000; // Refresh cache every 5 seconds

function getConfigWithCache(): ModelConfigStore {
  const now = Date.now();
  if (!configCache || now - lastCacheTime > CACHE_TTL_MS) {
    configCache = readConfigStore();
    lastCacheTime = now;
  }
  return configCache;
}

function invalidateCache(): void {
  configCache = null;
  lastCacheTime = 0;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get global default Gemini configuration
 */
export function getDefaultGeminiConfig(): GeminiModelConfig {
  return getConfigWithCache().defaults;
}

/**
 * Set global default Gemini configuration
 */
export function setDefaultGeminiConfig(
  config: Partial<GeminiModelConfig>,
  updatedBy?: string
): void {
  const store = getConfigWithCache();
  store.defaults = {
    ...store.defaults,
    ...config,
  };
  writeConfigStore(store);
  invalidateCache();
  log.info({ updatedBy, config }, 'Default Gemini config updated');
}

/**
 * Get persona-specific model configuration
 * Falls back to defaults if no persona config exists
 */
export function getPersonaModelConfig(personaId: string): PersonaModelConfig {
  const store = getConfigWithCache();
  const personaConfig = store.personas[personaId];

  if (personaConfig) {
    // Merge with defaults for any missing fields
    return {
      ...personaConfig,
      gemini: {
        ...store.defaults,
        ...personaConfig.gemini,
      },
      tools: {
        ...store.toolDefaults,
        ...(personaConfig.tools || {}),
      },
    };
  }

  // Return defaults for this persona
  return {
    personaId,
    useSystemPromptOverride: false,
    gemini: store.defaults,
    tools: store.toolDefaults,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Set persona-specific model configuration
 */
export function setPersonaModelConfig(
  personaId: string,
  config: Partial<Omit<PersonaModelConfig, 'personaId' | 'updatedAt'>>,
  updatedBy?: string
): PersonaModelConfig {
  const store = getConfigWithCache();
  const existing = store.personas[personaId] || {
    personaId,
    useSystemPromptOverride: false,
    gemini: store.defaults,
    tools: store.toolDefaults,
    updatedAt: new Date().toISOString(),
  };

  const updated: PersonaModelConfig = {
    ...existing,
    ...config,
    personaId,
    gemini: config.gemini ? { ...existing.gemini, ...config.gemini } : existing.gemini,
    tools: config.tools ? { ...existing.tools, ...config.tools } : existing.tools,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  store.personas[personaId] = updated;
  writeConfigStore(store);
  invalidateCache();

  log.info({ personaId, updatedBy }, 'Persona model config updated');
  return updated;
}

/**
 * Delete persona-specific config (reverts to defaults)
 */
export function deletePersonaModelConfig(personaId: string): boolean {
  const store = getConfigWithCache();
  if (store.personas[personaId]) {
    delete store.personas[personaId];
    writeConfigStore(store);
    invalidateCache();
    log.info({ personaId }, 'Persona model config deleted');
    return true;
  }
  return false;
}

/**
 * Get all persona configurations
 */
export function getAllPersonaConfigs(): Record<string, PersonaModelConfig> {
  return getConfigWithCache().personas;
}

/**
 * Get full config store (for admin dashboard)
 */
export function getFullConfigStore(): ModelConfigStore {
  return getConfigWithCache();
}

/**
 * Reset all configurations to defaults
 */
export function resetAllConfigs(): void {
  writeConfigStore({
    defaults: DEFAULT_GEMINI_CONFIG,
    toolDefaults: DEFAULT_TOOL_CONFIG,
    personas: {},
    version: CONFIG_VERSION,
  });
  invalidateCache();
  log.info('All model configs reset to defaults');
}

// ============================================================================
// TOOL CONFIG API
// ============================================================================

/**
 * Get global default tool configuration
 */
export function getDefaultToolConfig(): ToolConfig {
  return getConfigWithCache().toolDefaults;
}

/**
 * Set global default tool configuration
 */
export function setDefaultToolConfig(config: Partial<ToolConfig>, updatedBy?: string): void {
  const store = getConfigWithCache();
  store.toolDefaults = {
    ...store.toolDefaults,
    ...config,
  };
  writeConfigStore(store);
  invalidateCache();
  log.info({ updatedBy, config }, 'Default tool config updated');
}

/**
 * Get tool configuration for a persona
 * Falls back to global defaults if no persona-specific config
 */
export function getToolConfig(personaId: string): ToolConfig {
  return getPersonaModelConfig(personaId).tools;
}

/**
 * Set tool configuration for a persona
 */
export function setToolConfig(
  personaId: string,
  config: Partial<ToolConfig>,
  updatedBy?: string
): ToolConfig {
  // Merge partial config with existing to create full ToolConfig
  const existing = getPersonaModelConfig(personaId);
  const mergedTools: ToolConfig = {
    ...existing.tools,
    ...config,
  };
  const updated = setPersonaModelConfig(personaId, { tools: mergedTools }, updatedBy);
  return updated.tools;
}

/**
 * Get effective system prompt for a persona
 * Returns override if enabled, otherwise returns null (caller should use bundle prompt)
 */
export function getEffectiveSystemPromptOverride(personaId: string): string | null {
  const config = getPersonaModelConfig(personaId);
  if (config.useSystemPromptOverride && config.systemPromptOverride) {
    return config.systemPromptOverride;
  }
  return null;
}

/**
 * Update just the system prompt for a persona
 */
export function setPersonaSystemPrompt(
  personaId: string,
  systemPrompt: string,
  enabled: boolean,
  updatedBy?: string
): void {
  setPersonaModelConfig(
    personaId,
    {
      systemPromptOverride: systemPrompt,
      useSystemPromptOverride: enabled,
    },
    updatedBy
  );
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate Gemini config values are within acceptable ranges
 */
export function validateGeminiConfig(config: Partial<GeminiModelConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.temperature !== undefined) {
    if (config.temperature < 0 || config.temperature > 2) {
      errors.push('temperature must be between 0 and 2');
    }
  }

  if (config.topK !== undefined) {
    if (config.topK < 1 || config.topK > 100) {
      errors.push('topK must be between 1 and 100');
    }
  }

  if (config.topP !== undefined) {
    if (config.topP < 0 || config.topP > 1) {
      errors.push('topP must be between 0 and 1');
    }
  }

  if (config.maxOutputTokens !== undefined) {
    if (config.maxOutputTokens < 1 || config.maxOutputTokens > 8192) {
      errors.push('maxOutputTokens must be between 1 and 8192');
    }
  }

  if (config.model !== undefined) {
    const validModels = AVAILABLE_MODELS.map((m) => m.id);
    if (!validModels.includes(config.model)) {
      errors.push(`model must be one of: ${validModels.join(', ')}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// CONVENIENCE HELPERS
// ============================================================================

/**
 * Get the default model name from config.
 * Use this instead of hardcoding model names!
 *
 * @example
 * // Instead of: model: 'gemini-2.0-flash-exp'
 * // Use: model: getDefaultModel()
 */
export function getDefaultModel(): string {
  return getDefaultGeminiConfig().model;
}

/**
 * Get the default model for a specific persona, falling back to global default.
 */
export function getModelForPersona(personaId?: string): string {
  if (personaId) {
    return getPersonaModelConfig(personaId).gemini.model;
  }
  return getDefaultModel();
}

// getLLMTimeout and getShortLLMTimeout are now re-exported from gemini-config.ts

// ============================================================================
// EXPORTS
// ============================================================================

// Note: All imports from gemini-config.js are at the top of the file

export const modelConfig = {
  getDefault: getDefaultGeminiConfig,
  getDefaults: getDefaultGeminiConfig, // Alias for compatibility
  setDefault: setDefaultGeminiConfig,
  getPersona: getPersonaModelConfig,
  setPersona: setPersonaModelConfig,
  deletePersona: deletePersonaModelConfig,
  getAllPersonas: getAllPersonaConfigs,
  getStore: getFullConfigStore,
  resetAll: resetAllConfigs,
  getSystemPromptOverride: getEffectiveSystemPromptOverride,
  setSystemPrompt: setPersonaSystemPrompt,
  validate: validateGeminiConfig,
  availableModels: AVAILABLE_MODELS,
  // Tool configuration
  getToolConfig,
  setToolConfig,
  getDefaultToolConfig,
  setDefaultToolConfig,
  availableToolDomains: AVAILABLE_TOOL_DOMAINS,
  // Convenience helpers
  getDefaultModel,
  getModelForPersona,
  // Gemini client factory (from gemini-config.ts - SINGLE SOURCE OF TRUTH)
  createGeminiClient: getGeminiClient,
  getLLMTimeout,
  getShortLLMTimeout,
  // Environment exports (from gemini-config.ts)
  USE_VERTEX_AI,
  GOOGLE_CLOUD_PROJECT,
  GOOGLE_CLOUD_LOCATION,
  GOOGLE_API_KEY: GEMINI_API_KEY,
  GEMINI_MODEL,
  GEMINI_TEMPERATURE,
};

export default modelConfig;
