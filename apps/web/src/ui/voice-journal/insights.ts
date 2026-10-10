/**
 * Insights Tab
 *
 * AI-generated insights from journal entries with mood trend visualization.
 *
 * @module voice-journal/insights
 */

import { getModal, getEntries } from './state.js';
import { calculateStats } from './stats.js';
import { getMoodIcon, getMoodLabel, getMoodScore } from './mood-icons.js';
import type { CustomAgentMemory } from '../../services/custom-agent.service.js';
import { formatDate, formatNumber, t } from '../../i18n/index.js';
import { tp } from '../../i18n/plural.js';

// ============================================================================
// MOOD TREND CALCULATION
// ============================================================================

interface MoodTrendData {
  labels: string[];
  scores: number[];
  moods: string[];
}

/**
 * Calculate mood trend over the last 14 days
 */
function calculateMoodTrend(entries: CustomAgentMemory[]): MoodTrendData {
  const now = new Date();
  const days = 14;
  const labels: string[] = [];
  const scores: number[] = [];
  const moods: string[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateKey = date.toDateString();
    
    // Find entries for this day
    const dayEntries = entries.filter((e) => {
      const entryDate = new Date(e.createdAt);
      return entryDate.toDateString() === dateKey;
    });

    // Calculate average mood for the day
    let avgScore = 0;
    let avgMood = '';
    if (dayEntries.length > 0) {
      const totalScore = dayEntries.reduce((sum, e) => sum + getMoodScore(e.mood || 'neutral'), 0);
      avgScore = totalScore / dayEntries.length;
      // Get most common mood
      const moodCounts = new Map<string, number>();
      dayEntries.forEach((e) => {
        const mood = e.mood || 'neutral';
        moodCounts.set(mood, (moodCounts.get(mood) || 0) + 1);
      });
      avgMood = Array.from(moodCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    }

    const dayLabel = formatDate(date, { weekday: 'short' });
    labels.push(i === 0 ? t('common.today') : dayLabel);
    scores.push(avgScore);
    moods.push(avgMood);
  }

  return { labels, scores, moods };
}

/**
 * Render mood trend chart
 */
function renderMoodTrendChart(entries: CustomAgentMemory[]): string {
  const trend = calculateMoodTrend(entries);
  const maxScore = 10;
  
  // Filter out days with no entries for bar display
  const hasData = trend.scores.some((s) => s > 0);
  if (!hasData) {
    return '';
  }

  const bars = trend.scores.map((score, i) => {
    if (score === 0) {
      return `<div class="mood-bar mood-bar--empty" data-label="${trend.labels[i] ?? ''}" style="height: 4px;"></div>`;
    }
    const height = Math.max(10, (score / maxScore) * 100);
    const mood = trend.moods[i] ?? 'neutral';
    const label = trend.labels[i] ?? '';
    const color = getMoodColor(mood);
    return `
      <div class="mood-bar" 
           data-label="${label}" 
           style="height: ${height}%; background: ${color};"
           title="${t('voiceJournal.moodBarTitle', { label, mood: getMoodLabel(mood), score: formatNumber(score, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}">
      </div>
    `;
  }).join('');

  return `
    <div class="mood-analytics">
      <h4 class="mood-analytics-title">${t('voiceJournal.moodTrendTitle')}</h4>
      <div class="mood-chart">
        ${bars}
      </div>
      <div class="mood-legend">
        ${renderMoodLegend()}
      </div>
    </div>
  `;
}

/**
 * Get color for mood
 */
function getMoodColor(mood: string): string {
  const colorMap: Record<string, string> = {
    happy: 'var(--color-semantic-success, #4a6741)',
    excited: 'var(--color-semantic-success, #4a6741)',
    grateful: 'var(--color-semantic-success, #4a6741)',
    calm: 'var(--color-accent, #4a6741)',
    hopeful: 'var(--color-accent, #4a6741)',
    neutral: 'var(--color-text-muted, #888)',
    reflective: 'var(--color-text-muted, #888)',
    tired: 'var(--color-semantic-warning, #c4856a)',
    anxious: 'var(--color-semantic-error, #dc2626)',
    sad: 'var(--color-semantic-error, #dc2626)',
    angry: 'var(--color-semantic-error, #dc2626)',
    overwhelmed: 'var(--color-semantic-error, #dc2626)',
  };
  return colorMap[mood] || 'var(--color-accent, #4a6741)';
}

/**
 * Render mood legend
 */
function renderMoodLegend(): string {
  const categories = [
    { label: t('voiceJournal.moodPositive'), color: 'var(--color-semantic-success, #4a6741)' },
    { label: t('accessibility.neutral'), color: 'var(--color-text-muted, #888)' },
    { label: t('voiceJournal.moodChallenging'), color: 'var(--color-semantic-error, #dc2626)' },
  ];
  
  return categories.map((cat) => `
    <div class="mood-legend-item">
      <span class="mood-legend-dot" style="background: ${cat.color}"></span>
      <span>${cat.label}</span>
    </div>
  `).join('');
}

// ============================================================================
// INSIGHTS RENDERING
// ============================================================================

export function renderInsights(): void {
  const modal = getModal();
  const entries = getEntries();
  const container = modal?.querySelector('#journal-insights');
  if (!container) return;

  const stats = calculateStats(entries);

  if (entries.length < 3) {
    container.innerHTML = `
      <div class="insights-empty">
        <div class="insights-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        </div>
        <h3 class="insights-empty-title">${t('voiceJournal.moreEntriesNeeded')}</h3>
        <p class="insights-empty-text">${t('voiceJournal.moreEntriesHint')}</p>
        <button class="insights-cta" data-action="go-to-record">
          ${t('accessibility.startJournaling')}
        </button>
      </div>
    `;
    return;
  }

  // Generate insights
  const insights: Array<{ icon: string; title: string; text: string }> = [];

  // Streak insight
  if (stats.currentStreak > 0) {
    const streakIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`;
    insights.push({
      icon: streakIcon,
      title: tp('voiceJournal.streakTitle', stats.currentStreak),
      text:
        stats.currentStreak >= 7
          ? t('voiceJournal.streakTextLong')
          : stats.currentStreak >= 3
            ? t('voiceJournal.streakTextMid')
            : t('voiceJournal.streakTextShort'),
    });
  }

  // Mood pattern insight
  if (stats.topMoods.length > 0) {
    const topMood = stats.topMoods[0];
    if (topMood) {
      insights.push({
        icon: getMoodIcon(topMood.mood),
        title: t('voiceJournal.topMoodTitle', { mood: getMoodLabel(topMood.mood) }),
        text: tp(
          getMoodScore(topMood.mood) >= 7
            ? 'voiceJournal.topMoodTextPositive'
            : 'voiceJournal.topMoodTextReflective',
          topMood.count,
          { mood: getMoodLabel(topMood.mood).toLocaleLowerCase() }
        ),
      });
    }
  }

  // Activity insight
  const recentActivity = (stats.entriesByWeek[0] ?? 0) + (stats.entriesByWeek[1] ?? 0);
  const olderActivity = (stats.entriesByWeek[2] ?? 0) + (stats.entriesByWeek[3] ?? 0);
  if (entries.length >= 5) {
    if (recentActivity > olderActivity) {
      const trendUpIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`;
      insights.push({
        icon: trendUpIcon,
        title: t('voiceJournal.moreLatelyTitle'),
        text: t('voiceJournal.moreLatelyText'),
      });
    } else if (recentActivity < olderActivity && olderActivity > 0) {
      const thoughtIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
      insights.push({
        icon: thoughtIcon,
        title: t('voiceJournal.lessLatelyTitle'),
        text: t('voiceJournal.lessLatelyText'),
      });
    }
  }

  // Mood average insight
  if (stats.avgMoodScore > 0) {
    const sparkleIcon = stats.avgMoodScore >= 6 
      ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
      : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>`;
    insights.push({
      icon: sparkleIcon,
      title: t('voiceJournal.moodAverageTitle', {
        score: formatNumber(stats.avgMoodScore, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      }),
      text:
        stats.avgMoodScore >= 7
          ? t('voiceJournal.moodAverageHigh')
          : stats.avgMoodScore >= 5
            ? t('voiceJournal.moodAverageMid')
            : t('voiceJournal.moodAverageLow'),
    });
  }

  // Render mood trend chart
  const moodTrendChart = renderMoodTrendChart(entries);

  container.innerHTML = `
    <div class="insights-header">
      <h3 class="insights-title">${t('voiceJournal.journeyTitle')}</h3>
      <p class="insights-subtitle">${tp('voiceJournal.journeySubtitle', stats.totalEntries)}</p>
    </div>
    <div class="insights-grid">
      ${insights
        .map(
          (insight) => `
        <div class="insight-card">
          <span class="insight-icon">${insight.icon}</span>
          <div class="insight-content">
            <h4 class="insight-title">${insight.title}</h4>
            <p class="insight-text">${insight.text}</p>
          </div>
        </div>
      `
        )
        .join('')}
    </div>
    ${moodTrendChart}
  `;
}

