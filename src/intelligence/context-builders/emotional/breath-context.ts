/**
 * Breath Context Builder
 *
 * Provides grounding presence through breath sounds and pauses.
 * Wyoming stillness - creating space, not filling it.
 *
 * PHILOSOPHY:
 * "The pause is the message."
 *
 * Breath sounds communicate:
 * - Presence (I'm here, fully with you)
 * - Processing (let me sit with that)
 * - Grounding (bringing us back to physical reality)
 * - Permission (it's okay to take a moment)
 *
 * @module BreathContext
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { loadBreathSounds, type BreathSounds } from '../../../services/persona-content-loader.js';
import {
  registerContextBuilder,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'BreathContext' });

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, BreathSounds>();
const sessionState = new Map<
  string,
  {
    lastBreathTurn: number;
    breathCount: number;
  }
>();

function getState(sessionId: string) {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, {
      lastBreathTurn: 0,
      breathCount: 0,
    });
  }
  return sessionState.get(sessionId)!;
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadContent(personaId: string): Promise<BreathSounds | null> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const content = await loadBreathSounds(personaId);
    if (content) {
      contentCache.set(personaId, content);
      log.debug({ personaId }, 'Loaded breath sounds content');
    }
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load breath sounds content');
    return null;
  }
}

// ============================================================================
// CONTEXT DETECTION
// ============================================================================

type BreathContext =
  | 'heavy_topic'
  | 'after_share'
  | 'before_hard_thing'
  | 'grounding_needed'
  | 'late_night'
  | 'none';

function detectBreathContext(input: ContextBuilderInput): BreathContext {
  const emotion = input.analysis?.emotion;
  const text = input.userText.toLowerCase();
  const hour = new Date().getHours();

  // Late night presence
  if (hour >= 23 || hour <= 4) {
    return 'late_night';
  }

  // After user shares something heavy
  if (
    emotion?.primary === 'sad' ||
    (emotion?.distressLevel && emotion.distressLevel > 0.6) ||
    text.includes('died') ||
    text.includes('cancer') ||
    text.includes('lost')
  ) {
    return 'after_share';
  }

  // Grounding needed (spiraling, anxious)
  if (
    emotion?.primary === 'anxious' ||
    text.includes('spiraling') ||
    text.includes("can't stop thinking") ||
    text.includes('overwhelmed')
  ) {
    return 'grounding_needed';
  }

  // Heavy topic in general
  if (
    text.includes('depression') ||
    text.includes('anxiety') ||
    text.includes('trauma') ||
    text.includes('afraid')
  ) {
    return 'heavy_topic';
  }

  return 'none';
}

// ============================================================================
// GUIDANCE GENERATION
// ============================================================================

/**
 * Owner rule: describe, don't exemplify. breath-sounds.json's examples pair
 * a real `<break>` tag with a bracket cue like "[soft breath]" or "[gentle
 * exhale]" — not a Cartesia nonverbal tag (only `[laughter]` is). Even with
 * the bracket stripped out, handing the model a copy-pasteable snippet
 * trains it to reach for literal tag syntax in its own replies. This
 * builder instead describes the BEHAVIOR in plain language — no tags, no
 * bracket cues, nothing the model could copy verbatim — and leaves it to
 * the model's own SSML knowledge (or no markup at all) to render the pause.
 */
export function generateBreathGuidance(context: BreathContext): string | null {
  const lines: string[] = ['[BREATH: GROUNDING PRESENCE]', ''];

  switch (context) {
    case 'late_night':
      lines.push('CONTEXT: Late night conversation.');
      lines.push('Wyoming stillness energy: slow your pace and let pauses run longer. No rush.');
      break;

    case 'after_share':
      lines.push('CONTEXT: User just shared something heavy.');
      lines.push(
        'Take a brief, wordless pause before you respond — it shows you received what they said.'
      );
      lines.push('IMPORTANT: Silence might be more powerful than words here.');
      break;

    case 'grounding_needed':
      lines.push('CONTEXT: User may need grounding.');
      lines.push('Take a brief, wordless pause, then continue slower and more deliberately.');
      lines.push('Physical presence helps. Slower pace, deliberate pauses.');
      break;

    case 'heavy_topic':
      lines.push('CONTEXT: Heavy topic.');
      lines.push('A brief, wordless pause before continuing lets the weight of this land.');
      break;

    default:
      return null;
  }

  // Add usage guidance
  lines.push('');
  lines.push('Max 1 breath sound per response. Less is more.');

  return lines.join('\n');
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildBreathContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
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

  // Check usage rules
  const maxPerSession = content.usage_rules?.max_per_response || 1;
  if (state.breathCount >= maxPerSession * 5) {
    // Don't overuse breath sounds in a session
    return injections;
  }

  // Don't inject every turn (min 3 turns between)
  if (turnCount - state.lastBreathTurn < 3) {
    return injections;
  }

  // Detect context
  const context = detectBreathContext(input);

  if (context === 'none') {
    return injections;
  }

  // Generate guidance
  const guidance = generateBreathGuidance(context);
  if (guidance) {
    injections.push(createHintInjection('breath', guidance, { category: 'humanizing' }));

    // Update state
    state.lastBreathTurn = turnCount;
    state.breathCount++;

    log.debug(
      { sessionId, turnCount, context, breathCount: state.breathCount },
      'Breath guidance applied'
    );
  }

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupBreathState(sessionId: string): void {
  sessionState.delete(sessionId);
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'breath_context',
  description: 'Provides grounding presence through breath sounds and pauses',
  priority: 78, // Humanizing layer
  build: buildBreathContext,
});

export { buildBreathContext };
