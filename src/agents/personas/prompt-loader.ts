/**
 * Prompt Loader Utility for Persona Agents
 *
 * Centralized utility for loading and ASSEMBLING system prompts from persona bundles.
 *
 * ARCHITECTURE (Dec 2024):
 * Function calling instructions are now SPLIT for maintainability:
 *   - shared/function-calling-base.md - Common tools + critical rules (ALL personas)
 *   - identity/function-calling-specialty.md - Persona-specific tools
 *
 * The loader automatically assembles: base + specialty when loading function_calling.
 *
 * Other prompt modules:
 *   - identity/core-identity.md - WHO the persona IS
 *   - identity/directors-notes.md - Performance guidance
 *   - identity/biography.md - Backstory
 *
 * Assembly config in: content/prompts/_assembly.json
 *
 * @module agents/personas/prompt-loader
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PromptLoader' });

// ============================================================================
// CONFIGURATION
// ============================================================================

// Persona ID to bundle directory mapping
const PERSONA_BUNDLES: Record<string, string> = {
  ferni: 'ferni',
  'maya-santos': 'maya-santos',
  maya: 'maya-santos',
  'alex-chen': 'alex-chen',
  alex: 'alex-chen',
  'peter-john': 'peter-john',
  peter: 'peter-john',
  'jordan-taylor': 'jordan-taylor',
  jordan: 'jordan-taylor',
  'nayan-patel': 'nayan-patel',
  nayan: 'nayan-patel',
};

// Fallback prompts for each persona (used if file loading fails)
const FALLBACK_PROMPTS: Record<string, string> = {
  ferni:
    'You are Ferni, a warm and empathetic life coach who helps people navigate life with wisdom and genuine care.',
  'maya-santos':
    'You are Maya Santos, a warm habits coach who believes in starting small and celebrating every win.',
  'alex-chen':
    'You are Alex Chen, an efficient and warm communication coach who helps with calendar, email, and scheduling.',
  'peter-john':
    'You are Peter John, an 80-year-old analytical mind who sees patterns nobody else sees.',
  'jordan-taylor':
    'You are Jordan Taylor, an enthusiastic lifetime planner who makes every milestone feel special.',
  'nayan-patel':
    'You are Nayan Patel, a mystic lifetime coach who thinks in decades and blends Eastern wisdom with Western pragmatism.',
};

// ============================================================================
// ASSEMBLY TYPES
// ============================================================================

export type PromptMode = 'voice_agent' | 'full_context';

interface AssemblyConfig {
  prompt_modules: Record<string, string>;
  voice_agent_modules?: string[];
  full_context_modules?: string[];
  token_budget?: {
    voice_agent_max?: number;
    full_context_max?: number;
  };
}

// ============================================================================
// FILE LOADING HELPERS
// ============================================================================

async function loadFile(bundleDir: string, relativePath: string): Promise<string | null> {
  try {
    const fs = await import('fs/promises');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    const filePath = join(__dirname, '../../personas/bundles', bundleDir, relativePath);
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Load shared file from bundles/shared/ directory
 */
async function loadSharedFile(relativePath: string): Promise<string | null> {
  try {
    const fs = await import('fs/promises');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    const filePath = join(__dirname, '../../personas/bundles/shared', relativePath);
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Load the shared safety disclaimer.
 * This ensures all personas have consistent legal/safety guardrails.
 */
async function loadSafetyDisclaimer(): Promise<string | null> {
  return loadSharedFile('safety-disclaimer.md');
}

/**
 * Load function calling prompt with base + specialty pattern.
 *
 * This assembles:
 * 1. shared/safety-disclaimer.md (legal/safety guardrails - ALL personas)
 * 2. shared/function-calling-base.md (common tools + critical rules)
 * 3. identity/function-calling-specialty.md (persona-specific tools)
 *
 * Falls back to legacy identity/function-calling.md if new files don't exist.
 * 
 * SKIP when SEMANTIC_ROUTING_PRIMARY=true:
 * When semantic routing handles all tool calls, we don't want the LLM
 * to output JSON function calls (they would be spoken as text).
 */
async function loadFunctionCallingWithBase(bundleDir: string): Promise<string | null> {
  // 🎯 SEMANTIC ROUTING PRIMARY: Skip function calling prompts entirely
  // The semantic router handles tool execution BEFORE the LLM, so we don't
  // want to teach the LLM the JSON format (it would output JSON as speech).
  if (process.env.SEMANTIC_ROUTING_PRIMARY === 'true') {
    log.info(
      { bundleDir },
      '🎯 SEMANTIC_ROUTING_PRIMARY=true: Skipping function-calling prompts (semantic router handles tools)'
    );
    return null;
  }

  // Load safety disclaimer (always include if available)
  const safetyDisclaimer = await loadSafetyDisclaimer();

  // Try new pattern first: base + specialty
  const base = await loadSharedFile('function-calling-base.md');
  const specialty = await loadFile(bundleDir, 'identity/function-calling-specialty.md');

  const parts: string[] = [];

  // Safety disclaimer comes first (sets the tone)
  if (safetyDisclaimer) {
    parts.push(safetyDisclaimer);
  }

  if (base && specialty) {
    log.debug({ bundleDir }, 'Loaded function-calling with base + specialty pattern');
    parts.push(base, specialty);
    return parts.join('\n\n---\n\n');
  }

  // Fall back to legacy single-file pattern
  const legacy = await loadFile(bundleDir, 'identity/function-calling.md');
  if (legacy) {
    log.debug({ bundleDir }, 'Loaded legacy function-calling.md');
    parts.push(legacy);
    return parts.join('\n\n---\n\n');
  }

  // Last resort: just the base if specialty doesn't exist
  if (base) {
    log.warn({ bundleDir }, 'No specialty file found, using base only');
    parts.push(base);
    return parts.join('\n\n---\n\n');
  }

  // If we only have safety disclaimer, still return it
  if (safetyDisclaimer) {
    return safetyDisclaimer;
  }

  return null;
}

async function loadAssemblyConfig(bundleDir: string): Promise<AssemblyConfig | null> {
  const configJson = await loadFile(bundleDir, 'content/prompts/_assembly.json');
  if (!configJson) return null;

  try {
    return JSON.parse(configJson);
  } catch {
    log.warn({ bundleDir }, 'Failed to parse _assembly.json');
    return null;
  }
}

// ============================================================================
// MAIN PROMPT LOADER
// ============================================================================

/**
 * Load and assemble a persona's system prompt from modular files.
 *
 * @param personaId - The persona ID (e.g., 'ferni', 'maya-santos', 'alex')
 * @param mode - 'voice_agent' for lean prompt, 'full_context' for rich prompt
 * @returns The assembled system prompt string
 */
export async function loadSystemPrompt(
  personaId: string,
  mode: PromptMode = 'voice_agent'
): Promise<string> {
  const bundleDir = PERSONA_BUNDLES[personaId.toLowerCase()] || personaId;
  const fallback = FALLBACK_PROMPTS[bundleDir] || `You are ${personaId}, a helpful AI assistant.`;

  try {
    // Load assembly config
    const config = await loadAssemblyConfig(bundleDir);

    if (!config) {
      // No assembly config - fall back to legacy system-prompt.md
      const legacyPrompt = await loadFile(bundleDir, 'identity/system-prompt.md');
      if (legacyPrompt) {
        log.debug({ personaId, bundleDir, mode: 'legacy' }, 'Loaded legacy system prompt');
        return legacyPrompt;
      }
      return fallback;
    }

    // Determine which modules to include based on mode
    const moduleKeys =
      mode === 'voice_agent'
        ? config.voice_agent_modules || ['core_identity', 'function_calling']
        : config.full_context_modules || Object.keys(config.prompt_modules);

    // Load and assemble modules
    const sections: string[] = [];
    const loadedModules: string[] = [];

    for (const moduleKey of moduleKeys) {
      const modulePath = config.prompt_modules[moduleKey];
      if (!modulePath) continue;

      // Special handling for function_calling - use base + specialty pattern
      if (moduleKey === 'function_calling') {
        const functionCallingContent = await loadFunctionCallingWithBase(bundleDir);
        if (functionCallingContent) {
          sections.push(functionCallingContent);
          loadedModules.push(moduleKey);
        }
        continue;
      }

      const content = await loadFile(bundleDir, modulePath);
      if (content) {
        sections.push(content);
        loadedModules.push(moduleKey);
      }
    }

    if (sections.length === 0) {
      log.warn({ personaId, bundleDir }, 'No prompt modules loaded, using fallback');
      return fallback;
    }

    const assembled = sections.join('\n\n---\n\n');

    log.info(
      {
        personaId,
        bundleDir,
        mode,
        modules: loadedModules,
        length: assembled.length,
        estimatedTokens: Math.round(assembled.length / 4),
      },
      'Assembled modular prompt'
    );

    return assembled;
  } catch (error) {
    log.warn(
      { personaId, bundleDir, error: String(error) },
      'Failed to load system prompt, using fallback'
    );
    return fallback;
  }
}

/**
 * Load only the function calling instructions (for injection).
 * Uses the new base + specialty pattern automatically.
 */
export async function loadFunctionCallingPrompt(personaId: string): Promise<string | null> {
  const bundleDir = PERSONA_BUNDLES[personaId.toLowerCase()] || personaId;
  return loadFunctionCallingWithBase(bundleDir);
}

/**
 * Load only the core identity (without tools).
 */
export async function loadCoreIdentityPrompt(personaId: string): Promise<string | null> {
  const bundleDir = PERSONA_BUNDLES[personaId.toLowerCase()] || personaId;
  return loadFile(bundleDir, 'identity/core-identity.md');
}

/**
 * Load director's notes for rich context.
 */
export async function loadDirectorsNotes(personaId: string): Promise<string | null> {
  const bundleDir = PERSONA_BUNDLES[personaId.toLowerCase()] || personaId;
  return loadFile(bundleDir, 'identity/directors-notes.md');
}

// ============================================================================
// CACHING
// ============================================================================

/**
 * Synchronous cache for prompts that have been loaded.
 * Useful for avoiding async in constructors.
 */
const promptCache = new Map<string, string>();

/**
 * Get a cached prompt (returns fallback if not cached).
 * Call preloadPrompts() first to populate the cache.
 */
export function getCachedPrompt(personaId: string): string {
  const bundleDir = PERSONA_BUNDLES[personaId.toLowerCase()] || personaId;
  const cached = promptCache.get(bundleDir);
  if (cached) return cached;
  return FALLBACK_PROMPTS[bundleDir] || `You are ${personaId}, a helpful AI assistant.`;
}

/**
 * Preload prompts for all personas into cache.
 * Call this at app startup for sync access later.
 */
export async function preloadPrompts(): Promise<void> {
  const personaIds = Object.keys(FALLBACK_PROMPTS);
  await Promise.all(
    personaIds.map(async (personaId) => {
      const prompt = await loadSystemPrompt(personaId, 'voice_agent');
      promptCache.set(personaId, prompt);
    })
  );
  log.info({ count: promptCache.size }, 'Preloaded persona prompts');
}

// ============================================================================
// MODEL-LEVEL BASE INSTRUCTIONS
// ============================================================================

/**
 * Model-level base instructions cache.
 * These are foundational rules baked into the RealtimeModel at connection time.
 */
let modelBaseInstructionsCache: string | null = null;

/**
 * Load model-level base instructions.
 *
 * These are foundational rules that should be active from the very first moment
 * of connection (before agent-level instructions are sent).
 *
 * Includes:
 * - Platform context (Ferni team)
 * - Critical tool calling format (JSON)
 * - Honesty rules
 * - Voice output guidance
 * - Safety boundaries
 */
export async function loadModelBaseInstructions(): Promise<string> {
  // Return cached if available
  if (modelBaseInstructionsCache) {
    return modelBaseInstructionsCache;
  }

  try {
    const fs = await import('fs/promises');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Load from shared bundles directory
    const basePath = join(__dirname, '../../personas/bundles/shared/model-base-instructions.md');
    const content = await fs.readFile(basePath, 'utf-8');

    // Cache it
    modelBaseInstructionsCache = content;
    log.info(
      { length: content.length, estimatedTokens: Math.round(content.length / 4) },
      'Loaded model-level base instructions'
    );

    return content;
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to load model-base-instructions, using fallback');

    // Fallback: minimal critical instructions
    const fallback = `You are part of Ferni, a voice-first life coaching platform.

When user requests a tool action, output ONLY raw JSON:
{"fn":"toolName","args":{...}}

NO speech before or after JSON. Just JSON and stop.

For normal conversation, speak naturally with no JSON.

Never claim capabilities you don't have. Be honest.`;

    modelBaseInstructionsCache = fallback;
    return fallback;
  }
}

/**
 * Get model base instructions synchronously (from cache).
 * Call loadModelBaseInstructions() first to populate cache.
 */
export function getModelBaseInstructionsCached(): string | null {
  return modelBaseInstructionsCache;
}

// ============================================================================
// RE-EXPORTS FOR COMPATIBILITY
// ============================================================================

export { PERSONA_BUNDLES, FALLBACK_PROMPTS };
