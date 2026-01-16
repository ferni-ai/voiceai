/**
 * Superhuman Services Hooks
 *
 * Auto-indexing hooks for "Better than Human" capabilities.
 * These represent what no human friend could consistently provide.
 *
 * @module services/data-layer/hooks/superhuman-hooks
 */

import { createDomainHook, formatField, joinNonEmpty, formatDate } from '../hook-generator.js';
import type {
  DreamEntity,
  LifeChapterEntity,
  ValuesAlignmentEntity,
  CapacityStateEntity,
} from '../types.js';

// ============================================================================
// DREAM KEEPER
// ============================================================================

/**
 * Track user's dreams and aspirations
 * Only indexes active dreams (skips deferred, achieved, abandoned)
 */
export const onDreamChange = createDomainHook<DreamEntity>({
  storeType: 'superhuman',
  entityType: 'dream',
  contentBuilder: (d) =>
    joinNonEmpty([
      `Dream: ${d.dream}.`,
      `Category: ${d.category}.`,
      formatField('Timeframe', d.timeframe),
      d.steps?.length ? `Steps: ${d.steps.join(', ')}.` : '',
    ]),
  metadataExtractor: (d) => ({
    category: d.category,
    timeframe: d.timeframe,
    status: d.status,
  }),
  // Only index active dreams - achieved/deferred/abandoned are no longer relevant
  shouldSkip: (d) => d.status !== 'active',
});

// ============================================================================
// LIFE NARRATIVE
// ============================================================================

/**
 * Track chapters of user's life story
 */
export const onLifeChapterChange = createDomainHook<LifeChapterEntity>({
  storeType: 'superhuman',
  entityType: 'life_chapter',
  contentBuilder: (c) => {
    // Handle period as string or object
    const periodStr = c.period
      ? typeof c.period === 'string'
        ? c.period
        : `${formatDate(c.period.start)}${c.period.end ? ` - ${formatDate(c.period.end)}` : ' - present'}`
      : '';
    // Support both themes array and singular theme
    const themesStr = c.themes?.length
      ? c.themes.join(', ')
      : c.theme
        ? c.theme
        : '';
    return joinNonEmpty([
      c.title ? `Life chapter: "${c.title}".` : '',
      c.summary,
      periodStr ? `Period: ${periodStr}.` : '',
      themesStr ? `Themes: ${themesStr}.` : '',
      c.keyMoments?.length ? `Key moments: ${c.keyMoments.join('; ')}.` : '',
      c.keyEvents?.length ? `Key events: ${c.keyEvents.join('; ')}.` : '',
      c.lessonsLearned?.length ? `Lessons: ${c.lessonsLearned.join('; ')}.` : '',
    ]);
  },
  metadataExtractor: (c) => ({
    themes: c.themes ?? (c.theme ? [c.theme] : undefined),
    periodStart: c.period && typeof c.period === 'object' ? c.period.start : c.period,
    periodEnd: c.period && typeof c.period === 'object' ? c.period.end : undefined,
    status: c.status,
  }),
});

// ============================================================================
// VALUES ALIGNMENT
// ============================================================================

/**
 * Track user's values and alignment
 */
export const onValuesAlignmentChange = createDomainHook<ValuesAlignmentEntity>({
  storeType: 'superhuman',
  entityType: 'values_alignment',
  contentBuilder: (v) =>
    joinNonEmpty([`Value: ${v.value}.`, `Alignment: ${v.alignment}.`, `Evidence: ${v.evidence}.`]),
  metadataExtractor: (v) => ({
    alignment: v.alignment,
    lastChecked: v.lastChecked,
  }),
});

// ============================================================================
// CAPACITY GUARDIAN
// ============================================================================

/**
 * Track user's energy and burnout levels
 */
export const onCapacityStateChange = createDomainHook<CapacityStateEntity>({
  storeType: 'superhuman',
  entityType: 'capacity_state',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Capacity level: ${c.level}.`,
      `Factors: ${c.factors.join(', ')}.`,
      `Recommendation: ${c.recommendation}.`,
    ]),
  metadataExtractor: (c) => ({
    level: c.level,
    timestamp: c.timestamp,
  }),
});

// ============================================================================
// ADDITIONAL SUPERHUMAN HOOKS
// ============================================================================

interface RelationshipMilestoneEntity {
  milestone: string;
  relationship: string;
  significance: string;
  date?: string;
  celebrated?: boolean;
}

/**
 * Track relationship milestones
 */
export const onRelationshipMilestoneChange = createDomainHook<RelationshipMilestoneEntity>({
  storeType: 'superhuman',
  entityType: 'relationship_milestone',
  contentBuilder: (r) =>
    joinNonEmpty([
      `Relationship milestone: ${r.milestone}.`,
      `With: ${r.relationship}.`,
      `Significance: ${r.significance}.`,
      formatField('Date', r.date),
    ]),
  metadataExtractor: (r) => ({
    relationship: r.relationship,
    celebrated: r.celebrated,
    date: r.date,
  }),
});

interface SeasonalPatternEntity {
  pattern: string;
  season: 'spring' | 'summer' | 'fall' | 'winter' | 'holiday' | 'anniversary';
  observation: string;
  recommendation?: string;
}

/**
 * Track seasonal patterns and awareness
 */
export const onSeasonalPatternChange = createDomainHook<SeasonalPatternEntity>({
  storeType: 'superhuman',
  entityType: 'seasonal_pattern',
  contentBuilder: (s) =>
    joinNonEmpty([
      `Seasonal pattern: ${s.pattern}.`,
      `Season: ${s.season}.`,
      `Observation: ${s.observation}.`,
      formatField('Recommendation', s.recommendation),
    ]),
  metadataExtractor: (s) => ({
    season: s.season,
  }),
});

interface EmotionalFirstAidEntity {
  situation: string;
  support: string;
  outcome?: string;
  date?: string;
  followUpNeeded?: boolean;
}

/**
 * Track crisis support moments
 */
export const onEmotionalFirstAidChange = createDomainHook<EmotionalFirstAidEntity>({
  storeType: 'superhuman',
  entityType: 'emotional_first_aid',
  contentBuilder: (e) =>
    joinNonEmpty([
      `Emotional support: ${e.situation}.`,
      `Support provided: ${e.support}.`,
      formatField('Outcome', e.outcome),
    ]),
  metadataExtractor: (e) => ({
    followUpNeeded: e.followUpNeeded,
    date: e.date,
  }),
});

interface PredictiveInsightEntity {
  prediction: string;
  basis: string;
  confidence: 'low' | 'medium' | 'high';
  timeframe?: string;
  actionSuggestion?: string;
}

/**
 * Track predictive coaching insights
 */
export const onPredictiveInsightChange = createDomainHook<PredictiveInsightEntity>({
  storeType: 'superhuman',
  entityType: 'predictive_insight',
  contentBuilder: (p) =>
    joinNonEmpty([
      `Prediction: ${p.prediction}.`,
      `Based on: ${p.basis}.`,
      `Confidence: ${p.confidence}.`,
      formatField('Suggested action', p.actionSuggestion),
    ]),
  metadataExtractor: (p) => ({
    confidence: p.confidence,
    timeframe: p.timeframe,
  }),
});

interface CommitmentKeeperEntity {
  commitment: string;
  madeOn: string;
  status: 'pending' | 'completed' | 'overdue' | 'forgiven';
  remindersSent?: number;
}

/**
 * Track commitment keeping
 * Only indexes pending/overdue commitments (skips completed/forgiven)
 */
export const onCommitmentKeeperChange = createDomainHook<CommitmentKeeperEntity>({
  storeType: 'superhuman',
  entityType: 'commitment_keeper',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Commitment tracked: ${c.commitment}.`,
      `Made on: ${formatDate(c.madeOn)}.`,
      `Status: ${c.status}.`,
    ]),
  metadataExtractor: (c) => ({
    status: c.status,
    remindersSent: c.remindersSent,
  }),
  // Only index active commitments - completed/forgiven are no longer relevant for reminders
  shouldSkip: (c) => c.status === 'completed' || c.status === 'forgiven',
});

interface RelationshipNetworkEntity {
  person: string;
  relationship: string;
  connectionStrength: 'weak' | 'moderate' | 'strong' | 'core';
  lastContact?: string;
  notes?: string;
}

/**
 * Track social network mapping
 */
export const onRelationshipNetworkChange = createDomainHook<RelationshipNetworkEntity>({
  storeType: 'superhuman',
  entityType: 'relationship_network',
  contentBuilder: (r) =>
    joinNonEmpty([
      `Person: ${r.person}.`,
      `Relationship: ${r.relationship}.`,
      `Connection strength: ${r.connectionStrength}.`,
      formatField('Notes', r.notes),
    ]),
  metadataExtractor: (r) => ({
    connectionStrength: r.connectionStrength,
    lastContact: r.lastContact,
  }),
});

interface ConflictMemoryEntity {
  conflict: string;
  parties: string[];
  resolution?: string;
  lessonsLearned?: string;
  status: 'active' | 'resolved' | 'recurring';
}

/**
 * Track conflict resolution history
 */
export const onConflictMemoryChange = createDomainHook<ConflictMemoryEntity>({
  storeType: 'superhuman',
  entityType: 'conflict_memory',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Conflict: ${c.conflict}.`,
      `Parties: ${c.parties.join(', ')}.`,
      `Status: ${c.status}.`,
      formatField('Resolution', c.resolution),
      formatField('Lessons learned', c.lessonsLearned),
    ]),
  metadataExtractor: (c) => ({
    status: c.status,
    parties: c.parties,
  }),
});

interface RecoveryMilestoneEntity {
  milestone: string;
  recoveryFrom: string;
  significance: string;
  date?: string;
}

/**
 * Track recovery milestones
 */
export const onRecoveryMilestoneChange = createDomainHook<RecoveryMilestoneEntity>({
  storeType: 'superhuman',
  entityType: 'recovery_milestone',
  contentBuilder: (r) =>
    joinNonEmpty([
      `Recovery milestone: ${r.milestone}.`,
      `Recovering from: ${r.recoveryFrom}.`,
      `Significance: ${r.significance}.`,
    ]),
  metadataExtractor: (r) => ({
    recoveryFrom: r.recoveryFrom,
    date: r.date,
  }),
});

// ============================================================================
// MOOD CALENDAR
// ============================================================================

interface MoodPatternEntity {
  mood: string;
  intensity: number;
  dayOfWeek: number;
  hourOfDay: number;
  context?: string;
}

/**
 * Track mood patterns for emotional prediction
 */
export const onMoodPatternChange = createDomainHook<MoodPatternEntity>({
  storeType: 'superhuman',
  entityType: 'emotional_pattern',
  contentBuilder: (m) =>
    joinNonEmpty([
      `Mood: ${m.mood} (intensity ${Math.round(m.intensity * 100)}%).`,
      `Day: ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][m.dayOfWeek]}.`,
      `Time: ${m.hourOfDay}:00.`,
      formatField('Context', m.context),
    ]),
  metadataExtractor: (m) => ({
    mood: m.mood,
    intensity: m.intensity,
    dayOfWeek: m.dayOfWeek,
    hourOfDay: m.hourOfDay,
  }),
});

// ============================================================================
// ENERGY WAVE MAPPING
// ============================================================================

interface EnergyPatternEntity {
  conversationType: string;
  dayOfWeek: number;
  hourOfDay: number;
  engagement: number;
  outcome: 'positive' | 'neutral' | 'negative';
}

/**
 * Track energy patterns for optimal timing
 */
export const onEnergyPatternChange = createDomainHook<EnergyPatternEntity>({
  storeType: 'superhuman',
  entityType: 'capacity_state',
  contentBuilder: (e) =>
    joinNonEmpty([
      `Conversation type: ${e.conversationType}.`,
      `Day: ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][e.dayOfWeek]}.`,
      `Time: ${e.hourOfDay}:00.`,
      `Engagement: ${Math.round(e.engagement * 100)}%.`,
      `Outcome: ${e.outcome}.`,
    ]),
  metadataExtractor: (e) => ({
    conversationType: e.conversationType,
    engagement: e.engagement,
    outcome: e.outcome,
  }),
});

// ============================================================================
// MAYA COACHING SERVICES HOOKS
// ============================================================================

interface HabitDNAEntity {
  habitName?: string;
  timesStarted?: number;
  timesBroke?: number;
  currentStreak?: number;
  longestStreak?: number;
  commonTriggers?: string[];
  commonBarriers?: string[];
  optimalConditions?: {
    bestTime?: string;
    bestContext?: string;
    bestMood?: string;
  };
  events?: unknown[]; // Support for habit-intelligence-services format
}

/**
 * Track habit DNA - complete genetic profile of every habit
 */
export const onHabitDNAChange = createDomainHook<HabitDNAEntity>({
  storeType: 'superhuman',
  entityType: 'habit_dna',
  contentBuilder: (h) =>
    joinNonEmpty([
      h.habitName ? `Habit: ${h.habitName}.` : '',
      h.timesStarted !== undefined || h.timesBroke !== undefined
        ? `Started ${h.timesStarted ?? 0} times, broke ${h.timesBroke ?? 0} times.`
        : '',
      h.currentStreak !== undefined || h.longestStreak !== undefined
        ? `Current streak: ${h.currentStreak ?? 0}, longest: ${h.longestStreak ?? 0}.`
        : '',
      h.commonTriggers?.length ? `Triggers: ${h.commonTriggers.join(', ')}.` : '',
      h.commonBarriers?.length ? `Barriers: ${h.commonBarriers.join(', ')}.` : '',
      h.optimalConditions?.bestTime ? `Best time: ${h.optimalConditions.bestTime}.` : '',
    ]),
  metadataExtractor: (h) => ({
    habitName: h.habitName,
    currentStreak: h.currentStreak,
    timesStarted: h.timesStarted,
    timesBroke: h.timesBroke,
  }),
});

interface FrictionPointEntity {
  habitName: string;
  frictionType: 'time' | 'location' | 'energy' | 'social' | 'emotional' | 'environmental' | 'other';
  description: string;
  intensity: 'minor' | 'moderate' | 'major';
}

/**
 * Track friction points - where/when habits fail
 */
export const onFrictionPointChange = createDomainHook<FrictionPointEntity>({
  storeType: 'superhuman',
  entityType: 'friction_point',
  contentBuilder: (f) =>
    joinNonEmpty([
      `Friction for habit ${f.habitName}: ${f.description}.`,
      `Type: ${f.frictionType}, intensity: ${f.intensity}.`,
    ]),
  metadataExtractor: (f) => ({
    habitName: f.habitName,
    frictionType: f.frictionType,
    intensity: f.intensity,
  }),
});

interface TendencyProfileEntity {
  primaryTendency?: 'Upholder' | 'Questioner' | 'Obliger' | 'Rebel';
  confidence?: number;
  recentSignals?: string[];
  // Support for habit-intelligence-services TendencySignal format
  tendency?: 'Upholder' | 'Questioner' | 'Obliger' | 'Rebel';
  signal?: string;
  context?: string;
}

/**
 * Track Four Tendencies profile
 */
export const onTendencyProfileChange = createDomainHook<TendencyProfileEntity>({
  storeType: 'superhuman',
  entityType: 'tendency_profile',
  contentBuilder: (t) => {
    // Support both full profile format and individual signal format
    const tendency = t.primaryTendency ?? t.tendency;
    const confidenceStr =
      t.confidence !== undefined ? ` (${Math.round(t.confidence * 100)}% confidence)` : '';
    return joinNonEmpty([
      tendency ? `Four Tendencies profile: ${tendency}${confidenceStr}.` : '',
      t.recentSignals?.length ? `Recent signals: ${t.recentSignals.slice(0, 3).join('; ')}.` : '',
      t.signal ? `Signal: ${t.signal}.` : '',
      t.context ? `Context: ${t.context}.` : '',
    ]);
  },
  metadataExtractor: (t) => ({
    primaryTendency: t.primaryTendency ?? t.tendency,
    confidence: t.confidence,
  }),
});

interface KeystoneObservationEntity {
  primaryHabit: string;
  affectedHabits: string[];
  observation: string;
}

/**
 * Track keystone habits - habits that cascade changes
 */
export const onKeystoneObservationChange = createDomainHook<KeystoneObservationEntity>({
  storeType: 'superhuman',
  entityType: 'keystone_habit',
  contentBuilder: (k) =>
    joinNonEmpty([
      `Keystone habit: ${k.primaryHabit}.`,
      `Affects: ${k.affectedHabits.join(', ')}.`,
      `Observation: ${k.observation}.`,
    ]),
  metadataExtractor: (k) => ({
    primaryHabit: k.primaryHabit,
    affectedHabitCount: k.affectedHabits.length,
  }),
});

interface IdentityStatementEntity {
  statement?: string;
  domain?: string;
  confidence?: 'aspiring' | 'emerging' | 'established' | 'core';
  recordedAt?: string;
}

/**
 * Track identity statements - "I am someone who..."
 */
export const onIdentityStatementChange = createDomainHook<IdentityStatementEntity>({
  storeType: 'superhuman',
  entityType: 'identity_statement',
  contentBuilder: (i) =>
    joinNonEmpty([
      i.statement ? `Identity: "${i.statement}".` : '',
      i.domain || i.confidence ? `Domain: ${i.domain ?? 'unknown'}, confidence: ${i.confidence ?? 'unknown'}.` : '',
      i.recordedAt ? `Recorded: ${i.recordedAt}.` : '',
    ]),
  metadataExtractor: (i) => ({
    domain: i.domain,
    confidence: i.confidence,
  }),
});

interface SetbackPatternEntity {
  habitName: string;
  whatHappened: string;
  emotionalTrigger?: string;
}

/**
 * Track setback patterns - pattern-match failures
 */
export const onSetbackPatternChange = createDomainHook<SetbackPatternEntity>({
  storeType: 'superhuman',
  entityType: 'setback_pattern',
  contentBuilder: (s) =>
    joinNonEmpty([
      `Setback for ${s.habitName}: ${s.whatHappened}.`,
      formatField('Emotional trigger', s.emotionalTrigger),
    ]),
  metadataExtractor: (s) => ({
    habitName: s.habitName,
    hasEmotionalTrigger: !!s.emotionalTrigger,
  }),
});

interface HabitAutopsyEntity {
  habitName: string;
  howLongItLasted?: string;
  causeOfDeath: string;
  lessonsLearned?: string;
  willResurrect?: boolean;
}

/**
 * Track habit autopsies - post-mortem for dead habits
 */
export const onHabitAutopsyChange = createDomainHook<HabitAutopsyEntity>({
  storeType: 'superhuman',
  entityType: 'habit_autopsy',
  contentBuilder: (h) =>
    joinNonEmpty([
      `Habit autopsy: ${h.habitName}.`,
      formatField('Duration', h.howLongItLasted),
      `Cause of death: ${h.causeOfDeath}.`,
      formatField('Lessons', h.lessonsLearned),
      h.willResurrect ? 'Will attempt resurrection.' : '',
    ]),
  metadataExtractor: (h) => ({
    habitName: h.habitName,
    willResurrect: h.willResurrect,
  }),
});

// ============================================================================
// NAYAN WISDOM SERVICES HOOKS
// ============================================================================

interface ParadoxEntity {
  desire1?: string;
  desire2?: string;
  context?: string;
  status: 'active' | 'resolved' | 'accepted';
  resolutionNotes?: string;
}

/**
 * Track paradoxes - contradictions without resolution
 */
export const onParadoxChange = createDomainHook<ParadoxEntity>({
  storeType: 'superhuman',
  entityType: 'paradox',
  contentBuilder: (p) =>
    joinNonEmpty([
      p.desire1 && p.desire2 ? `Paradox: "${p.desire1}" vs "${p.desire2}".` : '',
      formatField('Context', p.context),
      formatField('Resolution', p.resolutionNotes),
      `Status: ${p.status}.`,
    ]),
  metadataExtractor: (p) => ({
    status: p.status,
  }),
  shouldSkip: (p) => p.status === 'resolved',
});

interface EnoughStatementEntity {
  domain?: string;
  statement?: string;
  wasItEnough?: boolean;
  reachedAt?: string;
  notes?: string;
}

/**
 * Track "enough" declarations
 */
export const onEnoughStatementChange = createDomainHook<EnoughStatementEntity>({
  storeType: 'superhuman',
  entityType: 'enough_statement',
  contentBuilder: (e) =>
    joinNonEmpty([
      e.domain && e.statement ? `Enough statement in ${e.domain}: "${e.statement}".` : '',
      e.wasItEnough !== undefined ? `Was it enough: ${e.wasItEnough ? 'yes' : 'no'}.` : '',
      formatField('Reached at', e.reachedAt),
      formatField('Notes', e.notes),
    ]),
  metadataExtractor: (e) => ({
    domain: e.domain,
    wasItEnough: e.wasItEnough,
  }),
});

interface IncubatingWisdomEntity {
  question?: string;
  status: 'incubating' | 'ready' | 'resolved';
  insight?: string;
}

/**
 * Track wisdom incubation - things needing time to ripen
 */
export const onIncubatingWisdomChange = createDomainHook<IncubatingWisdomEntity>({
  storeType: 'superhuman',
  entityType: 'incubating_wisdom',
  contentBuilder: (w) =>
    joinNonEmpty([
      w.question ? `Incubating question: "${w.question}".` : '',
      `Status: ${w.status}.`,
      formatField('Insight', w.insight),
    ]),
  metadataExtractor: (w) => ({
    status: w.status,
  }),
  shouldSkip: (w) => w.status === 'resolved',
});

interface WisdomPatternEntity {
  theme?: string;
  patternType?: 'recurring-question' | 'growth-theme' | 'stuck-point' | 'breakthrough';
  occurrences?: number;
  contexts?: string[];
  lastSeen?: string;
  insight?: string;
}

/**
 * Track wisdom patterns
 */
export const onWisdomPatternChange = createDomainHook<WisdomPatternEntity>({
  storeType: 'superhuman',
  entityType: 'wisdom_pattern',
  contentBuilder: (w) =>
    joinNonEmpty([
      w.theme && w.patternType ? `Wisdom pattern: ${w.theme} (${w.patternType}).` : '',
      w.occurrences !== undefined ? `Occurrences: ${w.occurrences}.` : '',
      formatField('Last seen', w.lastSeen),
      formatField('Insight', w.insight),
    ]),
  metadataExtractor: (w) => ({
    patternType: w.patternType,
    occurrences: w.occurrences,
  }),
});

interface LegacyStatementEntity {
  statement: string;
  domain: string;
  importance: 'core' | 'significant' | 'emerging';
}

/**
 * Track legacy/meaning goals
 */
export const onLegacyStatementChange = createDomainHook<LegacyStatementEntity>({
  storeType: 'superhuman',
  entityType: 'legacy_statement',
  contentBuilder: (l) =>
    joinNonEmpty([
      `Legacy goal: "${l.statement}".`,
      `Domain: ${l.domain}, importance: ${l.importance}.`,
    ]),
  metadataExtractor: (l) => ({
    domain: l.domain,
    importance: l.importance,
  }),
});

interface CyclicalPatternEntity {
  pattern?: string;
  cycle?: 'daily' | 'weekly' | 'monthly' | 'seasonal' | 'annual';
  insight?: string;
  observations?: Array<{ date: string; note: string }>;
  lastObserved?: string;
}

/**
 * Track cyclical/seasonal patterns
 */
export const onCyclicalPatternChange = createDomainHook<CyclicalPatternEntity>({
  storeType: 'superhuman',
  entityType: 'cyclical_pattern',
  contentBuilder: (c) =>
    joinNonEmpty([
      c.pattern && c.cycle ? `Cyclical pattern: ${c.pattern} (${c.cycle}).` : '',
      c.pattern && !c.cycle ? `Pattern: ${c.pattern}.` : '',
      formatField('Insight', c.insight),
      c.observations?.length ? `Observations: ${c.observations.length} recorded.` : '',
      c.lastObserved ? `Last observed: ${c.lastObserved}.` : '',
    ]),
  metadataExtractor: (c) => ({
    cycle: c.cycle,
  }),
});

// ============================================================================
// JORDAN PLANNING SERVICES HOOKS
// ============================================================================

interface EventPatternEntity {
  eventType: string;
  pattern: string;
  lesson?: string;
}

/**
 * Track event patterns
 */
export const onEventPatternChange = createDomainHook<EventPatternEntity>({
  storeType: 'superhuman',
  entityType: 'event_pattern',
  contentBuilder: (e) =>
    joinNonEmpty([
      `Event pattern for ${e.eventType}: ${e.pattern}.`,
      formatField('Lesson', e.lesson),
    ]),
  metadataExtractor: (e) => ({
    eventType: e.eventType,
  }),
});

interface GuestProfileEntity {
  name: string;
  dietary?: string;
  accessibility?: string;
  note?: string;
}

/**
 * Track guest profiles for events
 */
export const onGuestProfileChange = createDomainHook<GuestProfileEntity>({
  storeType: 'superhuman',
  entityType: 'guest_profile',
  contentBuilder: (g) =>
    joinNonEmpty([
      `Guest: ${g.name}.`,
      formatField('Dietary', g.dietary),
      formatField('Accessibility', g.accessibility),
      formatField('Notes', g.note),
    ]),
  metadataExtractor: (g) => ({
    hasDietary: !!g.dietary,
    hasAccessibility: !!g.accessibility,
  }),
});

interface DetectedMilestoneEntity {
  type: string;
  description: string;
  date: string;
  recurring: boolean;
}

/**
 * Track detected milestones
 */
export const onDetectedMilestoneChange = createDomainHook<DetectedMilestoneEntity>({
  storeType: 'superhuman',
  entityType: 'detected_milestone',
  contentBuilder: (m) =>
    joinNonEmpty([
      `Milestone: ${m.description} (${m.type}).`,
      `Date: ${formatDate(m.date)}.`,
      m.recurring ? 'Recurring.' : '',
    ]),
  metadataExtractor: (m) => ({
    type: m.type,
    recurring: m.recurring,
    date: m.date,
  }),
});

interface EventMeaningEntity {
  eventName: string;
  meaning?: string;
  memorableMoment?: string;
  lessonLearned?: string;
}

/**
 * Track what events MEANT
 */
export const onEventMeaningChange = createDomainHook<EventMeaningEntity>({
  storeType: 'superhuman',
  entityType: 'event_meaning',
  contentBuilder: (e) =>
    joinNonEmpty([
      `Event: ${e.eventName}.`,
      formatField('Meaning', e.meaning),
      formatField('Memorable moment', e.memorableMoment),
      formatField('Lesson', e.lessonLearned),
    ]),
  metadataExtractor: (e) => ({
    eventName: e.eventName,
  }),
});

interface CelebrationEntity {
  what: string;
  forWhom: 'self' | 'other' | 'both';
  size: 'micro' | 'small' | 'medium' | 'large';
}

/**
 * Track celebrations for joy balance
 */
export const onCelebrationChange = createDomainHook<CelebrationEntity>({
  storeType: 'superhuman',
  entityType: 'celebration',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Celebration: ${c.what}.`,
      `For: ${c.forWhom}, size: ${c.size}.`,
    ]),
  metadataExtractor: (c) => ({
    forWhom: c.forWhom,
    size: c.size,
  }),
});

interface TransitionSignalEntity {
  type: string;
  signal: string;
  strength: 'weak' | 'moderate' | 'strong';
}

/**
 * Track life transition signals
 */
export const onTransitionSignalChange = createDomainHook<TransitionSignalEntity>({
  storeType: 'superhuman',
  entityType: 'transition_signal',
  contentBuilder: (t) =>
    joinNonEmpty([
      `Transition signal for ${t.type}: ${t.signal}.`,
      `Strength: ${t.strength}.`,
    ]),
  metadataExtractor: (t) => ({
    type: t.type,
    strength: t.strength,
  }),
});

// ============================================================================
// PETER ANALYTICS SERVICES HOOKS
// ============================================================================

interface BlindSpotEntity {
  domain: string;
  observation: string;
  evidence?: string;
}

/**
 * Track blind spots - patterns they're avoiding
 */
export const onBlindSpotChange = createDomainHook<BlindSpotEntity>({
  storeType: 'superhuman',
  entityType: 'blind_spot',
  contentBuilder: (b) =>
    joinNonEmpty([
      `Blind spot in ${b.domain}: ${b.observation}.`,
      formatField('Evidence', b.evidence),
    ]),
  metadataExtractor: (b) => ({
    domain: b.domain,
  }),
});

interface CounterfactualEntity {
  originalDecision: string;
  alternativePath: string;
  domain: string;
  outcome?: string;
  lesson?: string;
}

/**
 * Track counterfactuals - roads not taken
 */
export const onCounterfactualChange = createDomainHook<CounterfactualEntity>({
  storeType: 'superhuman',
  entityType: 'counterfactual',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Counterfactual: Instead of "${c.originalDecision}", what if "${c.alternativePath}"?`,
      `Domain: ${c.domain}.`,
      formatField('Outcome', c.outcome),
      formatField('Lesson', c.lesson),
    ]),
  metadataExtractor: (c) => ({
    domain: c.domain,
  }),
});

interface PatternPredictionEntity {
  pattern: string;
  domain: string;
  currentTrajectory: 'improving' | 'declining' | 'stable' | 'volatile';
  prediction?: string;
}

/**
 * Track pattern predictions - where trajectories are heading
 */
export const onPatternPredictionChange = createDomainHook<PatternPredictionEntity>({
  storeType: 'superhuman',
  entityType: 'pattern_prediction',
  contentBuilder: (p) =>
    joinNonEmpty([
      `Pattern: ${p.pattern} in ${p.domain}.`,
      `Trajectory: ${p.currentTrajectory}.`,
      formatField('Prediction', p.prediction),
    ]),
  metadataExtractor: (p) => ({
    domain: p.domain,
    trajectory: p.currentTrajectory,
  }),
});

interface DecisionScoreEntity {
  decision: string;
  domain: string;
  outcome: 'great' | 'good' | 'neutral' | 'poor' | 'bad';
  lesson?: string;
}

/**
 * Track decision quality over time
 */
export const onDecisionScoreChange = createDomainHook<DecisionScoreEntity>({
  storeType: 'superhuman',
  entityType: 'decision_score',
  contentBuilder: (d) =>
    joinNonEmpty([
      `Decision: ${d.decision}.`,
      `Domain: ${d.domain}, outcome: ${d.outcome}.`,
      formatField('Lesson', d.lesson),
    ]),
  metadataExtractor: (d) => ({
    domain: d.domain,
    outcome: d.outcome,
  }),
});

interface CorrelationEntity {
  factor1: string;
  factor2: string;
  relationship: 'positive' | 'negative' | 'complex' | 'unknown';
  strength?: 'weak' | 'moderate' | 'strong';
  insight?: string;
}

/**
 * Track correlations - cross-domain connections
 */
export const onCorrelationChange = createDomainHook<CorrelationEntity>({
  storeType: 'superhuman',
  entityType: 'correlation',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Correlation: ${c.factor1} ↔ ${c.factor2}.`,
      `Relationship: ${c.relationship}${c.strength ? ` (${c.strength})` : ''}.`,
      formatField('Insight', c.insight),
    ]),
  metadataExtractor: (c) => ({
    relationship: c.relationship,
    strength: c.strength,
  }),
});

interface AnomalyEntity {
  anomaly: string;
  domain: string;
  severity: 'info' | 'warning' | 'alert';
  interpretation?: string;
}

/**
 * Track anomalies - unusual patterns
 */
export const onAnomalyChange = createDomainHook<AnomalyEntity>({
  storeType: 'superhuman',
  entityType: 'anomaly',
  contentBuilder: (a) =>
    joinNonEmpty([
      `Anomaly in ${a.domain}: ${a.anomaly}.`,
      `Severity: ${a.severity}.`,
      formatField('Interpretation', a.interpretation),
    ]),
  metadataExtractor: (a) => ({
    domain: a.domain,
    severity: a.severity,
  }),
});

interface InsightEntity {
  insight: string;
  domain: string;
  source: string;
  importance: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Track insights - personal knowledge base
 */
export const onInsightChange = createDomainHook<InsightEntity>({
  storeType: 'superhuman',
  entityType: 'insight',
  contentBuilder: (i) =>
    joinNonEmpty([
      `Insight: ${i.insight}.`,
      `Domain: ${i.domain}, source: ${i.source}.`,
      `Importance: ${i.importance}.`,
    ]),
  metadataExtractor: (i) => ({
    domain: i.domain,
    importance: i.importance,
    source: i.source,
  }),
});

// ============================================================================
// ANTICIPATORY PLANNING HOOKS
// ============================================================================

interface AnticipatedTransitionEntity {
  transition: string;
  confidence: number;
  timeframe?: string;
  triggers: string[];
}

/**
 * Track anticipated life transitions
 */
export const onAnticipatedTransitionChange = createDomainHook<AnticipatedTransitionEntity>({
  storeType: 'superhuman',
  entityType: 'anticipated_transition',
  contentBuilder: (a) =>
    joinNonEmpty([
      `Anticipated transition: ${a.transition}.`,
      `Confidence: ${Math.round(a.confidence * 100)}%.`,
      formatField('Timeframe', a.timeframe),
      a.triggers.length ? `Triggers: ${a.triggers.join(', ')}.` : '',
    ]),
  metadataExtractor: (a) => ({
    transition: a.transition,
    confidence: a.confidence,
  }),
  shouldSkip: (a) => a.confidence < 0.3,
});

// ============================================================================
// OBSERVATIONS HOOKS
// ============================================================================

interface SuperhumanObservationEntity {
  type: 'linguistic_pattern' | 'behavioral_pattern' | 'emotional_pattern' | 'relationship_pattern' | 'timing_pattern';
  observation: string;
  evidenceCount: number;
  confidence: number;
  surfacingPhrase: string;
}

/**
 * Track superhuman observations - patterns only AI would notice
 */
export const onSuperhumanObservationChange = createDomainHook<SuperhumanObservationEntity>({
  storeType: 'superhuman',
  entityType: 'observation',
  contentBuilder: (o) =>
    joinNonEmpty([
      `Observation (${o.type}): ${o.observation}.`,
      `Evidence count: ${o.evidenceCount}, confidence: ${Math.round(o.confidence * 100)}%.`,
      `Surfacing: "${o.surfacingPhrase}".`,
    ]),
  metadataExtractor: (o) => ({
    type: o.type,
    evidenceCount: o.evidenceCount,
    confidence: o.confidence,
  }),
  shouldSkip: (o) => o.confidence < 0.5 || o.evidenceCount < 3,
});

// ============================================================================
// EXPORTS
// ============================================================================

export const superhumanHooks = {
  // Original hooks
  onDreamChange,
  onLifeChapterChange,
  onValuesAlignmentChange,
  onCapacityStateChange,
  onRelationshipMilestoneChange,
  onSeasonalPatternChange,
  onEmotionalFirstAidChange,
  onPredictiveInsightChange,
  onCommitmentKeeperChange,
  onRelationshipNetworkChange,
  onConflictMemoryChange,
  onRecoveryMilestoneChange,
  onMoodPatternChange,
  onEnergyPatternChange,
  // Maya coaching hooks
  onHabitDNAChange,
  onFrictionPointChange,
  onTendencyProfileChange,
  onKeystoneObservationChange,
  onIdentityStatementChange,
  onSetbackPatternChange,
  onHabitAutopsyChange,
  // Nayan wisdom hooks
  onParadoxChange,
  onEnoughStatementChange,
  onIncubatingWisdomChange,
  onWisdomPatternChange,
  onLegacyStatementChange,
  onCyclicalPatternChange,
  // Jordan planning hooks
  onEventPatternChange,
  onGuestProfileChange,
  onDetectedMilestoneChange,
  onEventMeaningChange,
  onCelebrationChange,
  onTransitionSignalChange,
  // Peter analytics hooks
  onBlindSpotChange,
  onCounterfactualChange,
  onPatternPredictionChange,
  onDecisionScoreChange,
  onCorrelationChange,
  onAnomalyChange,
  onInsightChange,
  // Anticipatory planning hooks
  onAnticipatedTransitionChange,
  // Observations hooks
  onSuperhumanObservationChange,
};

export default superhumanHooks;
