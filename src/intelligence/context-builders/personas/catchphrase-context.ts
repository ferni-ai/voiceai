/**
 * Catchphrase Context Builder
 *
 * Provides signature phrases that make Ferni memorable.
 * Catchphrases are rare and earned - not sprinkled randomly.
 *
 * PHILOSOPHY:
 * "Pixar principle: the catchphrase earns its moment."
 *
 * Key principles:
 * - Max 1-2 catchphrases per conversation (rarity = impact)
 * - Only when context truly warrants it
 * - Includes SSML delivery instructions
 * - Never force - only when it fits naturally
 *
 * @module CatchphraseContext
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { loadCatchphrases, type Catchphrases } from '../../../services/persona-content-loader.js';
import {
  registerContextBuilder,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'CatchphraseContext' });

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, Catchphrases>();
const sessionState = new Map<
  string,
  {
    catchphrasesUsed: number;
    lastCatchphraseTurn: number;
    phrasesUsedThisSession: string[];
  }
>();

function getState(sessionId: string) {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, {
      catchphrasesUsed: 0,
      lastCatchphraseTurn: 0,
      phrasesUsedThisSession: [],
    });
  }
  return sessionState.get(sessionId)!;
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadContent(personaId: string): Promise<Catchphrases | null> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const content = await loadCatchphrases(personaId);
    if (content) {
      contentCache.set(personaId, content);
      log.debug({ personaId }, 'Loaded catchphrases content');
    }
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load catchphrases content');
    return null;
  }
}

// ============================================================================
// TRIGGER DETECTION
// ============================================================================

type CatchphraseTrigger =
  | 'kintsugi_moment'
  | 'failure_recovery'
  | 'vulnerability'
  | 'wyoming_wisdom'
  | 'japan_lesson'
  | 'alegria'
  | 'none';

function detectCatchphraseTrigger(input: ContextBuilderInput): CatchphraseTrigger {
  const text = input.userText.toLowerCase();
  const emotion = input.analysis?.emotion;

  // Kintsugi moment - imperfection becomes beauty
  if (
    text.includes('broken') ||
    text.includes('flawed') ||
    text.includes('messed up') ||
    text.includes('imperfect')
  ) {
    return 'kintsugi_moment';
  }

  // Failure recovery
  if (
    text.includes('failed') ||
    text.includes('lost') ||
    text.includes("didn't work") ||
    text.includes('fell apart')
  ) {
    return 'failure_recovery';
  }

  // Vulnerability - opening up
  if (
    emotion?.primary === 'sad' ||
    text.includes('scared') ||
    text.includes('afraid') ||
    text.includes('admit')
  ) {
    return 'vulnerability';
  }

  // Wyoming wisdom - patience, nature, time
  if (
    text.includes('patience') ||
    text.includes('waiting') ||
    text.includes('time') ||
    text.includes('slow down')
  ) {
    return 'wyoming_wisdom';
  }

  // Japan lessons - resilience, beauty in impermanence
  if (
    text.includes('change') ||
    text.includes('letting go') ||
    text.includes('moving on') ||
    text.includes('acceptance')
  ) {
    return 'japan_lesson';
  }

  // Alegria - Brazilian joy, celebrating life
  if (
    emotion?.primary === 'happy' ||
    text.includes('celebrate') ||
    text.includes('joy') ||
    text.includes('grateful')
  ) {
    return 'alegria';
  }

  return 'none';
}

// ============================================================================
// GUIDANCE GENERATION
// ============================================================================

function generateCatchphraseGuidance(
  content: Catchphrases,
  trigger: CatchphraseTrigger,
  state: { catchphrasesUsed: number; phrasesUsedThisSession: string[] }
): string | null {
  const lines: string[] = ['[CATCHPHRASE: SIGNATURE MOMENT]', ''];

  // Only allow if under limit
  if (state.catchphrasesUsed >= 2) {
    return null;
  }

  switch (trigger) {
    case 'kintsugi_moment':
      if (content.core_signature) {
        lines.push(`MOMENT: Kintsugi/imperfection becoming strength`);
        lines.push(`SIGNATURE: "${content.core_signature.phrase}"`);
        if (content.core_signature.delivery) {
          lines.push(`DELIVERY: ${content.core_signature.delivery}`);
        }
      }
      break;

    case 'wyoming_wisdom':
      if (content.wyoming_wisdom && content.wyoming_wisdom.length > 0) {
        const wisdom = content.wyoming_wisdom.find(
          (w) => !state.phrasesUsedThisSession.includes(w)
        );
        if (wisdom) {
          lines.push(`MOMENT: Wyoming patience/grounding`);
          lines.push(`CAN SHARE: "${wisdom}"`);
        }
      }
      break;

    case 'japan_lesson':
      if (content.japan_lessons && content.japan_lessons.length > 0) {
        const lesson = content.japan_lessons.find((l) => !state.phrasesUsedThisSession.includes(l));
        if (lesson) {
          lines.push(`MOMENT: Japan/impermanence wisdom`);
          lines.push(`CAN SHARE: "${lesson}"`);
        }
      }
      break;

    case 'alegria':
      if (content.alegria_joy && content.alegria_joy.length > 0) {
        const joy = content.alegria_joy.find((j) => !state.phrasesUsedThisSession.includes(j));
        if (joy) {
          lines.push(`MOMENT: Brazilian joy/celebration`);
          lines.push(`CAN SHARE: "${joy}"`);
        }
      }
      break;

    case 'vulnerability':
    case 'failure_recovery':
      if (content.secondary_signatures && content.secondary_signatures.length > 0) {
        const sig = content.secondary_signatures.find(
          (s) => !state.phrasesUsedThisSession.includes(s.phrase)
        );
        if (sig) {
          lines.push(
            `MOMENT: ${trigger === 'vulnerability' ? 'Vulnerability' : 'Failure recovery'}`
          );
          lines.push(`CAN SHARE: "${sig.phrase}"`);
          if (sig.delivery) {
            lines.push(`DELIVERY: ${sig.delivery}`);
          }
        }
      }
      break;

    default:
      return null;
  }

  if (lines.length <= 2) {
    return null;
  }

  lines.push('');
  lines.push('IMPORTANT: Only use if it TRULY fits. Never force.');
  lines.push('Catchphrases are rare and earned. Max 1-2 per conversation.');

  return lines.join('\n');
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildCatchphraseContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { persona, services, userData } = input;
  const injections: ContextInjection[] = [];

  const personaId = persona?.identity?.id || 'ferni';
  const sessionId = services?.sessionId || 'anonymous';
  const turnCount = userData.turnCount || 0;

  // Load content
  const content = await loadContent(personaId);
  if (!content) {
    return injections;
  }

  // Get state
  const state = getState(sessionId);

  // Max 2 catchphrases per conversation
  if (state.catchphrasesUsed >= 2) {
    return injections;
  }

  // Wait at least 5 turns between catchphrases
  if (turnCount - state.lastCatchphraseTurn < 5 && state.catchphrasesUsed > 0) {
    return injections;
  }

  // Detect trigger
  const trigger = detectCatchphraseTrigger(input);
  if (trigger === 'none') {
    return injections;
  }

  // 40% chance when trigger detected (rarity)
  if (Math.random() > 0.4) {
    return injections;
  }

  // Generate guidance
  const guidance = generateCatchphraseGuidance(content, trigger, state);
  if (guidance) {
    injections.push(createHintInjection('catchphrase', guidance, { category: 'persona' }));

    // Update state
    state.catchphrasesUsed++;
    state.lastCatchphraseTurn = turnCount;

    log.debug(
      { sessionId, turnCount, trigger, catchphrasesUsed: state.catchphrasesUsed },
      'Catchphrase guidance applied'
    );
  }

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupCatchphraseState(sessionId: string): void {
  sessionState.delete(sessionId);
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'catchphrase_context',
  description: 'Provides signature phrases for memorable moments (rare and earned)',
  priority: 86, // Late - after core personality
  build: buildCatchphraseContext,
});

export { buildCatchphraseContext };
