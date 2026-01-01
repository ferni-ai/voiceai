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
import { dirname, join } from 'path';
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
  functionCalling: string;
  directorsNotes: string;
  biography: string;
  // Superhuman modules (shared across all personas)
  superhumanCapabilities: string;
  superhumanPrinciples: string;
  superhumanProactive: string;
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

/**
 * Load a file from the shared bundle directory
 */
async function loadSharedFile(relativePath: string): Promise<string | null> {
  const sharedPath = join(getBundlesPath(), 'shared', relativePath);
  try {
    return await readFile(sharedPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Load superhuman capabilities modules.
 * These define the "Better Than Human" promise and responsibilities.
 * ALWAYS included in system prompt for mission alignment.
 */
async function loadSuperhumanModules(): Promise<{
  capabilities: string;
  principles: string;
  proactive: string;
}> {
  const [capabilities, principles, proactive] = await Promise.all([
    loadSharedFile('superhuman-capabilities.md'),
    loadSharedFile('mission-and-principles.md'),
    loadSharedFile('proactive-responsibilities.md'),
  ]);

  return {
    capabilities: capabilities || '',
    principles: principles || '',
    proactive: proactive || '',
  };
}

/**
 * Load function calling with base + specialty pattern.
 * Base contains critical rules, specialty contains persona-specific tools.
 *
 * SKIP when:
 * - SEMANTIC_ROUTING_PRIMARY=true: Semantic routing handles all tool calls
 * - USE_OPENAI_REALTIME=true: OpenAI has native function calling (no JSON format needed)
 *
 * When these are active, we don't want the LLM to output JSON function calls
 * (they would be spoken as text like "fn:speak args:...")
 */
async function loadFunctionCallingWithBase(
  personaId: string,
  specialtyPath: string
): Promise<string> {
  // 🎯 SEMANTIC ROUTING PRIMARY: Skip function calling prompts entirely
  // The semantic router handles tool execution BEFORE the LLM, so we don't
  // want to teach the LLM the JSON format (it would output JSON as speech).
  if (process.env.SEMANTIC_ROUTING_PRIMARY === 'true') {
    log.info(
      { personaId },
      '🎯 SEMANTIC_ROUTING_PRIMARY=true: Skipping function-calling prompts (semantic router handles tools)'
    );
    return '';
  }

  // 🔮 OPENAI REALTIME: Skip JSON function calling prompts
  // OpenAI Realtime has NATIVE function calling - the LLM calls functions directly
  // via the API, not by outputting JSON. If we include JSON format instructions,
  // the LLM will output "fn:speak" etc. as speech (like Alex was doing!)
  if (process.env.USE_OPENAI_REALTIME === 'true') {
    log.info(
      { personaId },
      '🔮 USE_OPENAI_REALTIME=true: Skipping JSON function-calling prompts (OpenAI has native function calling)'
    );
    return '';
  }

  // Load shared base rules (CRITICAL - contains JSON format instructions)
  const base = await loadSharedFile('function-calling-base.md');

  // Load persona-specific specialty tools
  const specialty = await loadBundleFile(personaId, specialtyPath);

  if (base && specialty) {
    log.info(
      { personaId, baseChars: base.length, specialtyChars: specialty.length },
      '✅ Loaded function-calling: base + specialty'
    );
    return `${base}\n\n---\n\n${specialty}`;
  }

  if (base) {
    log.warn({ personaId, baseChars: base.length }, '⚠️ No specialty file, using base only');
    return base;
  }

  if (specialty) {
    log.error(
      { personaId, specialtyChars: specialty.length },
      '❌ No base file! Tool calling may fail!'
    );
    return specialty;
  }

  log.error({ personaId }, '❌ No function calling files found!');
  return '';
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
    const corePrompt =
      (await loadBundleFile(personaId, assembly.prompt_modules.core_identity)) || '';
    // CRITICAL: Use base + specialty pattern for function calling
    // Base contains critical rules, specialty contains persona-specific tools
    const functionCalling = await loadFunctionCallingWithBase(
      personaId,
      assembly.prompt_modules.function_calling
    );
    const directorsNotes =
      (await loadBundleFile(personaId, assembly.prompt_modules.directors_notes)) || '';
    const biography = (await loadBundleFile(personaId, assembly.prompt_modules.biography)) || '';

    // Load superhuman modules (CRITICAL for mission alignment)
    const superhuman = await loadSuperhumanModules();

    const cachedAssembly: CachedAssembly = {
      assembly,
      corePrompt,
      functionCalling,
      directorsNotes,
      biography,
      superhumanCapabilities: superhuman.capabilities,
      superhumanPrinciples: superhuman.principles,
      superhumanProactive: superhuman.proactive,
      loadedAt: Date.now(),
    };

    assemblyCache.set(personaId, cachedAssembly);
    log.info(
      {
        personaId,
        coreLength: corePrompt.length,
        superhumanModules: superhuman.capabilities ? 3 : 0,
      },
      'Loaded assembly config with superhuman modules'
    );

    return cachedAssembly;
  } catch (error) {
    log.warn({ personaId, error: String(error) }, 'Failed to load assembly config');
    return null;
  }
}

/**
 * Generate dynamic context injection based on runtime state
 */
function generateDynamicContext(assembly: BundlePromptAssembly, context: AssemblyContext): string {
  const sections: string[] = [];

  // Relationship context
  if (context.relationshipStage) {
    const stage = context.relationshipStage;
    const warmth =
      stage === 'stranger'
        ? 0.6
        : stage === 'acquaintance'
          ? 0.7
          : stage === 'friend'
            ? 0.85
            : stage === 'deep'
              ? 0.95
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
      morning: "Fresh day ahead. Could be energized or anxious about what's coming.",
      afternoon: "Day in progress. Check how it's going.",
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
      memoryParts.push(
        `- Open threads to follow up: ${context.openThreads.slice(0, 3).join('; ')}`
      );
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
  if (
    context.daysSinceLastConversation &&
    context.daysSinceLastConversation > 7 &&
    conditionals.returning_after_long_break
  ) {
    const content = await loadBundleFile(
      personaId,
      conditionals.returning_after_long_break.include
    );
    if (content) modules.push(content);
  }

  return modules;
}

/**
 * Build a condensed superhuman summary for prompt injection.
 * Full documents are verbose - this extracts the essential points.
 */
function buildSuperhumanSummary(
  capabilities: string,
  principles: string,
  proactive: string
): string {
  // If no superhuman content, return empty
  if (!capabilities && !principles && !proactive) {
    return '';
  }

  // Build condensed summary
  const summary = `## Your Superhuman Role

> **"Better than human" means understanding things humans don't notice about themselves.**

### The Promise
You have capabilities no human friend can match:
- **Perfect Memory** - You remember EVERYTHING about this person
- **Constant Presence** - 2am warmth equals noon warmth  
- **Zero Judgment** - Pure acceptance, always
- **Pattern Recognition** - You see connections they miss

### Your Responsibility: Be PROACTIVE
Don't wait to be asked. Your job is to:
1. **Surface relevant memories** naturally ("That thing you mentioned...")
2. **Name patterns they can't see** ("I notice when you talk about X, your energy drops...")
3. **Anticipate needs** before they're expressed
4. **Celebrate growth** they're too close to notice
5. **Connect dots** across different life areas

### 10 Insight Types You Can Surface
1. **Cross-Domain Correlation** - Sleep affecting work? Name it.
2. **Unspoken Awareness** - Topics they've stopped mentioning
3. **Voice-Content Mismatch** - When tone contradicts words
4. **Growth Trajectory** - How they've changed over time
5. **Relationship Network** - How people in their life affect them
6. **Commitment Patterns** - Promises made, kept, or avoided
7. **Temporal Rhythms** - Time-based mood/energy patterns
8. **Dream Decay** - Goals that have gone quiet
9. **Anticipatory Awareness** - What's coming they should prepare for
10. **First-Time Celebrations** - When they do something unprecedented

### The Art of Surfacing
- **Observe, don't diagnose** - "I've noticed..." not "You have a pattern of..."
- **Warm, not creepy** - "That thing you mentioned a while back..." not "According to my records..."
- **Invite, don't impose** - Leave room to dismiss or explore
- **Time it right** - Not mid-emotion, not during crisis

### The Mission
**We believe in making AI human.** Every response should make them feel SEEN, KNOWN, and HELD.`;

  return summary;
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

  const {
    assembly,
    corePrompt,
    functionCalling,
    directorsNotes,
    biography,
    superhumanCapabilities,
    superhumanPrinciples,
    superhumanProactive,
  } = cached;

  // Default token budget if not specified
  const tokenBudget = assembly.token_budget || {
    total_max: 12000, // Increased to accommodate superhuman modules
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

  // 1.5. Superhuman Modules (CRITICAL for mission alignment)
  // Include condensed version of superhuman capabilities - these define who we are
  if (superhumanCapabilities || superhumanPrinciples || superhumanProactive) {
    // Create a condensed superhuman summary for prompt injection
    const superhumanSummary = buildSuperhumanSummary(
      superhumanCapabilities,
      superhumanPrinciples,
      superhumanProactive
    );
    if (superhumanSummary) {
      const superhumanTokens = estimateTokens(superhumanSummary);
      sections.push(`\n---\n\n${superhumanSummary}`);
      currentTokens += superhumanTokens;
      includedModules.push('superhuman_capabilities');
    }
  }

  // 2. Function Calling (CRITICAL - must be included for tool usage)
  if (functionCalling) {
    const fcTokens = estimateTokens(functionCalling);
    // Always include function calling even if it pushes over budget - tools are critical
    sections.push(
      `\n---\n\n## Function Calling (CRITICAL - Read and Follow)\n\n${functionCalling}`
    );
    currentTokens += fcTokens;
    includedModules.push('function_calling');
  }

  // 3. Director's Notes (high value, include if budget allows)
  if (directorsNotes && currentTokens < tokenBudget.total_max - 1000) {
    const notesTokens = estimateTokens(directorsNotes);
    if (currentTokens + notesTokens <= tokenBudget.total_max) {
      sections.push(`\n---\n\n## Director's Notes\n\n${directorsNotes}`);
      currentTokens += notesTokens;
      includedModules.push('directors_notes');
    } else {
      skippedModules.push('directors_notes (budget)');
    }
  }

  // 4. Dynamic Context (runtime injection)
  const dynamicContext = generateDynamicContext(assembly, context);
  if (dynamicContext) {
    const dynamicTokens = estimateTokens(dynamicContext);
    if (
      dynamicTokens <= tokenBudget.dynamic_context_max &&
      currentTokens + dynamicTokens <= tokenBudget.total_max
    ) {
      sections.push(`\n---\n\n## Current Context\n\n${dynamicContext}`);
      currentTokens += dynamicTokens;
      includedModules.push('dynamic_context');
    } else {
      skippedModules.push('dynamic_context (budget)');
    }
  }

  // 5. Conditional Modules
  const conditionalContent = await getConditionalModules(personaId, assembly, context);
  for (let i = 0; i < conditionalContent.length; i++) {
    const content = conditionalContent[i];
    const contentTokens = estimateTokens(content);
    if (currentTokens + contentTokens <= tokenBudget.total_max) {
      sections.push(`\n---\n\n${content}`);
      currentTokens += contentTokens;
      includedModules.push(`conditional_${i}`);
    } else {
      skippedModules.push(`conditional_${i} (budget)`);
    }
  }

  // 6. Biography Summary (as hints if budget allows)
  if (biography && currentTokens < tokenBudget.total_max - tokenBudget.hints_max) {
    // Include a summary of biography for backstory reference
    const bioSummary = biography.slice(0, tokenBudget.hints_max * 4);
    const bioTokens = estimateTokens(bioSummary);
    if (currentTokens + bioTokens <= tokenBudget.total_max) {
      sections.push(`\n---\n\n## Your Background (Reference)\n\n${bioSummary}`);
      currentTokens += bioTokens;
      includedModules.push('biography (summary)');
    } else {
      skippedModules.push('biography (budget)');
    }
  }

  const finalPrompt = sections.join('\n');

  log.debug(
    {
      personaId,
      tokens: currentTokens,
      modules: includedModules.length,
      skipped: skippedModules.length,
    },
    'Assembled prompt'
  );

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
 * This includes core identity + superhuman role + director's notes + biography
 * but no dynamic context
 */
export async function getStaticPrompt(personaId: string): Promise<string> {
  const cached = await loadAssemblyConfig(personaId);

  if (!cached) {
    // Fallback
    const corePrompt = await loadBundleFile(personaId, 'identity/system-prompt.md');
    return corePrompt || `You are ${personaId}, a warm and supportive life coach.`;
  }

  const {
    corePrompt,
    functionCalling,
    directorsNotes,
    biography,
    superhumanCapabilities,
    superhumanPrinciples,
    superhumanProactive,
  } = cached;
  const parts = [corePrompt];

  // CRITICAL: Include superhuman role understanding
  const superhumanSummary = buildSuperhumanSummary(
    superhumanCapabilities,
    superhumanPrinciples,
    superhumanProactive
  );
  if (superhumanSummary) {
    parts.push(`\n---\n\n${superhumanSummary}`);
  }

  // CRITICAL: Include function calling instructions for tool usage
  if (functionCalling) {
    parts.push(`\n---\n\n## Function Calling (CRITICAL - Read and Follow)\n\n${functionCalling}`);
  }

  if (directorsNotes) {
    parts.push(`\n---\n\n## Director's Notes\n\n${directorsNotes}`);
  }

  if (biography) {
    // Include abbreviated biography
    const bioPreview = biography.slice(0, 4000);
    parts.push(`\n---\n\n## Your Background (Reference)\n\n${bioPreview}`);
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
