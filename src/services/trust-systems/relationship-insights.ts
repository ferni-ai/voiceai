/**
 * Relationship Insights Report
 *
 * Generates periodic "State of Us" reports summarizing the relationship,
 * progress made, patterns noticed, and growth celebrated.
 *
 * Philosophy: Reflection creates meaning. Seeing the journey mapped
 * out helps people appreciate how far they've come.
 *
 * Report Types:
 * - Weekly snapshot (brief)
 * - Monthly insights (detailed)
 * - Quarterly reflection (comprehensive)
 * - Annual journey (milestone)
 *
 * @module RelationshipInsights
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'RelationshipInsights' });

// ============================================================================
// TYPES
// ============================================================================

export type ReportPeriod = 'week' | 'month' | 'quarter' | 'year';

export interface InsightsReport {
  id: string;
  userId: string;
  period: ReportPeriod;
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  
  // Summary
  summary: ReportSummary;
  
  // Sections
  conversations: ConversationInsights;
  growth: GrowthInsights;
  themes: ThemeInsights;
  wins: WinsInsights;
  challenges: ChallengeInsights;
  relationship: RelationshipInsights;
  
  // Forward looking
  lookingAhead: LookingAhead;
  
  // Shareable format
  shareableText?: string;
  shareableForTherapist?: string;
}

export interface ReportSummary {
  headline: string;
  subheadline: string;
  emoji: string;
  overallMood: 'flourishing' | 'growing' | 'steady' | 'challenging' | 'difficult';
  highlightQuote?: string;
}

export interface ConversationInsights {
  totalSessions: number;
  totalMinutes: number;
  avgSessionLength: number;
  longestSession: number;
  mostActiveDay: string;
  mostActiveTime: string;
  comparedToPrevious: 'more' | 'same' | 'less';
}

export interface GrowthInsights {
  growthAreas: GrowthArea[];
  breakthroughs: Breakthrough[];
  shiftsNoticed: string[];
  growthScore: number; // 0-100
}

export interface GrowthArea {
  area: string;
  progress: 'significant' | 'steady' | 'emerging' | 'maintained';
  evidence: string;
}

export interface Breakthrough {
  description: string;
  date: Date;
  significance: string;
}

export interface ThemeInsights {
  topThemes: Theme[];
  emergingThemes: string[];
  resolvedThemes: string[];
  recurringPatterns: string[];
}

export interface Theme {
  name: string;
  frequency: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  sentiment: 'positive' | 'neutral' | 'challenging';
}

export interface WinsInsights {
  totalWins: number;
  biggestWin?: string;
  winStreak: number;
  winCategories: Record<string, number>;
  celebrationMoments: string[];
}

export interface ChallengeInsights {
  mainChallenges: string[];
  progressOnChallenges: ChallengeProgress[];
  supportProvided: string[];
}

export interface ChallengeProgress {
  challenge: string;
  status: 'improving' | 'working_on' | 'persistent';
  insight: string;
}

export interface RelationshipInsights {
  trustLevel: 'new' | 'building' | 'established' | 'deep' | 'flourishing';
  trustChange: 'grew' | 'maintained' | 'tested';
  connectionMoments: string[];
  sharedHistory: string[];
}

export interface LookingAhead {
  focusAreas: string[];
  upcomingEvents: string[];
  intentions: string[];
  encouragement: string;
}

export interface ReportData {
  sessions: SessionData[];
  emotions: EmotionData[];
  topics: TopicData[];
  wins: WinData[];
  growth: GrowthData[];
}

export interface SessionData {
  date: Date;
  durationMinutes: number;
  mainTopic?: string;
  mood?: string;
}

export interface EmotionData {
  date: Date;
  emotion: string;
  intensity: number;
}

export interface TopicData {
  topic: string;
  frequency: number;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface WinData {
  date: Date;
  type: string;
  description: string;
}

export interface GrowthData {
  area: string;
  observation: string;
  date: Date;
}

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

const reportHistory = new Map<string, InsightsReport[]>();
const reportData = new Map<string, ReportData>();

// ============================================================================
// DATA COLLECTION
// ============================================================================

/**
 * Record session data for reports
 */
export function recordSessionData(
  userId: string,
  session: SessionData
): void {
  const data = getOrCreateReportData(userId);
  data.sessions.push(session);

  // Keep last 365 days
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  data.sessions = data.sessions.filter((s) => s.date >= yearAgo);
}

/**
 * Record emotion data
 */
export function recordEmotionData(
  userId: string,
  emotion: EmotionData
): void {
  const data = getOrCreateReportData(userId);
  data.emotions.push(emotion);

  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  data.emotions = data.emotions.filter((e) => e.date >= yearAgo);
}

/**
 * Record topic data
 */
export function recordTopicData(
  userId: string,
  topic: string,
  sentiment: 'positive' | 'neutral' | 'negative'
): void {
  const data = getOrCreateReportData(userId);

  const existing = data.topics.find((t) => t.topic === topic);
  if (existing) {
    existing.frequency++;
    existing.sentiment = sentiment; // Update to most recent
  } else {
    data.topics.push({ topic, frequency: 1, sentiment });
  }
}

/**
 * Record win data
 */
export function recordWinData(
  userId: string,
  win: WinData
): void {
  const data = getOrCreateReportData(userId);
  data.wins.push(win);

  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  data.wins = data.wins.filter((w) => w.date >= yearAgo);
}

/**
 * Record growth observation
 */
export function recordGrowthData(
  userId: string,
  growth: GrowthData
): void {
  const data = getOrCreateReportData(userId);
  data.growth.push(growth);

  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  data.growth = data.growth.filter((g) => g.date >= yearAgo);
}

function getOrCreateReportData(userId: string): ReportData {
  let data = reportData.get(userId);
  if (!data) {
    data = {
      sessions: [],
      emotions: [],
      topics: [],
      wins: [],
      growth: [],
    };
    reportData.set(userId, data);
  }
  return data;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

/**
 * Generate insights report
 */
export function generateReport(
  userId: string,
  period: ReportPeriod
): InsightsReport {
  const data = getOrCreateReportData(userId);
  const now = new Date();

  // Calculate period bounds
  const periodDays = { week: 7, month: 30, quarter: 90, year: 365 };
  const periodStart = new Date(now.getTime() - periodDays[period] * 24 * 60 * 60 * 1000);

  // Filter data to period
  const periodSessions = data.sessions.filter((s) => s.date >= periodStart);
  const periodEmotions = data.emotions.filter((e) => e.date >= periodStart);
  const periodWins = data.wins.filter((w) => w.date >= periodStart);
  const periodGrowth = data.growth.filter((g) => g.date >= periodStart);

  // Generate report sections
  const conversations = generateConversationInsights(periodSessions, period, data);
  const growth = generateGrowthInsights(periodGrowth, periodSessions);
  const themes = generateThemeInsights(data.topics, periodSessions);
  const wins = generateWinsInsights(periodWins);
  const challenges = generateChallengeInsights(periodSessions, periodEmotions);
  const relationship = generateRelationshipInsights(periodSessions, periodWins);
  const lookingAhead = generateLookingAhead(themes, challenges, growth);

  // Generate summary
  const summary = generateSummary(
    conversations,
    growth,
    wins,
    challenges,
    period
  );

  const report: InsightsReport = {
    id: `report-${userId}-${period}-${Date.now()}`,
    userId,
    period,
    generatedAt: now,
    periodStart,
    periodEnd: now,
    summary,
    conversations,
    growth,
    themes,
    wins,
    challenges,
    relationship,
    lookingAhead,
  };

  // Generate shareable versions
  report.shareableText = generateShareableText(report);
  report.shareableForTherapist = generateTherapistSummary(report);

  // Store report
  const history = reportHistory.get(userId) || [];
  history.push(report);
  // Keep last 12 reports
  if (history.length > 12) history.shift();
  reportHistory.set(userId, history);

  log.info({
    userId,
    period,
    sessions: conversations.totalSessions,
    wins: wins.totalWins,
  }, '📊 Insights report generated');

  return report;
}

/**
 * Generate conversation insights
 */
function generateConversationInsights(
  sessions: SessionData[],
  period: ReportPeriod,
  allData: ReportData
): ConversationInsights {
  const totalSessions = sessions.length;
  const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  const avgSessionLength = totalSessions > 0 ? totalMinutes / totalSessions : 0;
  const longestSession = sessions.length > 0
    ? Math.max(...sessions.map((s) => s.durationMinutes))
    : 0;

  // Find most active day
  const dayCounts: Record<string, number> = {};
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (const session of sessions) {
    const day = dayNames[session.date.getDay()];
    dayCounts[day] = (dayCounts[day] || 0) + 1;
  }
  const mostActiveDay = Object.entries(dayCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  // Find most active time
  const hourCounts: Record<string, number> = {};
  for (const session of sessions) {
    const hour = session.date.getHours();
    const timeSlot = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    hourCounts[timeSlot] = (hourCounts[timeSlot] || 0) + 1;
  }
  const mostActiveTime = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  // Compare to previous period
  const periodDays = { week: 7, month: 30, quarter: 90, year: 365 };
  const previousPeriodStart = new Date(
    Date.now() - periodDays[period] * 2 * 24 * 60 * 60 * 1000
  );
  const previousPeriodEnd = new Date(
    Date.now() - periodDays[period] * 24 * 60 * 60 * 1000
  );
  const previousSessions = allData.sessions.filter(
    (s) => s.date >= previousPeriodStart && s.date < previousPeriodEnd
  );

  let comparedToPrevious: 'more' | 'same' | 'less' = 'same';
  if (totalSessions > previousSessions.length * 1.2) {
    comparedToPrevious = 'more';
  } else if (totalSessions < previousSessions.length * 0.8) {
    comparedToPrevious = 'less';
  }

  return {
    totalSessions,
    totalMinutes: Math.round(totalMinutes),
    avgSessionLength: Math.round(avgSessionLength),
    longestSession,
    mostActiveDay,
    mostActiveTime,
    comparedToPrevious,
  };
}

/**
 * Generate growth insights
 */
function generateGrowthInsights(
  growthData: GrowthData[],
  sessions: SessionData[]
): GrowthInsights {
  // Group by area
  const areaMap = new Map<string, GrowthData[]>();
  for (const g of growthData) {
    const existing = areaMap.get(g.area) || [];
    existing.push(g);
    areaMap.set(g.area, existing);
  }

  const growthAreas: GrowthArea[] = [];
  for (const [area, observations] of areaMap) {
    let progress: GrowthArea['progress'] = 'emerging';
    if (observations.length >= 5) progress = 'significant';
    else if (observations.length >= 3) progress = 'steady';

    growthAreas.push({
      area,
      progress,
      evidence: observations[observations.length - 1]?.observation || '',
    });
  }

  // Identify breakthroughs (significant observations)
  const breakthroughs: Breakthrough[] = growthData
    .filter((g) => g.observation.toLowerCase().includes('breakthrough') ||
      g.observation.toLowerCase().includes('first time'))
    .slice(-3)
    .map((g) => ({
      description: g.observation,
      date: g.date,
      significance: `Growth in ${g.area}`,
    }));

  // Calculate growth score
  const growthScore = Math.min(100, growthAreas.length * 15 + breakthroughs.length * 20);

  return {
    growthAreas: growthAreas.slice(0, 5),
    breakthroughs,
    shiftsNoticed: growthData.slice(-3).map((g) => g.observation),
    growthScore,
  };
}

/**
 * Generate theme insights
 */
function generateThemeInsights(
  topics: TopicData[],
  sessions: SessionData[]
): ThemeInsights {
  // Sort by frequency
  const sortedTopics = [...topics].sort((a, b) => b.frequency - a.frequency);

  const topThemes: Theme[] = sortedTopics.slice(0, 5).map((t) => {
    const sentiment: Theme['sentiment'] = t.sentiment === 'negative' ? 'challenging' : t.sentiment;
    return {
      name: t.topic,
      frequency: t.frequency,
      trend: 'stable' as const, // Would calculate from history
      sentiment,
    };
  });

  // Emerging = low frequency but recent
  const emergingThemes = sortedTopics
    .filter((t) => t.frequency <= 2)
    .slice(0, 3)
    .map((t) => t.topic);

  // Resolved = used to be frequent but not recently
  const resolvedThemes: string[] = []; // Would need historical comparison

  return {
    topThemes,
    emergingThemes,
    resolvedThemes,
    recurringPatterns: topThemes.slice(0, 3).map((t) => t.name),
  };
}

/**
 * Generate wins insights
 */
function generateWinsInsights(wins: WinData[]): WinsInsights {
  const totalWins = wins.length;

  // Find biggest win (most recent high-impact)
  const biggestWin = wins.length > 0
    ? wins[wins.length - 1]?.description
    : undefined;

  // Calculate streak (consecutive days with wins)
  let winStreak = 0;
  if (wins.length > 0) {
    const sortedWins = [...wins].sort((a, b) => b.date.getTime() - a.date.getTime());
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const win of sortedWins) {
      const winDate = new Date(win.date);
      winDate.setHours(0, 0, 0, 0);

      const daysAgo = Math.floor((today.getTime() - winDate.getTime()) / (24 * 60 * 60 * 1000));
      if (daysAgo === winStreak) {
        winStreak++;
      } else {
        break;
      }
    }
  }

  // Categorize wins
  const winCategories: Record<string, number> = {};
  for (const win of wins) {
    winCategories[win.type] = (winCategories[win.type] || 0) + 1;
  }

  // Celebration moments
  const celebrationMoments = wins.slice(-3).map((w) => w.description);

  return {
    totalWins,
    biggestWin,
    winStreak,
    winCategories,
    celebrationMoments,
  };
}

/**
 * Generate challenge insights
 */
function generateChallengeInsights(
  sessions: SessionData[],
  emotions: EmotionData[]
): ChallengeInsights {
  // Find challenging emotions
  const challengingEmotions = emotions.filter(
    (e) => ['anxious', 'sad', 'overwhelmed', 'stressed', 'angry'].includes(e.emotion)
  );

  // Extract main challenges from session topics
  const challengingTopics = sessions
    .filter((s) => s.mood && ['difficult', 'challenging', 'hard'].includes(s.mood))
    .map((s) => s.mainTopic)
    .filter(Boolean);

  const mainChallenges = [...new Set(challengingTopics)].slice(0, 3) as string[];

  return {
    mainChallenges,
    progressOnChallenges: mainChallenges.map((c) => ({
      challenge: c,
      status: 'working_on' as const,
      insight: 'Continuing to address this area',
    })),
    supportProvided: ['Emotional support', 'Problem-solving', 'Perspective'],
  };
}

/**
 * Generate relationship insights
 */
function generateRelationshipInsights(
  sessions: SessionData[],
  wins: WinData[]
): RelationshipInsights {
  // Determine trust level from engagement
  let trustLevel: RelationshipInsights['trustLevel'] = 'new';
  if (sessions.length >= 50) trustLevel = 'flourishing';
  else if (sessions.length >= 20) trustLevel = 'deep';
  else if (sessions.length >= 10) trustLevel = 'established';
  else if (sessions.length >= 5) trustLevel = 'building';

  return {
    trustLevel,
    trustChange: 'grew',
    connectionMoments: ['Deep conversation', 'Vulnerability shared', 'Growth acknowledged'],
    sharedHistory: wins.slice(-3).map((w) => w.description),
  };
}

/**
 * Generate looking ahead section
 */
function generateLookingAhead(
  themes: ThemeInsights,
  challenges: ChallengeInsights,
  growth: GrowthInsights
): LookingAhead {
  const focusAreas = [
    ...challenges.mainChallenges.slice(0, 2),
    ...growth.growthAreas.filter((g) => g.progress === 'emerging').map((g) => g.area),
  ].slice(0, 3);

  const encouragement = growth.growthScore >= 60
    ? "You're making real progress. Keep going!"
    : growth.growthScore >= 30
    ? "Every step forward counts. You're doing great."
    : "Remember, growth isn't always visible. You're showing up, and that matters.";

  return {
    focusAreas,
    upcomingEvents: [], // Would integrate with life events
    intentions: focusAreas.map((a) => `Continue working on ${a}`),
    encouragement,
  };
}

/**
 * Generate summary
 */
function generateSummary(
  conversations: ConversationInsights,
  growth: GrowthInsights,
  wins: WinsInsights,
  challenges: ChallengeInsights,
  period: ReportPeriod
): ReportSummary {
  // Determine overall mood
  let overallMood: ReportSummary['overallMood'] = 'steady';
  if (growth.growthScore >= 70 && wins.totalWins >= 5) {
    overallMood = 'flourishing';
  } else if (growth.growthScore >= 50 || wins.totalWins >= 3) {
    overallMood = 'growing';
  } else if (challenges.mainChallenges.length > 3) {
    overallMood = 'challenging';
  }

  const periodLabel = {
    week: 'This Week',
    month: 'This Month',
    quarter: 'This Quarter',
    year: 'This Year',
  };

  const headlines: Record<ReportSummary['overallMood'], string> = {
    flourishing: `${periodLabel[period]}: You're Thriving`,
    growing: `${periodLabel[period]}: Real Growth`,
    steady: `${periodLabel[period]}: Steady Progress`,
    challenging: `${periodLabel[period]}: Working Through It`,
    difficult: `${periodLabel[period]}: Tough But Moving`,
  };

  const emojis: Record<ReportSummary['overallMood'], string> = {
    flourishing: '🌟',
    growing: '🌱',
    steady: '💫',
    challenging: '💪',
    difficult: '🤍',
  };

  return {
    headline: headlines[overallMood],
    subheadline: `${conversations.totalSessions} conversations, ${wins.totalWins} wins`,
    emoji: emojis[overallMood],
    overallMood,
    highlightQuote: wins.biggestWin,
  };
}

// ============================================================================
// SHAREABLE FORMATS
// ============================================================================

/**
 * Generate shareable text version
 */
function generateShareableText(report: InsightsReport): string {
  const lines: string[] = [];

  lines.push(`${report.summary.emoji} ${report.summary.headline}`);
  lines.push(report.summary.subheadline);
  lines.push('');

  if (report.wins.celebrationMoments.length > 0) {
    lines.push('🎉 Wins:');
    for (const win of report.wins.celebrationMoments) {
      lines.push(`  • ${win}`);
    }
    lines.push('');
  }

  if (report.growth.shiftsNoticed.length > 0) {
    lines.push('🌱 Growth:');
    for (const shift of report.growth.shiftsNoticed) {
      lines.push(`  • ${shift}`);
    }
    lines.push('');
  }

  lines.push(`💬 ${report.conversations.totalSessions} conversations, ${report.conversations.totalMinutes} minutes`);
  lines.push('');
  lines.push(report.lookingAhead.encouragement);

  return lines.join('\n');
}

/**
 * Generate therapist-friendly summary
 */
function generateTherapistSummary(report: InsightsReport): string {
  const lines: string[] = [];

  lines.push(`Report Period: ${report.periodStart.toDateString()} - ${report.periodEnd.toDateString()}`);
  lines.push('');

  lines.push('ENGAGEMENT:');
  lines.push(`  Sessions: ${report.conversations.totalSessions}`);
  lines.push(`  Total time: ${report.conversations.totalMinutes} minutes`);
  lines.push(`  Trend: ${report.conversations.comparedToPrevious} than previous period`);
  lines.push('');

  lines.push('THEMES:');
  for (const theme of report.themes.topThemes) {
    lines.push(`  • ${theme.name} (${theme.sentiment})`);
  }
  lines.push('');

  lines.push('CHALLENGES:');
  for (const challenge of report.challenges.mainChallenges) {
    lines.push(`  • ${challenge}`);
  }
  lines.push('');

  lines.push('GROWTH AREAS:');
  for (const area of report.growth.growthAreas) {
    lines.push(`  • ${area.area}: ${area.progress}`);
  }
  lines.push('');

  lines.push(`OVERALL: ${report.summary.overallMood}`);
  lines.push(`Trust Level: ${report.relationship.trustLevel}`);

  return lines.join('\n');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get report history
 */
export function getReportHistory(userId: string): InsightsReport[] {
  return reportHistory.get(userId) || [];
}

/**
 * Get latest report
 */
export function getLatestReport(
  userId: string,
  period?: ReportPeriod
): InsightsReport | null {
  const history = reportHistory.get(userId) || [];

  if (period) {
    return history.filter((r) => r.period === period).pop() || null;
  }

  return history[history.length - 1] || null;
}

/**
 * Check if report is due
 */
export function isReportDue(userId: string, period: ReportPeriod): boolean {
  const latest = getLatestReport(userId, period);
  if (!latest) return true;

  const periodDays = { week: 7, month: 30, quarter: 90, year: 365 };
  const daysSinceReport = (Date.now() - latest.generatedAt.getTime()) / (24 * 60 * 60 * 1000);

  return daysSinceReport >= periodDays[period];
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  recordSessionData,
  recordEmotionData,
  recordTopicData,
  recordWinData,
  recordGrowthData,
  generateReport,
  getReportHistory,
  getLatestReport,
  isReportDue,
};

