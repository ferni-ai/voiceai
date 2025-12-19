/**
 * Prompt Loader Utility for Persona Agents
 *
 * Centralized utility for loading and ASSEMBLING system prompts from persona bundles.
 * Prompts are now modular:
 *   - identity/core-identity.md - WHO the persona IS
 *   - identity/function-calling.md - Tool usage instructions
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
    const moduleKeys = mode === 'voice_agent' 
      ? (config.voice_agent_modules || ['core_identity', 'function_calling'])
      : (config.full_context_modules || Object.keys(config.prompt_modules));

    // Load and assemble modules
    const sections: string[] = [];
    const loadedModules: string[] = [];
    
    for (const moduleKey of moduleKeys) {
      const modulePath = config.prompt_modules[moduleKey];
      if (!modulePath) continue;

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
        estimatedTokens: Math.round(assembled.length / 4)
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
 */
export async function loadFunctionCallingPrompt(personaId: string): Promise<string | null> {
  const bundleDir = PERSONA_BUNDLES[personaId.toLowerCase()] || personaId;
  return loadFile(bundleDir, 'identity/function-calling.md');
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
// RE-EXPORTS FOR COMPATIBILITY
// ============================================================================

export { PERSONA_BUNDLES, FALLBACK_PROMPTS };
