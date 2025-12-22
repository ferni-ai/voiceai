/**
 * Stats Rendering
 *
 * Render journal statistics UI.
 *
 * @module voice-journal/render-stats
 */

import { getModal, getEntries } from './state.js';
import { calculateStats } from './stats.js';
import { getMoodIcon, getMoodLabel } from './mood-icons.js';

// ============================================================================
// STATS RENDERING
// ============================================================================

export function renderStats(): void {
  const modal = getModal();
  const entries = getEntries();
  const container = modal?.querySelector('#journal-stats');
  if (!container) return;

  const stats = calculateStats(entries);

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card stat-card--streak">
        <div class="stat-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>
          </svg>
        </div>
        <div class="stat-value">${stats.currentStreak}</div>
        <div class="stat-label">Day${stats.currentStreak !== 1 ? 's' : ''} streak</div>
      </div>
      <div class="stat-card stat-card--entries">
        <div class="stat-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
        </div>
        <div class="stat-value">${stats.totalEntries}</div>
        <div class="stat-label">Total entries</div>
      </div>
      <div class="stat-card stat-card--mood">
        <div class="stat-icon stat-icon--mood">
          ${stats.topMoods.length > 0 ? getMoodIcon(stats.topMoods[0].mood) : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>'}
        </div>
        <div class="stat-value">${stats.topMoods.length > 0 ? getMoodLabel(stats.topMoods[0].mood) : '-'}</div>
        <div class="stat-label">Top mood</div>
      </div>
    </div>
    ${
      stats.totalEntries > 0
        ? `
    <div class="stats-activity">
      <span class="activity-label">Last 4 weeks:</span>
      <div class="activity-bars">
        ${stats.entriesByWeek
          .map((count) => {
            const height = count > 0 ? Math.min(100, (count / Math.max(...stats.entriesByWeek)) * 100) : 10;
            return `<div class="activity-bar" style="height: ${height}%;" title="${count} entries"></div>`;
          })
          .reverse()
          .join('')}
      </div>
    </div>
    `
        : ''
    }
  `;
}

