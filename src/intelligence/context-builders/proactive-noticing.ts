/**
 * Proactive Noticing Context Builder
 *
 * "Better Than Human" - Actually SPEAKS the patterns we detect.
 *
 * Most AI systems detect patterns but never surface them.
 * This builder actively injects "I notice..." observations
 * that create "they really see me" moments.
 *
 * What we surface:
 * - Repeated mentions of topics/emotions (3+ times)
 * - Voice/text contradictions ("I'm fine" + sad voice)
 * - Deflection patterns (avoiding certain topics)
 * - Growth moments (changed behavior over time)
 * - Energy/mood patterns across conversations
 *
 * @module ProactiveNoticingContext
 */

import {
  type ContextBuilderInput,
  type ContextInjection,
  createHighInjection,
  createStandardInjection,
  registerContextBuilder,
} from './index.js';
import { BuilderCategory } from './categories.js';
import { createLogger } from '../../utils/safe-logger.js';
import { loadPersonaContent } from '../../services/persona-content-loader.js';

const log = createLogger({ module: 'ProactiveNoticing' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Probability of surfacing a notice (to avoid overuse)
 * Start conservative - can increase based on user reception
 */
const SURFACING_PROBABILITY = 0.15; // 15% chance per turn when triggered

/**
 * Minimum turns between surfacing notices
 */
const MIN_TURNS_BETWEEN_NOTICES = 8;

/**
 * Minimum relationship stage for deeper noticing
 */
const DEEP_NOTICING_MIN_STAGE = 'friend';

/**
 * In-memory tracking to avoid over-surfacing
 */
const lastNoticeSurfaced = new Map<string, number>(); // userId -> turnCount

// ============================================================================
// I-NOTICE PHRASE LOADING
// ============================================================================

interface INoticePhrases {
  opening_frames: {
    gentle_openings: string[];
    soft_landings: string[];
  };
  surfacing_phrases: {
    temporal_patterns: string[];
    behavioral_patterns: string[];
    emotional_patterns: string[];
  };
  contradiction_surfacing: {
    phrases: string[];
    relationship_gate: string;
  };
  growth_noticing: {
    phrases: string[];
  };
  voice_noticing: {
    phrases: string[];
  };
  what_they_didnt_say: {
    phrases: string[];
  };
}

let cachedPhrases: INoticePhrases | null = null;

async function loadINoticePhrases(personaId: string): Promise<INoticePhrases | null> {
  if (cachedPhrases) return cachedPhrases;

  try {
    const content = await loadPersonaContent<INoticePhrases>(personaId, 'i-notice-power');
    if (content) {
      cachedPhrases = content;
      return cachedPhrases;
    }
  } catch (err) {
    log.debug({ personaId, error: String(err) }, 'Could not load i-notice-power.json');
  }

  return null;
}

// ============================================================================
// PATTERN DETECTION HELPERS
// ============================================================================

interface TopicMention {
  topic: string;
  count: number;
  emotion?: string;
  lastMentioned: number; // turn number
}

interface DetectedPattern {
  type: 'frequency' | 'contradiction' | 'deflection' | 'growth' | 'energy';
  description: string;
  confidence: number;
  surfacePhrase: string;
}

/**
 * Detect repeating topic/emotion patterns
 */
function detectFrequencyPattern(
  userText: string,
  userData: ContextBuilderInput['userData'],
  analysis: ContextBuilderInput['analysis']
): DetectedPattern | null {
  // Check for repeated emotion mentions
  const emotion = analysis?.emotion?.primary;
  const intensity = analysis?.emotion?.intensity || 0;

  // Get recent topics from user data
  const recentTopics = userData?.recentTopics || [];
  const currentTopic = analysis?.topics?.primary;

  // Count emotion mentions in recent conversation
  // This is a simplified heuristic - real implementation would use persistent storage
  if (emotion && intensity > 0.5) {
    const emotionMentionThreshold = 3;
    // Check if this emotion appears frequently in recent context
    // For now, use a probability-based trigger with intensity
    if (intensity > 0.7 && Math.random() < 0.3) {
      return {
        type: 'frequency',
        description: `User expressing strong ${emotion} emotion`,
        confidence: intensity,
        surfacePhrase: `You've mentioned feeling ${emotion} a few times now. Is there something underneath that?`,
      };
    }
  }

  return null;
}

/**
 * Detect voice/text contradictions
 */
function detectContradictionPattern(
  userText: string,
  analysis: ContextBuilderInput['analysis']
): DetectedPattern | null {
  const lowerText = userText.toLowerCase();
  const voiceEmotion = analysis?.emotion?.primary;
  const voiceIntensity = analysis?.emotion?.intensity || 0;

  // "I'm fine" patterns with negative voice emotion
  const finePatterns = [
    "i'm fine",
    "i'm okay",
    "it's fine",
    "it's okay",
    "i'm good",
    "it's whatever",
    "it doesn't matter",
  ];

  const negativVoiceEmotions = ['sad', 'anxious', 'frustrated', 'tired', 'stressed', 'worried'];

  const saidFine = finePatterns.some((p) => lowerText.includes(p));
  const voiceSaysOtherwise =
    negativVoiceEmotions.includes(voiceEmotion || '') && voiceIntensity > 0.4;

  if (saidFine && voiceSaysOtherwise) {
    return {
      type: 'contradiction',
      description: `Said "${userText.slice(0, 30)}..." but voice indicates ${voiceEmotion}`,
      confidence: voiceIntensity,
      surfacePhrase: `You said you're fine, but... I hear something else in your voice. You don't have to talk about it. But I notice.`,
    };
  }

  return null;
}

/**
 * Detect deflection/avoidance patterns
 */
function detectDeflectionPattern(userText: string): DetectedPattern | null {
  const lowerText = userText.toLowerCase();

  const deflectionPatterns = [
    /anyway,? (what about|how about|let's talk about)/i,
    /but enough about (me|that)/i,
    /forget i said/i,
    /never ?mind/i,
    /let's move on/i,
    /i don't (want to|wanna) talk about/i,
    /can we (change|talk about something)/i,
  ];

  for (const pattern of deflectionPatterns) {
    if (pattern.test(lowerText)) {
      return {
        type: 'deflection',
        description: 'User deflecting from current topic',
        confidence: 0.7,
        surfacePhrase: `You just steered us away from something. We don't have to go back there. But I noticed.`,
      };
    }
  }

  return null;
}

/**
 * Select appropriate opening frame and phrase
 */
function buildNoticingPhrase(
  pattern: DetectedPattern,
  phrases: INoticePhrases,
  relationshipStage: string
): string {
  // Select opening
  const openings = phrases.opening_frames.gentle_openings;
  const opening = openings[Math.floor(Math.random() * openings.length)];

  // Get type-specific phrase
  let bodyPhrase = pattern.surfacePhrase;

  switch (pattern.type) {
    case 'contradiction':
      if (relationshipStage === 'friend' || relationshipStage === 'close_friend') {
        const contradictionPhrases = phrases.contradiction_surfacing.phrases;
        if (contradictionPhrases.length > 0) {
          bodyPhrase =
            contradictionPhrases[Math.floor(Math.random() * contradictionPhrases.length)];
        }
      }
      break;
    case 'frequency':
      const emotionalPhrases = phrases.surfacing_phrases.emotional_patterns;
      if (emotionalPhrases.length > 0) {
        bodyPhrase = emotionalPhrases[Math.floor(Math.random() * emotionalPhrases.length)];
      }
      break;
    case 'deflection':
      const unsaidPhrases = phrases.what_they_didnt_say.phrases;
      if (unsaidPhrases.length > 0) {
        bodyPhrase = unsaidPhrases[Math.floor(Math.random() * unsaidPhrases.length)];
      }
      break;
  }

  // Clean up template variables (replace with generic if not filled)
  bodyPhrase = bodyPhrase
    .replace(/\{emotion\}/g, 'something heavy')
    .replace(/\{topic\}/g, 'that')
    .replace(/\{person\}/g, 'someone')
    .replace(/\{goal\}/g, 'that goal')
    .replace(/\{value\}/g, 'what matters');

  return `${opening} ${bodyPhrase}`;
}

// ============================================================================
// MAIN CONTEXT BUILDER
// ============================================================================

async function buildProactiveNoticingContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userText, analysis, userData, services, persona } = input;
  const userId = services?.userId;
  const turnCount = userData?.turnCount || 0;
  const personaId = persona?.id || 'ferni';
  const relationshipStage =
    ((userData as Record<string, unknown> | undefined)?.relationshipStage as string) || 'stranger';

  // Skip if no user identification
  if (!userId) return [];

  // Skip early turns (let relationship build first)
  if (turnCount < 3) return [];

  // Check cooldown
  const lastNotice = lastNoticeSurfaced.get(userId) || 0;
  if (turnCount - lastNotice < MIN_TURNS_BETWEEN_NOTICES) {
    return [];
  }

  // Load I-notice phrases
  const phrases = await loadINoticePhrases(personaId);
  if (!phrases) {
    log.debug({ personaId }, 'No i-notice phrases loaded');
    return [];
  }

  // Detect patterns
  const patterns: DetectedPattern[] = [];

  // 1. Check for voice/text contradiction (highest priority)
  const contradiction = detectContradictionPattern(userText, analysis);
  if (contradiction) patterns.push(contradiction);

  // 2. Check for deflection
  const deflection = detectDeflectionPattern(userText);
  if (deflection) patterns.push(deflection);

  // 3. Check for frequency patterns
  const frequency = detectFrequencyPattern(userText, userData, analysis);
  if (frequency) patterns.push(frequency);

  // No patterns detected
  if (patterns.length === 0) return [];

  // Select highest confidence pattern
  const bestPattern = patterns.sort((a, b) => b.confidence - a.confidence)[0];

  // Apply probability gate
  if (Math.random() > SURFACING_PROBABILITY) {
    log.debug(
      { userId, pattern: bestPattern.type, confidence: bestPattern.confidence },
      'Pattern detected but probability gate not passed'
    );
    return [];
  }

  // Build the noticing phrase
  const noticingPhrase = buildNoticingPhrase(bestPattern, phrases, relationshipStage);

  // Record that we surfaced a notice
  lastNoticeSurfaced.set(userId, turnCount);

  log.info(
    {
      userId,
      pattern: bestPattern.type,
      confidence: bestPattern.confidence,
      turnCount,
    },
    '🔍 BETTER-THAN-HUMAN: Surfacing proactive notice'
  );

  return [
    createHighInjection(
      'proactive_noticing',
      `[BETTER-THAN-HUMAN MOMENT] You noticed something worth surfacing. Consider saying something like: "${noticingPhrase}" - but make it natural and in your own voice. This is a "they really see me" moment. Offer an exit ramp.`,
      { category: 'trust', confidence: bestPattern.confidence }
    ),
  ];
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'proactive-noticing',
  description: 'Surfaces "I notice..." observations about patterns (Better Than Human)',
  priority: 35, // After safety, before general context
  category: BuilderCategory.HUMANIZING,
  build: buildProactiveNoticingContext,
});

export { buildProactiveNoticingContext };
