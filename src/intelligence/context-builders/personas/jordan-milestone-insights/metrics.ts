/**
 * Jordan Milestone Insights - Metrics & Analysis
 *
 * Computed planning metrics and analysis functions.
 *
 * @module intelligence/context-builders/jordan-milestone-insights/metrics
 */

import type {
  GoalsOverview,
  PeterFinancialInsights,
  HabitInsights,
  MoodInsights,
  MemoryInsights,
  PlanningMetrics,
  LifeStageContext,
  SeasonalContext,
} from './types.js';

// ============================================================================
// COMPUTED PLANNING METRICS
// ============================================================================

export function computePlanningMetrics(
  goalsOverview: GoalsOverview,
  peterInsights: PeterFinancialInsights,
  mayaInsights: HabitInsights,
  moodPatterns: MoodInsights
): PlanningMetrics {
  const patterns: string[] = [];

  // Planning Velocity Index (0-100)
  // Based on: goal progress rate, financial capacity, habit support
  let planningVelocity = 50;
  if (peterInsights.savingsVelocity === 'rapid') planningVelocity += 20;
  else if (peterInsights.savingsVelocity === 'steady') planningVelocity += 10;
  if (goalsOverview.nearingCompletion.length > 0) planningVelocity += 15;
  if (goalsOverview.atRisk.length > 0) planningVelocity -= 15;
  if (mayaInsights.planningRelatedHabits.length > 0) planningVelocity += 10;
  planningVelocity = Math.max(0, Math.min(100, planningVelocity));

  // Celebration Readiness Score (0-100)
  // Based on: mood, energy, financial health, emotional capacity
  let celebrationReadiness = 50;
  if (moodPatterns.celebrationReadiness === 'high') celebrationReadiness += 25;
  else if (moodPatterns.celebrationReadiness === 'low') celebrationReadiness -= 20;
  if (peterInsights.budgetHealth === 'excellent') celebrationReadiness += 15;
  else if (peterInsights.budgetHealth === 'stressed') celebrationReadiness -= 15;
  if (moodPatterns.recentMoodTrend === 'improving') celebrationReadiness += 10;
  else if (moodPatterns.recentMoodTrend === 'declining') celebrationReadiness -= 10;
  celebrationReadiness = Math.max(0, Math.min(100, celebrationReadiness));

  // Life Stage Momentum (0-100)
  // Based on: active goals, milestone dates, transition signals
  let lifeStageMomentum = 50;
  if (goalsOverview.activeGoals >= 3) lifeStageMomentum += 15;
  if (goalsOverview.milestoneDates.length > 0) lifeStageMomentum += 15;
  if (goalsOverview.recentlyAchieved.length > 0) lifeStageMomentum += 20;
  if (mayaInsights.momentumScore > 70) lifeStageMomentum += 10;
  lifeStageMomentum = Math.max(0, Math.min(100, lifeStageMomentum));

  // Event Success Predictor (0-100)
  // Composite of all factors
  const eventSuccessPredictor = Math.round(
    planningVelocity * 0.3 +
      celebrationReadiness * 0.3 +
      lifeStageMomentum * 0.2 +
      mayaInsights.momentumScore * 0.2
  );

  // Detect cross-domain patterns
  if (peterInsights.budgetHealth === 'excellent' && moodPatterns.celebrationReadiness === 'high') {
    patterns.push('💫 Perfect storm: Financial + emotional readiness aligned for big planning!');
  }
  if (goalsOverview.nearingCompletion.length > 0 && mayaInsights.keystoneHabits.length > 0) {
    patterns.push('🎯 Goals nearing completion with habit support - strong finish predicted');
  }
  if (moodPatterns.recentMoodTrend === 'declining' && goalsOverview.atRisk.length > 0) {
    patterns.push('⚠️ Declining mood + at-risk goals - may need timeline adjustment or support');
  }
  if (mayaInsights.planningRelatedHabits.length > 0 && peterInsights.savingsVelocity === 'rapid') {
    patterns.push('📈 Planning habits + rapid savings = milestone acceleration mode!');
  }

  return {
    planningVelocityIndex: Math.round(planningVelocity),
    celebrationReadinessScore: Math.round(celebrationReadiness),
    lifeStageMomentum: Math.round(lifeStageMomentum),
    eventSuccessPredictor,
    patterns,
  };
}

// ============================================================================
// LIFE STAGE CONTEXT
// ============================================================================

export function analyzeLifeStageContext(
  goalsOverview: GoalsOverview,
  memoryInsights: MemoryInsights
): LifeStageContext {
  const context: LifeStageContext = {
    currentStage: 'active-planning',
    transitionSignals: [],
    stageSpecificAdvice: [],
    upcomingTransitions: [],
  };

  // Detect life stage from biggest goal
  if (goalsOverview.biggestGoal) {
    const name = goalsOverview.biggestGoal.name.toLowerCase();

    if (name.includes('house') || name.includes('home')) {
      context.currentStage = 'home-buying';
      context.stageSpecificAdvice.push(
        'Home buying chapter! Focus on: neighborhood research, pre-approval timeline, inspection checklist'
      );
      context.transitionSignals.push('Major transition: From renter to homeowner mindset');
    } else if (name.includes('wedding')) {
      context.currentStage = 'wedding-planning';
      context.stageSpecificAdvice.push(
        'Wedding planning! Key decisions: venue → date → guest list → vendors. Timeline is everything.'
      );
      context.transitionSignals.push('Life transition: Merging two lives and families');
    } else if (name.includes('baby') || name.includes('nursery') || name.includes('family')) {
      context.currentStage = 'growing-family';
      context.stageSpecificAdvice.push(
        'Growing family chapter! Consider: childcare plans, life insurance, estate basics'
      );
      context.transitionSignals.push('Identity shift: Becoming a parent changes everything');
    } else if (name.includes('retire')) {
      context.currentStage = 'retirement-transition';
      context.stageSpecificAdvice.push(
        'Retirement chapter! Focus on: income sources, healthcare coverage, purpose discovery'
      );
      context.transitionSignals.push('Major transition: From accumulation to distribution phase');
    } else if (name.includes('graduate') || name.includes('school')) {
      context.currentStage = 'education-transition';
      context.stageSpecificAdvice.push(
        'Education milestone! Consider: celebration plans, next chapter preparation'
      );
    }
  }

  // Add family context from memories
  if (memoryInsights.familyContext.length > 0) {
    context.upcomingTransitions.push(
      'Family milestones may be coming - stay tuned to their mentions'
    );
  }

  // General stage advice
  context.stageSpecificAdvice.push(
    'Remember: Hard chapters deserve presence, not positivity. Celebrate ALL progress.'
  );

  return context;
}

// ============================================================================
// SEASONAL AWARENESS
// ============================================================================

export function analyzeSeasonalContext(): SeasonalContext {
  const now = new Date();
  const month = now.getMonth();
  const dayOfWeek = now.getDay();

  const context: SeasonalContext = {
    currentSeason: '',
    seasonalOpportunities: [],
    upcomingDates: [],
    planningWindows: [],
  };

  // Determine season and opportunities
  if (month >= 4 && month <= 5) {
    context.currentSeason = 'graduation-season';
    context.seasonalOpportunities.push(
      '🎓 GRADUATION SEASON! I cry at graduations. Any graduations. Happy tears.'
    );
    context.seasonalOpportunities.push(
      'Great time for: milestone celebrations, fresh start planning'
    );
  } else if (month >= 5 && month <= 9) {
    context.currentSeason = 'wedding-season';
    context.seasonalOpportunities.push(
      '💒 WEDDING SEASON! Peak planning energy. Love is in the air.'
    );
    context.seasonalOpportunities.push('Peak engagement: venue hunting, guest list planning');
  } else if (month >= 10 && month <= 11) {
    context.currentSeason = 'holiday-prep';
    context.seasonalOpportunities.push('🦃 Holiday season approaching - family gathering planning');
    context.seasonalOpportunities.push('Good for: year-end reviews, next year goal setting');
  } else if (month === 0) {
    context.currentSeason = 'fresh-start';
    context.seasonalOpportunities.push('🎊 NEW YEAR! Fresh start energy. Vision casting time!');
    context.seasonalOpportunities.push('Perfect for: annual planning, big picture dreaming');
  } else if (month >= 1 && month <= 3) {
    context.currentSeason = 'planning-season';
    context.seasonalOpportunities.push('📋 Peak planning season - summer event prep begins now');
  }

  // Time-based planning windows
  if (dayOfWeek === 0) {
    context.planningWindows.push('Sunday planning energy! Good day for big picture thinking.');
  } else if (dayOfWeek === 1) {
    context.planningWindows.push('Monday fresh start! High motivation for new plans.');
  }

  // Upcoming notable dates (within 90 days)
  const valentines = new Date(now.getFullYear(), 1, 14);
  const mothersDay = new Date(now.getFullYear(), 4, 11); // Approximate
  const fathersDay = new Date(now.getFullYear(), 5, 18); // Approximate

  const notableDates = [
    { name: "Valentine's Day", date: valentines },
    { name: "Mother's Day", date: mothersDay },
    { name: "Father's Day", date: fathersDay },
  ];

  for (const notable of notableDates) {
    let targetDate = notable.date;
    if (targetDate < now) {
      targetDate = new Date(targetDate.setFullYear(targetDate.getFullYear() + 1));
    }
    const daysAway = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysAway <= 90) {
      context.upcomingDates.push({
        name: notable.name,
        date: targetDate.toLocaleDateString(),
        daysAway,
      });
    }
  }

  return context;
}
