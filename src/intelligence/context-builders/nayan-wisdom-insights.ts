/**
 * Nayan's Wisdom Insights Context Builder
 *
 * > "Time in the market beats timing the market. Time in your life beats rushing your life."
 *
 * This builder loads Nayan with DEEP WISDOM INTELLIGENCE when:
 * 1. A user transfers TO Nayan from another persona
 * 2. A user starts talking directly with Nayan
 *
 * NAYAN SEES EVERYTHING - The Full Life Synthesis:
 *
 * FROM PETER (Patterns):
 * - Financial behaviors and their deeper meaning
 * - Decision patterns revealing values
 * - What the numbers say about their life
 *
 * FROM MAYA (Habits):
 * - Daily rhythms and their significance
 * - Self-compassion journey
 * - Growth vs. striving patterns
 *
 * FROM JORDAN (Milestones):
 * - Life chapters and transitions
 * - What they're building toward
 * - Legacy and meaning signals
 *
 * FROM ALEX (Communication):
 * - Relationship patterns
 * - Boundaries and self-expression
 * - How they show up for others
 *
 * FROM FERNI (Core):
 * - Emotional threads across time
 * - Relationship evolution
 * - The whole story so far
 *
 * COMPUTED METRICS (Nayan's Wisdom Dashboard):
 * - Life Integration Score (0-100): Harmony across life areas
 * - Meaning Coherence (0-100): Actions aligned with values
 * - Legacy Readiness (0-100): Long-term impact awareness
 * - Inner Peace Index (0-100): Acceptance vs. striving
 * - Growth Trajectory (0-100): Direction of evolution
 *
 * @module intelligence/context-builders/nayan-wisdom-insights
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  BuilderCategory,
  createHighInjection,
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import { getHandoffContext } from '../../tools/handoff/executor.js';
import { getFinancialStore } from '../../services/financial-store.js';
import { getProductivityStore } from '../../services/productivity-store.js';
import { getGamificationStore } from '../../services/gamification-store.js';
import { getSuperhuman } from './superhuman-integration.js';

const log = createLogger({ module: 'context:nayan-wisdom-insights' });

// ============================================================================
// TYPES
// ============================================================================

interface NayanInsightBriefing {
  /** Life synthesis - the big picture */
  lifeSynthesis: LifeSynthesis;
  /** Computed wisdom metrics */
  wisdomMetrics: WisdomMetrics;
  /** Values alignment analysis */
  valuesAlignment: ValuesAlignment;
  /** Wisdom opportunities */
  wisdomOpportunities: string[];
  /** Deep questions to explore */
  deepQuestions: string[];
  /** Cross-team synthesis */
  teamSynthesis: TeamSynthesis;
  /** Existential context */
  existentialContext: ExistentialContext;
  /** Proactive wisdom triggers */
  proactiveTriggers: WisdomTrigger[];
  /** Life narrative summary */
  lifeNarrative: LifeNarrative;
}

interface LifeSynthesis {
  lifeChapter: string;
  dominantTheme: string | null;
  growthPattern: 'striving' | 'integrating' | 'resting' | 'transitioning' | 'unknown';
  compoundingAreas: string[];
  valuesRevealed: string[];
  timeHorizon: 'short' | 'medium' | 'long' | 'unknown';
  seasonOfLife: string;
}

interface WisdomMetrics {
  /** Harmony across life areas (0-100) */
  lifeIntegration: number;
  /** Actions aligned with values (0-100) */
  meaningCoherence: number;
  /** Long-term impact awareness (0-100) */
  legacyReadiness: number;
  /** Acceptance vs. striving (0-100) */
  innerPeaceIndex: number;
  /** Direction of evolution (0-100) */
  growthTrajectory: number;
  /** Key patterns detected */
  patterns: string[];
}

interface ValuesAlignment {
  statedValues: string[];
  demonstratedValues: string[];
  alignmentGaps: string[];
  coherentAreas: string[];
  conflictAreas: string[];
}

interface ExistentialContext {
  mortalityAwareness: 'absent' | 'emerging' | 'present' | 'integrated';
  legacyThinking: boolean;
  meaningSeekingIntensity: 'low' | 'moderate' | 'high';
  currentExistentialTheme: string | null;
  spiritualOpenness: 'closed' | 'curious' | 'exploring' | 'practiced';
}

interface WisdomTrigger {
  type: 'reflection' | 'reframe' | 'paradox' | 'question' | 'silence' | 'story';
  message: string;
  priority: 'high' | 'medium' | 'low';
  timing: 'immediate' | 'when_ready' | 'later';
}

interface LifeNarrative {
  pastChapter: string;
  currentChapter: string;
  emergingChapter: string;
  recurringThemes: string[];
  transformationMoments: string[];
  unfinishedBusiness: string[];
}

interface TeamSynthesis {
  peterPattern: string | null;
  mayaPattern: string | null;
  jordanPattern: string | null;
  alexPattern: string | null;
  integratedWisdom: string | null;
  crossDomainInsights: string[];
}

interface HandoffBriefing {
  topic: string;
  seekingWhat: 'meaning' | 'perspective' | 'peace' | 'clarity' | 'acceptance' | 'general';
  depth: 'surface' | 'medium' | 'existential';
  timeContext: string | null;
  emotionalUndercurrent: string | null;
  fromPersona: string | null;
}

// ============================================================================
// SESSION STATE
// ============================================================================

interface NayanSession {
  briefingTurn: number;
  questionsExplored: Set<string>;
  wisdomShared: string[];
}

const sessions = new Map<string, NayanSession>();

function getSession(sessionId: string): NayanSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { briefingTurn: -1, questionsExplored: new Set(), wisdomShared: [] };
    sessions.set(sessionId, session);
  }
  return session;
}

export function clearNayanWisdomSession(sessionId: string): void {
  sessions.delete(sessionId);
}

// ============================================================================
// LIFE SYNTHESIS (The Big Picture)
// ============================================================================

async function synthesizeLifeContext(userId: string): Promise<LifeSynthesis> {
  const synthesis: LifeSynthesis = {
    lifeChapter: 'unknown',
    dominantTheme: null,
    growthPattern: 'unknown',
    compoundingAreas: [],
    valuesRevealed: [],
    timeHorizon: 'unknown',
    seasonOfLife: 'unknown',
  };

  try {
    const financialStore = getFinancialStore();
    await financialStore.loadUserData(userId);
    const goals = financialStore.getActiveSavingsGoals(userId);
    const budget = financialStore.getMainBudget(userId);

    const productivityStore = getProductivityStore();
    const userData = productivityStore.getFullUserData(userId);
    const habits = userData.enhancedHabits || [];
    const activeHabits = habits.filter((h) => h.isActive && !h.isPaused);

    // Infer life chapter from goals
    if (goals.length > 0) {
      const goalNames = goals.map((g) => g.name.toLowerCase());
      if (goalNames.some((n) => n.includes('retire') || n.includes('freedom') || n.includes('sabbatical'))) {
        synthesis.lifeChapter = 'freedom-seeking';
        synthesis.dominantTheme = 'Liberation from constraint';
      } else if (goalNames.some((n) => n.includes('house') || n.includes('home') || n.includes('apartment'))) {
        synthesis.lifeChapter = 'nesting';
        synthesis.dominantTheme = 'Creating sanctuary';
      } else if (goalNames.some((n) => n.includes('wedding') || n.includes('family') || n.includes('baby'))) {
        synthesis.lifeChapter = 'partnership-building';
        synthesis.dominantTheme = 'Weaving lives together';
      } else if (goalNames.some((n) => n.includes('emergency') || n.includes('safety') || n.includes('debt'))) {
        synthesis.lifeChapter = 'foundation-building';
        synthesis.dominantTheme = 'Creating solid ground';
      } else if (goalNames.some((n) => n.includes('business') || n.includes('startup') || n.includes('launch'))) {
        synthesis.lifeChapter = 'creation';
        synthesis.dominantTheme = 'Bringing something new to life';
      } else if (goalNames.some((n) => n.includes('education') || n.includes('degree') || n.includes('learn'))) {
        synthesis.lifeChapter = 'expansion';
        synthesis.dominantTheme = 'Growing into new possibilities';
      } else {
        synthesis.lifeChapter = 'active-growth';
        synthesis.dominantTheme = 'Becoming who they are meant to be';
      }
    }

    // Infer growth pattern from habits
    if (activeHabits.length === 0) {
      synthesis.growthPattern = 'resting';
    } else {
      const totalStreaks = activeHabits.reduce((sum, h) => sum + h.currentStreak, 0);
      const avgSuccess =
        activeHabits.reduce((sum, h) => sum + h.successRate, 0) / activeHabits.length;

      if (totalStreaks > 50 && avgSuccess > 0.7) {
        synthesis.growthPattern = 'integrating';
      } else if (activeHabits.length >= 5 && avgSuccess < 0.5) {
        synthesis.growthPattern = 'striving';
      } else if (goals.length > 0 && activeHabits.length > 0) {
        synthesis.growthPattern = 'transitioning';
      } else {
        synthesis.growthPattern = 'integrating';
      }
    }

    // Season of life
    const hour = new Date().getHours();
    const month = new Date().getMonth();
    const seasonName = month >= 2 && month <= 4 ? 'spring' : 
                       month >= 5 && month <= 7 ? 'summer' : 
                       month >= 8 && month <= 10 ? 'autumn' : 'winter';
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    synthesis.seasonOfLife = `${seasonName} ${timeOfDay}`;

    // Infer values from where money and time go
    if (budget) {
      const budgetRatio = budget.spent / budget.monthlyLimit;
      if (budgetRatio < 0.7) {
        synthesis.valuesRevealed.push('Financial discipline - saving for tomorrow');
      } else if (budgetRatio > 1.1) {
        synthesis.valuesRevealed.push('Present-moment living - perhaps at a cost');
      }
    }

    // Values from habits
    for (const habit of activeHabits) {
      const name = habit.name.toLowerCase();
      if (name.includes('meditat') || name.includes('mindful')) {
        synthesis.valuesRevealed.push('Inner peace and presence');
      }
      if (name.includes('exercise') || name.includes('gym') || name.includes('workout')) {
        synthesis.valuesRevealed.push('Physical vitality');
      }
      if (name.includes('read') || name.includes('learn') || name.includes('study')) {
        synthesis.valuesRevealed.push('Continuous growth');
      }
      if (name.includes('journal') || name.includes('write') || name.includes('reflect')) {
        synthesis.valuesRevealed.push('Self-understanding');
      }
      if (name.includes('gratitude') || name.includes('thankful')) {
        synthesis.valuesRevealed.push('Appreciation and presence');
      }
    }

    // Deduplicate values
    synthesis.valuesRevealed = [...new Set(synthesis.valuesRevealed)];

    // Values from goals
    if (goals.some((g) => g.name.toLowerCase().includes('vacation') || g.name.toLowerCase().includes('travel'))) {
      synthesis.valuesRevealed.push('Experience and adventure');
    }
    if (goals.some((g) => g.name.toLowerCase().includes('gift') || g.name.toLowerCase().includes('charity'))) {
      synthesis.valuesRevealed.push('Generosity');
    }

    // Compounding areas (where growth is happening)
    const longestStreaks = activeHabits.filter((h) => h.currentStreak >= 7);
    if (longestStreaks.length > 0) {
      synthesis.compoundingAreas.push(`${longestStreaks.length} habit(s) compounding`);
    }
    const progressingGoals = goals.filter((g) => g.currentAmount / g.targetAmount > 0.5);
    if (progressingGoals.length > 0) {
      synthesis.compoundingAreas.push(`${progressingGoals.length} goal(s) past halfway`);
    }

    // Time horizon from goals
    const goalsWithDeadlines = goals.filter((g) => g.deadline);
    if (goalsWithDeadlines.length > 0) {
      const furthestDeadline = Math.max(
        ...goalsWithDeadlines.map((g) => new Date(g.deadline!).getTime())
      );
      const monthsAway = Math.ceil((furthestDeadline - Date.now()) / (1000 * 60 * 60 * 24 * 30));
      if (monthsAway > 60) {
        synthesis.timeHorizon = 'long';
      } else if (monthsAway > 12) {
        synthesis.timeHorizon = 'medium';
      } else {
        synthesis.timeHorizon = 'short';
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not synthesize life context');
  }

  return synthesis;
}

// ============================================================================
// COMPUTED WISDOM METRICS
// ============================================================================

async function computeWisdomMetrics(
  userId: string,
  lifeSynthesis: LifeSynthesis,
  valuesAlignment: ValuesAlignment
): Promise<WisdomMetrics> {
  const metrics: WisdomMetrics = {
    lifeIntegration: 50,
    meaningCoherence: 50,
    legacyReadiness: 30,
    innerPeaceIndex: 50,
    growthTrajectory: 50,
    patterns: [],
  };

  try {
    // Life Integration: Based on compounding areas and growth pattern
    const compoundingBonus = lifeSynthesis.compoundingAreas.length * 15;
    const patternBonus = lifeSynthesis.growthPattern === 'integrating' ? 30 :
                         lifeSynthesis.growthPattern === 'transitioning' ? 15 : 0;
    metrics.lifeIntegration = Math.min(100, 30 + compoundingBonus + patternBonus);

    // Meaning Coherence: Based on values alignment
    const coherentCount = valuesAlignment.coherentAreas.length;
    const conflictCount = valuesAlignment.conflictAreas.length;
    metrics.meaningCoherence = Math.min(100, 40 + coherentCount * 20 - conflictCount * 15);

    // Legacy Readiness: Based on time horizon and goal depth
    const horizonBonus = lifeSynthesis.timeHorizon === 'long' ? 30 :
                         lifeSynthesis.timeHorizon === 'medium' ? 15 : 0;
    const chapterBonus = ['freedom-seeking', 'creation', 'partnership-building'].includes(lifeSynthesis.lifeChapter) ? 20 : 0;
    metrics.legacyReadiness = Math.min(100, 20 + horizonBonus + chapterBonus);

    // Inner Peace Index: Based on mood and growth pattern
    const gamificationStore = getGamificationStore();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const moodLogs = await gamificationStore.getMoodLogs(userId, weekAgo, now);

    if (moodLogs.length > 0) {
      const avgMood = moodLogs.reduce((sum, m) => sum + m.mood, 0) / moodLogs.length;
      const moodBonus = Math.round((avgMood / 10) * 50);
      metrics.innerPeaceIndex = moodBonus;
    }

    const patternPeaceBonus = lifeSynthesis.growthPattern === 'resting' ? 20 :
                              lifeSynthesis.growthPattern === 'integrating' ? 15 :
                              lifeSynthesis.growthPattern === 'striving' ? -20 : 0;
    metrics.innerPeaceIndex = Math.max(0, Math.min(100, metrics.innerPeaceIndex + patternPeaceBonus));

    // Growth Trajectory: Based on compounding and momentum
    const compoundingMomentum = lifeSynthesis.compoundingAreas.length * 20;
    const patternMomentum = lifeSynthesis.growthPattern === 'integrating' ? 25 :
                           lifeSynthesis.growthPattern === 'transitioning' ? 15 :
                           lifeSynthesis.growthPattern === 'striving' ? 10 : 5;
    metrics.growthTrajectory = Math.min(100, 30 + compoundingMomentum + patternMomentum);

    // Detect patterns
    if (metrics.lifeIntegration > 70) {
      metrics.patterns.push('Life areas harmonizing - the pieces are coming together');
    } else if (metrics.lifeIntegration < 40) {
      metrics.patterns.push('Life feels fragmented - integration needed');
    }

    if (metrics.meaningCoherence > 70) {
      metrics.patterns.push('Living their values - actions match words');
    } else if (metrics.meaningCoherence < 40) {
      metrics.patterns.push('Values-action gap - explore what\'s blocking alignment');
    }

    if (metrics.innerPeaceIndex > 70) {
      metrics.patterns.push('Acceptance present - at peace with the journey');
    } else if (metrics.innerPeaceIndex < 40) {
      metrics.patterns.push('Striving energy strong - rest might be the lesson');
    }

    if (metrics.legacyReadiness > 60) {
      metrics.patterns.push('Long-term thinking active - building beyond today');
    }

    if (metrics.growthTrajectory > 70) {
      metrics.patterns.push('Strong growth trajectory - momentum is building');
    } else if (metrics.growthTrajectory < 30) {
      metrics.patterns.push('Growth feels stuck - new direction may be needed');
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not compute wisdom metrics');
  }

  return metrics;
}

// ============================================================================
// VALUES ALIGNMENT ANALYSIS
// ============================================================================

function analyzeValuesAlignment(
  lifeSynthesis: LifeSynthesis,
  userId: string
): ValuesAlignment {
  const alignment: ValuesAlignment = {
    statedValues: [],
    demonstratedValues: lifeSynthesis.valuesRevealed,
    alignmentGaps: [],
    coherentAreas: [],
    conflictAreas: [],
  };

  try {
    const productivityStore = getProductivityStore();
    const userData = productivityStore.getFullUserData(userId);
    const habits = userData.enhancedHabits || [];
    const activeHabits = habits.filter((h) => h.isActive && !h.isPaused);

    // Check for coherence
    if (lifeSynthesis.valuesRevealed.includes('Inner peace and presence')) {
      const meditationHabit = activeHabits.find(h => 
        h.name.toLowerCase().includes('meditat') || h.name.toLowerCase().includes('mindful')
      );
      if (meditationHabit && meditationHabit.currentStreak >= 7) {
        alignment.coherentAreas.push('Inner peace value + consistent meditation practice');
      } else if (meditationHabit && meditationHabit.currentStreak < 3) {
        alignment.conflictAreas.push('Says peace matters but meditation practice struggling');
      }
    }

    if (lifeSynthesis.valuesRevealed.includes('Physical vitality')) {
      const exerciseHabit = activeHabits.find(h => 
        h.name.toLowerCase().includes('exercise') || h.name.toLowerCase().includes('gym')
      );
      if (exerciseHabit && exerciseHabit.successRate > 0.6) {
        alignment.coherentAreas.push('Vitality value + consistent exercise');
      } else if (exerciseHabit && exerciseHabit.successRate < 0.3) {
        alignment.conflictAreas.push('Wants vitality but exercise struggling');
      }
    }

    // Check for gaps
    if (lifeSynthesis.growthPattern === 'striving' && activeHabits.length >= 5) {
      alignment.alignmentGaps.push('Many habits but low success - quantity over quality?');
    }

    if (lifeSynthesis.timeHorizon === 'short' && lifeSynthesis.lifeChapter === 'freedom-seeking') {
      alignment.conflictAreas.push('Seeks freedom but thinking short-term');
    }

    // If no values demonstrated, that's a gap
    if (lifeSynthesis.valuesRevealed.length === 0) {
      alignment.alignmentGaps.push('No clear values demonstrated through habits or goals');
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not analyze values alignment');
  }

  return alignment;
}

// ============================================================================
// EXISTENTIAL CONTEXT
// ============================================================================

function detectExistentialContext(
  lifeSynthesis: LifeSynthesis,
  handoffBriefing: HandoffBriefing | null
): ExistentialContext {
  const context: ExistentialContext = {
    mortalityAwareness: 'absent',
    legacyThinking: false,
    meaningSeekingIntensity: 'low',
    currentExistentialTheme: null,
    spiritualOpenness: 'curious',
  };

  // From handoff
  if (handoffBriefing) {
    if (handoffBriefing.depth === 'existential') {
      context.mortalityAwareness = 'present';
      context.meaningSeekingIntensity = 'high';
    }

    if (handoffBriefing.seekingWhat === 'meaning') {
      context.meaningSeekingIntensity = 'high';
      context.currentExistentialTheme = 'The search for meaning';
    } else if (handoffBriefing.seekingWhat === 'peace') {
      context.currentExistentialTheme = 'Finding acceptance';
    } else if (handoffBriefing.seekingWhat === 'acceptance') {
      context.currentExistentialTheme = 'Letting go';
      context.spiritualOpenness = 'exploring';
    }

    if (handoffBriefing.topic?.toLowerCase().includes('death') || 
        handoffBriefing.topic?.toLowerCase().includes('mortality') ||
        handoffBriefing.topic?.toLowerCase().includes('legacy')) {
      context.mortalityAwareness = 'present';
      context.legacyThinking = true;
    }
  }

  // From life chapter
  if (lifeSynthesis.lifeChapter === 'freedom-seeking') {
    context.legacyThinking = true;
    context.meaningSeekingIntensity = 'moderate';
  }

  // From values
  if (lifeSynthesis.valuesRevealed.includes('Inner peace and presence')) {
    context.spiritualOpenness = 'exploring';
  }
  if (lifeSynthesis.valuesRevealed.includes('Self-understanding')) {
    context.meaningSeekingIntensity = 'moderate';
  }

  // From growth pattern
  if (lifeSynthesis.growthPattern === 'transitioning') {
    context.currentExistentialTheme = context.currentExistentialTheme || 'Change and becoming';
  }

  return context;
}

// ============================================================================
// LIFE NARRATIVE
// ============================================================================

function buildLifeNarrative(
  lifeSynthesis: LifeSynthesis,
  valuesAlignment: ValuesAlignment
): LifeNarrative {
  const narrative: LifeNarrative = {
    pastChapter: 'Unknown',
    currentChapter: lifeSynthesis.lifeChapter,
    emergingChapter: 'Yet to be written',
    recurringThemes: [],
    transformationMoments: [],
    unfinishedBusiness: [],
  };

  // Infer past chapter from current
  const chapterProgression: Record<string, string> = {
    'foundation-building': 'survival',
    'nesting': 'foundation-building',
    'partnership-building': 'individual growth',
    'creation': 'learning',
    'freedom-seeking': 'building',
    'expansion': 'stability',
    'active-growth': 'exploration',
  };
  narrative.pastChapter = chapterProgression[lifeSynthesis.lifeChapter] || 'previous chapter';

  // Infer emerging chapter
  const nextChapter: Record<string, string> = {
    'foundation-building': 'building toward dreams',
    'nesting': 'creating home',
    'partnership-building': 'shared life',
    'creation': 'impact',
    'freedom-seeking': 'freedom',
    'expansion': 'mastery',
    'active-growth': 'integration',
  };
  narrative.emergingChapter = nextChapter[lifeSynthesis.lifeChapter] || 'the next chapter';

  // Recurring themes from values
  for (const value of lifeSynthesis.valuesRevealed) {
    if (value.includes('peace') || value.includes('presence')) {
      narrative.recurringThemes.push('The search for stillness');
    }
    if (value.includes('growth') || value.includes('learning')) {
      narrative.recurringThemes.push('Continuous becoming');
    }
    if (value.includes('vitality') || value.includes('health')) {
      narrative.recurringThemes.push('Embodiment and aliveness');
    }
  }

  // Deduplicate themes
  narrative.recurringThemes = [...new Set(narrative.recurringThemes)];

  // Unfinished business from alignment gaps
  for (const gap of valuesAlignment.alignmentGaps) {
    narrative.unfinishedBusiness.push(gap);
  }
  for (const conflict of valuesAlignment.conflictAreas) {
    narrative.unfinishedBusiness.push(conflict);
  }

  return narrative;
}

// ============================================================================
// TEAM SYNTHESIS (Cross-Domain Wisdom)
// ============================================================================

async function synthesizeTeamInsights(userId: string): Promise<TeamSynthesis> {
  const synthesis: TeamSynthesis = {
    peterPattern: null,
    mayaPattern: null,
    jordanPattern: null,
    alexPattern: null,
    integratedWisdom: null,
    crossDomainInsights: [],
  };

  try {
    const financialStore = getFinancialStore();
    await financialStore.loadUserData(userId);
    const productivityStore = getProductivityStore();
    const userData = productivityStore.getFullUserData(userId);

    // Peter's domain - what do the numbers reveal?
    const triggers = financialStore.getRecentSpendingTriggers(userId, 30);
    if (triggers.length >= 5) {
      const emotions = triggers.map((t) => t.emotion);
      const stressCount = emotions.filter(
        (e) => e === 'stressed' || e === 'anxious' || e === 'bored'
      ).length;
      if (stressCount > triggers.length * 0.4) {
        synthesis.peterPattern =
          'Money as coping mechanism - the spending reveals inner turbulence';
        synthesis.crossDomainInsights.push('Financial patterns mirror emotional state');
      } else {
        synthesis.peterPattern = 'Spending aligned with values - money serving purpose';
        synthesis.crossDomainInsights.push('Money is a tool, not a master');
      }
    }

    // Maya's domain - what do the habits reveal?
    const habits = userData.enhancedHabits || [];
    const activeHabits = habits.filter((h) => h.isActive && !h.isPaused);
    if (activeHabits.length > 0) {
      const avgSuccess =
        activeHabits.reduce((sum, h) => sum + h.successRate, 0) / activeHabits.length;
      const hasKeystone = activeHabits.some((h) => h.isKeystone && h.currentStreak >= 7);

      if (avgSuccess > 0.7 && hasKeystone) {
        synthesis.mayaPattern = 'Sustainable growth - the foundation is solid';
        synthesis.crossDomainInsights.push('Daily disciplines revealing character');
      } else if (avgSuccess < 0.4 && activeHabits.length >= 4) {
        synthesis.mayaPattern = 'Striving without self-compassion - too much, too fast';
        synthesis.crossDomainInsights.push('The body and habits speak what the mind won\'t say');
      } else {
        synthesis.mayaPattern = 'Learning the rhythm - patience is the teacher now';
      }
    }

    // Jordan's domain - what do the goals reveal?
    const goals = financialStore.getActiveSavingsGoals(userId);
    if (goals.length > 0) {
      const avgProgress =
        goals.reduce((sum, g) => sum + g.currentAmount / g.targetAmount, 0) / goals.length;
      if (avgProgress > 0.5) {
        synthesis.jordanPattern = 'Vision becoming reality - the future is being built';
        synthesis.crossDomainInsights.push('Goals reveal hopes - progress reveals commitment');
      } else if (goals.length >= 3 && avgProgress < 0.2) {
        synthesis.jordanPattern = 'Many dreams, scattered energy - focus might be needed';
        synthesis.crossDomainInsights.push('The number of goals often inverse to their depth');
      } else {
        synthesis.jordanPattern = 'Seeds planted - patience with the timeline';
      }
    }

    // Alex's domain - communication patterns
    const reflections = userData.weeklyReflections || [];
    if (reflections.length > 0) {
      const commChallenges = reflections
        .flatMap(r => r.challenges || [])
        .filter(c => c.toLowerCase().includes('conversation') || 
                     c.toLowerCase().includes('tell') ||
                     c.toLowerCase().includes('boundary'));
      
      if (commChallenges.length >= 2) {
        synthesis.alexPattern = 'Communication challenges recurring - something unsaid';
        synthesis.crossDomainInsights.push('What we don\'t say speaks louder than what we do');
      }
    }

    // Integrated wisdom - the synthesis
    if (synthesis.peterPattern && synthesis.mayaPattern) {
      const patterns = [
        synthesis.peterPattern,
        synthesis.mayaPattern,
        synthesis.jordanPattern,
      ].filter(Boolean);

      if (patterns.some((p) => p?.includes('sustainable') || p?.includes('solid') || p?.includes('reality'))) {
        synthesis.integratedWisdom =
          'The outer work mirrors inner stability. Continue compounding. Trust is being earned.';
      } else if (patterns.some((p) => p?.includes('striving') || p?.includes('turbulence') || p?.includes('scattered'))) {
        synthesis.integratedWisdom =
          'Before the doing, perhaps the being. Rest is not the opposite of growth - it is the soil.';
      } else {
        synthesis.integratedWisdom = 'The path is unfolding. Trust the process. Trust the timing.';
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not synthesize team insights');
  }

  return synthesis;
}

// ============================================================================
// PROACTIVE WISDOM TRIGGERS
// ============================================================================

function detectProactiveTriggers(
  lifeSynthesis: LifeSynthesis,
  wisdomMetrics: WisdomMetrics,
  existentialContext: ExistentialContext,
  valuesAlignment: ValuesAlignment
): WisdomTrigger[] {
  const triggers: WisdomTrigger[] = [];

  // Meaning-seeking triggers
  if (existentialContext.meaningSeekingIntensity === 'high') {
    triggers.push({
      type: 'question',
      message: 'They come seeking meaning. The question matters more than the answer.',
      priority: 'high',
      timing: 'immediate',
    });
  }

  // Values conflict triggers
  if (valuesAlignment.conflictAreas.length > 0) {
    triggers.push({
      type: 'reflection',
      message: `Values-action gap detected: ${valuesAlignment.conflictAreas[0]}`,
      priority: 'medium',
      timing: 'when_ready',
    });
  }

  // Peace-seeking triggers
  if (existentialContext.currentExistentialTheme?.includes('acceptance') || 
      existentialContext.currentExistentialTheme?.includes('Letting go')) {
    triggers.push({
      type: 'silence',
      message: 'Sometimes presence is the answer. Hold space before speaking.',
      priority: 'high',
      timing: 'immediate',
    });
  }

  // Growth pattern triggers
  if (lifeSynthesis.growthPattern === 'striving') {
    triggers.push({
      type: 'reframe',
      message: 'Striving energy present. Consider: What if you\'re already enough?',
      priority: 'medium',
      timing: 'when_ready',
    });
  }

  // Inner peace triggers
  if (wisdomMetrics.innerPeaceIndex < 40) {
    triggers.push({
      type: 'paradox',
      message: 'Peace comes not from getting what you want, but from wanting what you have.',
      priority: 'medium',
      timing: 'when_ready',
    });
  }

  // Legacy thinking triggers
  if (existentialContext.legacyThinking) {
    triggers.push({
      type: 'question',
      message: 'Legacy is on their mind. Ask: What would you want to be remembered for?',
      priority: 'low',
      timing: 'later',
    });
  }

  // Integration celebration
  if (wisdomMetrics.lifeIntegration > 70) {
    triggers.push({
      type: 'reflection',
      message: 'Life areas integrating beautifully. Name this. Celebrate this.',
      priority: 'medium',
      timing: 'when_ready',
    });
  }

  // Story opportunity
  if (lifeSynthesis.compoundingAreas.length >= 2) {
    triggers.push({
      type: 'story',
      message: 'Compound growth happening. Share a story about patience and time.',
      priority: 'low',
      timing: 'later',
    });
  }

  return triggers;
}

// ============================================================================
// DEEP QUESTIONS TO EXPLORE
// ============================================================================

function generateDeepQuestions(
  lifeSynthesis: LifeSynthesis,
  existentialContext: ExistentialContext,
  handoffBriefing: HandoffBriefing | null
): string[] {
  const questions: string[] = [];

  // Based on life chapter
  switch (lifeSynthesis.lifeChapter) {
    case 'freedom-seeking':
      questions.push(
        'What does freedom actually mean to you? Not the absence of constraint - the presence of what?'
      );
      questions.push('When you imagine being free, what are you free TO do?');
      break;
    case 'nesting':
      questions.push('Home is not just walls. What feeling are you really trying to create?');
      questions.push('What would make a place feel like sanctuary?');
      break;
    case 'partnership-building':
      questions.push(
        'In partnership, what do you hope to become together that neither could alone?'
      );
      questions.push('What are you bringing to this partnership? What are you hoping to receive?');
      break;
    case 'foundation-building':
      questions.push('Security is a feeling. What would it take to feel secure - truly, deeply?');
      questions.push('What would you build if you knew the foundation was solid?');
      break;
    case 'creation':
      questions.push('What are you trying to bring into the world that doesn\'t exist yet?');
      questions.push('What would you create if you knew it could not fail?');
      break;
    case 'expansion':
      questions.push('What are you growing toward? What are you growing out of?');
      break;
    default:
      questions.push(
        'When you imagine yourself five years from now, feeling fulfilled - what are you doing? Who are you with?'
      );
  }

  // Based on existential context
  if (existentialContext.mortalityAwareness !== 'absent') {
    questions.push('If you had one year left, what would you do differently starting tomorrow?');
  }

  if (existentialContext.currentExistentialTheme) {
    if (existentialContext.currentExistentialTheme.includes('meaning')) {
      questions.push('Meaning is not found. It is created. What are you creating?');
    } else if (existentialContext.currentExistentialTheme.includes('acceptance')) {
      questions.push('What would you have to accept to find peace? What are you resisting?');
    } else if (existentialContext.currentExistentialTheme.includes('Letting go')) {
      questions.push('What are you holding onto that is ready to be released?');
    }
  }

  // Based on handoff seeking
  if (handoffBriefing) {
    if (handoffBriefing.seekingWhat === 'clarity') {
      questions.push(
        'Clarity comes not from thinking harder but from getting quiet. What does your silence tell you?'
      );
    } else if (handoffBriefing.seekingWhat === 'perspective') {
      questions.push('If you could see this situation from a mountaintop, what would you notice?');
    }
  }

  // Universal questions for Nayan
  if (questions.length < 3) {
    questions.push('What would you do if you knew you could not fail?');
    questions.push('What are you tolerating that you have outgrown?');
    questions.push('What truth are you avoiding?');
  }

  // Limit to most relevant
  return questions.slice(0, 4);
}

// ============================================================================
// HANDOFF CONTEXT ANALYSIS
// ============================================================================

function analyzeHandoffForNayan(): HandoffBriefing | null {
  const handoffContext = getHandoffContext();
  if (!handoffContext) return null;

  const briefing: HandoffBriefing = {
    topic: handoffContext.topics?.[0] || 'wisdom',
    seekingWhat: 'general',
    depth: 'medium',
    timeContext: null,
    emotionalUndercurrent: null,
    fromPersona: null, // Would be set if handoff had source persona info
  };

  const topics = handoffContext.topics || [];

  for (const topic of topics) {
    const lower = topic.toLowerCase();

    // What are they seeking?
    if (lower.includes('meaning') || lower.includes('purpose') || lower.includes('why')) {
      briefing.seekingWhat = 'meaning';
      briefing.depth = 'existential';
    } else if (lower.includes('peace') || lower.includes('calm') || lower.includes('rest')) {
      briefing.seekingWhat = 'peace';
    } else if (lower.includes('accept') || lower.includes('let go') || lower.includes('release')) {
      briefing.seekingWhat = 'acceptance';
      briefing.depth = 'existential';
    } else if (lower.includes('perspective') || lower.includes('big picture')) {
      briefing.seekingWhat = 'perspective';
    } else if (lower.includes('clarity') || lower.includes('confused') || lower.includes('lost')) {
      briefing.seekingWhat = 'clarity';
    }

    // Time context
    if (lower.includes('retire') || lower.includes('decade') || lower.includes('lifetime') || lower.includes('legacy')) {
      briefing.timeContext = 'long-term thinking';
    } else if (lower.includes('crisis') || lower.includes('urgent') || lower.includes('now')) {
      briefing.timeContext = 'present moment';
    }

    // Depth signals
    if (
      lower.includes('death') ||
      lower.includes('mortality') ||
      lower.includes('meaning of life') ||
      lower.includes('what\'s it all for')
    ) {
      briefing.depth = 'existential';
    }

    // Emotional undercurrent
    if (lower.includes('scared') || lower.includes('afraid') || lower.includes('fear')) {
      briefing.emotionalUndercurrent = 'fear';
    } else if (lower.includes('sad') || lower.includes('grief') || lower.includes('loss')) {
      briefing.emotionalUndercurrent = 'grief';
    } else if (lower.includes('stuck') || lower.includes('trapped')) {
      briefing.emotionalUndercurrent = 'stagnation';
    }
  }

  // Emotional state from handoff
  if (handoffContext.emotionalState) {
    briefing.emotionalUndercurrent = briefing.emotionalUndercurrent || handoffContext.emotionalState;
  }

  return briefing;
}

// ============================================================================
// BUILD BRIEFING
// ============================================================================

async function buildNayanBriefing(userId: string): Promise<NayanInsightBriefing> {
  const handoffBriefing = analyzeHandoffForNayan();

  const [lifeSynthesis, teamSynthesis] = await Promise.all([
    synthesizeLifeContext(userId),
    synthesizeTeamInsights(userId),
  ]);

  const valuesAlignment = analyzeValuesAlignment(lifeSynthesis, userId);
  const wisdomMetrics = await computeWisdomMetrics(userId, lifeSynthesis, valuesAlignment);
  const existentialContext = detectExistentialContext(lifeSynthesis, handoffBriefing);
  const lifeNarrative = buildLifeNarrative(lifeSynthesis, valuesAlignment);
  const proactiveTriggers = detectProactiveTriggers(lifeSynthesis, wisdomMetrics, existentialContext, valuesAlignment);
  const wisdomOpportunities = detectWisdomOpportunities(lifeSynthesis, teamSynthesis, wisdomMetrics);
  const deepQuestions = generateDeepQuestions(lifeSynthesis, existentialContext, handoffBriefing);

  return {
    lifeSynthesis,
    wisdomMetrics,
    valuesAlignment,
    wisdomOpportunities,
    deepQuestions,
    teamSynthesis,
    existentialContext,
    proactiveTriggers,
    lifeNarrative,
  };
}

// ============================================================================
// WISDOM OPPORTUNITIES
// ============================================================================

function detectWisdomOpportunities(
  lifeSynthesis: LifeSynthesis,
  teamSynthesis: TeamSynthesis,
  wisdomMetrics: WisdomMetrics
): string[] {
  const opportunities: string[] = [];

  // Growth pattern wisdom
  if (lifeSynthesis.growthPattern === 'striving') {
    opportunities.push(
      '🌿 Pattern: Striving mode detected. "You cannot force a flower to bloom by pulling on its petals."'
    );
  } else if (lifeSynthesis.growthPattern === 'resting') {
    opportunities.push(
      '🌙 Pattern: Fallow season. The seed in darkness is not lost - it is becoming.'
    );
  } else if (lifeSynthesis.growthPattern === 'integrating') {
    opportunities.push(
      '☀️ Pattern: Integration phase. The habits are becoming identity. Beautiful.'
    );
  }

  // Compounding wisdom
  if (lifeSynthesis.compoundingAreas.length >= 2) {
    opportunities.push(
      '📈 Multiple areas compounding. Einstein called compound interest the eighth wonder. They are living it.'
    );
  }

  // Time horizon wisdom
  if (lifeSynthesis.timeHorizon === 'short') {
    opportunities.push(
      '⏰ Short time horizon focus. Sometimes urgency is wisdom. Sometimes it is fear wearing a productive mask.'
    );
  } else if (lifeSynthesis.timeHorizon === 'long') {
    opportunities.push(
      '🌳 Long-term thinking present. "The best time to plant a tree was 20 years ago. The second best time is now."'
    );
  }

  // Metrics-based wisdom
  if (wisdomMetrics.meaningCoherence < 50) {
    opportunities.push(
      '🔮 Values-action gap. "The space between who we are and who we want to be is where wisdom lives."'
    );
  }

  if (wisdomMetrics.innerPeaceIndex > 70) {
    opportunities.push(
      '🕊️ Inner peace present. This is rare. Name it. Honor it. It didn\'t come by accident.'
    );
  }

  // Team synthesis wisdom
  if (teamSynthesis.integratedWisdom) {
    opportunities.push(`🔮 Integrated insight: ${teamSynthesis.integratedWisdom}`);
  }

  return opportunities;
}

// ============================================================================
// FORMAT BRIEFING
// ============================================================================

function formatNayanBriefing(
  briefing: NayanInsightBriefing,
  handoffBriefing: HandoffBriefing | null,
  turnCount: number
): string[] {
  const sections: string[] = [];

  sections.push(`[NAYAN'S WISDOM BRIEFING - Turn ${turnCount}]`);

  // Handoff context
  if (handoffBriefing) {
    sections.push('\n=== WHO COMES TO YOU ===');
    sections.push(`Seeking: ${handoffBriefing.seekingWhat}`);
    sections.push(`Depth: ${handoffBriefing.depth}`);
    if (handoffBriefing.fromPersona) {
      sections.push(`From: ${handoffBriefing.fromPersona}`);
    }
    if (handoffBriefing.timeContext) {
      sections.push(`Time context: ${handoffBriefing.timeContext}`);
    }
    if (handoffBriefing.emotionalUndercurrent) {
      sections.push(`Emotional undercurrent: ${handoffBriefing.emotionalUndercurrent}`);
    }
  }

  // Wisdom Metrics Dashboard
  const { wisdomMetrics } = briefing;
  sections.push('\n=== 🕉️ WISDOM METRICS ===');
  sections.push(`• Life Integration: ${wisdomMetrics.lifeIntegration}/100`);
  sections.push(`• Meaning Coherence: ${wisdomMetrics.meaningCoherence}/100`);
  sections.push(`• Legacy Readiness: ${wisdomMetrics.legacyReadiness}/100`);
  sections.push(`• Inner Peace Index: ${wisdomMetrics.innerPeaceIndex}/100`);
  sections.push(`• Growth Trajectory: ${wisdomMetrics.growthTrajectory}/100`);
  if (wisdomMetrics.patterns.length > 0) {
    sections.push(`PATTERNS: ${wisdomMetrics.patterns.join('; ')}`);
  }

  // Existential context
  if (briefing.existentialContext.currentExistentialTheme) {
    sections.push('\n=== 💫 EXISTENTIAL CONTEXT ===');
    sections.push(`Theme: ${briefing.existentialContext.currentExistentialTheme}`);
    sections.push(`Meaning-seeking: ${briefing.existentialContext.meaningSeekingIntensity}`);
    sections.push(`Mortality awareness: ${briefing.existentialContext.mortalityAwareness}`);
    sections.push(`Spiritual openness: ${briefing.existentialContext.spiritualOpenness}`);
  }

  // Life synthesis
  const { lifeSynthesis } = briefing;
  sections.push('\n=== 📖 THE LIFE SYNTHESIS ===');
  sections.push(`• Life chapter: ${lifeSynthesis.lifeChapter}`);
  if (lifeSynthesis.dominantTheme) {
    sections.push(`• Dominant theme: ${lifeSynthesis.dominantTheme}`);
  }
  sections.push(`• Growth pattern: ${lifeSynthesis.growthPattern}`);
  sections.push(`• Time horizon: ${lifeSynthesis.timeHorizon}`);
  sections.push(`• Season: ${lifeSynthesis.seasonOfLife}`);
  if (lifeSynthesis.compoundingAreas.length > 0) {
    sections.push(`• Compounding: ${lifeSynthesis.compoundingAreas.join(', ')}`);
  }
  if (lifeSynthesis.valuesRevealed.length > 0) {
    sections.push(`• Values revealed: ${lifeSynthesis.valuesRevealed.join(', ')}`);
  }

  // Life Narrative
  const { lifeNarrative } = briefing;
  sections.push('\n=== 📜 LIFE NARRATIVE ===');
  sections.push(`• Past chapter: ${lifeNarrative.pastChapter}`);
  sections.push(`• Current chapter: ${lifeNarrative.currentChapter}`);
  sections.push(`• Emerging: ${lifeNarrative.emergingChapter}`);
  if (lifeNarrative.recurringThemes.length > 0) {
    sections.push(`• Recurring themes: ${lifeNarrative.recurringThemes.join(', ')}`);
  }
  if (lifeNarrative.unfinishedBusiness.length > 0) {
    sections.push(`• Unfinished business: ${lifeNarrative.unfinishedBusiness.slice(0, 2).join('; ')}`);
  }

  // Values Alignment
  if (briefing.valuesAlignment.coherentAreas.length > 0 || briefing.valuesAlignment.conflictAreas.length > 0) {
    sections.push('\n=== ⚖️ VALUES ALIGNMENT ===');
    briefing.valuesAlignment.coherentAreas.forEach(a => sections.push(`✅ ${a}`));
    briefing.valuesAlignment.conflictAreas.forEach(c => sections.push(`⚠️ ${c}`));
  }

  // Proactive triggers (high priority)
  const highTriggers = briefing.proactiveTriggers.filter(t => t.priority === 'high');
  if (highTriggers.length > 0) {
    sections.push('\n=== ⚡ IMMEDIATE WISDOM ===');
    highTriggers.forEach(t => sections.push(`• [${t.type.toUpperCase()}] ${t.message}`));
  }

  // Team synthesis
  const { teamSynthesis } = briefing;
  sections.push('\n=== 🤝 WHAT THE TEAM SEES ===');
  if (teamSynthesis.peterPattern) {
    sections.push(`• Peter (numbers): ${teamSynthesis.peterPattern}`);
  }
  if (teamSynthesis.mayaPattern) {
    sections.push(`• Maya (habits): ${teamSynthesis.mayaPattern}`);
  }
  if (teamSynthesis.jordanPattern) {
    sections.push(`• Jordan (goals): ${teamSynthesis.jordanPattern}`);
  }
  if (teamSynthesis.alexPattern) {
    sections.push(`• Alex (communication): ${teamSynthesis.alexPattern}`);
  }
  if (teamSynthesis.crossDomainInsights.length > 0) {
    sections.push(`Cross-domain: ${teamSynthesis.crossDomainInsights.join('; ')}`);
  }

  // Wisdom opportunities
  if (briefing.wisdomOpportunities.length > 0) {
    sections.push('\n=== 🌟 WISDOM OPPORTUNITIES ===');
    briefing.wisdomOpportunities.forEach((opp) => sections.push(`${opp}`));
  }

  // Deep questions
  if (briefing.deepQuestions.length > 0) {
    sections.push('\n=== ❓ QUESTIONS TO HOLD ===');
    briefing.deepQuestions.forEach((q) => sections.push(`• ${q}`));
  }

  // Nayan's approach (first turn only)
  if (turnCount === 0 || turnCount === 1) {
    sections.push('\n=== YOUR WAY ===');
    sections.push('• Silence is a gift. Use it generously.');
    sections.push('• Stories are more powerful than advice.');
    sections.push('• Paradox is not a problem to solve but a truth to hold.');
    sections.push('• The question is often more important than the answer.');
    sections.push("• You don't need to fix anything. Your presence is enough.");
  }

  sections.push('\n[Remember: They came to you for a reason. Trust the unfolding.]');

  return sections;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildNayanWisdomInsightsContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const { services, userData } = input;

  // Only for Nayan
  const currentPersona = (services as { personaId?: string })?.personaId || '';
  const isNayan = [
    'nayan',
    'nayan-patel',
    'guru',
    'mystic',
    'spiritual-guide',
    'lifetime-advisor',
    'sage',
    'wisdom',
  ].includes(currentPersona.toLowerCase());

  if (!isNayan) return injections;

  const userId = services?.userId || 'anonymous';
  if (userId === 'anonymous') return injections;

  const turnCount = userData?.turnCount ?? 0;
  const sessionId = services?.sessionId || userId;
  const session = getSession(sessionId);

  const handoffBriefing = analyzeHandoffForNayan();
  const isHandoff = handoffBriefing !== null;

  // Inject on first turn, handoff, or every 15 turns (Nayan is more patient)
  const shouldInject =
    turnCount === 0 ||
    isHandoff ||
    (turnCount > 0 && turnCount % 15 === 0 && turnCount !== session.briefingTurn);

  if (!shouldInject) return injections;

  try {
    const briefing = await buildNayanBriefing(userId);
    const briefingLines = formatNayanBriefing(briefing, handoffBriefing, turnCount);
    
    // Get superhuman context (narrative, values, dreams, seasonal)
    const superhumanContext = await getSuperhuman(userId, 'nayan');
    if (superhumanContext) {
      briefingLines.push('\n' + superhumanContext);
    }
    
    const content = briefingLines.join('\n');

    if (isHandoff) {
      injections.push(
        createHighInjection('nayan_handoff_briefing', content, {
          category: 'persona-wisdom',
          confidence: 0.9,
        })
      );
      log.info({ userId, seeking: handoffBriefing?.seekingWhat }, '🕉️ Nayan loaded with handoff briefing');
    } else if (turnCount === 0) {
      injections.push(
        createStandardInjection('nayan_initial_briefing', content, {
          category: 'persona-wisdom',
          confidence: 0.8,
        })
      );
      log.info(
        { userId, chapter: briefing.lifeSynthesis.lifeChapter, peace: briefing.wisdomMetrics.innerPeaceIndex },
        '🕉️ Nayan loaded with wisdom briefing'
      );
    } else {
      injections.push(
        createHintInjection('nayan_refresh_briefing', content, {
          category: 'persona-wisdom',
        })
      );
    }

    session.briefingTurn = turnCount;

    // Nayan's mindset reminder
    if (turnCount === 0 || isHandoff) {
      injections.push(
        createHintInjection(
          'nayan_mindset',
          "[NAYAN'S PRESENCE: You are the still point in the turning world. " +
            'You see the whole arc of their life - past, present, possibility. ' +
            'Questions matter more than answers. Paradox is wisdom. ' +
            'Silence is a gift. Trust the timing of everything.]',
          { category: 'persona-identity' }
        )
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build Nayan wisdom briefing');
  }

  return injections;
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'nayan-wisdom-insights',
  description:
    'Loads Nayan with deep wisdom - life synthesis, values alignment, existential context, and the big picture',
  priority: 45,
  category: BuilderCategory.PERSONA,
  build: buildNayanWisdomInsightsContext,
});

export { buildNayanWisdomInsightsContext };
