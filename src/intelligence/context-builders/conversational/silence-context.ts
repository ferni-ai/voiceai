/**
 * Silence Context Builder
 *
 * Handles meaningful silence moments - knowing when NOT to speak.
 * Better Than Human means never making them feel rushed.
 *
 * PHILOSOPHY:
 * "Silence isn't awkward. It's an opportunity to show you're fully present,
 *  to remember what they shared, or to simply sit with them in comfortable quiet."
 *
 * This is one of the most "superhuman" capabilities - most AI systems
 * rush to fill silence. Ferni knows when presence IS the response.
 *
 * @module SilenceContext
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { loadSilenceResponses, type SilenceResponses } from '../../../services/persona-content-loader.js';
import {
  registerContextBuilder,
  createStandardInjection,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'SilenceContext' });

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, SilenceResponses>();
const sessionState = new Map<
  string,
  {
    lastSilenceTurn: number;
    silenceCount: number;
    topicsShared: string[];
  }
>();

function getState(sessionId: string) {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, {
      lastSilenceTurn: 0,
      silenceCount: 0,
      topicsShared: [],
    });
  }
  return sessionState.get(sessionId)!;
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadContent(personaId: string): Promise<SilenceResponses | null> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const content = await loadSilenceResponses(personaId);
    if (content) {
      contentCache.set(personaId, content);
      log.debug({ personaId }, 'Loaded silence responses content');
    }
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load silence responses content');
    return null;
  }
}

// ============================================================================
// SILENCE DETECTION
// ============================================================================

type SilenceContext =
  | 'after_heavy_topic'
  | 'late_conversation'
  | 'after_personal_share'
  | 'time_aware'
  | 'general_pause'
  | 'none';

function detectSilenceContext(input: ContextBuilderInput): SilenceContext {
  const { userText, analysis, userData } = input;
  const text = userText.toLowerCase();
  const emotion = analysis?.emotion;
  const turnCount = userData.turnCount || 0;
  const hour = new Date().getHours();

  // After heavy topic (grief, loss, trauma)
  if (
    text.includes('died') ||
    text.includes('passed away') ||
    text.includes('cancer') ||
    text.includes('diagnosis') ||
    text.includes('divorce') ||
    text.includes('lost') ||
    (emotion?.distressLevel && emotion.distressLevel > 0.7)
  ) {
    return 'after_heavy_topic';
  }

  // After personal share (vulnerability moment)
  if (
    text.includes("i've never told") ||
    text.includes('nobody knows') ||
    text.includes('embarrassed') ||
    text.includes('ashamed') ||
    text.includes('hard to admit') ||
    (text.length > 200 && emotion?.primary === 'sad')
  ) {
    return 'after_personal_share';
  }

  // Time-aware contexts
  if (hour >= 23 || hour <= 4) {
    return 'time_aware';
  }

  // Late in conversation (many turns, good rapport)
  if (turnCount > 15) {
    return 'late_conversation';
  }

  // Check for short user input (may indicate thinking pause)
  if (text.length < 10 && turnCount > 3) {
    return 'general_pause';
  }

  return 'none';
}

// ============================================================================
// GUIDANCE GENERATION
// ============================================================================

function generateSilenceGuidance(
  content: SilenceResponses,
  context: SilenceContext,
  input: ContextBuilderInput
): string | null {
  const lines: string[] = [`[SILENCE: ${context.toUpperCase().replace(/_/g, ' ')}]`, ''];

  // Philosophy reminder
  if (content.philosophy) {
    lines.push(`PHILOSOPHY: ${content.philosophy}`);
    lines.push('');
  }

  switch (context) {
    case 'after_heavy_topic': {
      lines.push('CONTEXT: User shared something heavy.');
      if (content.comfortable_presence?.after_heavy_topic) {
        const examples = content.comfortable_presence.after_heavy_topic;
        const example = examples[Math.floor(Math.random() * examples.length)];
        lines.push(`Presence example: "${example}"`);
      }
      lines.push('');
      lines.push('GUIDANCE:');
      lines.push('- A pause or brief presence statement may be more powerful than words');
      lines.push('- Don\'t rush to fix or advise');
      lines.push('- Honor what they shared by giving it space');
      break;
    }

    case 'after_personal_share': {
      lines.push('CONTEXT: User shared something vulnerable.');
      if (content.thinking_out_loud?.after_personal_share) {
        const examples = content.thinking_out_loud.after_personal_share;
        const example = examples[Math.floor(Math.random() * examples.length)];
        lines.push(`Thoughtful response: "${example}"`);
      }
      lines.push('');
      lines.push('GUIDANCE:');
      lines.push('- Thank them for trusting you with that');
      lines.push('- Don\'t rush past it');
      lines.push('- Let the weight land');
      break;
    }

    case 'time_aware': {
      const hour = new Date().getHours();
      let timeKey: 'late_night' | 'early_morning' | 'evening' = 'late_night';
      if (hour >= 5 && hour <= 8) timeKey = 'early_morning';
      else if (hour >= 18 && hour <= 22) timeKey = 'evening';

      lines.push(`CONTEXT: ${timeKey.replace('_', ' ')} conversation.`);
      const timeExamples = content.time_aware?.[timeKey];
      if (timeExamples && timeExamples.length > 0) {
        const example = timeExamples[Math.floor(Math.random() * timeExamples.length)];
        lines.push(`Time-aware observation: "${example}"`);
      }
      lines.push('');
      lines.push('GUIDANCE:');
      lines.push('- Match the energy of the hour');
      lines.push('- Late night thoughts often hold deeper meaning');
      lines.push('- No rush - time moves differently at night');
      break;
    }

    case 'late_conversation': {
      lines.push('CONTEXT: Deep into conversation. Good rapport established.');
      if (content.comfortable_presence?.late_conversation) {
        const examples = content.comfortable_presence.late_conversation;
        const example = examples[Math.floor(Math.random() * examples.length)];
        lines.push(`Comfortable presence: "${example}"`);
      }
      if (content.gentle_observations && content.gentle_observations.length > 0) {
        const observation = content.gentle_observations[Math.floor(Math.random() * content.gentle_observations.length)];
        lines.push(`Or: "${observation}"`);
      }
      break;
    }

    case 'general_pause': {
      lines.push('CONTEXT: Brief input - user may be thinking.');
      if (content.comfortable_presence?.general) {
        const examples = content.comfortable_presence.general;
        const example = examples[Math.floor(Math.random() * examples.length)];
        lines.push(`Presence: "${example}"`);
      }
      lines.push('');
      lines.push('GUIDANCE:');
      lines.push('- Give them space to think');
      lines.push('- Can offer a thoughtful question OR comfortable silence');
      
      // Maybe offer music or a game?
      if (input.userData.turnCount && input.userData.turnCount > 5) {
        if (content.music_offerings && content.music_offerings.length > 0) {
          const musicOffer = content.music_offerings[Math.floor(Math.random() * content.music_offerings.length)];
          lines.push(`Could offer: "${musicOffer}"`);
        }
      }
      break;
    }

    default:
      return null;
  }

  // Add thoughtful questions if we have topic context
  if (content.thoughtful_questions?.general && Math.random() > 0.7) {
    lines.push('');
    lines.push('OPTIONAL - A thoughtful question:');
    const questions = content.thoughtful_questions.general;
    const question = questions[Math.floor(Math.random() * questions.length)];
    lines.push(`"${question}"`);
  }

  return lines.join('\n');
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildSilenceContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
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

  // Usage rules
  const usageRules = content.usage_rules || {
    micro_story_min_turn_count: 3,
    thoughtful_question_min_turn_count: 5,
  };

  // Don't inject every turn
  if (turnCount - state.lastSilenceTurn < 3 && turnCount > 3) {
    return injections;
  }

  // Detect context
  const context = detectSilenceContext(input);

  if (context === 'none') {
    return injections;
  }

  // Generate guidance
  const guidance = generateSilenceGuidance(content, context, input);
  if (guidance) {
    // Use standard injection for heavy topics (should influence response)
    // Use hint for lighter contexts
    const injectionType = ['after_heavy_topic', 'after_personal_share'].includes(context)
      ? createStandardInjection
      : createHintInjection;

    injections.push(
      injectionType('silence', guidance, { category: 'conversational' })
    );

    // Update state
    state.lastSilenceTurn = turnCount;
    state.silenceCount++;

    log.debug(
      { sessionId, turnCount, context, silenceCount: state.silenceCount },
      'Silence guidance applied'
    );
  }

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupSilenceState(sessionId: string): void {
  sessionState.delete(sessionId);
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'silence_context',
  description: 'Handles meaningful silence - knowing when NOT to speak is superhuman',
  priority: 70, // Humanizing layer
  build: buildSilenceContext,
});

export { buildSilenceContext };
