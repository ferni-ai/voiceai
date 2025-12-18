/**
 * Prompt Loader Utility for Persona Agents
 *
 * Centralized utility for loading system prompts from persona bundles.
 * Each persona has a rich markdown system prompt in:
 *   src/personas/bundles/{persona-id}/identity/system-prompt.md
 *
 * @module agents/personas/prompt-loader
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PromptLoader' });

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

/**
 * Load a persona's system prompt from their bundle.
 *
 * @param personaId - The persona ID (e.g., 'ferni', 'maya-santos', 'alex')
 * @returns The system prompt string
 */
export async function loadSystemPrompt(personaId: string): Promise<string> {
  const bundleDir = PERSONA_BUNDLES[personaId.toLowerCase()] || personaId;
  const fallback = FALLBACK_PROMPTS[bundleDir] || `You are ${personaId}, a helpful AI assistant.`;

  try {
    const fs = await import('fs/promises');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    const promptPath = join(
      __dirname,
      '../../personas/bundles',
      bundleDir,
      'identity/system-prompt.md'
    );

    const prompt = await fs.readFile(promptPath, 'utf-8');
    log.debug({ personaId, bundleDir, length: prompt.length }, 'Loaded system prompt from bundle');
    return prompt;
  } catch (error) {
    log.warn(
      { personaId, bundleDir, error: String(error) },
      'Failed to load system prompt, using fallback'
    );
    return fallback;
  }
}

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
      const prompt = await loadSystemPrompt(personaId);
      promptCache.set(personaId, prompt);
    })
  );
  log.info({ count: promptCache.size }, 'Preloaded persona prompts');
}
