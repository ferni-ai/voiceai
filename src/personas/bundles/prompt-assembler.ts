/**
 * Prompt Assembler
 *
 * Dynamically assembles the system prompt from modular components
 * defined in _assembly.json. This enables:
 *
 * 1. Rich identity composition from multiple files
 * 2. Dynamic context injection at runtime
 * 3. Token budget management
 * 4. Conditional module inclusion
 *
 * @module personas/bundles/prompt-assembler
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../../utils/safe-logger.js';
import type { BundlePromptAssembly } from './types.js';

const log = createLogger({ module: 'PromptAssembler' });

// ============================================================================
// TYPES
// ============================================================================

export interface AssemblyContext {
  /** User's relationship stage with the persona */
  relationshipStage?: string;
  /** Current emotional state detected */
  emotionalState?: {
    primary: string;
    intensity: number;
    trajectory?: 'improving' | 'stable' | 'declining';
  };
  /** Is this user in distress? */
  isDistressed?: boolean;
  /** Is this user celebrating? */
  isCelebrating?: boolean;
  /** Is this the first conversation? */
  isFirstConversation?: boolean;
  /** Number of conversations */
  conversationCount?: number;
  /** Days since last conversation */
  daysSinceLastConversation?: number;
  /** Current persona mode */
  currentMode?: string;
  /** Time of day */
  timeOfDay?: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night';
  /** Day of week */
  dayOfWeek?: string;
  /** Topics from earlier in session */
  sessionTopics?: string[];
  /** Last session summary */
  lastSessionSummary?: string;
  /** Open threads to follow up on */
  openThreads?: string[];
}

export interface AssembledPrompt {
  /** The full assembled system prompt */
  prompt: string;
  /** Token count estimate */
  estimatedTokens: number;
  /** Modules that were included */
  includedModules: string[];
  /** Modules that were skipped (budget or conditions) */
  skippedModules: string[];
  /** Any warnings during assembly */
  warnings: string[];
}

// ============================================================================
// CACHE
// ============================================================================

interface CachedAssembly {
  assembly: BundlePromptAssembly;
  corePrompt: string;
  directorsNotes: string;
  biography: string;
  loadedAt: number;
}

const assemblyCache = new Map<string, CachedAssembly>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Estimate token count (rough approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Get the bundles directory path
 */
function getBundlesPath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return __dirname; // This file is in src/personas/bundles/
}

/**
 * Load a file from the persona bundle
 */
async function loadBundleFile(personaId: string, relativePath: string): Promise<string | null> {
  const bundlePath = join(getBundlesPath(), personaId, relativePath);
  try {
    return await readFile(bundlePath, 'utf-8');
  } catch {
    return null;
  }
}

// ============================================================================
// CORE ASSEMBLY FUNCTIONS
// ============================================================================

/**
 * Load and cache the assembly configuration and core modules
 */
async function loadAssemblyConfig(personaId: string): Promise<CachedAssembly | null> {
  // Check cache
  const cached = assemblyCache.get(personaId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached;
  }

  try {
    // Load assembly config
    const assemblyPath = join(getBundlesPath(), personaId, 'content/prompts/_assembly.json');
    const assemblyJson = await readFile(assemblyPath, 'utf-8');
    const assembly = JSON.parse(assemblyJson) as BundlePromptAssembly;

    // Load core modules (these are always included)
    const corePrompt = await loadBundleFile(personaId, assembly.prompt_modules.core_identity) || '';
    const directorsNotes = await loadBundleFile(personaId, assembly.prompt_modules.directors_notes) || '';
    const biography = await loadBundleFile(personaId, assembly.prompt_modules.biography) || '';

    const cachedAssembly: CachedAssembly = {
      assembly,
      corePrompt,
      directorsNotes,
      biography,
      loadedAt: Date.now(),
    };

    assemblyCache.set(personaId, cachedAssembly);
    log.info({ personaId, coreLength: corePrompt.length }, 'Loaded assembly config');

    return cachedAssembly;
  } catch (error) {
    log.warn({ personaId, error: String(error) }, 'Failed to load assembly config');
    return null;
  }
}

/**
 * Generate dynamic context injection based on runtime state
 */
function generateDynamicContext(
  assembly: BundlePromptAssembly,
  context: AssemblyContext
): string {
  const sections: string[] = [];

  // Relationship context
  if (context.relationshipStage) {
    const stage = context.relationshipStage;
    const warmth = stage === 'stranger' ? 0.6 
      : stage === 'acquaintance' ? 0.7 
      : stage === 'friend' ? 0.85 
      : stage === 'deep' ? 0.95 
      : 0.75;

    sections.push(`[RELATIONSHIP: ${stage}]
- Warmth level: ${warmth}
- ${context.isFirstConversation ? 'First meeting - be welcoming but not presumptuous' : `Conversation #${context.conversationCount || 1}`}
- ${warmth > 0.8 ? 'Can share deeper personal stories' : 'Keep sharing appropriate to relationship depth'}`);
  }

  // Emotional context
  if (context.emotionalState) {
    const { primary, intensity, trajectory } = context.emotionalState;
    sections.push(`[EMOTIONAL CONTEXT]
- Detected emotion: ${primary}
- Intensity: ${intensity > 0.7 ? 'high' : intensity > 0.4 ? 'moderate' : 'low'}
${trajectory ? `- Trajectory: ${trajectory}` : ''}
- ${intensity > 0.7 ? 'Match their emotional energy' : 'Stay grounded and present'}`);
  }

  // Time context
  if (context.timeOfDay) {
    const timeAcknowledgments: Record<string, string> = {
      early_morning: 'Early riser. Quiet energy. Maybe contemplative.',
      morning: 'Fresh day ahead. Could be energized or anxious about what\'s coming.',
      afternoon: 'Day in progress. Check how it\'s going.',
      evening: 'Winding down. Reflective time.',
      late_night: 'Late night. Something might be on their mind. Extra presence.',
    };
    sections.push(`[TIME CONTEXT: ${context.timeOfDay}, ${context.dayOfWeek || 'unknown'}]
${timeAcknowledgments[context.timeOfDay] || ''}`);
  }

  // Memory context
  if (context.sessionTopics?.length || context.lastSessionSummary || context.openThreads?.length) {
    const memoryParts: string[] = ['[MEMORY CONTEXT]'];
    if (context.sessionTopics?.length) {
      memoryParts.push(`- Topics this session: ${context.sessionTopics.slice(0, 5).join(', ')}`);
    }
    if (context.lastSessionSummary) {
      memoryParts.push(`- Last session: ${context.lastSessionSummary.slice(0, 200)}`);
    }
    if (context.openThreads?.length) {
      memoryParts.push(`- Open threads to follow up: ${context.openThreads.slice(0, 3).join('; ')}`);
    }
    sections.push(memoryParts.join('\n'));
  }

  // Returning after long break
  if (context.daysSinceLastConversation && context.daysSinceLastConversation > 7) {
    sections.push(`[RECONNECTION]
It's been ${context.daysSinceLastConversation} days. 
- Acknowledge the gap naturally: "It's been a minute..."
- Don't guilt them for being away
- Be curious about what's been happening`);
  }

  return sections.join('\n\n');
}

/**
 * Check conditional modules and include if conditions are met
 */
async function getConditionalModules(
  personaId: string,
  assembly: BundlePromptAssembly,
  context: AssemblyContext
): Promise<string[]> {
  const modules: string[] = [];
  const conditionals = assembly.conditional_modules;

  if (!conditionals) {
    return modules;
  }

  // User is distressed
  if (context.isDistressed && conditionals.user_is_distressed) {
    const content = await loadBundleFile(personaId, conditionals.user_is_distressed.include);
    if (content) modules.push(content);
  }

  // User is celebrating
  if (context.isCelebrating && conditionals.user_is_celebrating) {
    const content = await loadBundleFile(personaId, conditionals.user_is_celebrating.include);
    if (content) modules.push(content);
  }

  // First conversation
  if (context.isFirstConversation && conditionals.first_conversation) {
    const content = await loadBundleFile(personaId, conditionals.first_conversation.include);
    if (content) modules.push(content);
  }

  // Returning after long break
  if (context.daysSinceLastConversation && context.daysSinceLastConversation > 7 && conditionals.returning_after_long_break) {
    const content = await loadBundleFile(personaId, conditionals.returning_after_long_break.include);
    if (content) modules.push(content);
  }

  return modules;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Assemble the full system prompt for a persona with runtime context
 *
 * @param personaId - The persona to assemble for
 * @param context - Runtime context for dynamic injection
 * @returns Assembled prompt with metadata
 */
export async function assemblePrompt(
  personaId: string,
  context: AssemblyContext = {}
): Promise<AssembledPrompt> {
  const warnings: string[] = [];
  const includedModules: string[] = [];
  const skippedModules: string[] = [];

  // Load assembly config
  const cached = await loadAssemblyConfig(personaId);
  
  if (!cached) {
    // Fallback to direct system prompt load
    const corePrompt = await loadBundleFile(personaId, 'identity/system-prompt.md');
    if (corePrompt) {
      return {
        prompt: corePrompt,
        estimatedTokens: estimateTokens(corePrompt),
        includedModules: ['core_identity'],
        skippedModules: [],
        warnings: ['Assembly config not found, using core prompt only'],
      };
    }
    throw new Error(`No prompt available for persona: ${personaId}`);
  }

  const { assembly, corePrompt, directorsNotes, biography } = cached;
  
  // Default token budget if not specified
  const tokenBudget = assembly.token_budget || {
    total_max: 8000,
    core_identity_max: 2000,
    dynamic_context_max: 3000,
    recent_history_max: 2500,
    hints_max: 500,
  };

  // Start building the prompt
  const sections: string[] = [];
  let currentTokens = 0;

  // 1. Core Identity (always included, trimmed if needed)
  if (corePrompt) {
    const coreTokens = estimateTokens(corePrompt);
    if (coreTokens <= tokenBudget.core_identity_max) {
      sections.push(corePrompt);
      currentTokens += coreTokens;
      includedModules.push('core_identity');
    } else {
      // Truncate to budget
      const truncatedCore = corePrompt.slice(0, tokenBudget.core_identity_max * 4);
      sections.push(truncatedCore);
      currentTokens += tokenBudget.core_identity_max;
      includedModules.push('core_identity (truncated)');
      warnings.push('Core identity truncated to fit budget');
    }
  }

  // 2. Director's Notes (high value, include if budget allows)
  if (directorsNotes && currentTokens < tokenBudget.total_max - 1000) {
    const notesTokens = estimateTokens(directorsNotes);
    if (currentTokens + notesTokens <= tokenBudget.total_max) {
      sections.push('\n---\n\n## Director\'s Notes\n\n' + directorsNotes);
      currentTokens += notesTokens;
      includedModules.push('directors_notes');
    } else {
      skippedModules.push('directors_notes (budget)');
    }
  }

  // 3. Dynamic Context (runtime injection)
  const dynamicContext = generateDynamicContext(assembly, context);
  if (dynamicContext) {
    const dynamicTokens = estimateTokens(dynamicContext);
    if (dynamicTokens <= tokenBudget.dynamic_context_max && currentTokens + dynamicTokens <= tokenBudget.total_max) {
      sections.push('\n---\n\n## Current Context\n\n' + dynamicContext);
      currentTokens += dynamicTokens;
      includedModules.push('dynamic_context');
    } else {
      skippedModules.push('dynamic_context (budget)');
    }
  }

  // 4. Conditional Modules
  const conditionalContent = await getConditionalModules(personaId, assembly, context);
  for (let i = 0; i < conditionalContent.length; i++) {
    const content = conditionalContent[i];
    const contentTokens = estimateTokens(content);
    if (currentTokens + contentTokens <= tokenBudget.total_max) {
      sections.push('\n---\n\n' + content);
      currentTokens += contentTokens;
      includedModules.push(`conditional_${i}`);
    } else {
      skippedModules.push(`conditional_${i} (budget)`);
    }
  }

  // 5. Biography Summary (as hints if budget allows)
  if (biography && currentTokens < tokenBudget.total_max - tokenBudget.hints_max) {
    // Include a summary of biography for backstory reference
    const bioSummary = biography.slice(0, tokenBudget.hints_max * 4);
    const bioTokens = estimateTokens(bioSummary);
    if (currentTokens + bioTokens <= tokenBudget.total_max) {
      sections.push('\n---\n\n## Your Background (Reference)\n\n' + bioSummary);
      currentTokens += bioTokens;
      includedModules.push('biography (summary)');
    } else {
      skippedModules.push('biography (budget)');
    }
  }

  const finalPrompt = sections.join('\n');

  log.debug({
    personaId,
    tokens: currentTokens,
    modules: includedModules.length,
    skipped: skippedModules.length,
  }, 'Assembled prompt');

  return {
    prompt: finalPrompt,
    estimatedTokens: currentTokens,
    includedModules,
    skippedModules,
    warnings,
  };
}

/**
 * Get the static core prompt (for caching/prewarming)
 * This includes core identity + director's notes + biography
 * but no dynamic context
 */
export async function getStaticPrompt(personaId: string): Promise<string> {
  const cached = await loadAssemblyConfig(personaId);
  
  if (!cached) {
    // Fallback
    const corePrompt = await loadBundleFile(personaId, 'identity/system-prompt.md');
    return corePrompt || `You are ${personaId}, a warm and supportive life coach.`;
  }

  const { corePrompt, directorsNotes, biography } = cached;
  const parts = [corePrompt];
  
  if (directorsNotes) {
    parts.push('\n---\n\n## Director\'s Notes\n\n' + directorsNotes);
  }
  
  if (biography) {
    // Include abbreviated biography
    const bioPreview = biography.slice(0, 4000);
    parts.push('\n---\n\n## Your Background (Reference)\n\n' + bioPreview);
  }

  return parts.join('\n');
}

/**
 * Clear the assembly cache (for testing or hot reload)
 */
export function clearAssemblyCache(): void {
  assemblyCache.clear();
}

/**
 * Check if assembly config exists for a persona
 */
export async function hasAssemblyConfig(personaId: string): Promise<boolean> {
  const cached = await loadAssemblyConfig(personaId);
  return cached !== null;
}

export default {
  assemblePrompt,
  getStaticPrompt,
  clearAssemblyCache,
  hasAssemblyConfig,
};

