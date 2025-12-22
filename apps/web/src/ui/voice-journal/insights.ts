/**
 * Insights Tab
 *
 * AI-generated insights from journal entries.
 *
 * @module voice-journal/insights
 */

import { getModal, getEntries } from './state.js';
import { calculateStats } from './stats.js';
import { getMoodIcon, getMoodLabel, getMoodScore } from './mood-icons.js';

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
        <h3 class="insights-empty-title">More entries needed</h3>
        <p class="insights-empty-text">Record at least 3 journal entries to start seeing insights about your patterns.</p>
        <button aria-label="Start journaling" class="insights-cta" data-action="go-to-record">
          Start journaling
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
      title: `${stats.currentStreak}-day streak!`,
      text:
        stats.currentStreak >= 7
          ? "Incredible consistency! You've built a powerful habit."
          : stats.currentStreak >= 3
            ? "You're building momentum. Keep it up!"
            : "Great start! Try to journal again tomorrow.",
    });
  }

  // Mood pattern insight
  if (stats.topMoods.length > 0) {
    const topMood = stats.topMoods[0];
    insights.push({
      icon: getMoodIcon(topMood.mood),
      title: `Most common: ${getMoodLabel(topMood.mood)}`,
      text: `You've felt ${getMoodLabel(topMood.mood).toLowerCase()} ${topMood.count} times. ${
        getMoodScore(topMood.mood) >= 7
          ? "That's wonderful to see!"
          : 'Notice any patterns in when this comes up?'
      }`,
    });
  }

  // Activity insight
  const recentActivity = stats.entriesByWeek[0] + stats.entriesByWeek[1];
  const olderActivity = stats.entriesByWeek[2] + stats.entriesByWeek[3];
  if (entries.length >= 5) {
    if (recentActivity > olderActivity) {
      const trendUpIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`;
      insights.push({
        icon: trendUpIcon,
        title: 'Journaling more lately',
        text: "Your journaling frequency has increased. You're developing a stronger reflection practice!",
      });
    } else if (recentActivity < olderActivity && olderActivity > 0) {
      const thoughtIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
      insights.push({
        icon: thoughtIcon,
        title: 'Time for a check-in?',
        text: "You've been journaling less recently. Even a quick voice note can help you stay connected to yourself.",
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
      title: `Mood average: ${stats.avgMoodScore.toFixed(1)}/10`,
      text:
        stats.avgMoodScore >= 7
          ? "You're trending towards positive moods. Beautiful!"
          : stats.avgMoodScore >= 5
            ? 'A healthy mix of emotions. All feelings are valid.'
            : "You've been navigating some tough emotions. Be gentle with yourself.",
    });
  }

  container.innerHTML = `
    <div class="insights-header">
      <h3 class="insights-title">Your Journey So Far</h3>
      <p class="insights-subtitle">Patterns from ${stats.totalEntries} journal entries</p>
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
  `;
}

