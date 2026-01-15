/**
 * Emotional Contagion Timing System
 *
 * Humans don't instantly mirror emotions - they "catch" the emotion,
 * process it, then reflect it back. This builder adds that human-like
 * timing to emotional responses.
 *
 * The Absorb → Process → Reflect pattern:
 * - ABSORB: Brief receiving phase (~200-500ms conceptually)
 * - PROCESS: Verbal indicator showing processing ("...yeah.")
 * - REFLECT: Mirror back at 70-90% intensity (never exact match)
 *
 * This makes emotional responses feel genuine rather than algorithmic.
 *
 * @module intelligence/context-builders/emotional/emotional-contagion-timing
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createHighInjection,
  createStandardInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
  BuilderCategory,
} from '../index.js';

const log = createLogger({ module: 'EmotionalContagionTiming' });

// ============================================================================
// TYPES
// ============================================================================

type EmotionIntensity = 'low' | 'moderate' | 'high' | 'intense';
type ContagionPhase = 'absorb' | 'process' | 'reflect';

interface EmotionalState {
  emotion: string;
  intensity: EmotionIntensity;
  isVulnerable: boolean;
  isCelebration: boolean;
  isDistress: boolean;
}

interface ContagionTiming {
  /** Verbal processing indicator to use */
  processingPhrase: string;
  /** How much to mirror (0.7 = 70% of their intensity) */
  mirrorIntensity: number;
  /** Should we hold space instead of matching? */
  holdSpace: boolean;
  /** Additional guidance */
  reflectionGuidance: string;
}

// ============================================================================
// PROCESSING PHRASES - The "catch" moment
// ============================================================================

/**
 * These are the verbal indicators that show Ferni is processing,
 * not just instantly responding. They create the "human catch" effect.
 */
const PROCESSING_PHRASES = {
  // For heavy emotions - need more processing time
  heavy: [
    '...yeah.',
    '[pause] ...wow.',
    "[brief pause] ...that's a lot.",
    '...hmm.',
    '[silence] ...I hear that.',
  ],

  // For excitement - catch up to their energy
  excitement: [
    'Oh! ...wait, really?',
    '...oh wow!',
    "[catching up] ...that's amazing!",
    "...wait—that's huge!",
  ],

  // For sadness - gentle receiving
  sadness: ['...oh.', '[softly] ...yeah.', '...I hear you.', "[pause] ...that's hard."],

  // For frustration - validate before solving
  frustration: [
    '...yeah, that would be frustrating.',
    '[exhale] ...ugh, I get that.',
    "...that's annoying.",
    "...I can see why that's bothering you.",
  ],

  // For anxiety - grounding presence
  anxiety: [
    "...okay. I'm here.",
    "[steady] ...let's slow down.",
    "...take a breath. I'm listening.",
    '...okay. One thing at a time.',
  ],

  // For joy - shared delight
  joy: [
    "...aww, that's wonderful!",
    '[warm] ...I love that.',
    '...oh, that makes me smile.',
    "...yes! That's so good.",
  ],

  // Default - neutral processing
  default: ['...hmm.', '...okay.', '...I see.', '...yeah.'],
};

// ============================================================================
// REFLECTION GUIDANCE - How to mirror back
// ============================================================================

const REFLECTION_GUIDANCE: Record<string, string> = {
  sadness: `After your processing pause, reflect their feeling back gently.
Don't try to fix it immediately. Your first words after the pause should
acknowledge what they're feeling: "That sounds really painful" or 
"You're carrying a lot right now."`,

  frustration: `Match their frustration briefly - be on their side first.
"That IS annoying" or "You have every right to be frustrated."
Only move toward solutions if they seem ready.`,

  anxiety: `Be a calm anchor. Don't match anxious energy - be the grounding force.
Speak steadily and slowly. Less is more. Your calm presence matters more
than your words.`,

  excitement: `Let yourself catch their joy! It's okay to be enthusiastic.
"That's AMAZING!" "I'm so happy for you!" Don't rush to caveats or
practicalities. Celebrate with them first.`,

  joy: `Share their happiness genuinely. Smile in your voice.
Ask them to tell you more. "What was that moment like?" 
Let them savor it.`,

  fear: `Validate the fear without amplifying it. "That sounds scary"
is better than "That IS scary." Be present without fixing.
Ask what they need.`,

  shame: `Extra gentle here. Don't minimize or over-validate.
"Thank you for telling me that" acknowledges the courage it took.
Meet vulnerability with warmth, not solutions.`,

  default: `Reflect their emotion back before responding to content.
A brief acknowledgment - "I hear you" - creates connection
before you say anything else.`,
};

// ============================================================================
// INTENSITY DETECTION
// ============================================================================

function detectEmotionState(input: ContextBuilderInput): EmotionalState | null {
  const { analysis, voiceEmotion, userText } = input;

  const emotion = analysis?.emotion;
  if (!emotion) return null;

  const primary = emotion.primary?.toLowerCase() || '';
  const rawIntensity = emotion.intensity || 0.5;

  // Map to our intensity levels
  let intensity: EmotionIntensity = 'moderate';
  if (rawIntensity > 0.8) intensity = 'intense';
  else if (rawIntensity > 0.6) intensity = 'high';
  else if (rawIntensity < 0.3) intensity = 'low';

  // Check for vulnerability markers
  const lower = userText.toLowerCase();
  const isVulnerable =
    emotion.needsSupport === true ||
    lower.includes("i've never") ||
    lower.includes('first time') ||
    lower.includes('hard to say') ||
    lower.includes("don't usually") ||
    rawIntensity > 0.7;

  // Check for celebration
  const isCelebration =
    ['joy', 'excitement', 'proud', 'happy', 'thrilled'].includes(primary) && rawIntensity > 0.5;

  // Check for distress
  const isDistress =
    ['fear', 'anxiety', 'panic', 'overwhelmed', 'despair'].includes(primary) ||
    (emotion.needsSupport === true && rawIntensity > 0.6);

  return {
    emotion: primary,
    intensity,
    isVulnerable,
    isCelebration,
    isDistress,
  };
}

// ============================================================================
// TIMING CALCULATOR
// ============================================================================

function calculateContagionTiming(state: EmotionalState): ContagionTiming {
  const { emotion, intensity, isVulnerable, isCelebration, isDistress } = state;

  // Get appropriate processing phrase category
  let phraseCategory: keyof typeof PROCESSING_PHRASES = 'default';

  if (isDistress) phraseCategory = 'anxiety';
  else if (['sadness', 'grief', 'loss', 'hurt'].includes(emotion)) phraseCategory = 'sadness';
  else if (['frustration', 'anger', 'annoyed', 'irritated'].includes(emotion))
    phraseCategory = 'frustration';
  else if (['anxiety', 'worried', 'nervous', 'scared', 'fear'].includes(emotion))
    phraseCategory = 'anxiety';
  else if (isCelebration || ['excitement', 'thrilled'].includes(emotion))
    phraseCategory = 'excitement';
  else if (['joy', 'happy', 'content', 'grateful'].includes(emotion)) phraseCategory = 'joy';
  else if (intensity === 'intense' || intensity === 'high') phraseCategory = 'heavy';

  // Select a processing phrase
  const phrases = PROCESSING_PHRASES[phraseCategory];
  const processingPhrase = phrases[Math.floor(Math.random() * phrases.length)];

  // Calculate mirror intensity (never 100% - that feels robotic)
  let mirrorIntensity = 0.8; // Default: 80%

  if (intensity === 'intense')
    mirrorIntensity = 0.75; // Dial back slightly on intense
  else if (intensity === 'high') mirrorIntensity = 0.85;
  else if (intensity === 'moderate') mirrorIntensity = 0.8;
  else if (intensity === 'low') mirrorIntensity = 0.9; // Can match more closely on subtle

  // Anxiety: Be calmer than they are (grounding effect)
  if (isDistress || emotion === 'anxiety') {
    mirrorIntensity = 0.5; // Be notably calmer
  }

  // Celebration: Can go higher!
  if (isCelebration) {
    mirrorIntensity = 0.95; // Share the joy fully
  }

  // Hold space for vulnerability
  const holdSpace = isVulnerable && !isCelebration;

  // Get reflection guidance
  let guidanceKey = emotion;
  if (!REFLECTION_GUIDANCE[guidanceKey]) guidanceKey = 'default';
  const reflectionGuidance = REFLECTION_GUIDANCE[guidanceKey];

  return {
    processingPhrase,
    mirrorIntensity,
    holdSpace,
    reflectionGuidance,
  };
}

// ============================================================================
// SESSION STATE - Track contagion patterns
// ============================================================================

interface ContagionSessionState {
  lastEmotionMirrored: string | null;
  emotionMirrorCount: number;
  lastContagionTurn: number;
}

const sessionStates = new Map<string, ContagionSessionState>();

function getSessionState(sessionId: string): ContagionSessionState {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      lastEmotionMirrored: null,
      emotionMirrorCount: 0,
      lastContagionTurn: -3, // Allow first few turns
    };
    sessionStates.set(sessionId, state);
  }
  return state;
}

export function clearContagionSession(sessionId: string): void {
  sessionStates.delete(sessionId);
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export const emotionalContagionTimingBuilder: ContextBuilder = {
  name: 'emotional-contagion-timing',
  description: 'Adds human-like processing delay before emotional mirroring',
  priority: 72, // Just below energy-mirroring (75)
  category: BuilderCategory.EMOTIONAL,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, userData } = input;
    const injections: ContextInjection[] = [];

    const sessionId = services?.sessionId || 'unknown';
    const turnCount = userData?.turnCount || 0;
    const sessionState = getSessionState(sessionId);

    // Detect emotional state
    const emotionalState = detectEmotionState(input);
    if (!emotionalState) {
      return []; // No emotion detected
    }

    // Don't inject on every turn (space it out)
    const turnsSinceLastContagion = turnCount - sessionState.lastContagionTurn;
    if (turnsSinceLastContagion < 2 && emotionalState.intensity !== 'intense') {
      return []; // Too soon, unless it's intense
    }

    // Only inject for significant emotions
    if (emotionalState.intensity === 'low' && !emotionalState.isVulnerable) {
      return [];
    }

    // Calculate timing
    const timing = calculateContagionTiming(emotionalState);

    // Build injection content
    const lines: string[] = [
      `[🫀 EMOTIONAL CONTAGION - ${emotionalState.emotion.toUpperCase()}]`,
      '',
      '**Processing Phase:**',
      `Before your substantive response, include a processing moment: "${timing.processingPhrase}"`,
      '',
    ];

    if (timing.holdSpace) {
      lines.push('**Hold Space:**');
      lines.push('This is a vulnerable moment. Your first response should be brief.');
      lines.push('Let them feel heard before you say more.');
      lines.push('');
    }

    lines.push('**Reflection Guidance:**');
    lines.push(timing.reflectionGuidance);
    lines.push('');

    lines.push(`**Mirroring Intensity:** ${Math.round(timing.mirrorIntensity * 100)}%`);
    if (timing.mirrorIntensity < 0.7) {
      lines.push('(Be calmer than they are - be a grounding presence)');
    } else if (timing.mirrorIntensity > 0.9) {
      lines.push('(Match their energy! Celebrate with them!)');
    } else {
      lines.push('(Match their feeling without overcooking it)');
    }

    // Use high injection for distress/vulnerability, standard otherwise
    if (emotionalState.isDistress || emotionalState.isVulnerable) {
      injections.push(
        createHighInjection('emotional_contagion', lines.join('\n'), {
          category: 'emotional',
        })
      );
    } else {
      injections.push(
        createStandardInjection('emotional_contagion', lines.join('\n'), {
          category: 'emotional',
        })
      );
    }

    // Update session state
    sessionState.lastEmotionMirrored = emotionalState.emotion;
    sessionState.emotionMirrorCount++;
    sessionState.lastContagionTurn = turnCount;

    log.debug(
      {
        emotion: emotionalState.emotion,
        intensity: emotionalState.intensity,
        isVulnerable: emotionalState.isVulnerable,
        mirrorIntensity: timing.mirrorIntensity,
        holdSpace: timing.holdSpace,
      },
      '🫀 Emotional contagion timing'
    );

    return injections;
  },
};

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder(emotionalContagionTimingBuilder);

export { detectEmotionState, calculateContagionTiming, type EmotionalState, type ContagionTiming };
