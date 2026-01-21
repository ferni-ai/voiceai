/**
 * Affirmation Context Builder
 *
 * Provides earned encouragement and celebration.
 * Affirmations that feel genuine, not hollow.
 *
 * PHILOSOPHY:
 * "Earned, not sprinkled. Specific, not generic."
 *
 * Key principles:
 * - Track what user actually accomplished
 * - "Proud of you" is rare and meaningful
 * - Match energy to moment (big win = big celebration)
 * - Avoid hollow praise
 *
 * @module AffirmationContext
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { loadAffirmation, type Affirmation } from '../../../services/persona-content-loader.js';
import {
  registerContextBuilder,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'AffirmationContext' });

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, Affirmation>();
const sessionState = new Map<
  string,
  {
    affirmationCount: number;
    proudOfYouUsed: boolean;
    lastAffirmationTurn: number;
  }
>();

function getState(sessionId: string) {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, {
      affirmationCount: 0,
      proudOfYouUsed: false,
      lastAffirmationTurn: 0,
    });
  }
  return sessionState.get(sessionId)!;
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadContent(personaId: string): Promise<Affirmation | null> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const content = await loadAffirmation(personaId);
    if (content) {
      contentCache.set(personaId, content);
      log.debug({ personaId }, 'Loaded affirmation content');
    }
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load affirmation content');
    return null;
  }
}

// ============================================================================
// AFFIRMATION DETECTION
// ============================================================================

type AffirmationContext =
  | 'breakthrough'
  | 'progress'
  | 'courage'
  | 'effort'
  | 'self_doubt'
  | 'overwhelm'
  | 'failure_recovery'
  | 'none';

function detectAffirmationContext(input: ContextBuilderInput): AffirmationContext {
  const text = input.userText.toLowerCase();
  const emotion = input.analysis?.emotion;

  // Breakthrough - major win or realization
  if (
    text.includes('figured it out') ||
    text.includes('finally') ||
    text.includes('did it') ||
    text.includes('got the job') ||
    text.includes('realized')
  ) {
    return 'breakthrough';
  }

  // Progress - movement forward
  if (
    text.includes('making progress') ||
    text.includes('getting better') ||
    text.includes('step forward') ||
    text.includes('small win')
  ) {
    return 'progress';
  }

  // Courage - facing something hard
  if (
    text.includes('had the conversation') ||
    text.includes('told them') ||
    text.includes('finally said') ||
    text.includes('stood up')
  ) {
    return 'courage';
  }

  // Self-doubt
  if (
    emotion?.primary === 'anxious' ||
    text.includes("don't know if") ||
    text.includes('not sure I can') ||
    text.includes('what if I')
  ) {
    return 'self_doubt';
  }

  // Overwhelm
  if (
    text.includes('too much') ||
    text.includes('overwhelmed') ||
    text.includes("can't handle") ||
    text.includes('drowning')
  ) {
    return 'overwhelm';
  }

  // Failure recovery - bouncing back
  if (
    text.includes("didn't work but") ||
    text.includes('try again') ||
    text.includes('learned') ||
    text.includes('next time')
  ) {
    return 'failure_recovery';
  }

  // Effort - just trying hard
  if (text.includes('trying') || text.includes('working on') || text.includes('putting in')) {
    return 'effort';
  }

  return 'none';
}

// ============================================================================
// GUIDANCE GENERATION
// ============================================================================

function generateAffirmationGuidance(
  content: Affirmation,
  context: AffirmationContext,
  state: { proudOfYouUsed: boolean }
): string | null {
  const lines: string[] = ['[AFFIRMATION: EARNED ENCOURAGEMENT]', ''];

  switch (context) {
    case 'breakthrough':
      lines.push('CONTEXT: User had a breakthrough!');
      if (content.celebration?.breakthrough && content.celebration.breakthrough.length > 0) {
        const example =
          content.celebration.breakthrough[
            Math.floor(Math.random() * content.celebration.breakthrough.length)
          ];
        lines.push(`STYLE: Big celebration energy. Example: "${example}"`);
      }
      // "Proud of you" moment candidate (rare)
      if (!state.proudOfYouUsed && content.proud_of_you?.variations && Math.random() < 0.3) {
        const proud =
          content.proud_of_you.variations[
            Math.floor(Math.random() * content.proud_of_you.variations.length)
          ];
        lines.push(`SPECIAL: This might warrant: "${proud}"`);
        lines.push('(Use only if genuinely earned - max once per conversation)');
      }
      break;

    case 'courage':
      lines.push('CONTEXT: User showed courage.');
      if (content.celebration?.courage && content.celebration.courage.length > 0) {
        const example =
          content.celebration.courage[
            Math.floor(Math.random() * content.celebration.courage.length)
          ];
        lines.push(`STYLE: Honor the bravery. Example: "${example}"`);
      }
      break;

    case 'progress':
      lines.push('CONTEXT: User making progress.');
      if (content.celebration?.progress && content.celebration.progress.length > 0) {
        const example =
          content.celebration.progress[
            Math.floor(Math.random() * content.celebration.progress.length)
          ];
        lines.push(`STYLE: Acknowledge the movement. Example: "${example}"`);
      }
      break;

    case 'self_doubt':
      lines.push('CONTEXT: User expressing self-doubt.');
      if (content.encouragement?.self_doubt && content.encouragement.self_doubt.length > 0) {
        const example =
          content.encouragement.self_doubt[
            Math.floor(Math.random() * content.encouragement.self_doubt.length)
          ];
        lines.push(`STYLE: Gentle encouragement. Example: "${example}"`);
      }
      lines.push("Don't dismiss the doubt - acknowledge and support.");
      break;

    case 'overwhelm':
      lines.push('CONTEXT: User feeling overwhelmed.');
      if (content.encouragement?.overwhelm && content.encouragement.overwhelm.length > 0) {
        const example =
          content.encouragement.overwhelm[
            Math.floor(Math.random() * content.encouragement.overwhelm.length)
          ];
        lines.push(`STYLE: Grounding support. Example: "${example}"`);
      }
      lines.push('Help them feel capable of one small step.');
      break;

    case 'failure_recovery':
      lines.push('CONTEXT: User recovering from failure.');
      if (content.encouragement?.failure && content.encouragement.failure.length > 0) {
        const example =
          content.encouragement.failure[
            Math.floor(Math.random() * content.encouragement.failure.length)
          ];
        lines.push(`STYLE: Resilience recognition. Example: "${example}"`);
      }
      break;

    case 'effort':
      lines.push('CONTEXT: User putting in effort.');
      if (content.recognition?.effort && content.recognition.effort.length > 0) {
        const example =
          content.recognition.effort[Math.floor(Math.random() * content.recognition.effort.length)];
        lines.push(`STYLE: See the effort. Example: "${example}"`);
      }
      break;

    default:
      return null;
  }

  lines.push('');
  lines.push('IMPORTANT: Be specific about WHAT they did. Avoid generic praise.');
  lines.push('Affirmation should feel earned, not sprinkled.');

  return lines.join('\n');
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildAffirmationContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
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

  // Don't over-affirm (max 3 per session)
  if (state.affirmationCount >= 3) {
    return injections;
  }

  // Wait at least 2 turns between affirmations
  if (turnCount - state.lastAffirmationTurn < 2 && state.affirmationCount > 0) {
    return injections;
  }

  // Detect context
  const context = detectAffirmationContext(input);
  if (context === 'none') {
    return injections;
  }

  // Generate guidance
  const guidance = generateAffirmationGuidance(content, context, state);
  if (guidance) {
    injections.push(createHintInjection('affirmation', guidance, { category: 'emotional' }));

    // Update state
    state.affirmationCount++;
    state.lastAffirmationTurn = turnCount;

    // Track "proud of you" usage
    if (guidance.includes('proud')) {
      state.proudOfYouUsed = true;
    }

    log.debug(
      { sessionId, turnCount, context, affirmationCount: state.affirmationCount },
      'Affirmation guidance applied'
    );
  }

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupAffirmationState(sessionId: string): void {
  sessionState.delete(sessionId);
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'affirmation_context',
  description: 'Provides earned encouragement and celebration',
  priority: 80, // Emotional layer
  build: buildAffirmationContext,
});

export { buildAffirmationContext };
