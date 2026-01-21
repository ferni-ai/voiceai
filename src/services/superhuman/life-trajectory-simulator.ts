/**
 * Life Trajectory Simulator - Better Than Human Service
 *
 * What no human friend can do: Run Monte Carlo simulations on life paths,
 * optimize timing using temporal psychology, and apply decision science
 * to life planning with computational precision.
 *
 * Research Foundation:
 * - Monte Carlo Simulation for life path scenarios
 * - Fresh Start Effect (Dai, Milkman, Riis)
 * - Temporal Landmarks and goal pursuit
 * - Peak-End Rule (Kahneman)
 * - Optimal Stopping Theory
 * - Regret Minimization Framework
 *
 * @module services/superhuman/life-trajectory-simulator
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore, getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'life-trajectory-simulator' });

// ============================================================================
// TYPES
// ============================================================================

export type LifeDecisionCategory =
  | 'career'
  | 'relationship'
  | 'location'
  | 'financial'
  | 'education'
  | 'health'
  | 'family';

export type TemporalLandmarkType =
  | 'birthday'
  | 'new_year'
  | 'new_month'
  | 'monday'
  | 'anniversary'
  | 'season_change'
  | 'graduation'
  | 'milestone_birthday'
  | 'life_event';

export type ScenarioOutcome =
  | 'very_positive'
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'very_negative';

export interface LifeScenario {
  id: string;
  name: string;
  description: string;
  category: LifeDecisionCategory;

  // Key variables
  variables: Array<{
    name: string;
    currentValue: number | string;
    possibleValues: Array<{ value: number | string; probability: number }>;
  }>;

  // Outcomes
  outcomeDistribution: {
    veryPositive: number;
    positive: number;
    neutral: number;
    negative: number;
    veryNegative: number;
  };

  // Dependencies
  dependsOn: string[]; // Other scenario IDs
  affectsValues: string[]; // Life values affected
}

export interface SimulationResult {
  id: string;
  userId: string;
  scenario: LifeScenario;

  // Monte Carlo results
  iterations: number;
  outcomes: Record<ScenarioOutcome, number>; // Count per outcome
  expectedValue: number; // -2 to +2 scale
  variance: number;

  // Percentiles
  percentile10: number;
  percentile50: number;
  percentile90: number;

  // Risk analysis
  downwardRisk: number; // Probability of negative or worse
  upwardPotential: number; // Probability of positive or better

  // Recommendation
  recommendation: 'strongly_consider' | 'consider' | 'neutral' | 'caution' | 'avoid';
  rationale: string;

  simulatedAt: number;
}

export interface FreshStartEffect {
  landmark: TemporalLandmarkType;
  date: Date;
  daysUntil: number;
  motivationalBoost: number; // 0-1, estimated effectiveness
  bestFor: string[]; // Types of changes this landmark suits
  suggestion: string;
}

export interface PeakEndOptimization {
  eventName: string;
  currentPeaks: string[];
  currentEnding: string;

  // Optimization suggestions
  suggestedPeaks: Array<{
    moment: string;
    timing: 'early' | 'middle' | 'late';
    emotionalIntensity: number;
  }>;
  suggestedEnding: string;

  // Memory impact prediction
  predictedMemoryPositivity: number; // 0-1
  improvementFromBaseline: number; // Percentage improvement
}

export interface RegretMinimizationAnalysis {
  decision: string;
  options: string[];

  // For each option
  optionAnalysis: Array<{
    option: string;
    regretIfChosen: number; // Estimated regret if chosen
    regretIfNotChosen: number; // Estimated regret if NOT chosen (missed opportunity)
    netRegretRisk: number;
    eighty_year_old_perspective: string;
  }>;

  recommendation: string;
  minimumRegretOption: string;
}

export interface TemporalLandmark {
  type: TemporalLandmarkType;
  date: Date;
  significance: 'high' | 'medium' | 'low';
  freshStartPotential: number; // 0-1
  description: string;
}

export interface LifeTrajectoryProfile {
  userId: string;

  // Current life stage
  currentLifeStage: string;
  majorUpcomingDecisions: string[];

  // Simulation history
  simulations: SimulationResult[];

  // Temporal landmarks
  personalLandmarks: TemporalLandmark[];

  // Values for decision-making
  coreValues: string[];
  riskTolerance: 'low' | 'moderate' | 'high';

  // Life chapters
  currentChapter: {
    name: string;
    startedAt: number;
    keyThemes: string[];
  };

  updatedAt: number;
}

// ============================================================================
// MONTE CARLO SIMULATION
// ============================================================================

/**
 * Run Monte Carlo simulation on a life scenario.
 */
export function runMonteCarloSimulation(
  scenario: LifeScenario,
  iterations: number = 1000,
  userId: string
): SimulationResult {
  const outcomes: Record<ScenarioOutcome, number> = {
    very_positive: 0,
    positive: 0,
    neutral: 0,
    negative: 0,
    very_negative: 0,
  };

  const outcomeValues: number[] = [];
  const valueMap: Record<ScenarioOutcome, number> = {
    very_positive: 2,
    positive: 1,
    neutral: 0,
    negative: -1,
    very_negative: -2,
  };

  // Run simulations
  for (let i = 0; i < iterations; i++) {
    const outcome = simulateOutcome(scenario);
    outcomes[outcome]++;
    outcomeValues.push(valueMap[outcome]);
  }

  // Calculate statistics
  const expectedValue = outcomeValues.reduce((a, b) => a + b, 0) / iterations;
  const variance =
    outcomeValues.reduce((sum, v) => sum + Math.pow(v - expectedValue, 2), 0) / iterations;

  // Sort for percentiles
  outcomeValues.sort((a, b) => a - b);
  const percentile10 = outcomeValues[Math.floor(iterations * 0.1)];
  const percentile50 = outcomeValues[Math.floor(iterations * 0.5)];
  const percentile90 = outcomeValues[Math.floor(iterations * 0.9)];

  // Risk analysis
  const downwardRisk = (outcomes.negative + outcomes.very_negative) / iterations;
  const upwardPotential = (outcomes.positive + outcomes.very_positive) / iterations;

  // Generate recommendation
  const { recommendation, rationale } = generateRecommendation(
    expectedValue,
    variance,
    downwardRisk,
    upwardPotential,
    scenario.category
  );

  return {
    id: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    scenario,
    iterations,
    outcomes,
    expectedValue,
    variance,
    percentile10,
    percentile50,
    percentile90,
    downwardRisk,
    upwardPotential,
    recommendation,
    rationale,
    simulatedAt: Date.now(),
  };
}

function simulateOutcome(scenario: LifeScenario): ScenarioOutcome {
  const random = Math.random();
  const dist = scenario.outcomeDistribution;

  let cumulative = 0;

  cumulative += dist.veryPositive;
  if (random < cumulative) return 'very_positive';

  cumulative += dist.positive;
  if (random < cumulative) return 'positive';

  cumulative += dist.neutral;
  if (random < cumulative) return 'neutral';

  cumulative += dist.negative;
  if (random < cumulative) return 'negative';

  return 'very_negative';
}

function generateRecommendation(
  expectedValue: number,
  variance: number,
  downwardRisk: number,
  upwardPotential: number,
  category: LifeDecisionCategory
): { recommendation: SimulationResult['recommendation']; rationale: string } {
  // Risk-adjusted assessment
  const riskAdjustedValue = expectedValue - variance * 0.5;

  if (riskAdjustedValue > 1.0 && downwardRisk < 0.15) {
    return {
      recommendation: 'strongly_consider',
      rationale: `High expected value (${expectedValue.toFixed(2)}) with low downward risk (${(downwardRisk * 100).toFixed(0)}%)`,
    };
  }

  if (riskAdjustedValue > 0.5 && downwardRisk < 0.25) {
    return {
      recommendation: 'consider',
      rationale: `Positive expected value with manageable risk profile`,
    };
  }

  if (riskAdjustedValue > 0 || upwardPotential > 0.6) {
    return {
      recommendation: 'neutral',
      rationale: `Balanced risk-reward profile. Consider personal factors beyond the numbers.`,
    };
  }

  if (downwardRisk > 0.4) {
    return {
      recommendation: 'caution',
      rationale: `Significant downward risk (${(downwardRisk * 100).toFixed(0)}%). Ensure you can handle worst-case scenarios.`,
    };
  }

  if (riskAdjustedValue < -0.5) {
    return {
      recommendation: 'avoid',
      rationale: `Negative expected value with unfavorable risk profile`,
    };
  }

  return {
    recommendation: 'neutral',
    rationale: 'Mixed signals. Gather more information before deciding.',
  };
}

// ============================================================================
// FRESH START EFFECT
// ============================================================================

/**
 * Identify upcoming fresh start opportunities.
 * Based on research by Dai, Milkman, & Riis on temporal landmarks.
 */
export function identifyFreshStarts(currentDate: Date = new Date()): FreshStartEffect[] {
  const freshStarts: FreshStartEffect[] = [];

  // Next Monday
  const daysUntilMonday = (8 - currentDate.getDay()) % 7 || 7;
  const nextMonday = new Date(currentDate);
  nextMonday.setDate(currentDate.getDate() + daysUntilMonday);

  freshStarts.push({
    landmark: 'monday',
    date: nextMonday,
    daysUntil: daysUntilMonday,
    motivationalBoost: 0.3,
    bestFor: ['habits', 'routines', 'small changes'],
    suggestion: `Monday is a natural reset point. Great for starting new habits or routines.`,
  });

  // First of next month
  const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  const daysUntilMonth = Math.floor(
    (nextMonth.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  freshStarts.push({
    landmark: 'new_month',
    date: nextMonth,
    daysUntil: daysUntilMonth,
    motivationalBoost: 0.5,
    bestFor: ['financial goals', 'fitness goals', 'monthly challenges'],
    suggestion: `The first of the month provides mental "clean slate" energy.`,
  });

  // January 1 (if within 3 months)
  const nextYear = new Date(currentDate.getFullYear() + 1, 0, 1);
  const daysUntilNewYear = Math.floor(
    (nextYear.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilNewYear <= 90) {
    freshStarts.push({
      landmark: 'new_year',
      date: nextYear,
      daysUntil: daysUntilNewYear,
      motivationalBoost: 0.8,
      bestFor: ['major life changes', 'career shifts', 'relationship decisions'],
      suggestion: `New Year is the most powerful fresh start. Save big changes for this moment.`,
    });
  }

  // Season change (next equinox/solstice)
  const seasonDates = getNextSeasonChange(currentDate);
  freshStarts.push({
    landmark: 'season_change',
    date: seasonDates.date,
    daysUntil: seasonDates.daysUntil,
    motivationalBoost: 0.4,
    bestFor: ['lifestyle changes', 'routine adjustments', 'energy shifts'],
    suggestion: `Season changes are natural transition points. ${seasonDates.season} begins ${seasonDates.date.toLocaleDateString()}.`,
  });

  // Sort by days until
  freshStarts.sort((a, b) => a.daysUntil - b.daysUntil);

  return freshStarts;
}

function getNextSeasonChange(currentDate: Date): { date: Date; daysUntil: number; season: string } {
  const year = currentDate.getFullYear();
  const seasonDates = [
    { date: new Date(year, 2, 20), season: 'Spring' },
    { date: new Date(year, 5, 21), season: 'Summer' },
    { date: new Date(year, 8, 22), season: 'Fall' },
    { date: new Date(year, 11, 21), season: 'Winter' },
    { date: new Date(year + 1, 2, 20), season: 'Spring' },
  ];

  for (const { date, season } of seasonDates) {
    if (date > currentDate) {
      const daysUntil = Math.floor(
        (date.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      return { date, daysUntil, season };
    }
  }

  // Return next year's spring as fallback
  const fallbackDate = seasonDates[4].date;
  const fallbackDaysUntil = Math.floor(
    (fallbackDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  return { date: fallbackDate, daysUntil: fallbackDaysUntil, season: seasonDates[4].season };
}

// ============================================================================
// PEAK-END RULE OPTIMIZATION
// ============================================================================

/**
 * Optimize an event for better remembered experience using Peak-End Rule.
 * Kahneman's research: We remember experiences based on their peak intensity and ending.
 */
export function optimizeForPeakEnd(event: {
  name: string;
  duration: string;
  segments: Array<{ name: string; currentRating: number; canModify: boolean }>;
  currentEnding: string;
}): PeakEndOptimization {
  const { name, segments, currentEnding } = event;

  // Identify current peaks
  const sortedSegments = [...segments].sort((a, b) => b.currentRating - a.currentRating);
  const currentPeaks = sortedSegments.slice(0, 2).map((s) => s.name);

  // Suggest peak placements
  const suggestedPeaks: PeakEndOptimization['suggestedPeaks'] = [];

  // One peak early (anticipation builder)
  suggestedPeaks.push({
    moment: 'Create an early "wow" moment to set positive tone',
    timing: 'early',
    emotionalIntensity: 0.7,
  });

  // One peak in the middle (keeps engagement)
  suggestedPeaks.push({
    moment: 'Plan a highlight for the middle section',
    timing: 'middle',
    emotionalIntensity: 0.85,
  });

  // Strong ending
  const suggestedEnding = generateStrongEnding(name);

  // Calculate predicted memory positivity
  const avgRating = segments.reduce((sum, s) => sum + s.currentRating, 0) / segments.length;
  const peakRating = Math.max(...segments.map((s) => s.currentRating));
  const endingRating = segments[segments.length - 1]?.currentRating || avgRating;

  // Peak-End formula: memory ≈ (peak + end) / 2
  const currentMemory = (peakRating + endingRating) / 2 / 10;
  const optimizedMemory = Math.min(1, currentMemory + 0.15); // Assume 15% improvement potential

  return {
    eventName: name,
    currentPeaks,
    currentEnding,
    suggestedPeaks,
    suggestedEnding,
    predictedMemoryPositivity: optimizedMemory,
    improvementFromBaseline: ((optimizedMemory - currentMemory) / currentMemory) * 100,
  };
}

function generateStrongEnding(eventName: string): string {
  const endings = [
    'End with a memorable gesture or gift that people take home',
    'Close with heartfelt acknowledgments and a forward-looking statement',
    'Plan a "golden moment" for the final 10 minutes',
    'Save a surprise element for the very end',
    'End on a high note - better to end while people want more',
  ];

  return endings[Math.floor(Math.random() * endings.length)];
}

// ============================================================================
// REGRET MINIMIZATION FRAMEWORK
// ============================================================================

/**
 * Apply Jeff Bezos's regret minimization framework to a decision.
 */
export function analyzeRegretMinimization(decision: {
  description: string;
  options: string[];
  reversibility: Record<string, boolean>;
  timeHorizon: 'short' | 'medium' | 'long';
}): RegretMinimizationAnalysis {
  const { description, options, reversibility, timeHorizon } = decision;

  const optionAnalysis: RegretMinimizationAnalysis['optionAnalysis'] = [];

  for (const option of options) {
    const isReversible = reversibility[option] ?? true;

    // Estimate regret if chosen (mostly affects irreversible choices)
    const regretIfChosen = isReversible ? 0.2 : 0.5;

    // Estimate regret if NOT chosen (missed opportunity)
    // Longer time horizons = more regret for inaction
    const timeHorizonMultiplier =
      timeHorizon === 'long' ? 1.5 : timeHorizon === 'medium' ? 1.0 : 0.7;

    const regretIfNotChosen = isReversible
      ? 0.3 * timeHorizonMultiplier
      : 0.6 * timeHorizonMultiplier;

    const netRegretRisk = regretIfChosen - regretIfNotChosen;

    const eighty_year_old_perspective = generate80YearOldPerspective(option, isReversible);

    optionAnalysis.push({
      option,
      regretIfChosen,
      regretIfNotChosen,
      netRegretRisk,
      eighty_year_old_perspective,
    });
  }

  // Find minimum regret option (lowest net regret risk)
  optionAnalysis.sort((a, b) => a.netRegretRisk - b.netRegretRisk);
  const minimumRegretOption = optionAnalysis[0].option;

  return {
    decision: description,
    options,
    optionAnalysis,
    recommendation:
      `Based on regret minimization, consider "${minimumRegretOption}" - ` +
      `at 80, you're more likely to regret inaction than action on reversible decisions.`,
    minimumRegretOption,
  };
}

function generate80YearOldPerspective(option: string, isReversible: boolean): string {
  if (isReversible) {
    return `At 80, I probably won't remember the details of "${option}" - I'll remember if I lived fully and took chances.`;
  } else {
    return `"${option}" is a significant choice. At 80, I'll remember the courage it took to make this decision either way.`;
  }
}

// ============================================================================
// OPTIMAL STOPPING (When to Decide)
// ============================================================================

/**
 * Apply optimal stopping theory to determine when to stop searching and decide.
 * Based on the 37% rule from secretary problem research.
 */
export function calculateOptimalStopPoint(search: {
  totalOptionsExpected: number;
  optionsSeen: number;
  bestSoFarScore: number;
  averageScore: number;
  canGoBack: boolean;
}): {
  shouldStop: boolean;
  explorePhaseComplete: boolean;
  optimalStopPoint: number;
  recommendation: string;
  confidenceInCurrentBest: number;
} {
  const { totalOptionsExpected, optionsSeen, bestSoFarScore, averageScore, canGoBack } = search;

  // 37% rule: explore first 37% without choosing, then choose first option better than all explored
  const explorePhaseSize = Math.floor(totalOptionsExpected * 0.37);
  const explorePhaseComplete = optionsSeen >= explorePhaseSize;

  // Confidence increases as we see more options
  const confidenceInCurrentBest = Math.min(0.95, 0.5 + (optionsSeen / totalOptionsExpected) * 0.5);

  // Should stop if:
  // 1. Past explore phase
  // 2. Current best is significantly above average
  // 3. Haven't seen most options yet (diminishing returns)
  const aboveAverage = bestSoFarScore > averageScore * 1.2;
  const pastExplore = optionsSeen > explorePhaseSize;
  const notTooLate = optionsSeen < totalOptionsExpected * 0.8;

  const shouldStop = pastExplore && aboveAverage && notTooLate;

  let recommendation: string;
  if (optionsSeen < explorePhaseSize) {
    recommendation = `Keep exploring. You've seen ${optionsSeen}/${explorePhaseSize} of your explore phase. Don't commit yet.`;
  } else if (shouldStop) {
    recommendation = `Consider committing now. You've passed the explore phase and found something ${Math.round((bestSoFarScore / averageScore - 1) * 100)}% above average.`;
  } else if (optionsSeen >= totalOptionsExpected * 0.8) {
    recommendation = `You're running low on options. Seriously consider your current best before it's too late.`;
  } else {
    recommendation = `You can continue exploring, but be ready to commit when you find something good.`;
  }

  return {
    shouldStop,
    explorePhaseComplete,
    optimalStopPoint: explorePhaseSize,
    recommendation,
    confidenceInCurrentBest,
  };
}

// ============================================================================
// LIFE CHAPTER DETECTION
// ============================================================================

/**
 * Detect signals that a new life chapter is beginning.
 */
export function detectLifeChapterTransition(signals: {
  recentMajorEvents: string[];
  frequentTopics: string[];
  emotionalTone: 'nostalgic' | 'anxious' | 'excited' | 'neutral';
  identityShifts: string[];
  environmentChanges: string[];
}): {
  transitionLikelihood: number;
  suggestedChapterName: string;
  transitionType: 'beginning' | 'ending' | 'pivot' | 'continuation';
  guidance: string;
} {
  const { recentMajorEvents, frequentTopics, emotionalTone, identityShifts, environmentChanges } =
    signals;

  let transitionScore = 0;

  // Score based on signals
  transitionScore += recentMajorEvents.length * 0.15;
  transitionScore += identityShifts.length * 0.2;
  transitionScore += environmentChanges.length * 0.15;

  if (emotionalTone === 'nostalgic') transitionScore += 0.15;
  if (emotionalTone === 'excited') transitionScore += 0.1;
  if (emotionalTone === 'anxious') transitionScore += 0.1;

  // Cap at 1
  const transitionLikelihood = Math.min(1, transitionScore);

  // Determine transition type
  let transitionType: 'beginning' | 'ending' | 'pivot' | 'continuation';
  if (emotionalTone === 'nostalgic' && identityShifts.length > 0) {
    transitionType = 'ending';
  } else if (emotionalTone === 'excited' && environmentChanges.length > 0) {
    transitionType = 'beginning';
  } else if (identityShifts.length > 0) {
    transitionType = 'pivot';
  } else {
    transitionType = 'continuation';
  }

  // Generate chapter name suggestion
  const suggestedChapterName = generateChapterName(
    frequentTopics,
    recentMajorEvents,
    transitionType
  );

  // Guidance
  const guidanceMap: Record<typeof transitionType, string> = {
    beginning:
      'This feels like a new chapter beginning. What do you want this chapter to be about?',
    ending: 'It sounds like a chapter is closing. Take time to honor what was before moving on.',
    pivot:
      'You seem to be at a pivot point. This is a good time for intentional direction-setting.',
    continuation: "You're in a stable chapter. This is a good time to deepen what's working.",
  };

  return {
    transitionLikelihood,
    suggestedChapterName,
    transitionType,
    guidance: guidanceMap[transitionType],
  };
}

function generateChapterName(topics: string[], events: string[], type: string): string {
  const topTopic = topics[0] || 'growth';

  if (type === 'beginning') {
    return `The ${topTopic} awakening`;
  } else if (type === 'ending') {
    return `Closing the ${topTopic} chapter`;
  } else {
    return `The ${topTopic} journey`;
  }
}

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

export async function loadTrajectoryProfile(userId: string): Promise<LifeTrajectoryProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('superhuman')
      .doc('life_trajectory')
      .get();

    if (!doc.exists) return null;
    return doc.data() as LifeTrajectoryProfile;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load trajectory profile');
    return null;
  }
}

export async function saveTrajectoryProfile(profile: LifeTrajectoryProfile): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(profile.userId)
      .collection('superhuman')
      .doc('life_trajectory')
      .set(cleanForFirestore({ ...profile, updatedAt: Date.now() }));

    log.debug({ userId: profile.userId }, 'Life trajectory profile saved');
  } catch (error) {
    log.warn({ error: String(error), userId: profile.userId }, 'Failed to save trajectory profile');
  }
}

export async function saveSimulation(simulation: SimulationResult): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(simulation.userId)
      .collection('life_simulations')
      .doc(simulation.id)
      .set(cleanForFirestore(simulation));

    log.debug({ userId: simulation.userId, simulationId: simulation.id }, 'Simulation saved');
  } catch (error) {
    log.warn({ error: String(error), userId: simulation.userId }, 'Failed to save simulation');
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildLifeTrajectoryContext(userId: string): Promise<string> {
  const profile = await loadTrajectoryProfile(userId);
  const freshStarts = identifyFreshStarts();

  const sections: string[] = ['[LIFE TRAJECTORY SIMULATOR - Better Than Human Decision Science]'];
  sections.push('You can simulate life paths and optimize timing with research-backed precision.');

  // Upcoming fresh starts
  const topFreshStarts = freshStarts.slice(0, 3);
  sections.push('\n**Upcoming Fresh Start Windows**:');
  for (const fs of topFreshStarts) {
    sections.push(
      `• ${fs.landmark.replace(/_/g, ' ')} in ${fs.daysUntil} days (${Math.round(fs.motivationalBoost * 100)}% motivation boost)`
    );
    sections.push(`  Best for: ${fs.bestFor.slice(0, 2).join(', ')}`);
  }

  if (profile) {
    // Current chapter
    if (profile.currentChapter) {
      sections.push(`\n**Current Life Chapter**: "${profile.currentChapter.name}"`);
      if (profile.currentChapter.keyThemes.length > 0) {
        sections.push(`• Themes: ${profile.currentChapter.keyThemes.join(', ')}`);
      }
    }

    // Recent simulations
    const recentSims = profile.simulations?.slice(-2) || [];
    if (recentSims.length > 0) {
      sections.push('\n**Recent Decision Analysis**:');
      for (const sim of recentSims) {
        sections.push(`• ${sim.scenario.name}: ${sim.recommendation}`);
        sections.push(
          `  (Expected value: ${sim.expectedValue.toFixed(2)}, Risk: ${Math.round(sim.downwardRisk * 100)}%)`
        );
      }
    }

    // Major upcoming decisions
    if (profile.majorUpcomingDecisions && profile.majorUpcomingDecisions.length > 0) {
      sections.push('\n**Major Pending Decisions**:');
      for (const decision of profile.majorUpcomingDecisions.slice(0, 2)) {
        sections.push(`• ${decision}`);
      }
    }

    // Risk tolerance
    if (profile.riskTolerance) {
      sections.push(`\n**Risk Profile**: ${profile.riskTolerance} tolerance`);
    }
  }

  sections.push(
    '\nHelp them see around corners. Make trajectory planning feel like intuition, not math.'
  );

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const lifeTrajectorySimulator = {
  // Monte Carlo
  runMonteCarloSimulation,

  // Fresh Start Effect
  identifyFreshStarts,

  // Peak-End Rule
  optimizeForPeakEnd,

  // Regret Minimization
  analyzeRegretMinimization,

  // Optimal Stopping
  calculateOptimalStopPoint,

  // Life Chapters
  detectLifeChapterTransition,

  // Persistence
  loadProfile: loadTrajectoryProfile,
  saveProfile: saveTrajectoryProfile,
  saveSimulation,

  // Context
  buildContext: buildLifeTrajectoryContext,
};
