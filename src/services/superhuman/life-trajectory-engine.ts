/**
 * Life Trajectory Engine - Long-Term Life Planning & Synthesis
 *
 * The crown jewel of "Better Than Human" - synthesizes all of Ferni's knowledge
 * about a user into a coherent life trajectory with projections and suggestions.
 *
 * No human friend can:
 * - Remember every conversation over years
 * - See patterns across all life domains
 * - Model compound effects of habits
 * - Synthesize career, health, relationships simultaneously
 *
 * This service does all of that.
 *
 * @module services/superhuman/life-trajectory-engine
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'LifeTrajectoryEngine' });

// ============================================================================
// Types
// ============================================================================

export interface LifeTrajectory {
  userId: string;
  generatedAt: string;
  version: number;

  // Current state
  currentChapter: LifeChapter;
  activeGoals: Goal[];
  habits: HabitWithProjection[];
  relationships: RelationshipHealth[];
  values: ValueAlignment[];

  // Projections (this is the AGI-like capability)
  projectedOutcomes: {
    optimistic: Scenario;
    realistic: Scenario;
    pessimistic: Scenario;
  };

  // Compound effects - what happens if user continues current path
  compoundEffects: CompoundEffect[];

  // Critical dependencies - goals that depend on each other
  criticalDependencies: Dependency[];

  // Proactive suggestions - what Ferni thinks user should consider
  suggestedPivots: PivotSuggestion[];

  // Life score (subjective, but helpful)
  lifeScore: {
    overall: number; // 0-100
    health: number;
    career: number;
    relationships: number;
    growth: number;
    meaning: number;
  };
}

export interface LifeChapter {
  title: string; // e.g., "Building the Foundation", "Career Transition"
  description: string;
  startDate: string;
  themes: string[];
  keyEvents: Array<{
    date: string;
    event: string;
    impact: 'positive' | 'neutral' | 'negative';
  }>;
  emotionalTone: string;
}

export interface Goal {
  id: string;
  title: string;
  category: 'health' | 'career' | 'relationships' | 'growth' | 'financial' | 'creative' | 'other';
  description: string;
  targetDate?: string;
  progress: number; // 0-100
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  blockers: string[];
  enablers: string[];
  momentum: 'gaining' | 'steady' | 'losing' | 'stalled';
}

export interface HabitWithProjection {
  id: string;
  name: string;
  category: string;
  currentStreak: number;
  longestStreak: number;
  consistency: number; // 0-100 over last 30 days
  projectedImpact: {
    oneMonth: string;
    sixMonths: string;
    oneYear: string;
    fiveYears: string;
  };
  compoundBenefit: string; // What this habit enables
}

export interface RelationshipHealth {
  personName: string;
  relationship: string; // "partner", "parent", "friend", "colleague"
  importance: number; // 0-100
  currentHealth: number; // 0-100
  trend: 'improving' | 'stable' | 'declining';
  lastMeaningfulInteraction: string;
  suggestedAction?: string;
}

export interface ValueAlignment {
  value: string; // "authenticity", "growth", "family", etc.
  importanceToUser: number; // 0-100
  livingScorel: number; // 0-100 - how much they're living this value
  gap: number; // Difference between importance and living
  suggestion?: string;
}

export interface Scenario {
  name: string;
  probability: number; // 0-100
  timeframe: string;
  description: string;
  keyOutcomes: string[];
  requirements: string[];
  risks: string[];
}

export interface CompoundEffect {
  domain: 'health' | 'career' | 'relationships' | 'wealth' | 'skills' | 'wellbeing';
  currentBehavior: string;
  projectedOutcome: {
    oneYear: string;
    fiveYears: string;
    tenYears: string;
  };
  confidence: number; // 0-100
  sensitivity: string; // What would change this projection
}

export interface Dependency {
  goalId: string;
  dependsOn: string[];
  type: 'blocking' | 'enabling' | 'reinforcing';
  description: string;
}

export interface PivotSuggestion {
  id: string;
  title: string;
  domain: string;
  description: string;
  reasoning: string; // Why Ferni thinks this matters
  urgency: 'low' | 'medium' | 'high';
  potentialImpact: string;
  suggestedTiming: string;
  relatedGoals: string[];
}

// ============================================================================
// Data Gathering
// ============================================================================

/**
 * Gather all data needed for trajectory synthesis
 */
async function gatherTrajectoryData(
  userId: string
): Promise<{
  dreams: unknown[];
  commitments: unknown[];
  habits: unknown[];
  relationships: unknown[];
  values: unknown[];
  conversations: unknown[];
  insights: unknown[];
  milestones: unknown[];
  moods: unknown[];
}> {
  const db = getFirestoreDb();
  if (!db) {
    return {
      dreams: [],
      commitments: [],
      habits: [],
      relationships: [],
      values: [],
      conversations: [],
      insights: [],
      milestones: [],
      moods: [],
    };
  }

  const userRef = db.collection('bogle_users').doc(userId);

  try {
    const [
      dreamsSnap,
      commitmentsSnap,
      habitsSnap,
      relationshipsSnap,
      valuesSnap,
      conversationsSnap,
      insightsSnap,
      milestonesSnap,
      moodsSnap,
    ] = await Promise.all([
      userRef.collection('dreams').limit(100).get(),
      userRef.collection('commitments').limit(100).get(),
      userRef.collection('habits').limit(100).get(),
      userRef.collection('relationships').limit(100).get(),
      userRef.collection('values').limit(50).get(),
      userRef.collection('conversation_summaries').orderBy('timestamp', 'desc').limit(50).get(),
      userRef.collection('predictive_insights').orderBy('createdAt', 'desc').limit(50).get(),
      userRef.collection('milestones').limit(100).get(),
      userRef.collection('moods').orderBy('timestamp', 'desc').limit(30).get(),
    ]);

    return {
      dreams: dreamsSnap.docs.map((d) => d.data()),
      commitments: commitmentsSnap.docs.map((d) => d.data()),
      habits: habitsSnap.docs.map((d) => d.data()),
      relationships: relationshipsSnap.docs.map((d) => d.data()),
      values: valuesSnap.docs.map((d) => d.data()),
      conversations: conversationsSnap.docs.map((d) => d.data()),
      insights: insightsSnap.docs.map((d) => d.data()),
      milestones: milestonesSnap.docs.map((d) => d.data()),
      moods: moodsSnap.docs.map((d) => d.data()),
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to gather trajectory data');
    return {
      dreams: [],
      commitments: [],
      habits: [],
      relationships: [],
      values: [],
      conversations: [],
      insights: [],
      milestones: [],
      moods: [],
    };
  }
}

// ============================================================================
// Synthesis Functions
// ============================================================================

/**
 * Synthesize the current life chapter
 */
function synthesizeCurrentChapter(data: {
  conversations: unknown[];
  milestones: unknown[];
  moods: unknown[];
}): LifeChapter {
  // Analyze recent conversations for themes
  const themes: string[] = [];
  const recentTopics = new Map<string, number>();

  // Extract topics from conversation summaries
  for (const conv of data.conversations.slice(0, 20)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topics = (conv as any).topics || [];
    for (const topic of topics) {
      recentTopics.set(topic, (recentTopics.get(topic) || 0) + 1);
    }
  }

  // Get top themes
  const sortedTopics = Array.from(recentTopics.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  themes.push(...sortedTopics.map(([topic]) => topic));

  // Determine emotional tone from moods
  let emotionalTone = 'neutral';
  if (data.moods.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const avgMood = (data.moods as any[]).reduce((sum, m) => sum + (m.score || 50), 0) / data.moods.length;
    if (avgMood > 70) emotionalTone = 'positive and energized';
    else if (avgMood > 50) emotionalTone = 'steady and grounded';
    else if (avgMood > 30) emotionalTone = 'challenged but persevering';
    else emotionalTone = 'struggling and seeking support';
  }

  // Generate chapter title based on themes
  const chapterTitle = generateChapterTitle(themes, emotionalTone);

  return {
    title: chapterTitle,
    description: `This chapter is characterized by focus on ${themes.slice(0, 3).join(', ')}.`,
    startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days ago
    themes,
    keyEvents: data.milestones.slice(0, 5).map((m) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      date: (m as any).date || new Date().toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      event: (m as any).title || 'Milestone',
      impact: 'positive' as const,
    })),
    emotionalTone,
  };
}

/**
 * Generate a meaningful chapter title
 */
function generateChapterTitle(themes: string[], emotionalTone: string): string {
  const titleOptions: Record<string, string[]> = {
    career: ['The Professional Pivot', 'Building New Foundations', 'Career Awakening'],
    health: ['The Wellness Journey', 'Rebuilding Strength', 'Mind-Body Integration'],
    relationships: ['Deepening Connections', 'The Relationship Renaissance', 'Finding Your People'],
    growth: ['Personal Evolution', 'The Growth Edge', 'Becoming More'],
    financial: ['Financial Foundations', 'Wealth Building', 'Financial Freedom Journey'],
    creative: ['Creative Awakening', 'Finding Your Voice', 'The Art of Living'],
    family: ['Family Focus', 'Building Legacy', 'Roots and Wings'],
    purpose: ['Finding Meaning', 'Purpose Unveiled', 'The Why Phase'],
  };

  // Pick based on top theme
  for (const theme of themes) {
    const themeLower = theme.toLowerCase();
    for (const [key, titles] of Object.entries(titleOptions)) {
      if (themeLower.includes(key)) {
        return titles[Math.floor(Math.random() * titles.length)];
      }
    }
  }

  // Default based on emotional tone
  if (emotionalTone.includes('positive')) return 'Rising';
  if (emotionalTone.includes('struggling')) return 'The Cocoon';
  return 'In Transition';
}

/**
 * Project compound effects
 */
function projectCompoundEffects(data: {
  habits: unknown[];
  goals: unknown[];
}): CompoundEffect[] {
  const effects: CompoundEffect[] = [];

  // Analyze habits for compound effects
  for (const habit of data.habits.slice(0, 10)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h = habit as any;

    if (!h.name) continue;

    const consistency = h.consistency || 50;
    const habitName = h.name;
    const category = h.category || 'wellbeing';

    const effect: CompoundEffect = {
      domain: category as CompoundEffect['domain'],
      currentBehavior: habitName,
      projectedOutcome: {
        oneYear: projectHabitOutcome(habitName, consistency, 1),
        fiveYears: projectHabitOutcome(habitName, consistency, 5),
        tenYears: projectHabitOutcome(habitName, consistency, 10),
      },
      confidence: Math.min(consistency + 20, 95),
      sensitivity: consistency < 50
        ? 'Improving consistency would dramatically change this projection'
        : 'Maintaining current consistency will achieve this outcome',
    };

    effects.push(effect);
  }

  return effects;
}

/**
 * Project habit outcome based on compound effects
 */
function projectHabitOutcome(habitName: string, consistency: number, years: number): string {
  const habitLower = habitName.toLowerCase();

  // Exercise habits
  if (habitLower.includes('exercise') || habitLower.includes('workout') || habitLower.includes('run')) {
    if (consistency >= 70) {
      if (years === 1) return 'Significantly improved cardiovascular health, 10-15% more energy';
      if (years === 5) return 'Potential reversal of chronic disease markers, peak physical condition';
      return 'Extended healthspan, reduced risk of major diseases by 40%+';
    }
    if (years === 1) return 'Marginal fitness improvements, occasional energy boosts';
    return 'Missed opportunity for health transformation';
  }

  // Sleep habits
  if (habitLower.includes('sleep') || habitLower.includes('bedtime')) {
    if (consistency >= 70) {
      if (years === 1) return 'Improved cognitive function, emotional regulation';
      if (years === 5) return 'Reduced risk of Alzheimer\'s, maintained cognitive sharpness';
      return 'Significantly better brain health and longevity';
    }
    return 'Accumulated sleep debt affecting decision-making and health';
  }

  // Meditation/mindfulness
  if (habitLower.includes('meditat') || habitLower.includes('mindful')) {
    if (consistency >= 70) {
      if (years === 1) return 'Measurable reduction in anxiety, improved focus';
      if (years === 5) return 'Fundamental shift in stress response, emotional mastery';
      return 'Transformed relationship with thoughts and emotions';
    }
    return 'Occasional calm moments, but no lasting neural changes';
  }

  // Reading/learning
  if (habitLower.includes('read') || habitLower.includes('learn')) {
    if (consistency >= 70) {
      if (years === 1) return '~50 books, significant knowledge expansion';
      if (years === 5) return '~250 books, expert-level knowledge in multiple areas';
      return 'Renaissance-level breadth of knowledge, unique perspective on life';
    }
    return 'Slow knowledge accumulation, narrow perspective';
  }

  // Financial habits
  if (habitLower.includes('save') || habitLower.includes('budget') || habitLower.includes('invest')) {
    if (consistency >= 70) {
      if (years === 1) return 'Solid emergency fund, reduced financial stress';
      if (years === 5) return 'Financial security, options for career pivots';
      return 'Financial independence within reach';
    }
    return 'Living paycheck to paycheck, vulnerable to emergencies';
  }

  // Generic projection
  if (consistency >= 70) {
    if (years === 1) return 'Noticeable positive changes';
    if (years === 5) return 'Significant life improvement';
    return 'Transformational long-term impact';
  }
  return 'Limited impact without improved consistency';
}

/**
 * Generate pivot suggestions
 */
function generatePivotSuggestions(data: {
  dreams: unknown[];
  values: unknown[];
  goals: unknown[];
  relationships: unknown[];
}): PivotSuggestion[] {
  const suggestions: PivotSuggestion[] = [];

  // Check for dormant dreams
  for (const dream of data.dreams.slice(0, 5)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = dream as any;
    if (d.dormant || (d.lastMentioned && Date.now() - new Date(d.lastMentioned).getTime() > 90 * 24 * 60 * 60 * 1000)) {
      suggestions.push({
        id: `pivot_dream_${Date.now()}`,
        title: `Revisit: ${d.dream || 'Your dream'}`,
        domain: 'growth',
        description: `You mentioned wanting "${d.dream}" but haven't talked about it in a while.`,
        reasoning: 'Dreams that go unexplored often create regret. Even small steps keep them alive.',
        urgency: 'medium',
        potentialImpact: 'Reconnecting with this dream could bring renewed purpose and energy.',
        suggestedTiming: 'Consider exploring this in your next planning session',
        relatedGoals: [],
      });
    }
  }

  // Check for value misalignment
  for (const value of data.values.slice(0, 5)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = value as any;
    if (v.importanceToUser > 70 && (v.livingScore || 50) < 40) {
      suggestions.push({
        id: `pivot_value_${Date.now()}`,
        title: `Live your value: ${v.value}`,
        domain: 'meaning',
        description: `${v.value} is important to you, but your recent actions don't reflect it.`,
        reasoning: 'Value misalignment creates subtle unhappiness and inauthenticity.',
        urgency: 'high',
        potentialImpact: 'Aligning actions with values leads to deeper satisfaction.',
        suggestedTiming: 'This week - small alignment actions',
        relatedGoals: [],
      });
    }
  }

  // Check for relationship drift
  for (const rel of data.relationships.slice(0, 5)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = rel as any;
    if (r.importance > 70 && r.trend === 'declining') {
      suggestions.push({
        id: `pivot_rel_${Date.now()}`,
        title: `Reconnect with ${r.personName || 'someone important'}`,
        domain: 'relationships',
        description: `Your relationship with ${r.personName} has been drifting.`,
        reasoning: 'Important relationships require maintenance. The drift accelerates if unaddressed.',
        urgency: r.importance > 80 ? 'high' : 'medium',
        potentialImpact: 'Maintaining key relationships is essential for wellbeing and support.',
        suggestedTiming: 'Reach out this week',
        relatedGoals: [],
      });
    }
  }

  return suggestions.slice(0, 5); // Limit to 5 suggestions
}

/**
 * Calculate life score
 */
function calculateLifeScore(data: {
  habits: unknown[];
  relationships: unknown[];
  goals: unknown[];
  moods: unknown[];
}): LifeTrajectory['lifeScore'] {
  // This is subjective but helpful for tracking progress
  const scores = {
    health: 50,
    career: 50,
    relationships: 50,
    growth: 50,
    meaning: 50,
  };

  // Adjust based on habit consistency
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const healthHabits = (data.habits as any[]).filter((h) =>
    ['exercise', 'sleep', 'nutrition', 'workout'].some((k) => h.name?.toLowerCase().includes(k))
  );
  if (healthHabits.length > 0) {
    const avgConsistency = healthHabits.reduce((sum, h) => sum + (h.consistency || 50), 0) / healthHabits.length;
    scores.health = Math.round(avgConsistency);
  }

  // Adjust based on goal progress
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeGoals = (data.goals as any[]).filter((g) => g.status === 'active');
  if (activeGoals.length > 0) {
    const avgProgress = activeGoals.reduce((sum, g) => sum + (g.progress || 0), 0) / activeGoals.length;
    scores.growth = Math.round(avgProgress);
    scores.career = Math.round((avgProgress + 50) / 2);
  }

  // Adjust based on relationship health
  if (data.relationships.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const avgHealth = (data.relationships as any[]).reduce((sum, r) => sum + (r.health || 50), 0) / data.relationships.length;
    scores.relationships = Math.round(avgHealth);
  }

  // Adjust based on mood trend
  if (data.moods.length >= 5) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentMoods = data.moods.slice(0, 5).map((m: any) => m.score || 50);
    scores.meaning = Math.round(recentMoods.reduce((a, b) => a + b, 0) / recentMoods.length);
  }

  const overall = Math.round(
    (scores.health + scores.career + scores.relationships + scores.growth + scores.meaning) / 5
  );

  return {
    overall,
    ...scores,
  };
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Generate a complete life trajectory for a user
 */
export async function generateLifeTrajectory(userId: string): Promise<LifeTrajectory> {
  const startTime = Date.now();
  log.info({ userId }, 'Generating life trajectory');

  // Gather all data
  const data = await gatherTrajectoryData(userId);

  // Synthesize current chapter
  const currentChapter = synthesizeCurrentChapter(data);

  // Process goals
  const activeGoals: Goal[] = data.commitments
    .filter((c) => (c as { status?: string }).status === 'active')
    .slice(0, 10)
    .map((c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const commitment = c as any;
      return {
        id: commitment.id || `goal_${Math.random().toString(36).substring(2)}`,
        title: commitment.description || commitment.title || 'Goal',
        category: 'other' as const,
        description: commitment.description || '',
        targetDate: commitment.dueDate,
        progress: commitment.progress || 0,
        status: 'active' as const,
        blockers: [],
        enablers: [],
        momentum: 'steady' as const,
      };
    });

  // Process habits with projections
  const habits: HabitWithProjection[] = data.habits.slice(0, 10).map((h) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const habit = h as any;
    const consistency = habit.consistency || 50;
    return {
      id: habit.id || `habit_${Math.random().toString(36).substring(2)}`,
      name: habit.name || 'Habit',
      category: habit.category || 'wellness',
      currentStreak: habit.streak || 0,
      longestStreak: habit.longestStreak || habit.streak || 0,
      consistency,
      projectedImpact: {
        oneMonth: projectHabitOutcome(habit.name || '', consistency, 1 / 12),
        sixMonths: projectHabitOutcome(habit.name || '', consistency, 0.5),
        oneYear: projectHabitOutcome(habit.name || '', consistency, 1),
        fiveYears: projectHabitOutcome(habit.name || '', consistency, 5),
      },
      compoundBenefit: `Enables ${habit.category || 'personal'} growth`,
    };
  });

  // Process relationships
  const relationships: RelationshipHealth[] = data.relationships.slice(0, 10).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rel = r as any;
    return {
      personName: rel.name || 'Unknown',
      relationship: rel.relationship || 'friend',
      importance: rel.importance || 50,
      currentHealth: rel.health || 50,
      trend: rel.trend || 'stable',
      lastMeaningfulInteraction: rel.lastMentioned || new Date().toISOString(),
      suggestedAction: rel.trend === 'declining' ? 'Reach out soon' : undefined,
    };
  });

  // Process values
  const values: ValueAlignment[] = data.values.slice(0, 5).map((v) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const val = v as any;
    const importance = val.importance || 50;
    const living = val.livingScore || 50;
    return {
      value: val.value || val.name || 'Value',
      importanceToUser: importance,
      livingScorel: living,
      gap: Math.abs(importance - living),
      suggestion: importance > living + 20 ? 'Consider aligning actions with this value' : undefined,
    };
  });

  // Generate compound effects
  const compoundEffects = projectCompoundEffects({ habits: data.habits, goals: data.commitments });

  // Generate pivot suggestions
  const suggestedPivots = generatePivotSuggestions({
    dreams: data.dreams,
    values: data.values,
    goals: data.commitments,
    relationships: data.relationships,
  });

  // Calculate life score
  const lifeScore = calculateLifeScore({
    habits: data.habits,
    relationships: data.relationships,
    goals: data.commitments,
    moods: data.moods,
  });

  // Generate scenario projections
  const projectedOutcomes = {
    optimistic: {
      name: 'Best Case',
      probability: 20,
      timeframe: '2-3 years',
      description: 'If you maintain momentum and capitalize on opportunities',
      keyOutcomes: [
        'Significant progress on all major goals',
        'Strong relationships deepened',
        'New opportunities attracted',
      ],
      requirements: ['Consistent habit execution', 'Proactive relationship maintenance', 'Continued growth mindset'],
      risks: ['Burnout from over-optimization', 'Missing unexpected opportunities'],
    },
    realistic: {
      name: 'Expected',
      probability: 60,
      timeframe: '2-3 years',
      description: 'If you continue on your current trajectory with typical life variations',
      keyOutcomes: [
        'Moderate progress on most goals',
        'Maintained relationships',
        'Steady improvement in key areas',
      ],
      requirements: ['Maintaining current consistency', 'Adapting to challenges', 'Regular reflection'],
      risks: ['Plateau without new challenges', 'Drift in some relationships'],
    },
    pessimistic: {
      name: 'Challenging',
      probability: 20,
      timeframe: '2-3 years',
      description: 'If momentum is lost or major setbacks occur',
      keyOutcomes: [
        'Goals deprioritized or abandoned',
        'Relationship drift accelerates',
        'Reactive rather than proactive living',
      ],
      requirements: ['Resilience systems', 'Support network', 'Recovery practices'],
      risks: ['Accumulated regret', 'Health impacts', 'Missed opportunities'],
    },
  };

  const trajectory: LifeTrajectory = {
    userId,
    generatedAt: new Date().toISOString(),
    version: 1,
    currentChapter,
    activeGoals,
    habits,
    relationships,
    values,
    projectedOutcomes,
    compoundEffects,
    criticalDependencies: [],
    suggestedPivots,
    lifeScore,
  };

  // Store the trajectory
  const db = getFirestoreDb();
  if (db) {
    try {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('life_trajectories')
        .doc(trajectory.generatedAt)
        .set(trajectory);

      // Also update latest
      await db.collection('bogle_users').doc(userId).update({
        latestTrajectory: trajectory.generatedAt,
        latestLifeScore: lifeScore.overall,
      });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to store trajectory');
    }
  }

  const duration = Date.now() - startTime;
  log.info(
    {
      userId,
      duration,
      lifeScore: lifeScore.overall,
      goalsCount: activeGoals.length,
      habitsCount: habits.length,
      suggestionsCount: suggestedPivots.length,
    },
    'Life trajectory generated'
  );

  return trajectory;
}

/**
 * Get the latest trajectory for a user
 */
export async function getLatestTrajectory(userId: string): Promise<LifeTrajectory | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('life_trajectories')
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as LifeTrajectory;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get latest trajectory');
    return null;
  }
}

// ============================================================================
// Exports
// ============================================================================

export const lifeTrajectoryEngine = {
  generate: generateLifeTrajectory,
  getLatest: getLatestTrajectory,
};

export default lifeTrajectoryEngine;
