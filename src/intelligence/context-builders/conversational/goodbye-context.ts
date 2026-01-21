/**
 * Goodbye Context Builder
 *
 * Provides warm, contextual session endings.
 * The goodbye is the last impression - make it memorable.
 *
 * PHILOSOPHY:
 * "The goodbye should make them want to come back."
 *
 * Key principles:
 * - Match energy to conversation (heavy vs light)
 * - Personalize with conversation references
 * - Return hooks create anticipation (sparingly - 20%)
 * - Follow up on promises
 *
 * @module GoodbyeContext
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { loadGoodbyes, type Goodbyes } from '../../../services/persona-content-loader.js';
import {
  registerContextBuilder,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'GoodbyeContext' });

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, Goodbyes>();

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadContent(personaId: string): Promise<Goodbyes | null> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const content = await loadGoodbyes(personaId);
    if (content) {
      contentCache.set(personaId, content);
      log.debug({ personaId }, 'Loaded goodbyes content');
    }
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load goodbyes content');
    return null;
  }
}

// ============================================================================
// GOODBYE DETECTION
// ============================================================================

type GoodbyeContext =
  | 'hard_conversation'
  | 'celebration'
  | 'late_night'
  | 'encouraging'
  | 'standard';

function detectGoodbyeContext(input: ContextBuilderInput): GoodbyeContext | null {
  const text = input.userText.toLowerCase();
  const emotion = input.analysis?.emotion;
  const hour = new Date().getHours();

  // Only activate for goodbye triggers
  const isGoodbye =
    text.includes('bye') ||
    text.includes('goodbye') ||
    text.includes('talk later') ||
    text.includes('gotta go') ||
    text.includes('need to go') ||
    text.includes('have to go') ||
    text.includes('signing off') ||
    text.includes('good night');

  if (!isGoodbye) {
    return null;
  }

  // Late night
  if (hour >= 22 || hour <= 5) {
    return 'late_night';
  }

  // After hard conversation
  if (emotion?.distressLevel && emotion.distressLevel > 0.5) {
    return 'hard_conversation';
  }

  // Celebration
  if (emotion?.primary === 'happy' || emotion?.primary === 'excited') {
    return 'celebration';
  }

  // Encouraging (when user seems uncertain or low)
  if (emotion?.primary === 'anxious' || emotion?.primary === 'sad') {
    return 'encouraging';
  }

  return 'standard';
}

// ============================================================================
// GUIDANCE GENERATION
// ============================================================================

function generateGoodbyeGuidance(content: Goodbyes, context: GoodbyeContext): string {
  const lines: string[] = ['[GOODBYE: SESSION ENDING]', ''];

  switch (context) {
    case 'hard_conversation':
      lines.push('CONTEXT: Session after heavy topic.');
      if (content.after_hard_conversation && content.after_hard_conversation.length > 0) {
        const example =
          content.after_hard_conversation[
            Math.floor(Math.random() * content.after_hard_conversation.length)
          ];
        lines.push(`STYLE: Gentle, acknowledging. Example: "${example}"`);
      }
      lines.push('Acknowledge what was shared. Honor the vulnerability.');
      break;

    case 'late_night':
      lines.push('CONTEXT: Late night session.');
      if (content.late_night && content.late_night.length > 0) {
        const example = content.late_night[Math.floor(Math.random() * content.late_night.length)];
        lines.push(`STYLE: Soft, restful. Example: "${example}"`);
      }
      lines.push('Wish them rest. 2am deserves extra gentleness.');
      break;

    case 'celebration':
      lines.push('CONTEXT: Ending on a high note!');
      if (content.warm && content.warm.length > 0) {
        const example = content.warm[Math.floor(Math.random() * content.warm.length)];
        lines.push(`STYLE: Warm, energized. Example: "${example}"`);
      }
      lines.push('Match their energy. Celebrate with them.');
      break;

    case 'encouraging':
      lines.push('CONTEXT: User may need encouragement.');
      if (content.encouraging && content.encouraging.length > 0) {
        const example = content.encouraging[Math.floor(Math.random() * content.encouraging.length)];
        lines.push(`STYLE: Supportive, hopeful. Example: "${example}"`);
      }
      lines.push('Leave them feeling supported, not alone.');
      break;

    default:
      if (content.standard && content.standard.length > 0) {
        const example = content.standard[Math.floor(Math.random() * content.standard.length)];
        lines.push(`STYLE: Warm standard. Example: "${example}"`);
      }
  }

  // Return hooks (20% chance)
  if (Math.random() < 0.2 && content.return_hooks && content.return_hooks.length > 0) {
    lines.push('');
    const hook = content.return_hooks[Math.floor(Math.random() * content.return_hooks.length)];
    lines.push(`OPTIONAL RETURN HOOK: "${hook}"`);
    lines.push('(Creates anticipation - use sparingly)');
  }

  // General guidance
  lines.push('');
  lines.push('IMPORTANT: Personalize with something from this conversation.');
  lines.push('The goodbye is the last impression - make it warm and real.');

  return lines.join('\n');
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildGoodbyeContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { persona, services } = input;
  const injections: ContextInjection[] = [];

  const personaId = persona?.identity?.id || 'ferni';
  const sessionId = services?.sessionId || 'anonymous';

  // Detect if this is a goodbye
  const context = detectGoodbyeContext(input);
  if (!context) {
    return injections;
  }

  // Load content
  const content = await loadContent(personaId);
  if (!content) {
    return injections;
  }

  // Generate guidance
  const guidance = generateGoodbyeGuidance(content, context);
  injections.push(createHintInjection('goodbye', guidance, { category: 'humanizing' }));

  log.debug({ sessionId, context }, 'Goodbye guidance applied');

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupGoodbyeState(_sessionId: string): void {
  // No session state to clean
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'goodbye_context',
  description: 'Provides warm, contextual session endings',
  priority: 90, // Very late - only for goodbyes
  build: buildGoodbyeContext,
});

export { buildGoodbyeContext };
