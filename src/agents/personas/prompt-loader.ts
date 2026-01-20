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
import { getModelProvider } from '../model-provider/index.js';
// Use centralized FTIS V2 mode check - single source of truth
import { isFTISV2OnlyMode } from '../processors/ftis-v2-integration.js';

const log = createLogger({ module: 'PromptLoader' });

/**
 * Estimate token count (rough approximation: ~4 chars per token for English)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate prompt to fit within token limit, preserving the most important sections.
 * Priority order:
 * 1. Core identity (WHO the persona IS)
 * 2. Critical behavior rules
 * 3. Additional context
 *
 * @param prompt - The full system prompt
 * @param maxTokens - Maximum tokens allowed
 * @returns Truncated prompt that fits within the limit
 */
function truncatePromptToTokenLimit(prompt: string, maxTokens: number): string {
  const currentTokens = estimateTokens(prompt);

  if (currentTokens <= maxTokens) {
    return prompt;
  }

  log.warn(
    {
      currentTokens,
      maxTokens,
      overageTokens: currentTokens - maxTokens,
      promptLength: prompt.length,
    },
    '⚠️ System prompt exceeds token limit, truncating'
  );

  // Split by sections (marked by "---")
  const sections = prompt.split(/\n---\n/);

  // If single section, just truncate from the end
  if (sections.length === 1) {
    const maxChars = maxTokens * 4;
    const truncated = prompt.slice(0, maxChars);
    log.info(
      { originalTokens: currentTokens, newTokens: estimateTokens(truncated), sectionsRemoved: 0 },
      '📏 Truncated prompt (single section)'
    );
    return truncated + '\n\n[Content truncated to fit token limit]';
  }

  // Keep first section (core identity) always
  const result: string[] = [sections[0]];
  let currentLength = estimateTokens(sections[0]);
  const maxAllowed = maxTokens - 100; // Leave room for truncation message

  // Try to fit remaining sections in order of appearance (priority)
  for (let i = 1; i < sections.length; i++) {
    const sectionTokens = estimateTokens(sections[i]);
    if (currentLength + sectionTokens <= maxAllowed) {
      result.push(sections[i]);
      currentLength += sectionTokens;
    } else {
      // Try to include a truncated version of important sections
      const remaining = maxAllowed - currentLength;
      if (remaining > 500) {
        // Only truncate if we have reasonable space
        const truncatedSection = sections[i].slice(0, remaining * 4);
        result.push(truncatedSection + '\n[Section truncated]');
        currentLength += remaining;
      }
      // Skip remaining sections
      log.info(
        { sectionsKept: result.length, sectionsTotal: sections.length, sectionsSkipped: sections.length - result.length },
        '📏 Skipping remaining sections to fit token limit'
      );
      break;
    }
  }

  const finalPrompt = result.join('\n\n---\n\n');
  const finalTokens = estimateTokens(finalPrompt);

  log.info(
    {
      originalTokens: currentTokens,
      finalTokens,
      reduction: currentTokens - finalTokens,
      sectionsKept: result.length,
      sectionsTotal: sections.length,
    },
    '✅ Prompt truncated to fit OpenAI Realtime token limit'
  );

  return finalPrompt;
}

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
 * Load generated tool documentation from src/tools/schemas/generated/.
 *
 * When USE_GENERATED_TOOL_DOCS=true, prefer auto-generated markdown over manual files.
 * This is part of the Gemini Native Tool Schema migration.
 *
 * @see scripts/tools/generate-markdown-docs.ts
 */
async function loadGeneratedToolDocs(): Promise<string | null> {
  // Feature flag: opt-in to generated docs
  if (process.env.USE_GENERATED_TOOL_DOCS !== 'true') {
    return null;
  }

  try {
    const fs = await import('fs/promises');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    const filePath = join(__dirname, '../../../tools/schemas/generated/function-calling-base.generated.md');
    const content = await fs.readFile(filePath, 'utf-8');

    log.info({ source: 'generated' }, '📝 Loaded generated function-calling docs from tool schemas');
    return content;
  } catch {
    log.warn({}, '⚠️ USE_GENERATED_TOOL_DOCS=true but generated file not found - falling back to manual');
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
 * SKIP when:
 * - SEMANTIC_ROUTING_PRIMARY=true: Semantic routing handles all tool calls
 * - Provider has native function calling (e.g., OpenAI Realtime)
 *
 * When these are active, we don't want the LLM to output JSON function calls
 * (they would be spoken as text like "fn:speak args:...").
 */
async function loadFunctionCallingWithBase(bundleDir: string): Promise<string | null> {
  // 🎯 FTIS V2 ONLY MODE: Load FTIS V2 instructions instead of JSON function calling
  // FTIS V2 executes tools directly - LLM just responds to results
  // Uses isFTISV2OnlyMode() as SINGLE SOURCE OF TRUTH (enabled by default!)
  if (isFTISV2OnlyMode()) {
    log.info(
      { bundleDir },
      '🎯 FTIS V2 MODE: Loading FTIS V2 instructions (tools execute automatically)'
    );
    const ftisInstructions = await loadSharedFile('ftis-v2-instructions.md');
    if (ftisInstructions) {
      return ftisInstructions;
    }
    // Fall through if file not found
    log.warn({ bundleDir }, '⚠️ FTIS V2 instructions file not found, no tool instructions loaded');
    return null;
  }

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

  // Check if provider needs JSON function calling prompts
  const provider = getModelProvider();
  const promptConfig = provider.getPromptModules();

  if (!promptConfig.includeFunctionCallingBase) {
    log.info(
      { bundleDir, providerId: provider.id },
      `${provider.getLogPrefix()} Skipping JSON function-calling prompts (provider has native function calling)`
    );
    return null;
  }

  // Load safety disclaimer (always include if available)
  const safetyDisclaimer = await loadSafetyDisclaimer();

  // Try generated docs first (from tool schemas, when USE_GENERATED_TOOL_DOCS=true)
  const generatedDocs = await loadGeneratedToolDocs();
  const specialty = await loadFile(bundleDir, 'identity/function-calling-specialty.md');

  const parts: string[] = [];

  // Safety disclaimer comes first (sets the tone)
  if (safetyDisclaimer) {
    parts.push(safetyDisclaimer);
  }

  // If generated docs available and enabled, use them instead of manual base
  if (generatedDocs && specialty) {
    log.debug({ bundleDir, source: 'generated' }, 'Using generated function-calling docs + persona specialty');
    parts.push(generatedDocs, specialty);
    return parts.join('\n\n---\n\n');
  }

  // Fall back to manual files: base + specialty
  const base = await loadSharedFile('function-calling-base.md');

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

/**
 * Load tool usage guidance (conceptual knowledge about WHEN to use tools).
 *
 * This is SEPARATE from JSON format instructions and should be loaded for ALL providers,
 * including those with native function calling (OpenAI Realtime).
 *
 * Contains:
 * - Handoff triggers (which topic → which persona)
 * - Coordinator awareness matrix
 * - Phone call mechanics
 * - Game triggers
 * - Triage vs handoff logic
 *
 * @param bundleDir - The persona bundle directory
 * @returns Tool usage guidance content, or null if provider doesn't need it
 */
async function loadToolUsageGuidance(bundleDir: string): Promise<string | null> {
  const provider = getModelProvider();
  const promptConfig = provider.getPromptModules();

  if (!promptConfig.includeToolUsageGuidance) {
    log.debug(
      { bundleDir, providerId: provider.id },
      `${provider.getLogPrefix()} Skipping tool usage guidance (provider config)`
    );
    return null;
  }

  const guidance = await loadFile(bundleDir, 'identity/tool-usage-guidance.md');

  if (guidance) {
    log.debug(
      { bundleDir, providerId: provider.id },
      `${provider.getLogPrefix()} Loaded tool usage guidance (conceptual knowledge about WHEN to use tools)`
    );
    return guidance;
  }

  log.debug({ bundleDir }, 'No tool-usage-guidance.md found');
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
      let legacyPrompt = await loadFile(bundleDir, 'identity/system-prompt.md');
      if (legacyPrompt) {
        // Apply token limiting based on provider's limit
        const provider = getModelProvider();
        const tokenLimit = provider.getTokenLimit();
        const tokens = estimateTokens(legacyPrompt);
        if (tokens > tokenLimit) {
          log.warn(
            { personaId, tokens, limit: tokenLimit, providerId: provider.id },
            `${provider.getLogPrefix()} Legacy prompt exceeds token limit, truncating`
          );
          legacyPrompt = truncatePromptToTokenLimit(legacyPrompt, tokenLimit);
        }
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
      // (includes JSON format instructions - Gemini only)
      if (moduleKey === 'function_calling') {
        const functionCallingContent = await loadFunctionCallingWithBase(bundleDir);
        if (functionCallingContent) {
          sections.push(functionCallingContent);
          loadedModules.push(moduleKey);
        }
        continue;
      }

      // Special handling for tool_usage_guidance - conceptual knowledge about WHEN to use tools
      // (ALL providers need this, including OpenAI Realtime with native function calling)
      if (moduleKey === 'tool_usage_guidance') {
        const guidanceContent = await loadToolUsageGuidance(bundleDir);
        if (guidanceContent) {
          sections.push(guidanceContent);
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

    let assembled = sections.join('\n\n---\n\n');

    // Apply token limiting based on provider's limit
    // Different providers have different token limits for system instructions.
    const systemPromptProvider = getModelProvider();
    const systemPromptTokenLimit = systemPromptProvider.getTokenLimit();
    const estimatedTokenCount = estimateTokens(assembled);
    if (estimatedTokenCount > systemPromptTokenLimit) {
      log.warn(
        {
          personaId,
          estimatedTokens: estimatedTokenCount,
          limit: systemPromptTokenLimit,
          providerId: systemPromptProvider.id,
        },
        `${systemPromptProvider.getLogPrefix()} System prompt exceeds token limit, truncating`
      );
      assembled = truncatePromptToTokenLimit(assembled, systemPromptTokenLimit);
    }

    log.info(
      {
        personaId,
        bundleDir,
        mode,
        modules: loadedModules,
        length: assembled.length,
        estimatedTokens: Math.round(assembled.length / 4),
        providerId: systemPromptProvider.id,
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
 * Load tool usage guidance (conceptual knowledge about WHEN to use tools).
 * This is provider-aware and returns null if provider doesn't need it.
 */
export async function loadToolUsageGuidancePrompt(personaId: string): Promise<string | null> {
  const bundleDir = PERSONA_BUNDLES[personaId.toLowerCase()] || personaId;
  return loadToolUsageGuidance(bundleDir);
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
 * - Critical tool calling format (JSON) - SKIPPED for providers with native FC or FTIS V2 mode
 * - Honesty rules
 * - Voice output guidance
 * - Safety boundaries
 *
 * NOTE: Providers with native function calling (e.g., OpenAI Realtime) use
 * minimal instructions to prevent the LLM from outputting "fn:speak" etc.
 *
 * NOTE: When FTIS V2 mode is active, load model-base-instructions-ftis.md which
 * does NOT include JSON format examples (FTIS handles all tools externally).
 */
export async function loadModelBaseInstructions(): Promise<string> {
  // Check if provider uses minimal instructions (native function calling)
  const provider = getModelProvider();
  const promptConfig = provider.getPromptModules();

  if (promptConfig.useMinimalInstructions) {
    const minimalInstructions = provider.getMinimalInstructions();
    log.info(
      { providerId: provider.id, length: minimalInstructions.length },
      `${provider.getLogPrefix()} Using minimal instructions (native function calling)`
    );
    return minimalInstructions;
  }

  // Return cached if available (providers that need full instructions)
  if (modelBaseInstructionsCache) {
    return modelBaseInstructionsCache;
  }

  // Check if FTIS V2 mode is active - use FTIS-specific instructions (no JSON)
  // Uses isFTISV2OnlyMode() as SINGLE SOURCE OF TRUTH (enabled by default!)
  const isFTISV2Mode = isFTISV2OnlyMode();

  try {
    const fs = await import('fs/promises');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Load from shared bundles directory
    // Use FTIS-specific instructions when FTIS V2 mode is active (no JSON examples)
    const fileName = isFTISV2Mode ? 'model-base-instructions-ftis.md' : 'model-base-instructions.md';
    const basePath = join(__dirname, '../../personas/bundles/shared', fileName);
    const content = await fs.readFile(basePath, 'utf-8');

    // Cache it
    modelBaseInstructionsCache = content;
    log.info(
      { 
        length: content.length, 
        estimatedTokens: Math.round(content.length / 4),
        isFTISV2Mode,
        fileName,
      },
      `Loaded model-level base instructions${isFTISV2Mode ? ' (FTIS V2 mode - no JSON)' : ''}`
    );

    return content;
  } catch (error) {
    log.warn({ error: String(error), isFTISV2Mode }, 'Failed to load model-base-instructions, using fallback');

    // Fallback: different based on mode
    const fallback = isFTISV2Mode
      ? `You are part of Ferni, a voice-first life coaching platform.

Actions happen automatically in the background. You don't call tools or announce actions.

Just be conversational. When users ask for things like music or weather, respond naturally:
- "Sure thing!" or "Here we go!" or "Nice choice!"

CRITICAL: Never output technical text like brackets, status messages, or "tool" language. Just chat naturally.

Never claim capabilities you don't have. Be honest.`
      : `You are part of Ferni, a voice-first life coaching platform.

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
