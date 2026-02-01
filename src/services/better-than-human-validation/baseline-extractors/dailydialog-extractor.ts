/**
 * DailyDialog Baseline Extractor
 *
 * Extracts commitment examples (commissive speech acts) from the DailyDialog dataset
 * for use in BTH capability benchmarking.
 *
 * Dataset source: https://huggingface.co/datasets/li2017dailydialog/daily_dialog
 *
 * Dialog Act Labels:
 *   0 = __dummy__
 *   1 = inform
 *   2 = question
 *   3 = directive
 *   4 = commissive (promises, commitments - WHAT WE WANT)
 *
 * Emotion Labels:
 *   0 = no emotion
 *   1 = anger
 *   2 = disgust
 *   3 = fear
 *   4 = happiness
 *   5 = sadness
 *   6 = surprise
 *
 * @module better-than-human-validation/baseline-extractors
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'DailyDialogExtractor' });

// ============================================================================
// TYPES
// ============================================================================

export interface DailyDialogUtterance {
  text: string;
  dialogAct: number;
  emotion: number;
}

export interface DailyDialogConversation {
  dialog: string[];
  act: number[];
  emotion: number[];
}

export interface CommitmentExample {
  /** The commitment utterance */
  utterance: string;
  /** Previous turns for context */
  context: string[];
  /** Emotion label (0-6) */
  emotion: number;
  /** Dialog act (should be 4 for commissive) */
  dialogAct: number;
  /** Is this a clear commitment? (heuristic) */
  isStrongCommitment: boolean;
  /** Source dataset */
  source: 'dailydialog';
}

export interface EmotionalExample {
  /** The emotional utterance */
  utterance: string;
  /** Previous turns for context */
  context: string[];
  /** Emotion category */
  emotion: 'anger' | 'disgust' | 'fear' | 'happiness' | 'sadness' | 'surprise';
  /** Emotion intensity heuristic (0-1) */
  intensity: number;
  /** Source dataset */
  source: 'dailydialog';
}

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

const EMOTION_MAP: Record<number, EmotionalExample['emotion'] | null> = {
  0: null, // no emotion
  1: 'anger',
  2: 'disgust',
  3: 'fear',
  4: 'happiness',
  5: 'sadness',
  6: 'surprise',
};

const DIALOG_ACT_COMMISSIVE = 4;

/**
 * Commitment-indicating phrases for stronger detection
 */
const COMMITMENT_PATTERNS = [
  /\bi will\b/i,
  /\bi'll\b/i,
  /\bi promise\b/i,
  /\bi'm going to\b/i,
  /\bi am going to\b/i,
  /\blet me\b/i,
  /\bcount on me\b/i,
  /\bi can do\b/i,
  /\bi'll make sure\b/i,
  /\bdefinitely\b/i,
  /\bfor sure\b/i,
  /\bi guarantee\b/i,
  /\byou have my word\b/i,
  /\bi swear\b/i,
  /\bi commit\b/i,
  /\bi pledge\b/i,
];

/**
 * Extract commitment examples from DailyDialog conversations
 */
export function extractCommitments(conversations: DailyDialogConversation[]): CommitmentExample[] {
  const commitments: CommitmentExample[] = [];

  for (const conv of conversations) {
    const { dialog, act, emotion } = conv;

    for (let i = 0; i < dialog.length; i++) {
      // Check if this is a commissive speech act
      if (act[i] === DIALOG_ACT_COMMISSIVE) {
        const utterance = dialog[i].trim();

        // Get context (up to 3 previous turns)
        const context = dialog.slice(Math.max(0, i - 3), i).map((u) => u.trim());

        // Check for strong commitment language
        const isStrongCommitment = COMMITMENT_PATTERNS.some((pattern) => pattern.test(utterance));

        commitments.push({
          utterance,
          context,
          emotion: emotion[i],
          dialogAct: act[i],
          isStrongCommitment,
          source: 'dailydialog',
        });
      }
    }
  }

  log.info({ count: commitments.length }, 'Extracted commitments from DailyDialog');
  return commitments;
}

/**
 * Extract emotional examples from DailyDialog conversations
 */
export function extractEmotionalExamples(
  conversations: DailyDialogConversation[]
): EmotionalExample[] {
  const examples: EmotionalExample[] = [];

  for (const conv of conversations) {
    const { dialog, emotion } = conv;

    for (let i = 0; i < dialog.length; i++) {
      const emotionLabel = EMOTION_MAP[emotion[i]];

      // Skip if no emotion
      if (!emotionLabel) continue;

      const utterance = dialog[i].trim();
      const context = dialog.slice(Math.max(0, i - 3), i).map((u) => u.trim());

      // Simple intensity heuristic based on punctuation and caps
      const exclamations = (utterance.match(/!/g) || []).length;
      const questions = (utterance.match(/\?/g) || []).length;
      const capsRatio = (utterance.match(/[A-Z]/g) || []).length / utterance.length;
      const intensity = Math.min(1, 0.5 + exclamations * 0.1 + capsRatio * 0.5);

      examples.push({
        utterance,
        context,
        emotion: emotionLabel,
        intensity,
        source: 'dailydialog',
      });
    }
  }

  log.info({ count: examples.length }, 'Extracted emotional examples from DailyDialog');
  return examples;
}

/**
 * Filter to get only strong commitments (for benchmark test cases)
 */
export function getStrongCommitmentsOnly(commitments: CommitmentExample[]): CommitmentExample[] {
  return commitments.filter((c) => c.isStrongCommitment);
}

/**
 * Filter to get examples by emotion type
 */
export function getExamplesByEmotion(
  examples: EmotionalExample[],
  emotion: EmotionalExample['emotion']
): EmotionalExample[] {
  return examples.filter((e) => e.emotion === emotion);
}

/**
 * Convert extracted examples to BTH test case format
 */
export function toCommitmentTestCases(commitments: CommitmentExample[]): Array<{
  id: string;
  input: string;
  expectedOutput: { detected: boolean; commitment?: string };
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
}> {
  return commitments.map((c, i) => ({
    id: `dailydialog_commitment_${i}`,
    input: c.context.length > 0 ? `${c.context.join(' ')} ${c.utterance}` : c.utterance,
    expectedOutput: {
      detected: true,
      commitment: c.utterance,
    },
    difficulty: c.isStrongCommitment ? 'easy' : 'hard',
    category: 'real_conversation',
  }));
}

/**
 * Convert emotional examples to subtext detection test cases
 */
export function toEmotionalTestCases(examples: EmotionalExample[]): Array<{
  id: string;
  input: string;
  expectedOutput: { detected: boolean; emotion?: string };
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
}> {
  return examples.map((e, i) => ({
    id: `dailydialog_emotion_${i}`,
    input: e.context.length > 0 ? `${e.context.join(' ')} ${e.utterance}` : e.utterance,
    expectedOutput: {
      detected: true,
      emotion: e.emotion,
    },
    difficulty: e.intensity > 0.7 ? 'easy' : e.intensity > 0.5 ? 'medium' : 'hard',
    category: 'real_conversation',
  }));
}

// ============================================================================
// SAMPLE DATA (for testing without downloading full dataset)
// ============================================================================

/**
 * Sample DailyDialog conversations for testing
 * These are representative examples from the dataset
 */
export const SAMPLE_CONVERSATIONS: DailyDialogConversation[] = [
  {
    dialog: [
      "I'm thinking about going to the gym more often.",
      "That's great! When are you planning to start?",
      "I'll start going three times a week starting Monday.",
      "I'll hold you to that!",
    ],
    act: [1, 2, 4, 1], // inform, question, commissive, inform
    emotion: [0, 4, 4, 4], // neutral, happy, happy, happy
  },
  {
    dialog: [
      'Are you coming to the party tonight?',
      "I'm not sure, I have a lot of work.",
      'Come on, you promised!',
      "Okay, I'll be there by 8.",
    ],
    act: [2, 1, 3, 4], // question, inform, directive, commissive
    emotion: [0, 5, 0, 0], // neutral, sad, neutral, neutral
  },
  {
    dialog: [
      "I can't believe he said that to you!",
      "I know, I'm so angry right now.",
      'You should tell him how you feel.',
      'I will, first thing tomorrow morning.',
    ],
    act: [1, 1, 3, 4], // inform, inform, directive, commissive
    emotion: [6, 1, 0, 0], // surprise, anger, neutral, neutral
  },
  {
    dialog: [
      'Do you think you can help me move this weekend?',
      'Let me check my schedule... yes, I can help on Saturday.',
      'Thank you so much!',
      "No problem, I'll bring my truck.",
    ],
    act: [2, 4, 1, 4], // question, commissive, inform, commissive
    emotion: [0, 0, 4, 4], // neutral, neutral, happy, happy
  },
];

/**
 * Run extraction on sample data (for testing)
 */
export function runSampleExtraction(): {
  commitments: CommitmentExample[];
  emotional: EmotionalExample[];
} {
  const commitments = extractCommitments(SAMPLE_CONVERSATIONS);
  const emotional = extractEmotionalExamples(SAMPLE_CONVERSATIONS);

  log.info(
    {
      commitmentCount: commitments.length,
      strongCommitmentCount: getStrongCommitmentsOnly(commitments).length,
      emotionalCount: emotional.length,
    },
    'Sample extraction complete'
  );

  return { commitments, emotional };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  extractCommitments,
  extractEmotionalExamples,
  getStrongCommitmentsOnly,
  getExamplesByEmotion,
  toCommitmentTestCases,
  toEmotionalTestCases,
  runSampleExtraction,
  SAMPLE_CONVERSATIONS,
};
