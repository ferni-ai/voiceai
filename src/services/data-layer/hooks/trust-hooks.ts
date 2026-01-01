/**
 * Trust System Hooks
 *
 * Auto-indexing hooks for trust-building data.
 * These are the core "Better than Human" relationship signals.
 *
 * @module services/data-layer/hooks/trust-hooks
 */

import { createDomainHook, formatField, joinNonEmpty } from '../hook-generator.js';
import type {
  CommitmentEntity,
  BoundaryEntity,
  InsideJokeEntity,
  GrowthReflectionEntity,
  SmallWinEntity,
} from '../types.js';

// ============================================================================
// COMMITMENT TRACKING
// ============================================================================

/**
 * Track commitments made by or to the user
 */
export const onCommitmentChange = createDomainHook<CommitmentEntity>({
  storeType: 'trust',
  entityType: 'commitment',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Commitment: ${c.description}.`,
      `Made by: ${c.madeBy}.`,
      `Status: ${c.status}.`,
      formatField('Deadline', c.deadline),
      formatField('Context', c.context),
    ]),
  metadataExtractor: (c) => ({
    madeBy: c.madeBy,
    status: c.status,
    deadline: c.deadline,
    personaId: c.personaId,
  }),
  shouldSkip: (c) => c.status === 'cancelled',
});

// ============================================================================
// BOUNDARY MEMORY
// ============================================================================

/**
 * Track topics the user doesn't want to discuss
 */
export const onBoundaryChange = createDomainHook<BoundaryEntity>({
  storeType: 'trust',
  entityType: 'boundary',
  contentBuilder: (b) =>
    joinNonEmpty([
      `Boundary: Do not bring up "${b.topic}".`,
      `Severity: ${b.severity}.`,
      formatField('Reason', b.reason),
    ]),
  metadataExtractor: (b) => ({
    severity: b.severity,
    topic: b.topic,
    expiresAt: b.expiresAt,
  }),
});

// ============================================================================
// INSIDE JOKES
// ============================================================================

/**
 * Track shared humor and connection moments
 */
export const onInsideJokeChange = createDomainHook<InsideJokeEntity>({
  storeType: 'trust',
  entityType: 'inside_joke',
  contentBuilder: (j) =>
    joinNonEmpty([
      `Inside joke: "${j.joke}".`,
      `Context: ${j.context}.`,
      `Shared moment: ${j.sharedMoment}.`,
    ]),
  metadataExtractor: (j) => ({
    personaId: j.personaId,
  }),
});

// ============================================================================
// GROWTH REFLECTIONS
// ============================================================================

/**
 * Track observations about user's growth and evolution
 */
export const onGrowthReflectionChange = createDomainHook<GrowthReflectionEntity>({
  storeType: 'trust',
  entityType: 'growth_reflection',
  contentBuilder: (g) =>
    joinNonEmpty([
      `Growth noticed: ${g.observation}.`,
      `Area: ${g.area}.`,
      `Evidence: ${g.evidence}.`,
    ]),
  metadataExtractor: (g) => ({
    area: g.area,
    dateObserved: g.dateObserved,
  }),
});

// ============================================================================
// SMALL WINS
// ============================================================================

/**
 * Track and celebrate user's small wins
 */
export const onSmallWinChange = createDomainHook<SmallWinEntity>({
  storeType: 'trust',
  entityType: 'small_win',
  contentBuilder: (w) =>
    joinNonEmpty([
      `Small win celebrated: ${w.win}.`,
      `Effort acknowledged: ${w.effort}.`,
      formatField('Celebration', w.celebration),
    ]),
  metadataExtractor: (w) => ({
    dateAchieved: w.dateAchieved,
  }),
});

// ============================================================================
// ADDITIONAL TRUST HOOKS
// ============================================================================

interface ThinkingOfYouEntity {
  reason: string;
  trigger: string;
  message?: string;
  sent?: boolean;
  date?: string;
}

/**
 * Track "thinking of you" proactive moments
 */
export const onThinkingOfYouChange = createDomainHook<ThinkingOfYouEntity>({
  storeType: 'trust',
  entityType: 'thinking_of_you',
  contentBuilder: (t) =>
    joinNonEmpty([
      `Thought of user: ${t.reason}.`,
      `Triggered by: ${t.trigger}.`,
      formatField('Message', t.message),
    ]),
  metadataExtractor: (t) => ({
    sent: t.sent,
    date: t.date,
  }),
});

interface ReadingBetweenLinesEntity {
  observation: string;
  whatWasSaid: string;
  whatWasNotSaid: string;
  confidence: 'low' | 'medium' | 'high';
}

/**
 * Track what user is NOT saying
 */
export const onReadingBetweenLinesChange = createDomainHook<ReadingBetweenLinesEntity>({
  storeType: 'trust',
  entityType: 'reading_between_lines',
  contentBuilder: (r) =>
    joinNonEmpty([
      `Reading between lines: ${r.observation}.`,
      `User said: "${r.whatWasSaid}".`,
      `Possibly meant: "${r.whatWasNotSaid}".`,
      `Confidence: ${r.confidence}.`,
    ]),
  metadataExtractor: (r) => ({
    confidence: r.confidence,
  }),
});

interface TonalMemoryEntity {
  pattern: string;
  context: string;
  emotionalState?: string;
  frequency?: string;
}

/**
 * Track voice/tonal patterns
 */
export const onTonalMemoryChange = createDomainHook<TonalMemoryEntity>({
  storeType: 'trust',
  entityType: 'tonal_memory',
  contentBuilder: (t) =>
    joinNonEmpty([
      `Tonal pattern: ${t.pattern}.`,
      `Context: ${t.context}.`,
      formatField('Emotional state', t.emotionalState),
    ]),
  metadataExtractor: (t) => ({
    frequency: t.frequency,
  }),
});

interface VulnerabilityMomentEntity {
  topic: string;
  context: string;
  depth: 'surface' | 'moderate' | 'deep';
  response?: string;
  date?: string;
}

/**
 * Track moments when user opened up
 */
export const onVulnerabilityMomentChange = createDomainHook<VulnerabilityMomentEntity>({
  storeType: 'trust',
  entityType: 'vulnerability_moment',
  contentBuilder: (v) =>
    joinNonEmpty([
      `Vulnerability shared: ${v.topic}.`,
      `Context: ${v.context}.`,
      `Depth: ${v.depth}.`,
      formatField('Our response', v.response),
    ]),
  metadataExtractor: (v) => ({
    depth: v.depth,
    date: v.date,
  }),
});

interface TrustMilestoneEntity {
  milestone: string;
  significance: string;
  stage: 'initial' | 'growing' | 'established' | 'deep';
  date?: string;
}

/**
 * Track trust milestones in the relationship
 */
export const onTrustMilestoneChange = createDomainHook<TrustMilestoneEntity>({
  storeType: 'trust',
  entityType: 'trust_milestone',
  contentBuilder: (t) =>
    joinNonEmpty([
      `Trust milestone: ${t.milestone}.`,
      `Significance: ${t.significance}.`,
      `Relationship stage: ${t.stage}.`,
    ]),
  metadataExtractor: (t) => ({
    stage: t.stage,
    date: t.date,
  }),
});

// ============================================================================
// NEW MEMORY ENHANCEMENT HOOKS (December 2024)
// ============================================================================

interface CuriosityMentionEntity {
  entity: string;
  entityType: 'person' | 'place' | 'event' | 'activity' | 'goal';
  originalContext: string;
  priority: 'low' | 'medium' | 'high';
  followUpEligible: boolean;
  mentionedAt: string;
}

/**
 * Track passing mentions for follow-up (Curiosity Memory)
 * "You mentioned Sam a few weeks ago. How are they?"
 */
export const onCuriosityMentionChange = createDomainHook<CuriosityMentionEntity>({
  storeType: 'trust',
  entityType: 'curiosity_mention',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Curiosity mention: ${c.entity} (${c.entityType}).`,
      `Original context: ${c.originalContext}.`,
      `Priority: ${c.priority}.`,
      c.followUpEligible ? 'Eligible for follow-up.' : 'Already followed up.',
    ]),
  metadataExtractor: (c) => ({
    entityType: c.entityType,
    priority: c.priority,
    followUpEligible: c.followUpEligible,
    date: c.mentionedAt,
  }),
});

interface BetweenSessionThinkingEntity {
  topic: string;
  reflection: string;
  sessionNumber: number;
  depth: 'surface' | 'moderate' | 'deep';
  emotionalTone?: string;
  createdAt: string;
}

/**
 * Track between-session thinking moments (Continuous Presence)
 * "I've been thinking about what you said..."
 */
export const onBetweenSessionThinkingChange = createDomainHook<BetweenSessionThinkingEntity>({
  storeType: 'trust',
  entityType: 'between_session_thinking',
  contentBuilder: (b) =>
    joinNonEmpty([
      `Between-session reflection: ${b.topic}.`,
      `Ferni's thought: ${b.reflection}.`,
      `Depth: ${b.depth}.`,
      formatField('Emotional tone', b.emotionalTone),
    ]),
  metadataExtractor: (b) => ({
    depth: b.depth,
    sessionNumber: b.sessionNumber,
    date: b.createdAt,
  }),
});

interface PersonaGrowthEntity {
  personaId: string;
  growthType: 'perspective' | 'empathy' | 'knowledge' | 'curiosity' | 'values';
  description: string;
  userInfluence: string;
  date: string;
}

/**
 * Track how personas grow and change over time (Mutual Growth)
 * "You've changed how I think about this"
 */
export const onPersonaGrowthChange = createDomainHook<PersonaGrowthEntity>({
  storeType: 'trust',
  entityType: 'persona_growth',
  contentBuilder: (p) =>
    joinNonEmpty([
      `Persona growth (${p.personaId}): ${p.description}.`,
      `Growth type: ${p.growthType}.`,
      `User's influence: ${p.userInfluence}.`,
    ]),
  metadataExtractor: (p) => ({
    personaId: p.personaId,
    growthType: p.growthType,
    date: p.date,
  }),
});

// ============================================================================
// EXPORTS
// ============================================================================

export const trustHooks = {
  onCommitmentChange,
  onBoundaryChange,
  onInsideJokeChange,
  onGrowthReflectionChange,
  onSmallWinChange,
  onThinkingOfYouChange,
  onReadingBetweenLinesChange,
  onTonalMemoryChange,
  onVulnerabilityMomentChange,
  onTrustMilestoneChange,
  // New memory enhancement hooks
  onCuriosityMentionChange,
  onBetweenSessionThinkingChange,
  onPersonaGrowthChange,
};

export default trustHooks;
