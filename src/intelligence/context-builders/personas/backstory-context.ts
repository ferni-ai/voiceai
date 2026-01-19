/**
 * Dynamic Backstory Context Builder
 *
 * State-of-the-art persona backstory injection system.
 * Instead of dumping a full biography upfront, this builder:
 * 1. Detects trigger words in the conversation
 * 2. Loads relevant backstory segments dynamically
 * 3. Injects ONLY the contextually relevant backstory
 *
 * This is how real humans work - you don't share your life story upfront,
 * you reveal relevant backstory when the conversation calls for it.
 *
 * @module intelligence/context-builders/personas/backstory-context
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { loadBundleById } from '../../../personas/bundles/loader.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
import { BuilderCategory } from '../core/categories.js';
import { createHintInjection } from '../core/injection-helpers.js';

const log = createLogger({ module: 'BackstoryContextBuilder' });

// ============================================================================
// TYPES
// ============================================================================

interface BackstorySegment {
  triggers: string[];
  content: Record<string, string>;
  voice_lines: string[];
}

interface DynamicBackstory {
  _schema_version: string;
  trigger_contexts: Record<string, string[]>;
  rich_backstory: Record<string, BackstorySegment>;
  surface_probability: Record<string, number>;
}

// ============================================================================
// CACHE
// ============================================================================

const backstoryCache = new Map<string, DynamicBackstory>();

/**
 * Load dynamic backstory for a persona
 */
async function loadDynamicBackstory(personaId: string): Promise<DynamicBackstory | null> {
  // Check cache
  if (backstoryCache.has(personaId)) {
    return backstoryCache.get(personaId)!;
  }

  try {
    const bundle = await loadBundleById(personaId);
    if (!bundle) {
      log.debug({ personaId }, 'No bundle found for backstory loading');
      return null;
    }

    const behaviors = await bundle.getBehaviors();
    // backstory_dynamic may not exist in all bundles - check dynamically
    const backstory = (behaviors as Record<string, unknown>)?.backstory_dynamic as DynamicBackstory | undefined;

    if (!backstory) {
      // Try loading from JSON file directly
      const fs = await import('fs/promises');
      const { join } = await import('path');
      
      const backstoryPath = join(bundle.bundlePath, 'content/behaviors/backstory-dynamic.json');
      try {
        const content = await fs.readFile(backstoryPath, 'utf-8');
        const parsed = JSON.parse(content) as DynamicBackstory;
        backstoryCache.set(personaId, parsed);
        log.debug({ personaId }, 'Loaded dynamic backstory from file');
        return parsed;
      } catch {
        log.debug({ personaId }, 'No backstory-dynamic.json found');
        return null;
      }
    }

    backstoryCache.set(personaId, backstory);
    return backstory;
  } catch (error) {
    log.warn({ personaId, error: String(error) }, 'Failed to load dynamic backstory');
    return null;
  }
}

// ============================================================================
// TRIGGER DETECTION
// ============================================================================

/**
 * Detect which backstory contexts are triggered by the user's input
 */
function detectTriggeredContexts(
  userText: string,
  triggerContexts: Record<string, string[]>
): string[] {
  const triggered: string[] = [];
  const normalizedText = userText.toLowerCase();

  for (const [contextName, triggers] of Object.entries(triggerContexts)) {
    for (const trigger of triggers) {
      if (normalizedText.includes(trigger.toLowerCase())) {
        triggered.push(contextName);
        break; // Only need one trigger per context
      }
    }
  }

  return triggered;
}

/**
 * Find backstory segments that match triggered contexts
 */
function findRelevantBackstory(
  triggeredContexts: string[],
  richBackstory: Record<string, BackstorySegment>,
  surfaceProbabilities: Record<string, number>
): Array<{ key: string; segment: BackstorySegment; probability: number }> {
  const relevant: Array<{ key: string; segment: BackstorySegment; probability: number }> = [];

  for (const [key, segment] of Object.entries(richBackstory)) {
    // Check if any of the segment's triggers match our triggered contexts
    const hasMatch = segment.triggers.some((t) => triggeredContexts.includes(t));
    
    if (hasMatch) {
      const probability = surfaceProbabilities[key] ?? 0.3;
      relevant.push({ key, segment, probability });
    }
  }

  return relevant;
}

/**
 * Select which backstory to actually surface (probabilistic)
 */
function selectBackstoryToSurface(
  relevant: Array<{ key: string; segment: BackstorySegment; probability: number }>
): { key: string; segment: BackstorySegment } | null {
  if (relevant.length === 0) return null;

  // Sort by probability (higher = more likely to surface)
  relevant.sort((a, b) => b.probability - a.probability);

  // Take the top candidate and roll dice
  const top = relevant[0];
  const roll = Math.random();

  if (roll < top.probability) {
    return { key: top.key, segment: top.segment };
  }

  // Didn't surface - maybe try second candidate
  if (relevant.length > 1) {
    const second = relevant[1];
    const secondRoll = Math.random();
    if (secondRoll < second.probability * 0.5) {
      // Lower probability for second choice
      return { key: second.key, segment: second.segment };
    }
  }

  return null;
}

/**
 * Format backstory for injection
 */
function formatBackstoryInjection(
  key: string,
  segment: BackstorySegment
): string {
  // Pick a random voice line if available
  const voiceLine = segment.voice_lines.length > 0
    ? segment.voice_lines[Math.floor(Math.random() * segment.voice_lines.length)]
    : null;

  // Build a concise backstory injection
  const parts: string[] = [];
  
  parts.push(`[BACKSTORY CONTEXT: ${key.replace(/_/g, ' ')}]`);
  
  if (voiceLine) {
    parts.push(`You might naturally reference: "${voiceLine}"`);
  }

  // Add one key piece of content (not the whole thing)
  const contentKeys = Object.keys(segment.content);
  if (contentKeys.length > 0) {
    const randomKey = contentKeys[Math.floor(Math.random() * contentKeys.length)];
    const contentSnippet = segment.content[randomKey];
    if (contentSnippet.length < 300) {
      parts.push(`Background: ${contentSnippet}`);
    }
  }

  parts.push('(Surface naturally if it fits, don\'t force it.)');

  return parts.join('\n');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export const backstoryContextBuilder: ContextBuilder = {
  name: 'dynamic-backstory',
  description: 'Injects contextually relevant persona backstory based on conversation triggers',
  priority: 35, // Medium priority - after identity, before humanization
  category: BuilderCategory.PERSONA,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { userText, persona } = input;
    const injections: ContextInjection[] = [];

    if (!persona?.id) {
      return injections;
    }

    // Don't run on very short inputs (greetings, etc.)
    if (userText.length < 20) {
      return injections;
    }

    // Load dynamic backstory for this persona
    const backstory = await loadDynamicBackstory(persona.id);
    if (!backstory) {
      return injections;
    }

    // Detect triggered contexts
    const triggeredContexts = detectTriggeredContexts(userText, backstory.trigger_contexts);
    
    if (triggeredContexts.length === 0) {
      return injections;
    }

    log.debug(
      { personaId: persona.id, triggered: triggeredContexts },
      'Backstory triggers detected'
    );

    // Find relevant backstory segments
    const relevant = findRelevantBackstory(
      triggeredContexts,
      backstory.rich_backstory,
      backstory.surface_probability
    );

    if (relevant.length === 0) {
      return injections;
    }

    // Probabilistically select what to surface
    const selected = selectBackstoryToSurface(relevant);
    
    if (!selected) {
      log.debug(
        { personaId: persona.id, considered: relevant.map(r => r.key) },
        'Backstory considered but not surfaced (probability roll)'
      );
      return injections;
    }

    // Format and inject
    const content = formatBackstoryInjection(selected.key, selected.segment);
    
    injections.push(
      createHintInjection('dynamic-backstory', content, {
        category: 'backstory',
        confidence: selected.segment.triggers.length > 1 ? 0.8 : 0.6,
      })
    );

    log.info(
      { 
        personaId: persona.id, 
        backstoryKey: selected.key, 
        triggers: triggeredContexts 
      },
      '✨ Dynamic backstory surfaced'
    );

    return injections;
  },
};

// ============================================================================
// REGISTRATION
// ============================================================================

import { registerContextBuilder } from '../index.js';

// Register automatically on import
registerContextBuilder(backstoryContextBuilder);

export default backstoryContextBuilder;
