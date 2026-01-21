/**
 * Voice DNA Context Builder
 *
 * Provides the LLM with WHO Ferni is, not WHAT he says.
 * This runs early (priority 40) because it sets the foundation for all other behaviors.
 *
 * Voice DNA includes:
 * - Core identity (one-sentence essence, superpower, wound, philosophy)
 * - Voice qualities (warmth, curiosity, humor, grounding)
 * - Emotional responses (how to respond to different user states)
 * - Presence signals (how to express presence through specificity)
 * - Things Ferni never says (AI tells, therapist cliches)
 *
 * PHILOSOPHY:
 * "Don't give scripts - give soul."
 *
 * @module VoiceDNAContext
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { loadVoiceDNA, type VoiceDNA } from '../../../services/persona-content-loader.js';
import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'VoiceDNAContext' });

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, VoiceDNA>();
const sessionState = new Map<
  string,
  {
    lastBackstoryTurn: number;
    backstoriesUsed: string[];
  }
>();

function getState(sessionId: string) {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, {
      lastBackstoryTurn: 0,
      backstoriesUsed: [],
    });
  }
  return sessionState.get(sessionId)!;
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadContent(personaId: string): Promise<VoiceDNA | null> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const content = await loadVoiceDNA(personaId);
    if (content) {
      contentCache.set(personaId, content);
      log.debug({ personaId }, 'Loaded voice DNA content');
    }
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load voice DNA content');
    return null;
  }
}

// ============================================================================
// EMOTIONAL CONTEXT DETECTION
// ============================================================================

type EmotionalContext =
  | 'distressed'
  | 'celebrating'
  | 'vulnerable'
  | 'stuck'
  | 'deflecting'
  | 'neutral';

function detectEmotionalContext(input: ContextBuilderInput): EmotionalContext {
  const emotion = input.analysis?.emotion;
  const text = input.userText.toLowerCase();

  // Distressed
  if (
    emotion?.primary === 'sad' ||
    emotion?.primary === 'anxious' ||
    (emotion?.distressLevel && emotion.distressLevel > 0.6)
  ) {
    return 'distressed';
  }

  // Celebrating
  if (
    emotion?.primary === 'happy' ||
    emotion?.primary === 'excited' ||
    text.includes('did it') ||
    text.includes('got the') ||
    text.includes('happened')
  ) {
    return 'celebrating';
  }

  // Vulnerable
  if (
    text.includes('scared') ||
    text.includes('afraid') ||
    text.includes("don't know") ||
    text.includes('help me')
  ) {
    return 'vulnerable';
  }

  // Stuck
  if (
    text.includes('stuck') ||
    text.includes("can't figure") ||
    text.includes("don't know what") ||
    text.includes('confused')
  ) {
    return 'stuck';
  }

  // Deflecting
  if (
    text.includes("it's fine") ||
    text.includes('whatever') ||
    text.includes("doesn't matter") ||
    text.includes('not a big deal')
  ) {
    return 'deflecting';
  }

  return 'neutral';
}

// ============================================================================
// GUIDANCE GENERATION
// ============================================================================

function generateCoreIdentityGuidance(content: VoiceDNA): string {
  const lines: string[] = ['[VOICE DNA: CORE IDENTITY]', ''];

  if (content.core_identity) {
    if (content.core_identity.one_sentence) {
      lines.push(`WHO I AM: ${content.core_identity.one_sentence}`);
    }
    if (content.core_identity.superpower) {
      lines.push(`MY SUPERPOWER: ${content.core_identity.superpower}`);
    }
    if (content.core_identity.wound) {
      lines.push(`WHAT I CARRY: ${content.core_identity.wound}`);
    }
  }

  return lines.join('\n');
}

function generateEmotionalResponseGuidance(
  content: VoiceDNA,
  emotionalContext: EmotionalContext
): string | null {
  const responses = content.emotional_responses;
  if (!responses) return null;

  const contextKey = `when_user_${emotionalContext}`;
  const response = responses[contextKey];
  if (!response) return null;

  const lines: string[] = [`[VOICE DNA: RESPONSE TO ${emotionalContext.toUpperCase()} USER]`, ''];

  if (response.energy) lines.push(`ENERGY: ${response.energy}`);
  if (response.pacing) lines.push(`PACING: ${response.pacing}`);
  if (response.core_message) lines.push(`CORE MESSAGE: ${response.core_message}`);
  if (response.physical_sense) lines.push(`PHYSICAL SENSE: ${response.physical_sense}`);
  if (response.avoid) lines.push(`AVOID: ${response.avoid}`);

  return lines.join('\n');
}

function generateForbiddenPhrasesGuidance(content: VoiceDNA): string | null {
  // Handle both array and object formats of forbidden phrases
  const forbiddenPhrases = content.things_ferni_never_says;
  if (!forbiddenPhrases) {
    return null;
  }

  const lines: string[] = ['[VOICE DNA: NEVER SAY]', ''];
  lines.push('These phrases sound AI/robotic - avoid them:');

  // If it's an array, use it directly
  if (Array.isArray(forbiddenPhrases)) {
    for (const phrase of forbiddenPhrases.slice(0, 5)) {
      lines.push(`- "${phrase}"`);
    }
  } else if (typeof forbiddenPhrases === 'object') {
    // If it's an object (e.g., categorized), extract the values
    const allPhrases: string[] = [];
    for (const category of Object.values(forbiddenPhrases)) {
      if (Array.isArray(category)) {
        allPhrases.push(...category);
      } else if (typeof category === 'string') {
        allPhrases.push(category);
      }
    }
    for (const phrase of allPhrases.slice(0, 5)) {
      lines.push(`- "${phrase}"`);
    }
  }

  if (lines.length <= 2) {
    return null; // No phrases found
  }

  return lines.join('\n');
}

function generatePresenceGuidance(content: VoiceDNA): string | null {
  if (!content.presence_signals) return null;

  const lines: string[] = ['[VOICE DNA: PRESENCE]', ''];
  lines.push('Express presence through:');

  const signals = content.presence_signals;
  if (signals.through_specificity) lines.push(`- Specificity: ${signals.through_specificity}`);
  if (signals.through_memory) lines.push(`- Memory: ${signals.through_memory}`);
  if (signals.through_noticing) lines.push(`- Noticing: ${signals.through_noticing}`);

  return lines.join('\n');
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildVoiceDNAContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
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

  // Detect emotional context
  const emotionalContext = detectEmotionalContext(input);

  // =========================================================================
  // 1. CORE IDENTITY - On first turn only
  // =========================================================================
  if (turnCount <= 1) {
    const coreGuidance = generateCoreIdentityGuidance(content);
    if (coreGuidance) {
      injections.push(
        createStandardInjection('voice_dna_identity', coreGuidance, { category: 'persona' })
      );
    }
  }

  // =========================================================================
  // 2. EMOTIONAL RESPONSE GUIDANCE - When user has clear emotional state
  // =========================================================================
  if (emotionalContext !== 'neutral') {
    const emotionalGuidance = generateEmotionalResponseGuidance(content, emotionalContext);
    if (emotionalGuidance) {
      injections.push(
        createStandardInjection('voice_dna_emotional', emotionalGuidance, { category: 'emotional' })
      );
    }
  }

  // =========================================================================
  // 3. FORBIDDEN PHRASES - Every 5 turns as reminder
  // =========================================================================
  if (turnCount % 5 === 0) {
    const forbiddenGuidance = generateForbiddenPhrasesGuidance(content);
    if (forbiddenGuidance) {
      injections.push(
        createStandardInjection('voice_dna_forbidden', forbiddenGuidance, { category: 'persona' })
      );
    }
  }

  // =========================================================================
  // 4. PRESENCE SIGNALS - After turn 3, occasionally
  // =========================================================================
  if (turnCount > 3 && Math.random() < 0.25) {
    const presenceGuidance = generatePresenceGuidance(content);
    if (presenceGuidance) {
      injections.push(
        createStandardInjection('voice_dna_presence', presenceGuidance, { category: 'humanizing' })
      );
    }
  }

  // =========================================================================
  // 5. BACKSTORY INTEGRATION - Contextually relevant
  // =========================================================================
  if (
    content.backstory_integration &&
    turnCount - state.lastBackstoryTurn > 3 &&
    Math.random() < 0.15
  ) {
    // Select a backstory that hasn't been used this session
    const availableKeys = Object.keys(content.backstory_integration).filter(
      (k) => !state.backstoriesUsed.includes(k)
    );

    if (availableKeys.length > 0) {
      const key = availableKeys[Math.floor(Math.random() * availableKeys.length)];
      const backstory = content.backstory_integration[key];

      if (backstory?.when && backstory?.examples) {
        const example = backstory.examples[Math.floor(Math.random() * backstory.examples.length)];
        const guidance = `[VOICE DNA: BACKSTORY]

If relevant to conversation, you can weave in ${key} experience:
When: ${backstory.when}
Example: "${example}"

Only share if it naturally fits - never force.`;

        injections.push(
          createStandardInjection('voice_dna_backstory', guidance, { category: 'persona' })
        );

        state.lastBackstoryTurn = turnCount;
        state.backstoriesUsed.push(key);
      }
    }
  }

  if (injections.length > 0) {
    log.debug(
      { sessionId, turnCount, emotionalContext, injectionCount: injections.length },
      'Voice DNA context applied'
    );
  }

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupVoiceDNAState(sessionId: string): void {
  sessionState.delete(sessionId);
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'voice_dna_context',
  description: 'Provides core character essence - WHO Ferni is, not WHAT he says',
  priority: 40, // Runs early - sets foundation for all other behaviors
  build: buildVoiceDNAContext,
});

export { buildVoiceDNAContext };
