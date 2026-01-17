/**
 * Weekly Calendar Digest Service
 *
 * Generates comprehensive weekly calendar digests for proactive outreach.
 * This is "Better Than Human" because:
 * - No human assistant could track all these patterns
 * - Personalized insights based on your unique calendar history
 * - Proactive recommendations before problems arise
 *
 * @module calendar/weekly-calendar-digest
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getCalendarLoadFactors } from './calendar-load-service.js';
import { detectRecoveryNeeds } from './recovery-protection.js';
import { getWeekOverview, type DayOverview } from './calendar-service.js';
import { analyzeCalendarPatterns, type CalendarPatterns } from './calendar-intelligence.js';

const log = createLogger({ module: 'weekly-calendar-digest' });

// ============================================================================
// TYPES
// ============================================================================

/** Pattern item for the digest (derived from CalendarPatterns analysis) */
export interface CalendarPatternItem {
  type: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface WeeklyDigest {
  userId: string;
  weekStartDate: Date;
  weekEndDate: Date;
  generatedAt: Date;

  // Summary stats
  summary: {
    totalMeetingHours: number;
    totalMeetings: number;
    focusTimePercent: number;
    backToBackPercent: number;
    busiestDay: { name: string; hours: number; meetings: number };
    lightestDay: { name: string; hours: number; meetings: number };
  };

  // Daily breakdown
  dailyBreakdown: DailyDigest[];

  // Health assessment
  health: {
    score: number; // 0-100
    status: 'excellent' | 'good' | 'needs-attention' | 'concerning';
    factors: HealthFactor[];
  };

  // Detected patterns
  patterns: CalendarPatternItem[];

  // Recommendations
  recommendations: Recommendation[];

  // Insights for conversation
  conversationStarters: string[];
}

export interface DailyDigest {
  date: Date;
  dayName: string;
  meetingHours: number;
  meetingCount: number;
  focusHours: number;
  isOverloaded: boolean;
  hasBackToBack: boolean;
  highlights: string[];
}

export interface HealthFactor {
  factor: string;
  status: 'positive' | 'neutral' | 'negative';
  description: string;
  weight: number;
}

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  category: 'focus' | 'recovery' | 'scheduling' | 'habits';
  title: string;
  description: string;
  suggestedAction?: string;
}

// ============================================================================
// DIGEST GENERATION
// ============================================================================

/**
 * Generate a comprehensive weekly calendar digest.
 */
export async function generateWeeklyDigest(userId: string): Promise<WeeklyDigest> {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(now);

  // Fetch all calendar data
  const [loadFactors, recoveryNeeds, weekOverview, patterns] = await Promise.all([
    getCalendarLoadFactors(userId),
    detectRecoveryNeeds(userId),
    getWeekOverview(userId, now),
    analyzeCalendarPatterns(userId),
  ]);

  // Build daily breakdown
  const dailyBreakdown = weekOverview.days.map((day) => buildDailyDigest(day));

  // Calculate summary
  const summary = buildSummary(weekOverview.days, loadFactors);

  // Transform CalendarPatterns object to CalendarPatternItem[]
  const patternItems = convertPatternsToItems(patterns);

  // Assess health
  const health = assessCalendarHealth(loadFactors, recoveryNeeds, summary);

  // Generate recommendations
  const recommendations = generateRecommendations(loadFactors, recoveryNeeds, patternItems, health);

  // Generate conversation starters
  const conversationStarters = generateConversationStarters(summary, health, recommendations);

  const digest: WeeklyDigest = {
    userId,
    weekStartDate: weekStart,
    weekEndDate: weekEnd,
    generatedAt: now,
    summary,
    dailyBreakdown,
    health,
    patterns: patternItems,
    recommendations,
    conversationStarters,
  };

  log.info(
    { userId, healthScore: health.score, meetingHours: summary.totalMeetingHours },
    'Generated weekly calendar digest'
  );

  return digest;
}

/**
 * Convert CalendarPatterns object to array of CalendarPatternItem.
 */
function convertPatternsToItems(patterns: CalendarPatterns): CalendarPatternItem[] {
  const items: CalendarPatternItem[] = [];

  // Analyze the patterns and create actionable items
  if (patterns.focusTimeRatio < 0.2) {
    items.push({
      type: 'warning',
      title: 'Very low focus time',
      description: `Only ${Math.round(patterns.focusTimeRatio * 100)}% of your work hours are uninterrupted.`,
      severity: 'warning',
    });
  } else if (patterns.focusTimeRatio < 0.35) {
    items.push({
      type: 'info',
      title: 'Limited focus time',
      description: `About ${Math.round(patterns.focusTimeRatio * 100)}% of your work hours are uninterrupted.`,
      severity: 'info',
    });
  }

  if (patterns.backToBackFrequency > 0.5) {
    items.push({
      type: 'warning',
      title: 'Frequent back-to-back meetings',
      description: `${Math.round(patterns.backToBackFrequency * 100)}% of meetings are back-to-back.`,
      severity: 'warning',
    });
  }

  if (patterns.totalMeetingHoursThisWeek > 30) {
    items.push({
      type: 'critical',
      title: 'Heavy meeting load',
      description: `${Math.round(patterns.totalMeetingHoursThisWeek)} hours of meetings this week.`,
      severity: 'critical',
    });
  } else if (patterns.totalMeetingHoursThisWeek > 20) {
    items.push({
      type: 'info',
      title: 'Moderate meeting load',
      description: `${Math.round(patterns.totalMeetingHoursThisWeek)} hours of meetings this week.`,
      severity: 'info',
    });
  }

  if (patterns.busiestDayOfWeek) {
    items.push({
      type: 'info',
      title: 'Busiest day identified',
      description: `${patterns.busiestDayOfWeek} tends to be your busiest day.`,
      severity: 'info',
    });
  }

  return items;
}

/**
 * Get start of week (Sunday).
 */
function getWeekStart(date: Date): Date {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Get end of week (Saturday).
 */
function getWeekEnd(date: Date): Date {
  const end = new Date(date);
  end.setDate(end.getDate() + (6 - end.getDay()));
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Build daily digest from day overview.
 */
function buildDailyDigest(day: DayOverview): DailyDigest {
  const highlights: string[] = [];

  if (day.isOverloaded) {
    highlights.push('Heavy meeting day');
  }
  if (day.hasBackToBack) {
    highlights.push('Back-to-back meetings');
  }
  if (day.totalMeetings === 0) {
    highlights.push('Meeting-free day');
  }
  if (day.freeTimeMinutes >= 240) {
    highlights.push('Good focus time available');
  }

  return {
    date: day.date,
    dayName: day.date.toLocaleDateString('en-US', { weekday: 'long' }),
    meetingHours: day.totalMeetingMinutes / 60,
    meetingCount: day.totalMeetings,
    focusHours: day.freeTimeMinutes / 60,
    isOverloaded: day.isOverloaded,
    hasBackToBack: day.hasBackToBack,
    highlights,
  };
}

/**
 * Build summary from week data.
 */
function buildSummary(
  days: DayOverview[],
  loadFactors: Awaited<ReturnType<typeof getCalendarLoadFactors>>
): WeeklyDigest['summary'] {
  const totalMeetingMinutes = days.reduce((sum, d) => sum + d.totalMeetingMinutes, 0);
  const totalMeetings = days.reduce((sum, d) => sum + d.totalMeetings, 0);

  // Find busiest and lightest days
  const sortedByMeetings = [...days].sort((a, b) => b.totalMeetingMinutes - a.totalMeetingMinutes);
  const busiestDay = sortedByMeetings[0];
  const lightestDay = sortedByMeetings[sortedByMeetings.length - 1];

  return {
    totalMeetingHours: totalMeetingMinutes / 60,
    totalMeetings,
    focusTimePercent: Math.round(loadFactors.weeklyFocusTimeRatio * 100),
    backToBackPercent: Math.round(loadFactors.weeklyBackToBackPercentage),
    busiestDay: {
      name: busiestDay.date.toLocaleDateString('en-US', { weekday: 'long' }),
      hours: busiestDay.totalMeetingMinutes / 60,
      meetings: busiestDay.totalMeetings,
    },
    lightestDay: {
      name: lightestDay.date.toLocaleDateString('en-US', { weekday: 'long' }),
      hours: lightestDay.totalMeetingMinutes / 60,
      meetings: lightestDay.totalMeetings,
    },
  };
}

/**
 * Assess overall calendar health.
 */
function assessCalendarHealth(
  loadFactors: Awaited<ReturnType<typeof getCalendarLoadFactors>>,
  recoveryNeeds: Awaited<ReturnType<typeof detectRecoveryNeeds>>,
  summary: WeeklyDigest['summary']
): WeeklyDigest['health'] {
  const factors: HealthFactor[] = [];
  let totalWeight = 0;
  let weightedScore = 0;

  // Meeting load factor (weight: 30)
  const meetingLoadFactor = assessMeetingLoad(summary.totalMeetingHours);
  factors.push(meetingLoadFactor);
  totalWeight += meetingLoadFactor.weight;
  weightedScore +=
    meetingLoadFactor.weight *
    (meetingLoadFactor.status === 'positive'
      ? 100
      : meetingLoadFactor.status === 'neutral'
        ? 70
        : 30);

  // Focus time factor (weight: 25)
  const focusFactor = assessFocusTime(summary.focusTimePercent);
  factors.push(focusFactor);
  totalWeight += focusFactor.weight;
  weightedScore +=
    focusFactor.weight *
    (focusFactor.status === 'positive' ? 100 : focusFactor.status === 'neutral' ? 70 : 30);

  // Back-to-back factor (weight: 20)
  const backToBackFactor = assessBackToBack(summary.backToBackPercent);
  factors.push(backToBackFactor);
  totalWeight += backToBackFactor.weight;
  weightedScore +=
    backToBackFactor.weight *
    (backToBackFactor.status === 'positive'
      ? 100
      : backToBackFactor.status === 'neutral'
        ? 70
        : 30);

  // Recovery factor (weight: 25)
  const recoveryFactor = assessRecoveryNeeds(recoveryNeeds);
  factors.push(recoveryFactor);
  totalWeight += recoveryFactor.weight;
  weightedScore +=
    recoveryFactor.weight *
    (recoveryFactor.status === 'positive' ? 100 : recoveryFactor.status === 'neutral' ? 70 : 30);

  const score = Math.round(weightedScore / totalWeight);

  let status: WeeklyDigest['health']['status'] = 'excellent';
  if (score < 50) status = 'concerning';
  else if (score < 65) status = 'needs-attention';
  else if (score < 80) status = 'good';

  return { score, status, factors };
}

function assessMeetingLoad(hours: number): HealthFactor {
  const factor = 'Meeting Load';
  const weight = 30;

  if (hours <= 15) {
    return { factor, status: 'positive', description: 'Light meeting load', weight };
  } else if (hours <= 25) {
    return { factor, status: 'neutral', description: 'Moderate meeting load', weight };
  } else {
    return { factor, status: 'negative', description: 'Heavy meeting load', weight };
  }
}

function assessFocusTime(percent: number): HealthFactor {
  const factor = 'Focus Time';
  const weight = 25;

  if (percent >= 40) {
    return { factor, status: 'positive', description: 'Plenty of focus time', weight };
  } else if (percent >= 25) {
    return { factor, status: 'neutral', description: 'Some focus time available', weight };
  } else {
    return { factor, status: 'negative', description: 'Very limited focus time', weight };
  }
}

function assessBackToBack(percent: number): HealthFactor {
  const factor = 'Meeting Flow';
  const weight = 20;

  if (percent <= 20) {
    return { factor, status: 'positive', description: 'Good breaks between meetings', weight };
  } else if (percent <= 40) {
    return { factor, status: 'neutral', description: 'Some back-to-back meetings', weight };
  } else {
    return { factor, status: 'negative', description: 'Many back-to-back meetings', weight };
  }
}

function assessRecoveryNeeds(
  recoveryNeeds: Awaited<ReturnType<typeof detectRecoveryNeeds>>
): HealthFactor {
  const factor = 'Recovery Status';
  const weight = 25;

  if (recoveryNeeds.length === 0) {
    return { factor, status: 'positive', description: 'No recovery concerns', weight };
  }

  const urgentNeeds = recoveryNeeds.filter((r) => r.urgency === 'immediate');
  if (urgentNeeds.length > 0) {
    return { factor, status: 'negative', description: 'Recovery needed', weight };
  }

  return { factor, status: 'neutral', description: 'Minor recovery recommended', weight };
}

/**
 * Generate actionable recommendations.
 */
function generateRecommendations(
  loadFactors: Awaited<ReturnType<typeof getCalendarLoadFactors>>,
  recoveryNeeds: Awaited<ReturnType<typeof detectRecoveryNeeds>>,
  patterns: CalendarPatternItem[],
  health: WeeklyDigest['health']
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Focus time recommendations
  if (loadFactors.weeklyFocusTimeRatio < 0.2) {
    recommendations.push({
      priority: 'high',
      category: 'focus',
      title: 'Block focus time',
      description: 'Your focus time is below 20%. Protect at least 2 hours daily for deep work.',
      suggestedAction: 'Block 2 hours on your lightest day',
    });
  }

  // Back-to-back recommendations
  if (loadFactors.weeklyBackToBackPercentage > 40) {
    recommendations.push({
      priority: 'medium',
      category: 'scheduling',
      title: 'Add meeting buffers',
      description: 'Over 40% of your meetings are back-to-back. Add 5-10 minute buffers.',
      suggestedAction: 'Enable "speedy meetings" in calendar settings',
    });
  }

  // Recovery recommendations
  if (recoveryNeeds.length > 0) {
    const topNeed = recoveryNeeds[0];
    recommendations.push({
      priority: topNeed.urgency === 'immediate' ? 'high' : 'medium',
      category: 'recovery',
      title: 'Schedule recovery time',
      description: topNeed.reason,
      suggestedAction: topNeed.suggestedAction?.description,
    });
  }

  // Pattern-based recommendations
  for (const pattern of patterns.slice(0, 2)) {
    if (pattern.severity === 'warning' || pattern.severity === 'critical') {
      recommendations.push({
        priority: pattern.severity === 'critical' ? 'high' : 'medium',
        category: 'scheduling',
        title: pattern.title,
        description: pattern.description,
      });
    }
  }

  // Health-based recommendations
  if (health.status === 'concerning') {
    recommendations.push({
      priority: 'high',
      category: 'recovery',
      title: 'Review your calendar',
      description:
        'Your calendar health score is concerning. Consider declining or rescheduling non-essential meetings.',
    });
  }

  return recommendations.slice(0, 5); // Max 5 recommendations
}

/**
 * Generate natural conversation starters for proactive outreach.
 */
function generateConversationStarters(
  summary: WeeklyDigest['summary'],
  health: WeeklyDigest['health'],
  recommendations: Recommendation[]
): string[] {
  const starters: string[] = [];

  // Positive opener if health is good
  if (health.score >= 80) {
    starters.push('Your calendar looks balanced this week. Nice work protecting your time!');
  }

  // Meeting load observation
  if (summary.totalMeetingHours > 30) {
    starters.push(
      `I noticed you have ${Math.round(summary.totalMeetingHours)} hours of meetings this week. That's a lot.`
    );
  } else if (summary.totalMeetingHours < 10) {
    starters.push(
      `Lighter meeting week ahead with only ${Math.round(summary.totalMeetingHours)} hours scheduled.`
    );
  }

  // Focus time observation
  if (summary.focusTimePercent < 20) {
    starters.push(
      'I see you have very little uninterrupted time this week. Want help blocking some focus time?'
    );
  }

  // Day comparison
  if (summary.busiestDay.name !== summary.lightestDay.name) {
    starters.push(
      `${summary.busiestDay.name} looks packed, but ${summary.lightestDay.name} has more breathing room.`
    );
  }

  // Recommendation-based
  if (recommendations.length > 0) {
    const topRec = recommendations[0];
    starters.push(`One thing that might help: ${topRec.title.toLowerCase()}.`);
  }

  return starters.slice(0, 3); // Max 3 starters
}

// ============================================================================
// DIGEST DELIVERY
// ============================================================================

/**
 * Format digest for push notification.
 */
export function formatDigestForPush(digest: WeeklyDigest): {
  title: string;
  body: string;
  data: Record<string, unknown>;
} {
  const healthEmoji =
    digest.health.status === 'excellent'
      ? '💚'
      : digest.health.status === 'good'
        ? '💛'
        : digest.health.status === 'needs-attention'
          ? '🟠'
          : '🔴';

  return {
    title: `${healthEmoji} Your Week Ahead`,
    body:
      digest.conversationStarters[0] ||
      `${Math.round(digest.summary.totalMeetingHours)}h of meetings across ${digest.summary.totalMeetings} calls`,
    data: {
      type: 'weekly-digest',
      healthScore: digest.health.score,
      meetingHours: digest.summary.totalMeetingHours,
      focusPercent: digest.summary.focusTimePercent,
    },
  };
}

/**
 * Format digest for email.
 */
export function formatDigestForEmail(digest: WeeklyDigest): {
  subject: string;
  previewText: string;
  sections: Array<{ title: string; content: string }>;
} {
  const weekStr = `${digest.weekStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${digest.weekEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const sections = [
    {
      title: 'At a Glance',
      content: `
- **${Math.round(digest.summary.totalMeetingHours)}h** of meetings
- **${digest.summary.focusTimePercent}%** focus time
- **${digest.health.score}/100** calendar health
- Busiest: **${digest.summary.busiestDay.name}** (${Math.round(digest.summary.busiestDay.hours)}h)
- Lightest: **${digest.summary.lightestDay.name}**
      `.trim(),
    },
  ];

  if (digest.recommendations.length > 0) {
    sections.push({
      title: 'Recommendations',
      content: digest.recommendations
        .slice(0, 3)
        .map((r) => `- ${r.title}: ${r.description}`)
        .join('\n'),
    });
  }

  return {
    subject: `Your Week Ahead (${weekStr})`,
    previewText:
      digest.conversationStarters[0] ||
      `${Math.round(digest.summary.totalMeetingHours)}h of meetings this week`,
    sections,
  };
}

/**
 * Build context injection for proactive outreach.
 */
export async function buildWeeklyDigestContextInjection(userId: string): Promise<string | null> {
  try {
    const digest = await generateWeeklyDigest(userId);

    const sections: string[] = ['[WEEKLY CALENDAR DIGEST - Better Than Human Proactive Care]'];

    // Summary
    sections.push(`\n**Week at a Glance:**`);
    sections.push(`- Meeting Hours: ${Math.round(digest.summary.totalMeetingHours)}h`);
    sections.push(`- Focus Time: ${digest.summary.focusTimePercent}%`);
    sections.push(`- Health Score: ${digest.health.score}/100 (${digest.health.status})`);
    sections.push(
      `- Busiest Day: ${digest.summary.busiestDay.name} (${Math.round(digest.summary.busiestDay.hours)}h)`
    );
    sections.push(`- Lightest Day: ${digest.summary.lightestDay.name}`);

    // Key factors
    if (digest.health.factors.some((f) => f.status === 'negative')) {
      sections.push(`\n**Concerns:**`);
      digest.health.factors
        .filter((f) => f.status === 'negative')
        .forEach((f) => sections.push(`- ${f.description}`));
    }

    // Top recommendation
    if (digest.recommendations.length > 0) {
      const topRec = digest.recommendations[0];
      sections.push(`\n**Top Recommendation:** ${topRec.title}`);
      sections.push(`${topRec.description}`);
    }

    // Conversation starters
    if (digest.conversationStarters.length > 0) {
      sections.push(`\n**Conversation Starter:** "${digest.conversationStarters[0]}"`);
    }

    return sections.join('\n');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to build weekly digest injection');
    return null;
  }
}
