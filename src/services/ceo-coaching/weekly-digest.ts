/**
 * CEO Coaching Weekly Digest
 *
 * Generates weekly summary emails with:
 * - Win highlights and patterns
 * - Energy trends and insights
 * - Blocker status and escalations
 * - Decision progress
 * - Gratitude reflections
 *
 * Called by Cloud Scheduler every Sunday at 8 AM.
 *
 * @module services/ceo-coaching/weekly-digest
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getRecentWins,
  getEnergyTrend,
  getRecentEnergyEntries,
  getActiveBlockers,
  getPendingDecisions,
  getRecentGratitude,
  getPriorities,
} from '../../tools/domains/ceo-coaching/storage.js';

const log = createLogger({ module: 'ceo-weekly-digest' });

// ============================================================================
// TYPES
// ============================================================================

export interface WeeklyDigestData {
  userId: string;
  weekStart: string;
  weekEnd: string;

  // Wins
  wins: {
    count: number;
    highlights: string[];
    categories: Record<string, number>;
  };

  // Energy
  energy: {
    average: number;
    trend: 'up' | 'down' | 'stable';
    bestDay?: string;
    lowestDay?: string;
    insight?: string;
  };

  // Blockers
  blockers: {
    active: number;
    resolved: number;
    stale: string[]; // Blockers older than 14 days
  };

  // Decisions
  decisions: {
    pending: number;
    stale: string[]; // Decisions older than 14 days
  };

  // Gratitude
  gratitude: {
    count: number;
    samples: string[];
  };

  // Priorities
  priorities: {
    active: number;
    completed: number;
    topPriority?: string;
  };

  // AI-generated insights
  insights: string[];
}

// ============================================================================
// DATA GATHERING
// ============================================================================

function getWeekDates(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek - 7); // Last Sunday
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Last Saturday

  return {
    start: startOfWeek.toISOString().split('T')[0],
    end: endOfWeek.toISOString().split('T')[0],
  };
}

function getDaysOld(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
}

function getDayName(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', { weekday: 'long' });
}

// ============================================================================
// DIGEST GENERATION
// ============================================================================

/**
 * Generate weekly digest data for a user.
 */
export async function generateWeeklyDigest(userId: string): Promise<WeeklyDigestData> {
  const { start, end } = getWeekDates();

  log.info({ userId, weekStart: start, weekEnd: end }, 'Generating weekly digest');

  // Fetch all data in parallel
  const [wins, energyTrend, energyEntries, blockers, decisions, gratitude, priorities] =
    await Promise.all([
      getRecentWins(userId, 7).catch(() => []),
      getEnergyTrend(userId).catch(() => null),
      getRecentEnergyEntries(userId, 7).catch(() => []),
      getActiveBlockers(userId).catch(() => []),
      getPendingDecisions(userId).catch(() => []),
      getRecentGratitude(userId, 10).catch(() => []),
      getPriorities(userId).catch(() => []),
    ]);

  // Process wins
  const winCategories: Record<string, number> = {};
  for (const win of wins) {
    const cat = win.category || 'general';
    winCategories[cat] = (winCategories[cat] || 0) + 1;
  }

  // Process energy
  let bestDay: string | undefined;
  let lowestDay: string | undefined;
  let bestEnergy = 0;
  let lowestEnergy = 10;

  for (const entry of energyEntries) {
    const day = getDayName(entry.timestamp);
    if (entry.level > bestEnergy) {
      bestEnergy = entry.level;
      bestDay = day;
    }
    if (entry.level < lowestEnergy) {
      lowestEnergy = entry.level;
      lowestDay = day;
    }
  }

  // Generate energy insight
  let energyInsight: string | undefined;
  if (energyTrend) {
    if (energyTrend.trend === 'down' && energyTrend.weekAverage && energyTrend.weekAverage < 5) {
      energyInsight = 'Energy trending down - consider scheduling recovery time';
    } else if (energyTrend.trend === 'up') {
      energyInsight = 'Energy improving - great momentum!';
    }
  }

  // Find stale blockers and decisions
  const staleBlockers = blockers.filter((b) => getDaysOld(b.createdAt) > 14).map((b) => b.text);
  const staleDecisions = decisions
    .filter((d) => getDaysOld(d.createdAt) > 14)
    .map((d) => d.description);

  // Count completed priorities (would need to track completions)
  const activePriorities = priorities.filter((p) => p.status === 'active');
  const completedPriorities = priorities.filter((p) => p.status === 'completed');

  // Generate insights
  const insights: string[] = [];

  // Win streak insight
  if (wins.length >= 5) {
    insights.push(`🔥 Strong week with ${wins.length} wins logged!`);
  } else if (wins.length === 0) {
    insights.push('💪 No wins logged this week - remember to celebrate small victories');
  }

  // Blocker insight
  if (staleBlockers.length > 0) {
    insights.push(`⚠️ ${staleBlockers.length} blocker(s) stuck 14+ days - consider escalation`);
  }

  // Decision insight
  if (staleDecisions.length > 0) {
    insights.push(
      `🤔 ${staleDecisions.length} decision(s) pending 14+ days - analysis paralysis risk`
    );
  }

  // Gratitude insight
  if (gratitude.length >= 7) {
    insights.push('🙏 Daily gratitude practice strong this week!');
  } else if (gratitude.length === 0) {
    insights.push('🙏 No gratitude logged - even small things count');
  }

  // Energy insight
  if (energyInsight) {
    insights.push(energyInsight);
  }

  return {
    userId,
    weekStart: start,
    weekEnd: end,
    wins: {
      count: wins.length,
      highlights: wins.slice(0, 5).map((w) => w.text),
      categories: winCategories,
    },
    energy: {
      average: energyTrend?.weekAverage || 0,
      trend: energyTrend?.trend || 'stable',
      bestDay,
      lowestDay,
      insight: energyInsight,
    },
    blockers: {
      active: blockers.length,
      resolved: 0, // Would need to track resolved count
      stale: staleBlockers,
    },
    decisions: {
      pending: decisions.length,
      stale: staleDecisions,
    },
    gratitude: {
      count: gratitude.length,
      samples: gratitude.slice(0, 3).map((g) => g.text),
    },
    priorities: {
      active: activePriorities.length,
      completed: completedPriorities.length,
      topPriority: activePriorities[0]?.text,
    },
    insights,
  };
}

// ============================================================================
// EMAIL RENDERING
// ============================================================================

/**
 * Render digest data as HTML email.
 */
export function renderDigestEmail(data: WeeklyDigestData): string {
  const { wins, energy, blockers, decisions, gratitude, priorities, insights, weekStart, weekEnd } =
    data;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Weekly Reflection</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #2c2520; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #4a6741; margin-bottom: 20px; }
    .header h1 { color: #4a6741; margin: 0; font-size: 24px; }
    .header p { color: #666; margin: 5px 0 0; font-size: 14px; }
    .section { margin-bottom: 25px; padding: 15px; background: #f9f9f7; border-radius: 8px; }
    .section h2 { color: #4a6741; margin: 0 0 10px; font-size: 18px; }
    .stat { display: inline-block; text-align: center; padding: 10px 20px; }
    .stat-value { font-size: 32px; font-weight: bold; color: #4a6741; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .insight { padding: 10px; margin: 5px 0; background: #fff; border-left: 3px solid #4a6741; border-radius: 4px; }
    .highlight { padding: 8px 12px; margin: 4px 0; background: #fff; border-radius: 4px; }
    .warn { border-left-color: #e6a23c; }
    .footer { text-align: center; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px; }
    .cta { display: inline-block; background: #4a6741; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>☀️ Your Weekly Reflection</h1>
    <p>${weekStart} - ${weekEnd}</p>
  </div>

  <!-- Quick Stats -->
  <div style="text-align: center; margin-bottom: 20px;">
    <div class="stat">
      <div class="stat-value">${wins.count}</div>
      <div class="stat-label">Wins</div>
    </div>
    <div class="stat">
      <div class="stat-value">${energy.average.toFixed(1)}</div>
      <div class="stat-label">Avg Energy</div>
    </div>
    <div class="stat">
      <div class="stat-value">${gratitude.count}</div>
      <div class="stat-label">Gratitude</div>
    </div>
  </div>

  <!-- Insights -->
  ${
    insights.length > 0
      ? `
  <div class="section">
    <h2>💡 Key Insights</h2>
    ${insights.map((i) => `<div class="insight${i.includes('⚠️') ? ' warn' : ''}">${i}</div>`).join('')}
  </div>
  `
      : ''
  }

  <!-- Wins -->
  ${
    wins.count > 0
      ? `
  <div class="section">
    <h2>🏆 Wins This Week</h2>
    ${wins.highlights.map((w) => `<div class="highlight">✓ ${w}</div>`).join('')}
  </div>
  `
      : ''
  }

  <!-- Energy -->
  <div class="section">
    <h2>⚡ Energy Patterns</h2>
    <p>
      Average: <strong>${energy.average.toFixed(1)}/10</strong>
      (${energy.trend === 'up' ? '📈 trending up' : energy.trend === 'down' ? '📉 trending down' : '➡️ stable'})
    </p>
    ${energy.bestDay ? `<p>Best day: <strong>${energy.bestDay}</strong></p>` : ''}
    ${energy.lowestDay ? `<p>Consider rest on: <strong>${energy.lowestDay}s</strong></p>` : ''}
  </div>

  <!-- Blockers & Decisions -->
  ${
    blockers.stale.length > 0 || decisions.stale.length > 0
      ? `
  <div class="section">
    <h2>⚠️ Needs Attention</h2>
    ${blockers.stale.map((b) => `<div class="insight warn">Blocker: ${b}</div>`).join('')}
    ${decisions.stale.map((d) => `<div class="insight warn">Decision: ${d}</div>`).join('')}
  </div>
  `
      : ''
  }

  <!-- Gratitude -->
  ${
    gratitude.count > 0
      ? `
  <div class="section">
    <h2>🙏 Gratitude Moments</h2>
    ${gratitude.samples.map((g) => `<div class="highlight">"${g}"</div>`).join('')}
  </div>
  `
      : ''
  }

  <!-- CTA -->
  <div style="text-align: center; margin: 30px 0;">
    <p>Ready to plan the week ahead?</p>
    <a href="tel:+18886666777" class="cta">Call Ferni</a>
  </div>

  <div class="footer">
    <p>Sent with 💚 from Ferni</p>
    <p>Your AI team cheering you on</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Render digest as plain text (for SMS/CLI).
 */
export function renderDigestText(data: WeeklyDigestData): string {
  const { wins, energy, blockers, decisions, gratitude, insights, weekStart, weekEnd } = data;

  const lines: string[] = [
    `📋 WEEKLY DIGEST (${weekStart} - ${weekEnd})`,
    '',
    `🏆 Wins: ${wins.count}`,
    `⚡ Energy: ${energy.average.toFixed(1)}/10 (${energy.trend})`,
    `🙏 Gratitude: ${gratitude.count}`,
    '',
  ];

  if (insights.length > 0) {
    lines.push('💡 Insights:');
    for (const insight of insights) {
      lines.push(`  ${insight}`);
    }
    lines.push('');
  }

  if (blockers.stale.length > 0) {
    lines.push(`⚠️ Stale Blockers (${blockers.stale.length}):`);
    for (const b of blockers.stale.slice(0, 3)) {
      lines.push(`  - ${b}`);
    }
    lines.push('');
  }

  if (decisions.stale.length > 0) {
    lines.push(`⚠️ Stale Decisions (${decisions.stale.length}):`);
    for (const d of decisions.stale.slice(0, 3)) {
      lines.push(`  - ${d}`);
    }
    lines.push('');
  }

  lines.push('Call Ferni to plan your week!');

  return lines.join('\n');
}
