/**
 * The context-injection categories whose content carries what is stored about the caller from
 * earlier calls or turns: recalled memories, facts, moments, feelings, open loops, commitments,
 * boundaries, people, dates, other channels, a person model. One registry, read by everything
 * that has to keep stored memory out of a reply (CRISIS_NO_MEMORY_RECALL,
 * agents/processors/turn-processor/crisis-memory-recall.ts).
 *
 * A builder that emits a new category gets classified here or in the guard's list of categories
 * that carry none (caller-memory-categories.test.ts): an unlisted literal category fails it.
 * Where the source of a category's content was not traced, it is listed here: holding it on a
 * crisis turn costs that turn some context, and missing it would let stored memory through.
 * Safety categories (SAFETY_CATEGORIES) are never counted: crisis_follow_up names a recent
 * crisis, and safety guidance always reaches the reply whole.
 *
 * @module intelligence/utils/caller-memory-categories
 */
import { SAFETY_CATEGORIES } from './injection-filter.js';

/** Categories whose content carries stored caller memory, or whose source is unconfirmed. */
const CALLER_MEMORY_CATEGORIES: ReadonlySet<string> = new Set([
  // Recalled memories and memory surfacing.
  'memory',
  'proactive_memory',
  'memory_intelligence',
  'revived_intelligence', // revived-intelligence.ts REVIVED_CATEGORY
  'emotional_memory',
  'superhuman_recall',
  'superhuman_semantic',
  'superhuman_joy',
  'superhuman_trajectory',
  'superhuman_commitment',
  'superhuman_insight',
  'superhuman',
  'commitment_reminder', // a stored commitment, quoted (commitment-follow-up-gate.ts)
  // Stored profile, moments, boundaries and person model.
  'awareness',
  'boundaries',
  'boundary_guidance',
  'callback',
  'celebration',
  'coaching',
  'communication_style',
  'context',
  'conversation_humanizing',
  'conversation_state',
  'deviation',
  'voice-deviation', // against the caller's stored voice baseline
  'growth',
  'humanization',
  'insight',
  'linguistic',
  'milestone',
  'personality',
  'predictive',
  'probing_preference',
  'protective',
  'relationship_stage',
  'team_huddle',
  'team_insights',
  'trust',
  'unsaid',
  'persona-communication', // persona briefings from stored goals, moods, habits, decisions
  'persona-planning',
  'persona-research',
  'persona-wisdom',
  // Stored data, dates, other channels, outreach and calls made for them.
  'cross_channel',
  'data',
  'external',
  'outreach_bridge',
  'pending_background_results',
  'proactive',
  'proactive_outreach',
  'proactive_session',
  // Source not traced: held.
  'presence',
  'semantic_intelligence',
  'wellbeing',
  'better_than_human',
  'persona-coaching',
]);

/** Category prefixes whose content carries stored caller memory, or whose source is unconfirmed. */
const CALLER_MEMORY_PREFIXES: readonly string[] = [
  'persona_', // per-persona briefings from stored insights and habits (intelligence-builders.ts)
  'scientific_', // per-caller pattern coaching (safety-coaching-builders.ts); not traced
];

/** Whether an injection of this category carries stored caller memory (never a safety one). */
export function carriesCallerMemory(category: string): boolean {
  if (SAFETY_CATEGORIES.has(category)) return false;
  return (
    CALLER_MEMORY_CATEGORIES.has(category) ||
    CALLER_MEMORY_PREFIXES.some((prefix) => category.startsWith(prefix))
  );
}
