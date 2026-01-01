/**
 * Computed behavioral metrics for Peter's research insights.
 *
 * @module intelligence/context-builders/personas/peter-research-insights/metrics
 */

import type { BehavioralMetrics, HabitInsights, MoodInsights } from './types.js';

// ============================================================================
// BEHAVIORAL METRICS COMPUTATION
// ============================================================================

export function computeBehavioralMetrics(
  mayaInsights: HabitInsights,
  moodPatterns: MoodInsights,
  spendingInsights: string[]
): BehavioralMetrics {
  const patterns: string[] = [];

  // Decision Quality Index (0-100)
  // Based on: energy level, mood trend, time of day, streak consistency
  let dqi = 70; // baseline
  if (moodPatterns.averageEnergy >= 3.5) dqi += 15;
  else if (moodPatterns.averageEnergy < 2.5) dqi -= 20;
  if (moodPatterns.recentMoodTrend === 'improving') dqi += 10;
  else if (moodPatterns.recentMoodTrend === 'declining') dqi -= 15;
  if (mayaInsights.averageSuccessRate > 0.7) dqi += 10;
  dqi = Math.max(0, Math.min(100, dqi));

  // Habit Formation Velocity
  let habitVelocity = 'unknown';
  if (mayaInsights.activeHabits > 0) {
    if (mayaInsights.averageSuccessRate > 0.8) habitVelocity = 'fast (21-30 days)';
    else if (mayaInsights.averageSuccessRate > 0.5) habitVelocity = 'moderate (30-66 days)';
    else habitVelocity = 'slow (66+ days)';
  }

  // Motivation Sustainability
  let motivationSustainability = 'moderate';
  if (mayaInsights.keystoneHabits.length > 0 && mayaInsights.averageSuccessRate > 0.7) {
    motivationSustainability = 'high (intrinsic drivers active)';
  } else if (mayaInsights.atRiskHabits.length > 2 || moodPatterns.recentMoodTrend === 'declining') {
    motivationSustainability = 'low (motivation fatigue signals)';
  }

  // Financial Stress Level
  let financialStress = 'moderate';
  const hasOverBudget = spendingInsights.some((i) => i.includes('over budget'));
  const hasBehindGoals = spendingInsights.some((i) => i.includes('behind'));
  if (hasOverBudget && hasBehindGoals) {
    financialStress = 'elevated (multiple stress signals)';
    patterns.push('Financial stress correlating with habit struggles');
  } else if (hasOverBudget || hasBehindGoals) {
    financialStress = 'moderate (one area needs attention)';
  } else {
    financialStress = 'low (on track)';
  }

  // Detect cross-domain patterns
  if (mayaInsights.atRiskHabits.length > 0 && moodPatterns.recentMoodTrend === 'declining') {
    patterns.push('Habit struggles + declining mood = likely stress cascade');
  }
  if (mayaInsights.keystoneHabits.length > 0 && mayaInsights.averageSuccessRate > 0.7) {
    patterns.push('Active keystone habit = strong foundation for other changes');
  }
  if (moodPatterns.averageEnergy < 2.5 && hasOverBudget) {
    patterns.push('Low energy + overspending = possible emotional spending pattern');
  }
  if (mayaInsights.currentStreaks.length >= 3) {
    patterns.push(
      `Multiple active streaks (${mayaInsights.currentStreaks.length}) = momentum building`
    );
  }

  return {
    decisionQualityIndex: Math.round(dqi),
    habitFormationVelocity: habitVelocity,
    motivationSustainability,
    financialStressLevel: financialStress,
    patterns,
  };
}

// ============================================================================
// TIME-BASED PATTERN ANALYSIS
// ============================================================================

export function analyzeTimePatterns(): string[] {
  const insights: string[] = [];
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  const dayOfMonth = now.getDate();

  // Sunday scaries (spending spike predictor)
  if (dayOfWeek === 0 && hour >= 17) {
    insights.push(
      'Sunday evening - classic "Sunday scaries" time. Research shows impulse spending often spikes now. Worth watching.'
    );
  }

  // End of month crunch
  if (dayOfMonth >= 28) {
    insights.push(
      'End of month - budget psychology shifts. People either panic-cut spending or give up until next month. Which pattern does this user follow?'
    );
  }

  // Monday morning correlation
  if (dayOfWeek === 1 && hour >= 7 && hour <= 10) {
    insights.push(
      'Monday morning - decision quality tends to be high. Good time to tackle important financial decisions.'
    );
  }

  // Friday afternoon
  if (dayOfWeek === 5 && hour >= 14) {
    insights.push(
      'Friday afternoon - end-of-week impulse spending risk. The "I deserve this" pattern often kicks in.'
    );
  }

  // Pre-market hours (if before 9:30 AM on weekday)
  if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 6 && hour < 9) {
    insights.push(
      'Pre-market hours - if user has investments, they might be checking overnight news. Good time for research discussions.'
    );
  }

  return insights;
}

// ============================================================================
// PERSONAL LIFE PATTERN ANALYSIS
// ============================================================================

export function analyzePersonalLifePatterns(): string[] {
  const insights: string[] = [];
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();

  // Energy cycle insights
  if (hour >= 9 && hour <= 11) {
    insights.push(
      'Peak decision-making window (9-11 AM). Decision Quality Index is typically highest now. Good time for important discussions.'
    );
  } else if (hour >= 14 && hour <= 15) {
    insights.push(
      'Post-lunch energy dip. Decision quality often drops 30-40% in this window. Keep discussions light or energy-focused.'
    );
  } else if (hour >= 21) {
    insights.push(
      'Evening wind-down. Good time for reflection, not major decisions. Ask about how their day went.'
    );
  }

  // Behavioral economics lens based on day
  if (dayOfWeek === 0) {
    insights.push(
      'Sunday: "Sunday scaries" window. Anxiety and control-seeking spending often spike. Look for stress signals.'
    );
  } else if (dayOfWeek === 1) {
    insights.push(
      'Monday: Fresh start energy. Good day for goal-setting discussions. Motivation is typically higher.'
    );
  } else if (dayOfWeek === 5 && hour >= 14) {
    insights.push(
      'Friday afternoon: "I deserve this" psychology kicks in. Watch for rationalized spending or impulsive decisions.'
    );
  }

  return insights;
}

// ============================================================================
// CROSS-DOMAIN PATTERN GENERATION
// ============================================================================

export function generateCrossDomainPatterns(): string[] {
  // These are pattern templates Peter uses to find connections
  return [
    'Look for correlations between spending categories and time of day - people often have "trigger times"',
    'Check if goal progress correlates with any behavioral patterns - what predicts success?',
    'The 80/20 rule applies everywhere - find the 20% of behaviors driving 80% of outcomes',
    'Leading indicators vs lagging indicators - what PREDICTS results vs just measures them?',
  ];
}

// ============================================================================
// COACHING ANALYTICS PATTERNS
// ============================================================================

export function generateCoachingInsights(): string[] {
  return [
    'Apply Four Tendencies detection: Listen for Upholder/Questioner/Obliger/Rebel signals in how they talk about goals',
    'Calculate Motivation Sustainability: Is this intrinsic (lasting) or extrinsic (temporary)?',
    'Look for keystone habit opportunities: One habit that cascades into fixing multiple areas',
    'Assess change readiness before pushing solutions: Are they in contemplation, preparation, or action stage?',
    'Track habit formation velocity: Some people are fast formers (21 days), others slow (90+ days)',
  ];
}

// ============================================================================
// DEEP FINANCIAL RESEARCH PATTERNS
// ============================================================================

export function generateDeepFinancialInsights(): string[] {
  return [
    'Calculate Investor Behavior Index: Checking frequency + trading frequency + emotional correlation',
    'Look for behavioral finance patterns: Loss aversion, present bias, mental accounting',
    'Assess Financial Stress Index sources: Liquidity, cash flow, debt, uncertainty, or goal gap?',
    'Check for money scripts: Money avoidance, worship, status, or vigilance patterns',
    'Analyze Spending Quality Score: Value-aligned spending minus regret spending',
  ];
}
