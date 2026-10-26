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

import type {
  CommunityResponsePattern,
  EffectiveQuestion,
  StoryResonance,
} from './community-insights.js';

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
export function describeQuestion(text: string | undefined | null): string {
  return SHAPE_DESCRIPTIONS[questionShapeOf(text)];
}

// ============================================================================
// TOPICS AND CONTEXTS
// ============================================================================

/**
 * The topic detector's fixed topic names and categories (intelligence/detectors/topic.ts).
 * Kept here, not imported, so this context stays self-contained; a topic missing from
 * this list is stored as 'general', which loses detail but never leaks words.
 */
const SAFE_TOPICS = new Set<string>([
  'retirement',
  'investments',
  'stocks',
  'bonds',
  'funds',
  'fees',
  'savings',
  'debt',
  'goals',
  'risk',
  'market',
  'family',
  'health',
  'work',
  'anxiety',
  'uncertainty',
  'college',
  'financial',
  'personal',
  'emotional',
  'planning',
  'education',
  'general',
]);

/** A topic from the fixed set above, or 'general'. */
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

/** The labels a breakthrough is stored under: [question shape, topic, context]. */
export function labelBreakthrough(
  question: string,
  topic: string,
  context: string
): [QuestionShape, string, string] {
  return [questionShapeOf(question), safeTopic(topic), safeContext(context)];
}

// ============================================================================
// RELABELING STORED ROWS
// Rows saved before labels were enforced can hold a caller's words (prompt text
// as a question, a reply as a context, free text as a topic). They are relabeled
// on load, so the next save rewrites the shared doc without them.
// ============================================================================

function relabelQuestions(rows: EffectiveQuestion[]): EffectiveQuestion[] {
  const byKey = new Map<string, EffectiveQuestion>();
  for (const row of rows) {
    const questionPattern = questionShapeOf(row.questionPattern);
    const topic = safeTopic(row.topic);
    const bestContexts = [...new Set((row.bestContexts ?? []).map(safeContext))];
    const key = `${questionPattern}|${row.personaId}|${topic}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...row, questionPattern, topic, bestContexts });
      continue;
    }
    const n = prev.sampleSize + row.sampleSize;
    if (n > 0) {
      prev.avgBreakthroughRate =
        (prev.avgBreakthroughRate * prev.sampleSize + row.avgBreakthroughRate * row.sampleSize) / n;
      prev.avgEngagementLift =
        (prev.avgEngagementLift * prev.sampleSize + row.avgEngagementLift * row.sampleSize) / n;
    }
    prev.sampleSize = n;
    prev.bestContexts = [...new Set([...prev.bestContexts, ...bestContexts])];
  }
  return [...byKey.values()];
}

function relabelStory(story: StoryResonance): StoryResonance {
  const byTopic: Record<string, number> = {};
  for (const [topic, score] of Object.entries(story.byTopic ?? {})) {
    const label = safeTopic(topic);
    byTopic[label] = byTopic[label] === undefined ? score : (byTopic[label] + score) / 2;
  }
  const bestContexts = [...new Set((story.bestContexts ?? []).map(safeTopic))];
  return { ...story, byTopic, bestContexts };
}

/**
 * Relabels rows loaded from the shared Firestore doc. Question and story rows are
 * relabeled (and merged where they now share a label); response patterns keyed by a
 * free-text topic are dropped, and recompute from new, labeled signals.
 */
export function relabelInsights<
  T extends {
    patterns?: CommunityResponsePattern[];
    effectiveQuestions?: EffectiveQuestion[];
    storyResonance?: StoryResonance[];
  },
>(data: T): T {
  return {
    ...data,
    patterns: data.patterns?.filter(
      (p) => p.context.topic === undefined || safeTopic(p.context.topic) === p.context.topic
    ),
    effectiveQuestions: data.effectiveQuestions && relabelQuestions(data.effectiveQuestions),
    storyResonance: data.storyResonance?.map(relabelStory),
  };
}
