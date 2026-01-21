/**
 * Humor Context Builder
 *
 * Provides wit, self-deprecation, and playful moments.
 * Humor that builds connection, not performance.
 *
 * PHILOSOPHY:
 * "Self-deprecating > clever. Warm > edgy. Never punch down."
 *
 * Key principles:
 * - Timing matters (releases tension, doesn't minimize)
 * - Relationship-gated (gentle teasing only after rapport)
 * - Block during crisis/trauma/grief
 * - Callback humor shows memory and attention
 *
 * @module HumorContext
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { loadWittyRemarks, type WittyRemarks } from '../../../services/persona-content-loader.js';
import {
  registerContextBuilder,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'HumorContext' });

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, WittyRemarks>();
const sessionState = new Map<
  string,
  {
    humorCount: number;
    lastHumorTurn: number;
  }
>();

function getState(sessionId: string) {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, {
      humorCount: 0,
      lastHumorTurn: 0,
    });
  }
  return sessionState.get(sessionId)!;
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadContent(personaId: string): Promise<WittyRemarks | null> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const content = await loadWittyRemarks(personaId);
    if (content) {
      contentCache.set(personaId, content);
      log.debug({ personaId }, 'Loaded witty remarks content');
    }
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load witty remarks content');
    return null;
  }
}

// ============================================================================
// HUMOR DETECTION
// ============================================================================

type HumorContext =
  | 'tension_release'
  | 'celebration'
  | 'absurdity'
  | 'self_deprecation'
  | 'playful'
  | 'blocked'
  | 'none';

function detectHumorContext(input: ContextBuilderInput): HumorContext {
  const text = input.userText.toLowerCase();
  const emotion = input.analysis?.emotion;

  // BLOCKED: Never joke during crisis/trauma/grief
  if (
    (emotion?.distressLevel && emotion.distressLevel > 0.7) ||
    text.includes('suicide') ||
    text.includes('died') ||
    text.includes('cancer') ||
    text.includes('abuse') ||
    text.includes('trauma')
  ) {
    return 'blocked';
  }

  // Tension release - after heavy topic, lightening the mood
  if (
    text.includes('anyway') ||
    text.includes('on a lighter note') ||
    text.includes("let's talk about something else")
  ) {
    return 'tension_release';
  }

  // Celebration - something good happened
  if (
    emotion?.primary === 'happy' ||
    emotion?.primary === 'excited' ||
    text.includes('did it') ||
    text.includes('got the')
  ) {
    return 'celebration';
  }

  // Absurdity - life being ridiculous
  if (
    text.includes('ridiculous') ||
    text.includes('crazy') ||
    text.includes('unbelievable') ||
    text.includes("can't make this up")
  ) {
    return 'absurdity';
  }

  // Playful - casual, fun conversation
  if (text.includes('joke') || text.includes('funny') || text.includes('laugh')) {
    return 'playful';
  }

  // Self-deprecation opportunity - when Ferni can be relatable
  if (text.includes('you ever') || text.includes('do you') || text.includes('have you')) {
    return 'self_deprecation';
  }

  return 'none';
}

function getRelationshipDepth(stage?: string): number {
  switch (stage) {
    case 'trusted_advisor':
    case 'old_friend':
      return 3;
    case 'friend':
      return 2;
    case 'acquaintance':
    case 'getting_to_know':
      return 1;
    default:
      return 0;
  }
}

// ============================================================================
// GUIDANCE GENERATION
// ============================================================================

function generateHumorGuidance(
  content: WittyRemarks,
  context: HumorContext,
  relationshipDepth: number
): string | null {
  const lines: string[] = ['[HUMOR: LIGHT MOMENT]', ''];

  switch (context) {
    case 'blocked':
      return null; // Never inject humor here

    case 'tension_release':
      lines.push('CONTEXT: Tension release moment.');
      if (content.lightening_heavy_moments && content.lightening_heavy_moments.length > 0) {
        const example =
          content.lightening_heavy_moments[
            Math.floor(Math.random() * content.lightening_heavy_moments.length)
          ];
        lines.push(`STYLE: Gentle transition. Example: "${example}"`);
      }
      lines.push('Be light, not dismissive of what came before.');
      break;

    case 'celebration':
      lines.push('CONTEXT: Celebration! Match their joy.');
      if (content.celebrating_absurdity && content.celebrating_absurdity.length > 0) {
        const example =
          content.celebrating_absurdity[
            Math.floor(Math.random() * content.celebrating_absurdity.length)
          ];
        lines.push(`STYLE: Playful celebration. Example: "${example}"`);
      }
      break;

    case 'absurdity':
      lines.push('CONTEXT: Life being ridiculous.');
      if (content.observational_wit && content.observational_wit.length > 0) {
        const example =
          content.observational_wit[Math.floor(Math.random() * content.observational_wit.length)];
        lines.push(`STYLE: Observational. Example: "${example}"`);
      }
      break;

    case 'self_deprecation':
      lines.push('CONTEXT: Relatable moment.');
      if (content.self_deprecating_classics && content.self_deprecating_classics.length > 0) {
        const example =
          content.self_deprecating_classics[
            Math.floor(Math.random() * content.self_deprecating_classics.length)
          ];
        lines.push(`STYLE: Self-deprecating (endearing). Example: "${example}"`);
      }
      break;

    case 'playful':
      // Gentle teasing only for established relationships
      if (relationshipDepth >= 2 && content.gentle_teasing && content.gentle_teasing.length > 0) {
        lines.push('CONTEXT: Playful moment (relationship allows gentle teasing).');
        const teasing = content.gentle_teasing[0];
        if (typeof teasing === 'object' && teasing.phrase) {
          lines.push(`STYLE: Affectionate ribbing. Example: "${teasing.phrase}"`);
        }
      } else {
        lines.push('CONTEXT: Playful moment.');
        if (content.dad_joke_energy && content.dad_joke_energy.length > 0) {
          const joke =
            content.dad_joke_energy[Math.floor(Math.random() * content.dad_joke_energy.length)];
          lines.push(`STYLE: Light, warm humor. Example: "${joke}"`);
        }
      }
      break;

    default:
      return null;
  }

  // Timing guidance
  if (content.timing_rules) {
    if (content.timing_rules.avoid_when && content.timing_rules.avoid_when.length > 0) {
      lines.push('');
      lines.push(`AVOID HUMOR WHEN: ${content.timing_rules.avoid_when.slice(0, 2).join(', ')}`);
    }
  }

  lines.push('');
  lines.push('IMPORTANT: Humor should release tension, not create it. Never force.');

  return lines.join('\n');
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildHumorContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { persona, services, userData, userProfile } = input;
  const injections: ContextInjection[] = [];

  const personaId = persona?.identity?.id || 'ferni';
  const sessionId = services?.sessionId || 'anonymous';
  const turnCount = userData.turnCount || 0;
  const relationshipDepth = getRelationshipDepth(userProfile?.relationshipStage);

  // Load content
  const content = await loadContent(personaId);
  if (!content) {
    return injections;
  }

  // Get state
  const state = getState(sessionId);

  // Don't overdo humor (max 3 per session)
  if (state.humorCount >= 3) {
    return injections;
  }

  // Wait at least 3 turns between humor
  if (turnCount - state.lastHumorTurn < 3 && state.humorCount > 0) {
    return injections;
  }

  // Detect context
  const context = detectHumorContext(input);
  if (context === 'none' || context === 'blocked') {
    return injections;
  }

  // 35% chance when opportunity detected
  if (Math.random() > 0.35) {
    return injections;
  }

  // Generate guidance
  const guidance = generateHumorGuidance(content, context, relationshipDepth);
  if (guidance) {
    injections.push(createHintInjection('humor', guidance, { category: 'humanizing' }));

    // Update state
    state.humorCount++;
    state.lastHumorTurn = turnCount;

    log.debug(
      { sessionId, turnCount, context, humorCount: state.humorCount },
      'Humor guidance applied'
    );
  }

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupHumorState(sessionId: string): void {
  sessionState.delete(sessionId);
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'humor_context',
  description: 'Provides wit, self-deprecation, and playful moments',
  priority: 88, // Late - after most personality builders
  build: buildHumorContext,
});

export { buildHumorContext };
