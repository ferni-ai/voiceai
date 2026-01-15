/**
 * Speech Imperfections
 *
 * Enhanced imperfection patterns that create authentic human-like speech.
 *
 * @module @ferni/conversation/speech-naturalizer/imperfections
 */

import { createSeededRandom, createSystemRandom, type RandomSource } from '../utils/rng.js';
import type { RandomOptions } from './types.js';

function getRng(options: RandomOptions | undefined, salt: string): RandomSource {
  if (options?.rng) return options.rng;
  if (options?.randomSeed) return createSeededRandom(`${options.randomSeed}:${salt}`);
  return createSystemRandom();
}

// ============================================================================
// SENTENCE FRAGMENTS
// ============================================================================

/**
 * Generate natural sentence fragments
 */
export function generateFragment(context: 'trailing' | 'interrupted' | 'rethinking'): string {
  const fragments = {
    trailing: [
      "It's just that...",
      'The thing is...',
      'What I mean is...',
      'You know how...',
      'Sometimes I wonder if...',
    ],
    interrupted: ['Wait—', 'Oh, hold on—', 'Actually—', 'No, wait—', 'Hmm—'],
    rethinking: [
      'Well, actually...',
      'On second thought...',
      'Then again...',
      'But then...',
      'Although...',
    ],
  };

  const options = fragments[context];
  return options[getRng(undefined, `speech-fragment:${context}`).nextInt(options.length)];
}

// ============================================================================
// MID-THOUGHT CORRECTIONS
// ============================================================================

/**
 * Mid-thought course correction patterns
 */
export const MID_THOUGHT_CORRECTIONS: string[] = [
  'Actually, scratch that—what I really mean is',
  "Wait, no, that's not quite right—let me try again:",
  "Hmm, that didn't come out right. What I'm trying to say is",
  "Actually—no, forget that. Here's what I actually think:",
  "Let me back up. That's not what I meant. I meant",
  "No, wait. That's not it. It's more like",
  'Okay, that sounded better in my head. Let me rephrase:',
];

/**
 * Generate a mid-thought course correction
 */
export function generateCourseCorrection(
  originalThought: string,
  correctedThought: string
): string {
  const rng = getRng(undefined, `speech-course-correction:${originalThought}:${correctedThought}`);
  const correction = MID_THOUGHT_CORRECTIONS[rng.nextInt(MID_THOUGHT_CORRECTIONS.length)];
  return `${originalThought}<break time="300ms"/> ${correction} ${correctedThought}`;
}

// ============================================================================
// DOUBT TO CONVICTION
// ============================================================================

/**
 * Self-doubt to conviction transitions
 */
export const DOUBT_TO_CONVICTION: Array<{ doubt: string; conviction: string }> = [
  { doubt: "I'm not sure if this is right, but—", conviction: 'actually, no, I am sure:' },
  { doubt: 'This might be wrong, but I think—', conviction: "wait, no, I'm confident about this:" },
  { doubt: "I don't know if I should say this, but—", conviction: 'you know what, yes, I should:' },
  { doubt: "Maybe this doesn't make sense, but—", conviction: 'actually, it makes total sense:' },
  { doubt: 'I could be way off here, but—', conviction: "no, wait, I think I'm onto something:" },
];

/**
 * Generate a doubt-to-conviction transition
 */
export function generateDoubtToConviction(statement: string): string {
  const rng = getRng(undefined, `speech-doubt-to-conviction:${statement}`);
  const pattern = DOUBT_TO_CONVICTION[rng.nextInt(DOUBT_TO_CONVICTION.length)];
  return `${pattern.doubt}<break time="200ms"/> ${pattern.conviction} ${statement}`;
}

// ============================================================================
// THINKING OUT LOUD
// ============================================================================

/**
 * Thinking out loud patterns
 */
export const THINKING_OUT_LOUD: string[] = [
  'Let me think about this out loud for a second...',
  'Okay, so if I follow this through...',
  'Walking through this in my head...',
  'So the thing I keep coming back to is...',
  "I'm just going to say what I'm thinking here...",
  'Let me work through this with you...',
  "Okay, so I'm hearing... and that makes me wonder...",
  "I'm thinking... no, wait... okay, yes:",
];

/**
 * Generate a thinking-out-loud prefix
 */
export function generateThinkingOutLoud(): string {
  const rng = getRng(undefined, 'speech-thinking-out-loud');
  const phrase = THINKING_OUT_LOUD[rng.nextInt(THINKING_OUT_LOUD.length)];
  return `<break time="150ms"/>${phrase}<break time="300ms"/>`;
}

// ============================================================================
// GRACEFUL UNCERTAINTY
// ============================================================================

/**
 * Graceful uncertainty expressions
 */
export const GRACEFUL_UNCERTAINTY: string[] = [
  'I might be wrong about this, but',
  'I could be totally off base, but',
  'This is just my read on it, but',
  "I don't have the full picture, but from what I can see,",
  'Take this with a grain of salt, but',
  "I'm no expert, but it seems to me that",
  'I could be missing something, but',
  "Based on what you've shared—and I could be wrong—",
];

/**
 * Generate a graceful uncertainty prefix
 */
export function generateGracefulUncertainty(statement: string): string {
  const rng = getRng(undefined, `speech-graceful-uncertainty:${statement}`);
  const uncertainty = GRACEFUL_UNCERTAINTY[rng.nextInt(GRACEFUL_UNCERTAINTY.length)];
  return `${uncertainty} ${statement.charAt(0).toLowerCase()}${statement.slice(1)}`;
}

// ============================================================================
// SELF-INTERRUPTIONS
// ============================================================================

/**
 * Self-interruption patterns
 */
export const SELF_INTERRUPTIONS: Array<{ start: string; interrupt: string; resume: string }> = [
  {
    start: "So what you're saying is—",
    interrupt: 'wait, let me make sure I understand—',
    resume: 'okay, so',
  },
  { start: 'The thing is—', interrupt: 'actually, hold on—', resume: 'the REAL thing is' },
  {
    start: 'I think—',
    interrupt: "no, 'think' is too weak—",
    resume: 'I feel pretty strongly that',
  },
  {
    start: 'You should—',
    interrupt: "wait, I don't want to tell you what to do—",
    resume: 'what if you tried',
  },
];

/**
 * Generate a self-interruption
 */
export function generateSelfInterruption(statement: string): string {
  const rng = getRng(undefined, `speech-self-interruption:${statement}`);
  const pattern = SELF_INTERRUPTIONS[rng.nextInt(SELF_INTERRUPTIONS.length)];
  return `${pattern.start}<break time="200ms"/> ${pattern.interrupt}<break time="300ms"/> ${pattern.resume} ${statement}`;
}

// ============================================================================
// IMPERFECTION APPLICATION
// ============================================================================

/**
 * Determine if imperfection should be applied
 */
export function shouldApplyImperfection(context: {
  isSeriousContext?: boolean;
  emotion?: string;
  turnNumber?: number;
  rng?: RandomSource;
  randomSeed?: string;
}): boolean {
  if (context.isSeriousContext) return false;
  if (
    context.emotion === 'sad' ||
    context.emotion === 'anxious' ||
    context.emotion === 'vulnerable'
  ) {
    return false;
  }

  const turnModifier = Math.min(1, (context.turnNumber || 5) / 5);
  const rng = getRng(context, `speech-imperfection:${context.turnNumber ?? 0}`);
  return rng.nextFloat() < 0.15 * turnModifier;
}

/**
 * Apply random imperfection to response
 */
export function applyRandomImperfection(
  text: string,
  context: {
    isSeriousContext?: boolean;
    emotion?: string;
    turnNumber?: number;
    rng?: RandomSource;
    randomSeed?: string;
  }
): string {
  if (!shouldApplyImperfection(context)) return text;

  const rng = getRng(context, `speech-imperfection-roll:${context.turnNumber ?? 0}`);
  const roll = rng.nextFloat();

  if (roll < 0.25) {
    return `${generateThinkingOutLoud()}${text}`;
  } else if (roll < 0.45) {
    return generateGracefulUncertainty(text);
  } else if (roll < 0.65) {
    if (
      text.toLowerCase().includes('think') ||
      text.toLowerCase().includes('should') ||
      text.toLowerCase().includes('try')
    ) {
      return generateDoubtToConviction(text);
    }
  } else if (roll < 0.85) {
    const fragment = generateFragment('trailing');
    return `${fragment}<break time="200ms"/> ${text}`;
  }

  return text;
}
