/**
 * Response Length Variation Context Builder
 *
 * Humans don't always give medium-length responses. Sometimes they just say
 * "yeah" or "mmm, tell me more." Other times they go deep with a long,
 * thoughtful response. This builder guides natural length variation.
 *
 * Length signals:
 * - User venting → be brief, hold space
 * - User excited sharing → brief encouragements, let them talk
 * - User asking deep question → can go longer
 * - User processing → brief, give them room
 * - User just needs acknowledgment → just acknowledge!
 *
 * @module ResponseLengthContextBuilder
 */

import {
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
  createHintInjection,
} from './index.js';

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ResponseLength' });

// ============================================================================
// LENGTH DETERMINATION
// ============================================================================

type ResponseLength = 'minimal' | 'brief' | 'normal' | 'elaborate';

interface LengthSignals {
  isVenting: boolean;
  isProcessing: boolean;
  isExcitedSharing: boolean;
  needsAcknowledgment: boolean;
  askingDeepQuestion: boolean;
  justSharedSomethingBig: boolean;
  userMessageLength: 'short' | 'medium' | 'long';
}

/**
 * Detect signals that indicate what length response is appropriate
 */
function detectLengthSignals(
  userText: string,
  analysis: ContextBuilderInput['analysis']
): LengthSignals {
  const wordCount = userText.split(/\s+/).length;
  const userMessageLength: 'short' | 'medium' | 'long' =
    wordCount < 10 ? 'short' : wordCount < 50 ? 'medium' : 'long';

  const lower = userText.toLowerCase();

  return {
    isVenting: Boolean(
      analysis?.emotion?.isVenting ||
      (analysis?.emotion?.intensity &&
        analysis.emotion.intensity > 0.7 &&
        analysis?.emotion?.valence === 'negative')
    ),

    isProcessing: Boolean(
      analysis?.emotion?.isProcessing ||
      lower.includes('i think') ||
      lower.includes("i'm trying to") ||
      lower.includes('working through')
    ),

    isExcitedSharing: Boolean(
      analysis?.emotion?.primary === 'joy' ||
      analysis?.emotion?.primary === 'excitement' ||
      (analysis?.emotion?.intensity &&
        analysis.emotion.intensity > 0.6 &&
        analysis?.emotion?.valence === 'positive')
    ),

    needsAcknowledgment: Boolean(
      lower.endsWith('right?') ||
      lower.endsWith('you know?') ||
      lower.includes('i just') ||
      lower.includes('guess what')
    ),

    askingDeepQuestion: Boolean(
      analysis?.intent?.isQuestion &&
      (lower.includes('what do you think') ||
        lower.includes('how do i') ||
        lower.includes('what should') ||
        lower.includes('help me understand'))
    ),

    justSharedSomethingBig: Boolean(
      userMessageLength === 'long' &&
      analysis?.emotion?.intensity &&
      analysis.emotion.intensity > 0.5
    ),

    userMessageLength,
  };
}

/**
 * Determine ideal response length based on signals
 *
 * PHILOSOPHY: Ferni should be warm, curious, and ENGAGING.
 * Being too brief makes him feel cold and disinterested.
 * Only go minimal when truly appropriate (intense venting, clear acknowledgment needs).
 * Default to being present and substantive.
 */
function determineResponseLength(signals: LengthSignals): ResponseLength {
  // When asking a deep question - elaborate! Show your curiosity and depth.
  if (signals.askingDeepQuestion) {
    return 'elaborate';
  }

  // When they're venting with HIGH intensity - hold space briefly, then engage
  // Changed: Only go brief (not minimal) - Ferni should still be present
  if (signals.isVenting) {
    return 'brief';
  }

  // When they're processing - be present but give them room
  if (signals.isProcessing) {
    return 'brief';
  }

  // When they're excited sharing long messages - let them shine, but celebrate!
  // Changed: Only brief if their message is actually long
  if (signals.isExcitedSharing && signals.userMessageLength === 'long') {
    return 'brief';
  }

  // When they just shared something big - acknowledge deeply, then explore
  // Changed: Go normal, not brief - big shares deserve full presence
  if (signals.justSharedSomethingBig) {
    return 'normal';
  }

  // When they just need acknowledgment - brief is fine, but not minimal
  // Changed: brief instead of minimal - Ferni should still engage
  if (signals.needsAcknowledgment) {
    return 'brief';
  }

  // REDUCED RANDOM VARIATION
  // Ferni's warmth and engagement are core to who he is.
  // Only occasionally go brief (10%), never randomly go minimal.
  const randomValue = Math.random();
  if (randomValue < 0.1) {
    return 'brief'; // Sometimes shorter is appropriate
  }

  // Default to normal - Ferni should be engaging, curious, present
  return 'normal';
}

// ============================================================================
// RESPONSE LENGTH GUIDANCE
// ============================================================================

const LENGTH_GUIDANCE: Record<
  ResponseLength,
  {
    description: string;
    examples: string[];
    maxSentences: string;
  }
> = {
  minimal: {
    description: 'Brief acknowledgment, then a curious follow-up. Still be present.',
    examples: [
      '"That\'s a lot. What\'s weighing on you most?"',
      '"I hear you. Go on..."',
      '"That landed. Tell me more."',
    ],
    maxSentences: '2-3 sentences',
  },

  brief: {
    description: 'Acknowledge warmly, then invite them to continue or ask a curious question.',
    examples: [
      '"That makes sense. What else is going on?"',
      '"I can see why that would be hard. What happened next?"',
      '"What\'s that like for you?"',
    ],
    maxSentences: '3-4 sentences',
  },

  normal: {
    description: 'Engaged presence. Acknowledge, explore, be curious. This is your default.',
    examples: [],
    maxSentences: '4-7 sentences',
  },

  elaborate: {
    description: 'Go deep when they want depth. Explore, share, connect.',
    examples: [],
    maxSentences: '7-12 sentences when the conversation calls for it',
  },
};

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build response length guidance
 */
async function buildResponseLengthContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, analysis, userData } = input;
  const injections: ContextInjection[] = [];

  // Detect signals
  const signals = detectLengthSignals(userText, analysis);

  // Determine ideal length
  const length = determineResponseLength(signals);

  // Only inject guidance for non-normal lengths
  if (length === 'normal') {
    return injections;
  }

  const guidance = LENGTH_GUIDANCE[length];

  const lines: string[] = [
    `[📏 RESPONSE LENGTH: ${length.toUpperCase()}]`,
    '',
    guidance.description,
    '',
    `Target: ${guidance.maxSentences}`,
  ];

  if (guidance.examples.length > 0) {
    lines.push('');
    lines.push('Examples of appropriate responses:');
    for (const example of guidance.examples.slice(0, 3)) {
      lines.push(`• ${example}`);
    }
  }

  // Add context-specific guidance
  if (signals.isVenting) {
    lines.push('');
    lines.push("⚠️ They're venting. DO NOT:");
    lines.push('• Give advice');
    lines.push('• Try to fix it');
    lines.push('• Share your own similar experience');
    lines.push('');
    lines.push('DO: Hold space. Let them feel heard. Brief acknowledgments.');
  }

  if (signals.isProcessing) {
    lines.push('');
    lines.push("💭 They're processing. Give them room to think.");
    lines.push('Brief reflections, then let them continue.');
  }

  if (signals.isExcitedSharing) {
    lines.push('');
    lines.push("🎉 They're excited! Let them have the spotlight.");
    lines.push('Enthusiastic but brief encouragements.');
  }

  injections.push(createHintInjection('response_length', lines.join('\n'), { category: 'pacing' }));

  log.debug(
    {
      length,
      signals: {
        venting: signals.isVenting,
        processing: signals.isProcessing,
        excited: signals.isExcitedSharing,
        acknowledgment: signals.needsAcknowledgment,
        deepQuestion: signals.askingDeepQuestion,
        bigShare: signals.justSharedSomethingBig,
        messageLength: signals.userMessageLength,
      },
    },
    '📏 Response length guidance'
  );

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'response_length',
  description: 'Guide natural response length variation - sometimes brief, sometimes elaborate',
  priority: 70, // High priority - affects overall response shape
  build: buildResponseLengthContext,
});

export { buildResponseLengthContext, detectLengthSignals, determineResponseLength };
