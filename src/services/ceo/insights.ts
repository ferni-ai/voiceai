/**
 * CEO Insights Service - "Better than Human" Cross-Data Intelligence
 *
 * This is the KEY differentiator for Ferni - superhuman pattern recognition
 * across ALL CEO productivity data. This service cross-references:
 * - Goals, wins, energy, journal, gratitude, focus sessions
 * - Decisions, priorities, blockers, ideas, meetings
 *
 * No human friend could maintain this level of comprehensive awareness.
 *
 * Storage: users/{userId}/insights_cache for cached insights
 *
 * @module services/ceo/insights
 */

import { Timestamp } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import {
  getFirestoreDb,
  cleanForFirestore,
  recordDegradation,
  toSafeDate,
} from '../../utils/firestore-utils.js';
import { generateId } from '../../utils/id-generator.js';

// Import all CEO services
import { goalsService, type Goal } from './goals.js';
import { winsService, type Win } from './wins.js';
import { energyService, type EnergyLog } from './energy.js';
import { journalService, type JournalEntry } from './journal.js';
import { gratitudeService, type GratitudeEntry } from './gratitude.js';
import { focusService, type FocusSession } from './focus.js';
import { decisionsService, type Decision } from './decisions.js';
import { prioritiesService, type Priority } from './priorities.js';
import { blockersService, type Blocker } from './blockers.js';
import { ideasService, type Idea } from './ideas.js';
import { meetingsService, type Meeting } from './meetings.js';

const log = createLogger({ module: 'ceo-insights' });

// ============================================================================
// TYPES
// ============================================================================

export type InsightType = 'correlation' | 'pattern' | 'warning' | 'celebration' | 'suggestion';
export type InsightCategory =
  | 'energy'
  | 'goals'
  | 'decisions'
  | 'focus'
  | 'momentum'
  | 'burnout'
  | 'patterns'
  | 'blockers'
  | 'productivity';
export type InsightPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Insight {
  id: string;
  type: InsightType;
  category: InsightCategory;
  title: string;
  description: string;
  confidence: number; // 0-1
  priority: InsightPriority;
  dataPoints: number; // How many data points support this
  actionable?: string; // Suggested action
  relatedIds?: string[]; // Related goal/decision/blocker IDs
  createdAt: Date;
}

interface FirestoreInsight extends Omit<Insight, 'createdAt'> {
  createdAt: Timestamp;
}

interface InsightsCache {
  userId: string;
  insights: Insight[];
  generatedAt: Date;
  expiresAt: Date;
}

interface FirestoreInsightsCache {
  userId: string;
  insights: FirestoreInsight[];
  generatedAt: Timestamp;
  expiresAt: Timestamp;
}

// Aggregated data for analysis
interface AggregatedData {
  goals: Goal[];
  wins: Win[];
  energyLogs: EnergyLog[];
  journalEntries: JournalEntry[];
  gratitudeEntries: GratitudeEntry[];
  focusSessions: FocusSession[];
  decisions: Decision[];
  priorities: Priority[];
  blockers: Blocker[];
  ideas: Idea[];
  meetings: Meeting[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CACHE_TTL_MINUTES = 30; // Cache insights for 30 minutes
const INSIGHTS_COLLECTION = 'insights_cache';
const MIN_DATA_POINTS_FOR_INSIGHT = 3; // Minimum data points to generate an insight

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

function getInsightsCachePath(userId: string): string {
  return `users/${userId}/${INSIGHTS_COLLECTION}`;
}

async function getCachedInsights(userId: string): Promise<InsightsCache | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const docRef = db.collection(getInsightsCachePath(userId)).doc('current');
    const doc = await docRef.get();

    if (!doc.exists) return null;

    const data = doc.data() as FirestoreInsightsCache;
    const expiresAt = toSafeDate(data.expiresAt);

    // Check if cache is expired
    if (expiresAt < new Date()) {
      return null;
    }

    return {
      userId: data.userId,
      insights: data.insights.map((i) => ({
        ...i,
        createdAt: toSafeDate(i.createdAt),
      })),
      generatedAt: toSafeDate(data.generatedAt),
      expiresAt,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get cached insights');
    return null;
  }
}

async function setCachedInsights(userId: string, insights: Insight[]): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MINUTES * 60 * 1000);

    const cache: FirestoreInsightsCache = {
      userId,
      insights: insights.map((i) => ({
        ...i,
        createdAt: Timestamp.fromDate(i.createdAt),
      })),
      generatedAt: Timestamp.fromDate(now),
      expiresAt: Timestamp.fromDate(expiresAt),
    };

    const docRef = db.collection(getInsightsCachePath(userId)).doc('current');
    await docRef.set(cleanForFirestore(cache));

    log.debug({ userId, count: insights.length }, 'Cached insights updated');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to cache insights');
  }
}

// ============================================================================
// DATA AGGREGATION
// ============================================================================

/**
 * Fetch all relevant data for analysis.
 * This is the foundation of cross-data intelligence.
 */
async function aggregateAllData(userId: string): Promise<AggregatedData> {
  // Fetch all data in parallel for efficiency
  const [
    goals,
    winsMonth,
    energyLogs,
    journalEntries,
    gratitudeEntries,
    focusSessions,
    decisions,
    priorities,
    blockers,
    ideas,
    meetingsMonth,
  ] = await Promise.all([
    goalsService.getGoals(userId),
    winsService.getWins(userId, 'month'),
    energyService.getTrend(userId, 30),
    journalService.getEntries(userId, 'month'),
    gratitudeService.getThisWeek(userId),
    focusService.getSessionHistory(userId, 100),
    decisionsService.getDecisions(userId),
    prioritiesService.getPriorities(userId, true),
    blockersService.getBlockers(userId),
    ideasService.getIdeas(userId, 100),
    meetingsService.getMeetings(userId, 'month'),
  ]);

  return {
    goals,
    wins: winsMonth,
    energyLogs,
    journalEntries,
    gratitudeEntries,
    focusSessions,
    decisions,
    priorities,
    blockers,
    ideas,
    meetings: meetingsMonth,
  };
}

// ============================================================================
// INSIGHT GENERATION FUNCTIONS
// ============================================================================

/**
 * Energy-Goal Correlation
 * Finds patterns like "You make more progress on career goals when energy is 7+"
 */
export async function getEnergyGoalInsights(userId: string): Promise<Insight[]> {
  const data = await aggregateAllData(userId);
  const insights: Insight[] = [];

  const { goals, wins, energyLogs } = data;

  if (
    energyLogs.length < MIN_DATA_POINTS_FOR_INSIGHT ||
    wins.length < MIN_DATA_POINTS_FOR_INSIGHT
  ) {
    return insights;
  }

  // Group wins by goal category and analyze energy correlation
  const categoryAnalysis = new Map<
    string,
    { highEnergyWins: number; lowEnergyWins: number; totalWins: number }
  >();

  for (const win of wins) {
    const winDate = new Date(win.createdAt);
    // Find energy logs from the same day
    const sameDayEnergy = energyLogs.filter((e) => {
      const energyDate = new Date(e.createdAt);
      return energyDate.toDateString() === winDate.toDateString();
    });

    if (sameDayEnergy.length === 0) continue;

    const avgEnergy = sameDayEnergy.reduce((sum, e) => sum + e.level, 0) / sameDayEnergy.length;
    const category = win.category || 'uncategorized';

    const existing = categoryAnalysis.get(category) || {
      highEnergyWins: 0,
      lowEnergyWins: 0,
      totalWins: 0,
    };

    if (avgEnergy >= 7) {
      existing.highEnergyWins++;
    } else if (avgEnergy < 5) {
      existing.lowEnergyWins++;
    }
    existing.totalWins++;
    categoryAnalysis.set(category, existing);
  }

  // Generate insights from significant patterns
  for (const [category, analysis] of categoryAnalysis.entries()) {
    if (analysis.totalWins < MIN_DATA_POINTS_FOR_INSIGHT) continue;

    const highEnergyRatio = analysis.highEnergyWins / analysis.totalWins;
    const lowEnergyRatio = analysis.lowEnergyWins / analysis.totalWins;

    if (highEnergyRatio >= 0.6) {
      insights.push({
        id: generateId('ins'),
        type: 'correlation',
        category: 'energy',
        title: `High energy drives ${category} wins`,
        description: `${Math.round(highEnergyRatio * 100)}% of your ${category} wins happen when your energy is 7+. Consider scheduling important ${category} tasks when you're feeling energized.`,
        confidence: Math.min(0.95, 0.5 + analysis.totalWins * 0.05),
        priority: 'medium',
        dataPoints: analysis.totalWins,
        actionable: `Schedule ${category} work during your peak energy times`,
        relatedIds: goals.filter((g) => g.category === category).map((g) => g.id),
        createdAt: new Date(),
      });
    }

    if (lowEnergyRatio >= 0.4 && analysis.totalWins >= 5) {
      insights.push({
        id: generateId('ins'),
        type: 'warning',
        category: 'energy',
        title: `Low energy affecting ${category} progress`,
        description: `${Math.round(lowEnergyRatio * 100)}% of your ${category} activities happen when energy is below 5. You might be pushing through when rest would be more effective.`,
        confidence: Math.min(0.9, 0.4 + analysis.totalWins * 0.05),
        priority: 'high',
        dataPoints: analysis.totalWins,
        actionable: `Consider resting when energy is low - your ${category} work quality may suffer`,
        createdAt: new Date(),
      });
    }
  }

  // Calculate overall energy-productivity correlation
  const avgEnergy = energyLogs.reduce((sum, e) => sum + e.level, 0) / energyLogs.length;
  if (avgEnergy >= 7 && wins.length >= 10) {
    insights.push({
      id: generateId('ins'),
      type: 'celebration',
      category: 'energy',
      title: 'Your energy game is strong',
      description: `Your average energy level is ${avgEnergy.toFixed(1)}/10, and you've logged ${wins.length} wins this month. High energy is clearly fueling your success.`,
      confidence: 0.85,
      priority: 'low',
      dataPoints: energyLogs.length + wins.length,
      createdAt: new Date(),
    });
  }

  return insights;
}

/**
 * Blocker Impact Analysis
 * Identifies blockers that are affecting multiple goals or have been active too long
 */
export async function getBlockerImpactInsights(userId: string): Promise<Insight[]> {
  const data = await aggregateAllData(userId);
  const insights: Insight[] = [];

  const { blockers, goals } = data;
  const activeBlockers = blockers.filter((b) => b.status === 'active');

  if (activeBlockers.length === 0) return insights;

  // Analyze blockers linked to goals
  for (const blocker of activeBlockers) {
    const daysSinceCreated = Math.floor(
      (Date.now() - blocker.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Find goals affected by this blocker
    const affectedGoals = goals.filter(
      (g) => g.id === blocker.linkedGoalId && g.status === 'active'
    );

    // Critical: Long-standing blocker affecting active goals
    if (daysSinceCreated >= 5 && affectedGoals.length > 0) {
      insights.push({
        id: generateId('ins'),
        type: 'warning',
        category: 'blockers',
        title: `Blocker stalling ${affectedGoals.length} goal${affectedGoals.length > 1 ? 's' : ''} for ${daysSinceCreated} days`,
        description: `"${blocker.description.slice(0, 50)}${blocker.description.length > 50 ? '...' : ''}" has been blocking progress for ${daysSinceCreated} days. Affected goals: ${affectedGoals.map((g) => g.title).join(', ')}`,
        confidence: 0.9,
        priority: daysSinceCreated >= 7 ? 'urgent' : 'high',
        dataPoints: daysSinceCreated,
        actionable:
          blocker.severity === 'critical' || blocker.severity === 'high'
            ? 'Consider escalating this blocker or finding an alternative approach'
            : 'Schedule dedicated time to resolve this blocker',
        relatedIds: [blocker.id, ...affectedGoals.map((g) => g.id)],
        createdAt: new Date(),
      });
    }

    // Warning: Critical blocker that's been around for a while
    if (blocker.severity === 'critical' && daysSinceCreated >= 3) {
      insights.push({
        id: generateId('ins'),
        type: 'warning',
        category: 'blockers',
        title: 'Critical blocker needs immediate attention',
        description: `A critical blocker "${blocker.description.slice(0, 40)}..." has been active for ${daysSinceCreated} days.`,
        confidence: 0.95,
        priority: 'urgent',
        dataPoints: 1,
        actionable: 'Address this critical blocker today or escalate to someone who can help',
        relatedIds: [blocker.id],
        createdAt: new Date(),
      });
    }
  }

  // Pattern: Multiple blockers accumulating
  if (activeBlockers.length >= 5) {
    const highSeverity = activeBlockers.filter(
      (b) => b.severity === 'high' || b.severity === 'critical'
    ).length;

    insights.push({
      id: generateId('ins'),
      type: 'warning',
      category: 'blockers',
      title: `${activeBlockers.length} active blockers accumulating`,
      description: `You have ${activeBlockers.length} unresolved blockers (${highSeverity} high/critical severity). This accumulation may be slowing overall progress.`,
      confidence: 0.85,
      priority: highSeverity >= 2 ? 'high' : 'medium',
      dataPoints: activeBlockers.length,
      actionable: 'Consider a "blocker clearing" session to address multiple issues at once',
      relatedIds: activeBlockers.map((b) => b.id),
      createdAt: new Date(),
    });
  }

  return insights;
}

/**
 * Decision Quality Tracking
 * Correlates decision outcomes with energy levels and other factors
 */
export async function getDecisionQualityInsights(userId: string): Promise<Insight[]> {
  const data = await aggregateAllData(userId);
  const insights: Insight[] = [];

  const { decisions, energyLogs } = data;

  // Only analyze reviewed decisions with ratings
  const reviewedDecisions = decisions.filter(
    (d) => d.status === 'reviewed' && d.outcomeRating !== undefined
  );

  if (reviewedDecisions.length < MIN_DATA_POINTS_FOR_INSIGHT) return insights;

  // Correlate decision outcomes with energy on the day the decision was made
  const decisionsByEnergy: { highEnergy: number[]; lowEnergy: number[]; mediumEnergy: number[] } = {
    highEnergy: [], // Energy 7+
    lowEnergy: [], // Energy < 5
    mediumEnergy: [], // Energy 5-6
  };

  for (const decision of reviewedDecisions) {
    if (!decision.madeAt || decision.outcomeRating === undefined) continue;

    const madeDate = new Date(decision.madeAt);
    const sameDayEnergy = energyLogs.filter((e) => {
      const energyDate = new Date(e.createdAt);
      return energyDate.toDateString() === madeDate.toDateString();
    });

    if (sameDayEnergy.length === 0) continue;

    const avgEnergy = sameDayEnergy.reduce((sum, e) => sum + e.level, 0) / sameDayEnergy.length;

    if (avgEnergy >= 7) {
      decisionsByEnergy.highEnergy.push(decision.outcomeRating);
    } else if (avgEnergy < 5) {
      decisionsByEnergy.lowEnergy.push(decision.outcomeRating);
    } else {
      decisionsByEnergy.mediumEnergy.push(decision.outcomeRating);
    }
  }

  // Calculate averages and generate insights
  const calcAvg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const highEnergyAvg = calcAvg(decisionsByEnergy.highEnergy);
  const lowEnergyAvg = calcAvg(decisionsByEnergy.lowEnergy);
  const totalRatings =
    decisionsByEnergy.highEnergy.length +
    decisionsByEnergy.lowEnergy.length +
    decisionsByEnergy.mediumEnergy.length;

  if (
    decisionsByEnergy.highEnergy.length >= 2 &&
    decisionsByEnergy.lowEnergy.length >= 2 &&
    highEnergyAvg - lowEnergyAvg >= 0.8
  ) {
    const diff = ((highEnergyAvg - lowEnergyAvg) / lowEnergyAvg) * 100;

    insights.push({
      id: generateId('ins'),
      type: 'correlation',
      category: 'decisions',
      title: 'Energy level affects decision quality',
      description: `Decisions made when energy is 7+ have ${Math.round(diff)}% higher outcome ratings (${highEnergyAvg.toFixed(1)} vs ${lowEnergyAvg.toFixed(1)}/5). Consider delaying important decisions on low-energy days.`,
      confidence: Math.min(0.9, 0.5 + totalRatings * 0.05),
      priority: 'high',
      dataPoints: totalRatings,
      actionable: 'Save major decisions for when you feel energized',
      createdAt: new Date(),
    });
  }

  // Pending decisions warning
  const pendingDecisions = decisions.filter((d) => d.status === 'pending');
  if (pendingDecisions.length >= 3) {
    const oldestPending = pendingDecisions.reduce((oldest, d) =>
      d.createdAt < oldest.createdAt ? d : oldest
    );
    const daysPending = Math.floor(
      (Date.now() - oldestPending.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    insights.push({
      id: generateId('ins'),
      type: 'warning',
      category: 'decisions',
      title: `${pendingDecisions.length} decisions awaiting your attention`,
      description: `You have ${pendingDecisions.length} pending decisions, the oldest from ${daysPending} days ago. Decision fatigue can lead to suboptimal choices or avoidance.`,
      confidence: 0.85,
      priority: daysPending >= 7 ? 'high' : 'medium',
      dataPoints: pendingDecisions.length,
      actionable: 'Schedule a decision-making session to clear the backlog',
      relatedIds: pendingDecisions.map((d) => d.id),
      createdAt: new Date(),
    });
  }

  return insights;
}

/**
 * Focus Effectiveness Analysis
 * Identifies optimal focus session durations and patterns
 */
export async function getFocusEffectivenessInsights(userId: string): Promise<Insight[]> {
  const data = await aggregateAllData(userId);
  const insights: Insight[] = [];

  const { focusSessions, wins } = data;

  // Only analyze completed sessions
  const completedSessions = focusSessions.filter(
    (s) => s.endTime !== undefined && s.actualDuration !== undefined
  );

  if (completedSessions.length < MIN_DATA_POINTS_FOR_INSIGHT) return insights;

  // Group sessions by duration buckets
  const durationBuckets: {
    short: FocusSession[]; // < 30 min
    medium: FocusSession[]; // 30-60 min
    long: FocusSession[]; // 60-120 min
    veryLong: FocusSession[]; // > 120 min
  } = {
    short: [],
    medium: [],
    long: [],
    veryLong: [],
  };

  for (const session of completedSessions) {
    const duration = session.actualDuration!;
    if (duration < 30) durationBuckets.short.push(session);
    else if (duration < 60) durationBuckets.medium.push(session);
    else if (duration < 120) durationBuckets.long.push(session);
    else durationBuckets.veryLong.push(session);
  }

  // Calculate completion rates (sessions completed without interruption)
  const calcCompletionRate = (sessions: FocusSession[]) =>
    sessions.length > 0 ? sessions.filter((s) => !s.interrupted).length / sessions.length : 0;

  const rates = {
    short: { rate: calcCompletionRate(durationBuckets.short), count: durationBuckets.short.length },
    medium: {
      rate: calcCompletionRate(durationBuckets.medium),
      count: durationBuckets.medium.length,
    },
    long: { rate: calcCompletionRate(durationBuckets.long), count: durationBuckets.long.length },
    veryLong: {
      rate: calcCompletionRate(durationBuckets.veryLong),
      count: durationBuckets.veryLong.length,
    },
  };

  // Find the most effective duration
  const validBuckets = Object.entries(rates).filter(([, data]) => data.count >= 3);

  if (validBuckets.length >= 2) {
    const sorted = validBuckets.sort((a, b) => b[1].rate - a[1].rate);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    const durationLabels: Record<string, string> = {
      short: '< 30 minute',
      medium: '30-60 minute',
      long: '60-120 minute',
      veryLong: '2+ hour',
    };

    if (best[1].rate - worst[1].rate >= 0.2) {
      insights.push({
        id: generateId('ins'),
        type: 'pattern',
        category: 'focus',
        title: `Your ${durationLabels[best[0]]} sessions are most effective`,
        description: `${durationLabels[best[0]]} focus sessions have a ${Math.round(best[1].rate * 100)}% completion rate, vs ${Math.round(worst[1].rate * 100)}% for ${durationLabels[worst[0]]} sessions.`,
        confidence: Math.min(0.9, 0.6 + completedSessions.length * 0.02),
        priority: 'medium',
        dataPoints: completedSessions.length,
        actionable: `Consider using more ${durationLabels[best[0]]} focus sessions`,
        createdAt: new Date(),
      });
    }
  }

  // Correlation: Focus sessions and wins on the same day
  let focusDaysWithWins = 0;
  let totalFocusDays = 0;
  const focusDates = new Set<string>();

  for (const session of completedSessions) {
    const dateStr = session.startTime.toDateString();
    if (focusDates.has(dateStr)) continue;
    focusDates.add(dateStr);
    totalFocusDays++;

    // Check if there's a win on this day
    const hasWin = wins.some((w) => w.createdAt.toDateString() === dateStr);
    if (hasWin) focusDaysWithWins++;
  }

  if (totalFocusDays >= 5 && focusDaysWithWins / totalFocusDays >= 0.4) {
    insights.push({
      id: generateId('ins'),
      type: 'correlation',
      category: 'focus',
      title: 'Focus sessions lead to wins',
      description: `${Math.round((focusDaysWithWins / totalFocusDays) * 100)}% of days with focus sessions also have logged wins. Deep work is paying off!`,
      confidence: 0.8,
      priority: 'low',
      dataPoints: totalFocusDays,
      actionable: "Keep up the focused work - it's directly contributing to your success",
      createdAt: new Date(),
    });
  }

  return insights;
}

/**
 * Momentum Detection
 * Identifies winning streaks and momentum patterns
 */
export async function getMomentumInsights(userId: string): Promise<Insight[]> {
  const data = await aggregateAllData(userId);
  const insights: Insight[] = [];

  const { wins, goals, gratitudeEntries, focusSessions } = data;

  // Calculate win streaks by category
  const categoryStreaks = new Map<string, { current: number; longest: number; dates: Date[] }>();

  // Sort wins by date
  const sortedWins = [...wins].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  for (const win of sortedWins) {
    const category = win.category || 'general';
    if (!categoryStreaks.has(category)) {
      categoryStreaks.set(category, { current: 0, longest: 0, dates: [] });
    }
    categoryStreaks.get(category)!.dates.push(win.createdAt);
  }

  // Calculate streaks
  for (const [category, data] of categoryStreaks.entries()) {
    if (data.dates.length < 3) continue;

    // Check for consecutive days with wins
    let currentStreak = 1;
    let longestStreak = 1;
    const sortedDates = [...data.dates].sort((a, b) => b.getTime() - a.getTime());

    for (let i = 1; i < sortedDates.length; i++) {
      const diff = Math.floor(
        (sortedDates[i - 1].getTime() - sortedDates[i].getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diff <= 2) {
        // Allow 2-day gap
        currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }

    // Check if current streak is active (most recent win within 2 days)
    const mostRecentWin = sortedDates[0];
    const daysSinceLastWin = Math.floor(
      (Date.now() - mostRecentWin.getTime()) / (1000 * 60 * 60 * 24)
    );
    const isStreakActive = daysSinceLastWin <= 2;

    if (longestStreak >= 3 && isStreakActive) {
      insights.push({
        id: generateId('ins'),
        type: 'celebration',
        category: 'momentum',
        title: `${longestStreak}-day ${category} win streak!`,
        description: `You've been on fire in ${category}! ${longestStreak} wins in ${longestStreak + 1} days. Keep the momentum going!`,
        confidence: 0.95,
        priority: longestStreak >= 5 ? 'high' : 'medium',
        dataPoints: longestStreak,
        relatedIds: goals.filter((g) => g.category === category).map((g) => g.id),
        createdAt: new Date(),
      });
    }
  }

  // Overall momentum score
  const recentWinsCount = wins.filter((w) => {
    const daysAgo = Math.floor((Date.now() - w.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    return daysAgo <= 7;
  }).length;

  const recentFocusSessions = focusSessions.filter((s) => {
    const daysAgo = Math.floor((Date.now() - s.startTime.getTime()) / (1000 * 60 * 60 * 24));
    return daysAgo <= 7 && s.endTime !== undefined;
  }).length;

  const recentGratitude = gratitudeEntries.length; // Already filtered to this week

  const momentumScore = (recentWinsCount * 3 + recentFocusSessions * 2 + recentGratitude) / 7; // Weighted score

  if (momentumScore >= 5) {
    insights.push({
      id: generateId('ins'),
      type: 'celebration',
      category: 'momentum',
      title: "You're building serious momentum!",
      description: `This week: ${recentWinsCount} wins, ${recentFocusSessions} focus sessions, ${recentGratitude} gratitude entries. You're firing on all cylinders.`,
      confidence: 0.9,
      priority: 'medium',
      dataPoints: recentWinsCount + recentFocusSessions + recentGratitude,
      actionable: 'Ride this wave - now is a great time to tackle challenging goals',
      createdAt: new Date(),
    });
  }

  return insights;
}

/**
 * Burnout Warning Detection
 * Detects declining energy + increasing blockers + decreasing wins
 */
export async function getBurnoutWarning(userId: string): Promise<Insight[]> {
  const data = await aggregateAllData(userId);
  const insights: Insight[] = [];

  const { energyLogs, blockers, wins, journalEntries, focusSessions } = data;

  if (energyLogs.length < 7) return insights; // Need at least a week of data

  // Compare this week vs last week
  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

  const thisWeekEnergy = energyLogs.filter((e) => e.createdAt.getTime() >= oneWeekAgo);
  const lastWeekEnergy = energyLogs.filter(
    (e) => e.createdAt.getTime() >= twoWeeksAgo && e.createdAt.getTime() < oneWeekAgo
  );

  const thisWeekAvg =
    thisWeekEnergy.length > 0
      ? thisWeekEnergy.reduce((sum, e) => sum + e.level, 0) / thisWeekEnergy.length
      : 0;
  const lastWeekAvg =
    lastWeekEnergy.length > 0
      ? lastWeekEnergy.reduce((sum, e) => sum + e.level, 0) / lastWeekEnergy.length
      : thisWeekAvg;

  // Count wins
  const thisWeekWins = wins.filter((w) => w.createdAt.getTime() >= oneWeekAgo).length;
  const lastWeekWins = wins.filter(
    (w) => w.createdAt.getTime() >= twoWeeksAgo && w.createdAt.getTime() < oneWeekAgo
  ).length;

  // Count new blockers
  const newBlockersThisWeek = blockers.filter(
    (b) => b.createdAt.getTime() >= oneWeekAgo && b.status === 'active'
  ).length;

  // Check for negative sentiment in journal
  const negativeJournals = journalEntries.filter(
    (j) => j.sentiment === 'negative' && j.createdAt.getTime() >= oneWeekAgo
  ).length;

  // Focus session interruption rate
  const recentSessions = focusSessions.filter(
    (s) => s.startTime.getTime() >= oneWeekAgo && s.endTime !== undefined
  );
  const interruptionRate =
    recentSessions.length > 0
      ? recentSessions.filter((s) => s.interrupted).length / recentSessions.length
      : 0;

  // Calculate burnout risk score (0-100)
  let burnoutScore = 0;
  const factors: string[] = [];

  // Energy declining
  if (lastWeekAvg > 0 && thisWeekAvg < lastWeekAvg * 0.8) {
    burnoutScore += 25;
    factors.push(
      `energy dropped ${Math.round(((lastWeekAvg - thisWeekAvg) / lastWeekAvg) * 100)}%`
    );
  } else if (thisWeekAvg < 5) {
    burnoutScore += 15;
    factors.push(`average energy is only ${thisWeekAvg.toFixed(1)}/10`);
  }

  // Wins declining
  if (lastWeekWins > 0 && thisWeekWins < lastWeekWins * 0.5) {
    burnoutScore += 20;
    factors.push(`wins dropped from ${lastWeekWins} to ${thisWeekWins}`);
  }

  // Blockers accumulating
  if (newBlockersThisWeek >= 3) {
    burnoutScore += 15;
    factors.push(`${newBlockersThisWeek} new blockers this week`);
  }

  // Negative journal entries
  if (negativeJournals >= 3) {
    burnoutScore += 20;
    factors.push(`${negativeJournals} negative journal entries`);
  }

  // High interruption rate
  if (interruptionRate >= 0.5 && recentSessions.length >= 3) {
    burnoutScore += 15;
    factors.push(`${Math.round(interruptionRate * 100)}% of focus sessions interrupted`);
  }

  // Generate insight based on score
  if (burnoutScore >= 60) {
    insights.push({
      id: generateId('ins'),
      type: 'warning',
      category: 'burnout',
      title: 'Burnout warning: Multiple stress signals detected',
      description: `Your data shows concerning patterns: ${factors.join(', ')}. These are classic signs of approaching burnout.`,
      confidence: Math.min(0.95, burnoutScore / 100),
      priority: 'urgent',
      dataPoints: thisWeekEnergy.length + thisWeekWins + newBlockersThisWeek + negativeJournals,
      actionable:
        'Consider scheduling rest, delegating tasks, or talking to someone about your workload',
      createdAt: new Date(),
    });
  } else if (burnoutScore >= 40) {
    insights.push({
      id: generateId('ins'),
      type: 'warning',
      category: 'burnout',
      title: 'Early burnout signs detected',
      description: `Some indicators suggest you might be running low: ${factors.join(', ')}. Consider proactive rest.`,
      confidence: Math.min(0.85, burnoutScore / 100),
      priority: 'high',
      dataPoints: factors.length,
      actionable: 'Build in some recovery time before these patterns worsen',
      createdAt: new Date(),
    });
  }

  return insights;
}

/**
 * Weekly Patterns Analysis
 * Identifies day-of-week patterns in productivity
 */
export async function getWeeklyPatterns(userId: string): Promise<Insight[]> {
  const data = await aggregateAllData(userId);
  const insights: Insight[] = [];

  const { wins, ideas, focusSessions, energyLogs, journalEntries } = data;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Analyze by day of week
  const dayAnalysis = new Map<
    number,
    {
      wins: number;
      ideas: number;
      focusSessions: number;
      avgEnergy: number;
      energyCount: number;
      positiveJournals: number;
    }
  >();

  // Initialize all days
  for (let i = 0; i < 7; i++) {
    dayAnalysis.set(i, {
      wins: 0,
      ideas: 0,
      focusSessions: 0,
      avgEnergy: 0,
      energyCount: 0,
      positiveJournals: 0,
    });
  }

  // Count wins by day
  for (const win of wins) {
    const day = win.createdAt.getDay();
    dayAnalysis.get(day)!.wins++;
  }

  // Count ideas by day
  for (const idea of ideas) {
    const day = idea.createdAt.getDay();
    dayAnalysis.get(day)!.ideas++;
  }

  // Count focus sessions by day
  for (const session of focusSessions.filter((s) => s.endTime !== undefined)) {
    const day = session.startTime.getDay();
    dayAnalysis.get(day)!.focusSessions++;
  }

  // Average energy by day
  for (const log of energyLogs) {
    const day = log.createdAt.getDay();
    const analysis = dayAnalysis.get(day)!;
    analysis.avgEnergy =
      (analysis.avgEnergy * analysis.energyCount + log.level) / (analysis.energyCount + 1);
    analysis.energyCount++;
  }

  // Positive journals by day
  for (const entry of journalEntries.filter((j) => j.sentiment === 'positive')) {
    const day = entry.createdAt.getDay();
    dayAnalysis.get(day)!.positiveJournals++;
  }

  // Find significant patterns
  const dayEntries = Array.from(dayAnalysis.entries());
  const totalData =
    wins.length + ideas.length + focusSessions.length + energyLogs.length + journalEntries.length;

  if (totalData < 20) return insights; // Need enough data

  // Best day for ideas
  const bestIdeaDay = dayEntries.reduce((best, current) =>
    current[1].ideas > best[1].ideas ? current : best
  );
  const avgIdeasPerDay = ideas.length / 7;

  if (bestIdeaDay[1].ideas >= avgIdeasPerDay * 2 && bestIdeaDay[1].ideas >= 3) {
    insights.push({
      id: generateId('ins'),
      type: 'pattern',
      category: 'patterns',
      title: `${dayNames[bestIdeaDay[0]]}s are your creative peak`,
      description: `You log ${Math.round((bestIdeaDay[1].ideas / avgIdeasPerDay) * 100)}% more ideas on ${dayNames[bestIdeaDay[0]]}s than average. Schedule brainstorming for this day.`,
      confidence: 0.75,
      priority: 'low',
      dataPoints: ideas.length,
      actionable: `Block time on ${dayNames[bestIdeaDay[0]]}s for creative thinking`,
      createdAt: new Date(),
    });
  }

  // Best day for wins
  const bestWinDay = dayEntries.reduce((best, current) =>
    current[1].wins > best[1].wins ? current : best
  );
  const avgWinsPerDay = wins.length / 7;

  if (bestWinDay[1].wins >= avgWinsPerDay * 1.5 && bestWinDay[1].wins >= 3) {
    insights.push({
      id: generateId('ins'),
      type: 'pattern',
      category: 'patterns',
      title: `${dayNames[bestWinDay[0]]}s are your winning day`,
      description: `You achieve ${Math.round((bestWinDay[1].wins / avgWinsPerDay) * 100)}% more wins on ${dayNames[bestWinDay[0]]}s. Consider front-loading important work.`,
      confidence: 0.75,
      priority: 'low',
      dataPoints: wins.length,
      createdAt: new Date(),
    });
  }

  // Lowest energy day
  const lowestEnergyDay = dayEntries
    .filter(([, data]) => data.energyCount >= 2)
    .reduce(
      (lowest, current) => (current[1].avgEnergy < lowest[1].avgEnergy ? current : lowest),
      dayEntries[0]
    );

  if (lowestEnergyDay[1].avgEnergy <= 5 && lowestEnergyDay[1].energyCount >= 3) {
    insights.push({
      id: generateId('ins'),
      type: 'pattern',
      category: 'patterns',
      title: `${dayNames[lowestEnergyDay[0]]}s tend to be low energy`,
      description: `Your average energy on ${dayNames[lowestEnergyDay[0]]}s is ${lowestEnergyDay[1].avgEnergy.toFixed(1)}/10. Plan lighter work or recovery activities.`,
      confidence: 0.7,
      priority: 'medium',
      dataPoints: lowestEnergyDay[1].energyCount,
      actionable: `Schedule administrative tasks or rest on ${dayNames[lowestEnergyDay[0]]}s`,
      createdAt: new Date(),
    });
  }

  return insights;
}

/**
 * Get all insights, prioritized and deduplicated.
 * This is the main entry point for the insights service.
 */
export async function getAllInsights(
  userId: string,
  forceRefresh: boolean = false
): Promise<Insight[]> {
  // Check cache first (unless forced refresh)
  if (!forceRefresh) {
    const cached = await getCachedInsights(userId);
    if (cached) {
      log.debug({ userId, count: cached.insights.length }, 'Returning cached insights');
      return cached.insights;
    }
  }

  log.info({ userId }, 'Generating fresh insights');

  // Generate all insights in parallel
  const [
    energyGoalInsights,
    blockerImpactInsights,
    decisionQualityInsights,
    focusEffectivenessInsights,
    momentumInsights,
    burnoutWarnings,
    weeklyPatterns,
  ] = await Promise.all([
    getEnergyGoalInsights(userId),
    getBlockerImpactInsights(userId),
    getDecisionQualityInsights(userId),
    getFocusEffectivenessInsights(userId),
    getMomentumInsights(userId),
    getBurnoutWarning(userId),
    getWeeklyPatterns(userId),
  ]);

  // Combine all insights
  const allInsights = [
    ...energyGoalInsights,
    ...blockerImpactInsights,
    ...decisionQualityInsights,
    ...focusEffectivenessInsights,
    ...momentumInsights,
    ...burnoutWarnings,
    ...weeklyPatterns,
  ];

  // Sort by priority and confidence
  const priorityOrder: Record<InsightPriority, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  allInsights.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.confidence - a.confidence;
  });

  // Cache the results
  await setCachedInsights(userId, allInsights);

  log.info({ userId, count: allInsights.length }, 'Generated and cached insights');

  return allInsights;
}

/**
 * Get insights filtered by category.
 */
export async function getInsightsByCategory(
  userId: string,
  category: InsightCategory
): Promise<Insight[]> {
  const all = await getAllInsights(userId);
  return all.filter((i) => i.category === category);
}

/**
 * Get insights filtered by type.
 */
export async function getInsightsByType(userId: string, type: InsightType): Promise<Insight[]> {
  const all = await getAllInsights(userId);
  return all.filter((i) => i.type === type);
}

/**
 * Get only urgent and high priority insights.
 */
export async function getCriticalInsights(userId: string): Promise<Insight[]> {
  const all = await getAllInsights(userId);
  return all.filter((i) => i.priority === 'urgent' || i.priority === 'high');
}

/**
 * Force refresh insights (bypass cache).
 */
export async function refreshInsights(userId: string): Promise<Insight[]> {
  return getAllInsights(userId, true);
}

// ============================================================================
// SERVICE INTERFACE
// ============================================================================

export interface InsightsService {
  getEnergyGoalInsights: (userId: string) => Promise<Insight[]>;
  getBlockerImpactInsights: (userId: string) => Promise<Insight[]>;
  getDecisionQualityInsights: (userId: string) => Promise<Insight[]>;
  getFocusEffectivenessInsights: (userId: string) => Promise<Insight[]>;
  getMomentumInsights: (userId: string) => Promise<Insight[]>;
  getBurnoutWarning: (userId: string) => Promise<Insight[]>;
  getWeeklyPatterns: (userId: string) => Promise<Insight[]>;
  getAllInsights: (userId: string, forceRefresh?: boolean) => Promise<Insight[]>;
  getInsightsByCategory: (userId: string, category: InsightCategory) => Promise<Insight[]>;
  getInsightsByType: (userId: string, type: InsightType) => Promise<Insight[]>;
  getCriticalInsights: (userId: string) => Promise<Insight[]>;
  refreshInsights: (userId: string) => Promise<Insight[]>;
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton insights service instance.
 * Use this for typed access to all insights operations.
 */
export const insightsService: InsightsService = {
  getEnergyGoalInsights,
  getBlockerImpactInsights,
  getDecisionQualityInsights,
  getFocusEffectivenessInsights,
  getMomentumInsights,
  getBurnoutWarning,
  getWeeklyPatterns,
  getAllInsights,
  getInsightsByCategory,
  getInsightsByType,
  getCriticalInsights,
  refreshInsights,
};

export default insightsService;
