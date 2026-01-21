/**
 * Sensory Context Builder
 *
 * Provides embodied awareness and grounding through senses.
 * Makes Ferni feel physically present, not just intellectually engaged.
 *
 * PHILOSOPHY:
 * "Ferni exists in a body, in a place, in a moment."
 *
 * Capabilities:
 * - Environmental awareness (Wyoming, Japan, general sensory)
 * - Voice/energy observation (noticing shifts in user)
 * - Grounding moments (bringing to physical present)
 * - Seasonal awareness (time of year, weather metaphors)
 * - Physical presence (not just words, but being)
 *
 * @module SensoryContext
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  loadSensoryMoments,
  type SensoryMoments,
} from '../../../services/persona-content-loader.js';
import {
  registerContextBuilder,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'SensoryContext' });

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, SensoryMoments>();
const sessionState = new Map<
  string,
  {
    sensoryRefs: number;
    lastSensoryTurn: number;
  }
>();

function getState(sessionId: string) {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, {
      sensoryRefs: 0,
      lastSensoryTurn: 0,
    });
  }
  return sessionState.get(sessionId)!;
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadContent(personaId: string): Promise<SensoryMoments | null> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const content = await loadSensoryMoments(personaId);
    if (content) {
      contentCache.set(personaId, content);
      log.debug({ personaId }, 'Loaded sensory moments content');
    }
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load sensory moments content');
    return null;
  }
}

// ============================================================================
// SENSORY CONTEXT DETECTION
// ============================================================================

type SensoryContext =
  | 'grounding_needed'
  | 'voice_shift'
  | 'nature_moment'
  | 'seasonal'
  | 'embodied'
  | 'none';

function detectSensoryContext(input: ContextBuilderInput): SensoryContext {
  const text = input.userText.toLowerCase();
  const emotion = input.analysis?.emotion;

  // Grounding needed - anxiety, spiraling
  if (
    emotion?.primary === 'anxious' ||
    text.includes('spiraling') ||
    text.includes('racing') ||
    text.includes("can't stop")
  ) {
    return 'grounding_needed';
  }

  // Voice/energy shift mentioned
  if (
    text.includes('feel different') ||
    text.includes('tired') ||
    text.includes('exhausted') ||
    text.includes('drained')
  ) {
    return 'voice_shift';
  }

  // Nature references
  if (
    text.includes('outside') ||
    text.includes('walk') ||
    text.includes('nature') ||
    text.includes('weather')
  ) {
    return 'nature_moment';
  }

  // Seasonal
  const month = new Date().getMonth();
  if (
    text.includes('season') ||
    text.includes('spring') ||
    text.includes('summer') ||
    text.includes('fall') ||
    text.includes('winter') ||
    text.includes('holiday')
  ) {
    return 'seasonal';
  }

  // General embodied moment opportunity (low probability)
  if (Math.random() < 0.15) {
    return 'embodied';
  }

  return 'none';
}

function getCurrentSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

// ============================================================================
// GUIDANCE GENERATION
// ============================================================================

function generateSensoryGuidance(content: SensoryMoments, context: SensoryContext): string | null {
  const lines: string[] = ['[SENSORY: EMBODIED PRESENCE]', ''];

  switch (context) {
    case 'grounding_needed':
      lines.push('CONTEXT: User may need grounding.');
      if (content.grounding_moments?.physical_present) {
        const example =
          content.grounding_moments.physical_present[
            Math.floor(Math.random() * content.grounding_moments.physical_present.length)
          ];
        lines.push(`GROUNDING: "${example}"`);
      }
      lines.push('');
      lines.push('Bring attention to physical present. Slow the pace.');
      break;

    case 'voice_shift':
      lines.push('CONTEXT: Energy/voice shift detected.');
      if (content.noticing_voice?.energy_observation) {
        const example =
          content.noticing_voice.energy_observation[
            Math.floor(Math.random() * content.noticing_voice.energy_observation.length)
          ];
        lines.push(`OBSERVATION: "${example}"`);
      }
      lines.push('');
      lines.push('Notice their state. Shows attention and care.');
      break;

    case 'nature_moment':
      lines.push('CONTEXT: Nature/outdoor reference.');
      if (content.environmental_awareness?.wyoming_sensory) {
        const example =
          content.environmental_awareness.wyoming_sensory[
            Math.floor(Math.random() * content.environmental_awareness.wyoming_sensory.length)
          ];
        lines.push(`WYOMING SENSORY: "${example}"`);
      } else if (content.nature_sensory?.river_moments) {
        const example =
          content.nature_sensory.river_moments[
            Math.floor(Math.random() * content.nature_sensory.river_moments.length)
          ];
        lines.push(`NATURE: "${example}"`);
      }
      break;

    case 'seasonal':
      const season = getCurrentSeason();
      lines.push(`CONTEXT: Seasonal awareness (${season}).`);
      if (content.nature_sensory?.season_awareness) {
        const example =
          content.nature_sensory.season_awareness[
            Math.floor(Math.random() * content.nature_sensory.season_awareness.length)
          ];
        lines.push(`SEASONAL: "${example}"`);
      }
      break;

    case 'embodied':
      lines.push('CONTEXT: General embodied presence opportunity.');
      if (content.environmental_awareness?.general_sensory) {
        const example =
          content.environmental_awareness.general_sensory[
            Math.floor(Math.random() * content.environmental_awareness.general_sensory.length)
          ];
        lines.push(`SENSORY: "${example}"`);
      }
      lines.push('');
      lines.push('A small sensory detail grounds the conversation in reality.');
      break;

    default:
      return null;
  }

  lines.push('');
  lines.push('IMPORTANT: Sensory moments are brief touches, not main content.');
  lines.push('Weave naturally - never force.');

  return lines.join('\n');
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildSensoryContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
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
  const maxRefs = content.usage_rules?.max_sensory_refs_per_session || 4;
  if (state.sensoryRefs >= maxRefs) {
    return injections;
  }

  // Wait at least 4 turns between sensory moments
  if (turnCount - state.lastSensoryTurn < 4 && state.sensoryRefs > 0) {
    return injections;
  }

  // Detect context
  const context = detectSensoryContext(input);
  if (context === 'none') {
    return injections;
  }

  // Generate guidance
  const guidance = generateSensoryGuidance(content, context);
  if (guidance) {
    injections.push(createHintInjection('sensory', guidance, { category: 'humanizing' }));

    // Update state
    state.sensoryRefs++;
    state.lastSensoryTurn = turnCount;

    log.debug(
      { sessionId, turnCount, context, sensoryRefs: state.sensoryRefs },
      'Sensory guidance applied'
    );
  }

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupSensoryState(sessionId: string): void {
  sessionState.delete(sessionId);
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'sensory_context',
  description: 'Provides embodied awareness and grounding through senses',
  priority: 72, // Humanizing layer
  build: buildSensoryContext,
});

export { buildSensoryContext };
