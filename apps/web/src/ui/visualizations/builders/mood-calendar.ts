/**
 * Mood Calendar Visualization Builder
 *
 * Displays emotional rhythm over time as a heatmap.
 * Adapts to different device sizes:
 * - Watch: Compact 7-day ring/grid
 * - Mobile: Card-based with heatmap and insights
 * - Tablet: Full month grid with details
 *
 * @module visualizations/builders/mood-calendar
 */

import {
  createElement,
  createFlexContainer,
  setStyles,
  createScreenReaderLabel,
} from '../utils/dom.js';
import type {
  MoodCalendarData,
  MoodEntry,
  MoodType,
  DeviceContext,
  VisualizationResult,
} from '../types.js';
import { DEFAULT_COLORS } from '../types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DAYS_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAYS_FULL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ============================================================================
// WATCH BUILDER
// ============================================================================

/**
 * Build compact mood calendar for watch.
 */
function buildWatch(
  container: HTMLElement,
  data: MoodCalendarData
): VisualizationResult {
  container.replaceChildren();

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Mood'));
  header.appendChild(createElement('p', '', 'This week'));
  container.appendChild(header);

  // Mini 7-day heatmap
  const heatmap = createFlexContainer('row', '3px', 'center');
  setStyles(heatmap, { margin: '12px 0' });

  // Get last 7 entries or pad with empty
  const lastWeek = getLastNEntries(data.entries, 7);

  lastWeek.forEach((entry, i) => {
    const cell = createElement('div');
    const isToday = i === lastWeek.length - 1;
    setStyles(cell, {
      width: '14px',
      height: '14px',
      borderRadius: '3px',
      background: entry ? DEFAULT_COLORS.moods[entry.mood] : 'rgba(44, 37, 32, 0.1)',
      opacity: isToday ? '1' : '0.6',
    });
    heatmap.appendChild(cell);
  });

  container.appendChild(heatmap);

  // Dominant mood metric
  const metric = createElement('div');
  setStyles(metric, {
    textAlign: 'center',
    fontSize: '1.1rem',
    color: 'var(--color-accent)',
    fontWeight: '600',
  });
  metric.textContent = capitalize(data.summary.dominantMood);
  container.appendChild(metric);

  // Summary
  const summary = createElement('div', 'watch-metric', `${data.summary.calmDays} calm days`);
  container.appendChild(summary);

  return {
    element: container,
    type: 'mood-calendar',
    device: 'watch',
    ariaLabel: `Mood calendar showing ${data.summary.dominantMood} as dominant mood with ${data.summary.calmDays} calm days`,
  };
}

// ============================================================================
// MOBILE BUILDER
// ============================================================================

/**
 * Build mood calendar for mobile (iOS/Android).
 */
function buildMobile(
  container: HTMLElement,
  data: MoodCalendarData,
  context: DeviceContext
): VisualizationResult {
  container.replaceChildren();
  const isAndroid = context.platform === 'android';

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Mood Calendar'));
  header.appendChild(createElement('p', '', 'Track your emotional rhythm'));
  container.appendChild(header);

  // Today's mood card
  const card1 = createElement('div', 'mobile-card');
  if (isAndroid) {
    setStyles(card1, { borderLeft: '3px solid var(--color-accent)' });
  }

  const cardHeader = createElement('div', 'mobile-card-header');
  cardHeader.appendChild(createElement('span', 'mobile-card-title', 'Today'));

  const badge = createElement('span', 'mobile-card-badge', capitalize(data.summary.dominantMood));
  cardHeader.appendChild(badge);
  card1.appendChild(cardHeader);

  // Heatmap with day labels
  const heatmapContainer = createFlexContainer('row', '4px');
  setStyles(heatmapContainer, { margin: '12px 0' });

  const lastWeek = getLastNEntries(data.entries, 7);

  lastWeek.forEach((entry, i) => {
    const dayCol = createElement('div');
    setStyles(dayCol, { textAlign: 'center', flex: '1' });

    const cell = createElement('div');
    const isToday = i === lastWeek.length - 1;
    setStyles(cell, {
      height: '20px',
      borderRadius: '4px',
      background: entry ? DEFAULT_COLORS.moods[entry.mood] : 'rgba(44, 37, 32, 0.1)',
      marginBottom: '4px',
      opacity: isToday ? '1' : '0.6',
    });
    dayCol.appendChild(cell);

    const label = createElement('span', '', DAYS_SHORT[i]);
    setStyles(label, { fontSize: '0.65rem', color: 'var(--color-text-muted)' });
    dayCol.appendChild(label);

    heatmapContainer.appendChild(dayCol);
  });

  card1.appendChild(heatmapContainer);
  container.appendChild(card1);

  // Pattern insight card
  const patternInsight = detectPattern(data.entries);
  if (patternInsight) {
    const card2 = createElement('div', 'mobile-card');
    if (isAndroid) {
      setStyles(card2, { borderLeft: '3px solid var(--persona-maya)' });
    }

    const patternHeader = createElement('div', 'mobile-card-header');
    patternHeader.appendChild(createElement('span', 'mobile-card-title', 'Pattern Detected'));
    card2.appendChild(patternHeader);

    const insight = createElement('p', 'mobile-insight', patternInsight);
    card2.appendChild(insight);
    container.appendChild(card2);
  }

  // Screen reader summary
  container.appendChild(
    createScreenReaderLabel(
      `Mood calendar for the past week. Dominant mood: ${data.summary.dominantMood}. Trend: ${data.summary.trend}.`
    )
  );

  return {
    element: container,
    type: 'mood-calendar',
    device: 'mobile',
    ariaLabel: `Mood calendar showing ${data.summary.dominantMood} as dominant mood`,
  };
}

// ============================================================================
// TABLET BUILDER
// ============================================================================

/**
 * Build mood calendar for tablet with full month view.
 */
function buildTablet(
  container: HTMLElement,
  data: MoodCalendarData,
  _context: DeviceContext
): VisualizationResult {
  container.replaceChildren();

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Mood Calendar'));
  header.appendChild(createElement('p', '', 'Your emotional journey this month'));
  container.appendChild(header);

  // Month grid
  const grid = createElement('div', 'mood-grid');
  setStyles(grid, {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '4px',
    padding: '16px',
    background: 'var(--color-background)',
    borderRadius: '12px',
  });

  // Day headers
  DAYS_FULL.forEach((day) => {
    const dayHeader = createElement('div', 'mood-day-header', day);
    setStyles(dayHeader, {
      textAlign: 'center',
      fontSize: '0.75rem',
      fontWeight: '600',
      color: 'var(--color-text-muted)',
      padding: '8px 0',
    });
    grid.appendChild(dayHeader);
  });

  // Calendar cells (last 28 days for simplicity)
  const last28 = getLastNEntries(data.entries, 28);
  last28.forEach((entry, i) => {
    const cell = createElement('div', 'mood-cell');
    const isToday = i === last28.length - 1;

    setStyles(cell, {
      aspectRatio: '1',
      borderRadius: '8px',
      background: entry ? DEFAULT_COLORS.moods[entry.mood] : 'rgba(44, 37, 32, 0.05)',
      opacity: entry ? (isToday ? '1' : '0.7') : '0.3',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.7rem',
      color: entry ? 'white' : 'var(--color-text-muted)',
      cursor: entry ? 'pointer' : 'default',
      transition: 'transform 150ms ease',
    });

    if (entry) {
      cell.textContent = String(i + 1);
      cell.title = `${entry.date}: ${capitalize(entry.mood)}`;
    }

    grid.appendChild(cell);
  });

  container.appendChild(grid);

  // Summary stats row
  const statsRow = createFlexContainer('row', '16px', 'space-around');
  setStyles(statsRow, { marginTop: '16px' });

  const stats = [
    { label: 'Calm Days', value: data.summary.calmDays },
    { label: 'Dominant', value: capitalize(data.summary.dominantMood) },
    { label: 'Trend', value: capitalize(data.summary.trend) },
  ];

  stats.forEach((stat) => {
    const statBox = createElement('div');
    setStyles(statBox, { textAlign: 'center' });

    const value = createElement('div', '', String(stat.value));
    setStyles(value, {
      fontSize: '1.25rem',
      fontWeight: '700',
      color: 'var(--color-accent)',
    });
    statBox.appendChild(value);

    const label = createElement('div', '', stat.label);
    setStyles(label, {
      fontSize: '0.75rem',
      color: 'var(--color-text-muted)',
    });
    statBox.appendChild(label);

    statsRow.appendChild(statBox);
  });

  container.appendChild(statsRow);

  return {
    element: container,
    type: 'mood-calendar',
    device: 'tablet',
    ariaLabel: `Monthly mood calendar with ${data.summary.calmDays} calm days and ${data.summary.trend} trend`,
  };
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build mood calendar visualization for the given device context.
 */
export function buildMoodCalendar(
  container: HTMLElement,
  data: MoodCalendarData,
  context: DeviceContext
): VisualizationResult {
  switch (context.type) {
    case 'watch':
      return buildWatch(container, data);
    case 'mobile':
      return buildMobile(container, data, context);
    case 'tablet':
    case 'desktop':
      return buildTablet(container, data, context);
    default:
      return buildMobile(container, data, context);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the last N entries, padding with null if needed.
 */
function getLastNEntries(entries: MoodEntry[], n: number): (MoodEntry | null)[] {
  const result: (MoodEntry | null)[] = [];
  const startIdx = Math.max(0, entries.length - n);

  // Pad with nulls if not enough entries
  for (let i = 0; i < n - entries.length; i++) {
    result.push(null);
  }

  // Add actual entries
  for (let i = startIdx; i < entries.length; i++) {
    result.push(entries[i]);
  }

  return result;
}

/**
 * Detect mood patterns for insights.
 */
function detectPattern(entries: MoodEntry[]): string | null {
  if (entries.length < 7) return null;

  // Group by day of week
  const dayMoods: Record<number, MoodType[]> = {};
  entries.forEach((entry) => {
    const day = new Date(entry.date).getDay();
    if (!dayMoods[day]) dayMoods[day] = [];
    dayMoods[day].push(entry.mood);
  });

  // Find day with most anxiety
  let maxAnxietyDay = -1;
  let maxAnxietyCount = 0;

  for (const [day, moods] of Object.entries(dayMoods)) {
    const anxietyCount = moods.filter((m) => m === 'anxious' || m === 'stressed').length;
    if (anxietyCount > maxAnxietyCount) {
      maxAnxietyCount = anxietyCount;
      maxAnxietyDay = parseInt(day);
    }
  }

  if (maxAnxietyCount >= 2) {
    const dayNames = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
    return `${dayNames[maxAnxietyDay]} show highest anxiety. Your mood tends to dip mid-week.`;
  }

  return null;
}

/**
 * Capitalize first letter.
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default buildMoodCalendar;
