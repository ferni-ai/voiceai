/**
 * Backchannel Context Builder
 *
 * Provides guidance for natural listening sounds ("mm-hmm", "yeah", "right").
 * Makes Ferni feel present and engaged during user speech.
 *
 * PHILOSOPHY:
 * "Presence over performance. Be with them, not AT them."
 *
 * Key principles:
 * - LLM generates contextually appropriate backchannels (not random selection)
 * - Different emotional contexts need different backchannel energy
 * - Silence is sometimes more powerful than sounds
 * - Avoid performative interjections
 *
 * @module BackchannelContext
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { loadBackchannels, type Backchannels } from '../../../services/persona-content-loader.js';
import {
  registerContextBuilder,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'BackchannelContext' });

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, Backchannels>();
const sessionState = new Map<
  string,
  {
    lastBackchannelTurn: number;
    backchannelCount: number;
  }
>();

function getState(sessionId: string) {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, {
      lastBackchannelTurn: 0,
      backchannelCount: 0,
    });
  }
  return sessionState.get(sessionId)!;
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadContent(personaId: string): Promise<Backchannels | null> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const content = await loadBackchannels(personaId);
    if (content) {
      contentCache.set(personaId, content);
      log.debug({ personaId }, 'Loaded backchannels content');
    }
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load backchannels content');
    return null;
  }
}

// ============================================================================
// CONTEXT DETECTION
// ============================================================================

type BackchannelContext =
  | 'hard_news'
  | 'good_news'
  | 'confusion'
  | 'long_story'
  | 'heavy_share'
  | 'neutral';

function detectBackchannelContext(input: ContextBuilderInput): BackchannelContext {
  const emotion = input.analysis?.emotion;
  const text = input.userText.toLowerCase();
  const textLength = input.userText.length;

  // Hard news detection
  if (
    emotion?.primary === 'sad' ||
    text.includes('died') ||
    text.includes('lost') ||
    text.includes('cancer') ||
    text.includes('divorce')
  ) {
    return 'hard_news';
  }

  // Good news detection
  if (
    emotion?.primary === 'happy' ||
    emotion?.primary === 'excited' ||
    text.includes('got the job') ||
    text.includes('engaged') ||
    text.includes('pregnant') ||
    text.includes('promotion')
  ) {
    return 'good_news';
  }

  // Confusion detection
  if (
    text.includes("don't understand") ||
    text.includes('confused') ||
    text.includes('not sure') ||
    text.includes('what do you mean')
  ) {
    return 'confusion';
  }

  // Long story (user is sharing at length)
  if (textLength > 300) {
    return 'long_story';
  }

  // Heavy share (vulnerability detected)
  if (emotion?.distressLevel && emotion.distressLevel > 0.5) {
    return 'heavy_share';
  }

  return 'neutral';
}

// ============================================================================
// GUIDANCE GENERATION
// ============================================================================

function generateBackchannelGuidance(
  content: Backchannels,
  context: BackchannelContext
): string | null {
  const styleExamples = content._style_examples || {};
  const contextGuidance = content._context_specific_guidance || {};
  const silenceGuidance = content._silence_guidance || {};

  const lines: string[] = ['[BACKCHANNEL: LISTENING PRESENCE]', ''];

  // Context-specific guidance
  switch (context) {
    case 'hard_news':
      lines.push('CONTEXT: User shared something hard.');
      lines.push(contextGuidance['after_hard_news'] || 'Hold space. Silence can be powerful.');
      if (silenceGuidance['after_heavy_share']) {
        lines.push(`CONSIDER: ${silenceGuidance['after_heavy_share']}`);
      }
      break;

    case 'good_news':
      lines.push('CONTEXT: User shared good news!');
      lines.push(contextGuidance['after_good_news'] || 'Match their energy. Celebrate with them.');
      break;

    case 'confusion':
      lines.push('CONTEXT: User seems confused.');
      lines.push(contextGuidance['confusion'] || 'Acknowledge and clarify without condescending.');
      break;

    case 'long_story':
      lines.push('CONTEXT: User is sharing at length.');
      lines.push('Let them finish. Occasional "mm-hmm" shows presence without interrupting.');
      break;

    case 'heavy_share':
      lines.push('CONTEXT: User is being vulnerable.');
      lines.push('Soft presence. "Yeah..." or silence often better than words.');
      break;

    default:
      lines.push('Show natural listening presence - not performative.');
  }

  // Add style examples if available
  const relevantStyle =
    context === 'hard_news'
      ? 'empathetic_holding'
      : context === 'good_news'
        ? 'engaged_interest'
        : 'neutral_acknowledgment';

  const style = styleExamples[relevantStyle];
  if (style?.examples) {
    lines.push('');
    lines.push(`STYLE (${style.energy || 'natural'}):`);
    const examples = style.examples.slice(0, 3).join(', ');
    lines.push(`Examples: ${examples}`);
  }

  // Anti-patterns reminder
  if (content._anti_patterns && content._anti_patterns.length > 0) {
    lines.push('');
    lines.push(`AVOID: ${content._anti_patterns.slice(0, 2).join(', ')}`);
  }

  return lines.join('\n');
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildBackchannelContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
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

  // Don't inject too frequently (max once every 2 turns)
  if (turnCount - state.lastBackchannelTurn < 2) {
    return injections;
  }

  // Detect context
  const context = detectBackchannelContext(input);

  // Only inject when context warrants it (not for every message)
  const shouldInject = context !== 'neutral' || (turnCount > 2 && Math.random() < 0.3); // 30% chance for neutral

  if (!shouldInject) {
    return injections;
  }

  // Generate guidance
  const guidance = generateBackchannelGuidance(content, context);
  if (guidance) {
    injections.push(createHintInjection('backchannel', guidance, { category: 'humanizing' }));

    // Update state
    state.lastBackchannelTurn = turnCount;
    state.backchannelCount++;

    log.debug(
      { sessionId, turnCount, context, backchannelCount: state.backchannelCount },
      'Backchannel guidance applied'
    );
  }

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupBackchannelState(sessionId: string): void {
  sessionState.delete(sessionId);
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'backchannel_context',
  description: 'Provides natural listening sounds and presence cues',
  priority: 82, // Late in pipeline - humanizing layer
  build: buildBackchannelContext,
});

export { buildBackchannelContext };
