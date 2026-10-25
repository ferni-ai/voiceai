/**
 * Community Labels
 *
 * Community insights are shared by every caller: one Firestore doc
 * (community_insights/global), prompt hints for other callers, and
 * GET /api/observability/intelligence. So nothing they store may be a caller's
 * words, or prompt text that can carry a caller's memories. These helpers turn
 * free text into a label from a fixed set, or a fixed fallback, and never keep
 * any of the input.
 *
 * @module intelligence/collective/community-labels
 */

import { TOPIC_NAMES, type TopicCategory } from '../detectors/topic.js';

// ============================================================================
// QUESTION SHAPES
// ============================================================================

export const QUESTION_SHAPES = [
  'clarifying_question',
  'feeling_question',
  'future_question',
  'meaning_question',
  'reflective_question',
  'open_question',
] as const;

export type QuestionShape = (typeof QUESTION_SHAPES)[number];

/** First match wins, so "what do you mean by" is clarifying, not meaning. */
const SHAPE_RULES: ReadonlyArray<readonly [QuestionShape, RegExp]> = [
  ['clarifying_question', /\b(mean by|do you mean|what kind|which one|tell me more)\b/i],
  ['feeling_question', /\b(feel|feels|feeling|felt|emotions?)\b/i],
  ['future_question', /\b(would|will|future|next|imagine|look like|hope)\b/i],
  ['meaning_question', /\b(matters?|meaning|means|important|why)\b/i],
  ['reflective_question', /\b(notice|realize|learn|looking back|think about)\b/i],
];

const SHAPE_DESCRIPTIONS: Record<QuestionShape, string> = {
  clarifying_question: 'a clarifying question about what they meant',
  feeling_question: 'a question about how they feel',
  future_question: 'a question about what they hope for next',
  meaning_question: 'a question about why it matters to them',
  reflective_question: 'a question inviting them to look back on what they noticed',
  open_question: 'an open question',
};

export function isQuestionShape(value: unknown): value is QuestionShape {
  return typeof value === 'string' && (QUESTION_SHAPES as readonly string[]).includes(value);
}

/** The shape of a question; the text itself is never kept. */
export function questionShapeOf(text: string | undefined | null): QuestionShape {
  if (!text) return 'open_question';
  if (isQuestionShape(text)) return text;
  for (const [shape, rule] of SHAPE_RULES) {
    if (rule.test(text)) return shape;
  }
  return 'open_question';
}

/** Fixed wording for a prompt hint, e.g. "a question about how they feel". */
export function describeQuestionShape(shape: QuestionShape): string {
  return SHAPE_DESCRIPTIONS[shape];
}

// ============================================================================
// TOPICS AND CONTEXTS
// ============================================================================

const TOPIC_CATEGORIES: readonly TopicCategory[] = [
  'financial',
  'personal',
  'emotional',
  'market',
  'planning',
  'education',
  'general',
];

const SAFE_TOPICS = new Set<string>([...TOPIC_NAMES, ...TOPIC_CATEGORIES]);

/** A topic from the topic detector's fixed names, or 'general'. */
export function safeTopic(topic: string | undefined | null): string {
  const key = (topic ?? '').trim().toLowerCase();
  return SAFE_TOPICS.has(key) ? key : 'general';
}

/** Conversation phase names used across the codebase, plus two fixed contexts. */
const SAFE_CONTEXTS = new Set<string>([
  'conversation',
  'breakthrough',
  'opening',
  'warming',
  'warming_up',
  'engaged',
  'building',
  'exploring',
  'deep',
  'deepening',
  'advising',
  'supporting',
  'winding',
  'extended',
  'closing',
  'wrapping_up',
  'greeting',
  'follow_up',
]);

/** A conversation-phase label, or 'conversation'. */
export function safeContext(context: string | undefined | null): string {
  const key = (context ?? '').trim().toLowerCase();
  return SAFE_CONTEXTS.has(key) ? key : 'conversation';
}
