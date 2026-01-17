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
import { CSS_COLOR_VARS } from '../types.js';
import { t } from '../../../i18n/index.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DAYS_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAYS_FULL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * CSS variable references for mood colors.
 * Used for DOM element styling (not SVG).
 */
const MOOD_CSS_VARS: Record<MoodType, string> = {
  calm: 'var(--viz-mood-calm)',
  joyful: 'var(--viz-mood-joyful)',
  anxious: 'var(--viz-mood-anxious)',
  tired: 'var(--viz-mood-tired)',
  focused: 'var(--viz-mood-focused)',
  reflective: 'var(--viz-mood-reflective)',
  stressed: 'var(--viz-mood-stressed)',
  energized: 'var(--viz-mood-energized)',
  peaceful: 'var(--viz-mood-peaceful)',
  uncertain: 'var(--viz-mood-uncertain)',
};

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

  // Header with design system classes
  const header = createElement('div', 'viz-header');
  const title = createElement('h3', 'viz-header__title viz-header__title--compact', t('visualizations.moodCalendar.titleShort', 'Mood'));
  const subtitle = createElement('p', 'viz-header__subtitle', t('visualizations.moodCalendar.subtitleShort', 'This week'));
  header.appendChild(title);
  header.appendChild(subtitle);
  container.appendChild(header);

  // Mini 7-day heatmap
  const heatmap = createElement('div', 'viz-flex viz-flex--row viz-flex--center');
  setStyles(heatmap, {
    gap: 'var(--viz-space-2xs)',
    margin: 'var(--viz-space-pause) 0',
  });

  // Get last 7 entries or pad with empty
  const lastWeek = getLastNEntries(data.entries, 7);

  lastWeek.forEach((entry, i) => {
    const cell = createElement('div', 'viz-heatmap-cell');
    const isToday = i === lastWeek.length - 1;
    setStyles(cell, {
      width: '14px',
      height: '14px',
      borderRadius: 'var(--viz-radius-xs)',
      background: entry ? MOOD_CSS_VARS[entry.mood] : 'var(--viz-border-subtle)',
      opacity: isToday ? '1' : '0.6',
    });
    heatmap.appendChild(cell);
  });

  container.appendChild(heatmap);

  // Dominant mood metric with design system classes
  const metric = createElement('div', 'viz-metric viz-metric--compact');
  const metricValue = createElement('span', 'viz-metric__value viz-metric__value--accent');
  metricValue.textContent = capitalize(data.summary.dominantMood);
  metric.appendChild(metricValue);
  container.appendChild(metric);

  // Summary with design system class
  const summary = createElement('div', 'viz-label');
  summary.textContent = `${data.summary.calmDays} ${t('visualizations.moodCalendar.calmDays', 'calm days')}`;
  container.appendChild(summary);

  // Screen reader label
  container.appendChild(
    createScreenReaderLabel(
      `Mood calendar showing ${data.summary.dominantMood} as dominant mood with ${data.summary.calmDays} calm days`
    )
  );

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

  // Header with design system classes
  const header = createElement('div', 'viz-header');
  const title = createElement('h3', 'viz-header__title', t('visualizations.moodCalendar.title', 'Mood Calendar'));
  const subtitle = createElement('p', 'viz-header__subtitle', t('visualizations.moodCalendar.subtitle', 'Your emotional journey this month'));
  header.appendChild(title);
  header.appendChild(subtitle);
  container.appendChild(header);

  // Today's mood card with glass styling
  const card1 = createElement('div', 'viz-card viz-animate-slide');
  if (isAndroid) {
    card1.classList.add('viz-card--accent-primary');
  }

  const cardHeader = createElement('div', 'viz-flex viz-flex--row viz-flex--center viz-flex--between');

  const todayTitle = createElement('span');
  setStyles(todayTitle, {
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--viz-text-base)',
    fontWeight: '600',
    color: CSS_COLOR_VARS.textPrimary,
  });
  todayTitle.textContent = t('visualizations.moodCalendar.today', 'Today');
  cardHeader.appendChild(todayTitle);

  const badge = createElement('span', `viz-badge viz-badge--mood-${data.summary.dominantMood}`);
  badge.textContent = capitalize(data.summary.dominantMood);
  cardHeader.appendChild(badge);
  card1.appendChild(cardHeader);

  // Heatmap with day labels using design system spacing
  const heatmapContainer = createElement('div', 'viz-flex viz-flex--row');
  setStyles(heatmapContainer, {
    gap: 'var(--viz-space-2xs)',
    margin: 'var(--viz-space-pause) 0',
  });

  const lastWeek = getLastNEntries(data.entries, 7);

  lastWeek.forEach((entry, i) => {
    const dayCol = createElement('div');
    setStyles(dayCol, { textAlign: 'center', flex: '1' });

    const cell = createElement('div', 'viz-heatmap-cell');
    const isToday = i === lastWeek.length - 1;
    setStyles(cell, {
      height: '20px',
      borderRadius: 'var(--viz-radius-sm)',
      background: entry ? MOOD_CSS_VARS[entry.mood] : 'var(--viz-border-subtle)',
      marginBottom: 'var(--viz-space-2xs)',
      opacity: isToday ? '1' : '0.6',
    });
    dayCol.appendChild(cell);

    const label = createElement('span', 'viz-day-label');
    label.textContent = DAYS_SHORT[i] ?? '';
    dayCol.appendChild(label);

    heatmapContainer.appendChild(dayCol);
  });

  card1.appendChild(heatmapContainer);
  container.appendChild(card1);

  // Pattern insight card
  const patternInsight = detectPattern(data.entries);
  if (patternInsight) {
    const card2 = createElement('div', 'viz-card viz-animate-slide viz-stagger-2');
    if (isAndroid) {
      card2.classList.add('viz-card--accent-emotional');
    }

    const patternHeader = createElement('div', 'viz-flex viz-flex--row viz-flex--center viz-flex--between');
    const patternTitle = createElement('span');
    setStyles(patternTitle, {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--viz-text-base)',
      fontWeight: '600',
      color: CSS_COLOR_VARS.textPrimary,
    });
    patternTitle.textContent = t('visualizations.moodCalendar.patternDetected', 'Pattern Detected');
    patternHeader.appendChild(patternTitle);
    card2.appendChild(patternHeader);

    const insight = createElement('p', 'viz-insight');
    insight.textContent = patternInsight;
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

  // Header with design system classes
  const header = createElement('div', 'viz-header');
  const title = createElement('h3', 'viz-header__title', t('visualizations.moodCalendar.title', 'Mood Calendar'));
  const subtitle = createElement('p', 'viz-header__subtitle', t('visualizations.moodCalendar.subtitle', 'Your emotional journey this month'));
  header.appendChild(title);
  header.appendChild(subtitle);
  container.appendChild(header);

  // Month grid card with glass styling
  const gridCard = createElement('div', 'viz-card viz-animate-slide');

  const grid = createElement('div', 'viz-grid viz-grid--calendar');
  setStyles(grid, {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 'var(--viz-space-2xs)',
    padding: 'var(--viz-space-pause)',
  });

  // Day headers with design system styling
  DAYS_FULL.forEach((day) => {
    const dayHeader = createElement('div', 'viz-day-label viz-day-label--header');
    dayHeader.textContent = day;
    grid.appendChild(dayHeader);
  });

  // Calendar cells (last 28 days for simplicity)
  const last28 = getLastNEntries(data.entries, 28);
  last28.forEach((entry, i) => {
    const cell = createElement('div', 'viz-calendar-cell');
    const isToday = i === last28.length - 1;

    setStyles(cell, {
      aspectRatio: '1',
      borderRadius: 'var(--viz-radius-sm)',
      background: entry ? MOOD_CSS_VARS[entry.mood] : 'var(--viz-border-subtle)',
      opacity: entry ? (isToday ? '1' : '0.7') : '0.3',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 'var(--viz-text-xs)',
      color: entry ? 'white' : CSS_COLOR_VARS.textMuted,
      cursor: entry ? 'pointer' : 'default',
      transition: 'transform var(--viz-duration-fast) var(--viz-ease-spring)',
    });

    if (entry) {
      cell.textContent = String(i + 1);
      cell.title = `${entry.date}: ${capitalize(entry.mood)}`;
    }

    grid.appendChild(cell);
  });

  gridCard.appendChild(grid);
  container.appendChild(gridCard);

  // Summary stats row with glass card styling
  const statsCard = createElement('div', 'viz-card viz-animate-slide viz-stagger-2');
  const statsRow = createElement('div', 'viz-flex viz-flex--row');
  setStyles(statsRow, {
    gap: 'var(--viz-space-pause)',
    justifyContent: 'space-around',
  });

  const stats = [
    { label: t('visualizations.moodCalendar.calmDaysLabel', 'Calm Days'), value: data.summary.calmDays },
    { label: t('visualizations.moodCalendar.dominant', 'Dominant'), value: capitalize(data.summary.dominantMood) },
    { label: t('visualizations.moodCalendar.trend', 'Trend'), value: capitalize(data.summary.trend) },
  ];

  stats.forEach((stat) => {
    const statBox = createElement('div', 'viz-stat');

    const value = createElement('div', 'viz-stat__value');
    value.textContent = String(stat.value);
    statBox.appendChild(value);

    const label = createElement('div', 'viz-stat__label');
    label.textContent = stat.label;
    statBox.appendChild(label);

    statsRow.appendChild(statBox);
  });

  statsCard.appendChild(statsRow);
  container.appendChild(statsCard);

  // Screen reader summary
  container.appendChild(
    createScreenReaderLabel(
      `Monthly mood calendar with ${data.summary.calmDays} calm days and ${data.summary.trend} trend`
    )
  );

  return {
    element: container,
    type: 'mood-calendar',
    device: 'tablet',
    ariaLabel: `Monthly mood calendar with ${data.summary.calmDays} calm days and ${data.summary.trend} trend`,
  };
}

// ============================================================================
// SMALL MULTIPLES (TUFTE-INSPIRED COMPARISON)
// ============================================================================

/**
 * Configuration for small multiples comparison view.
 * Enables side-by-side period comparison following Tufte's principles.
 */
export interface SmallMultiplesConfig {
  /** Array of datasets to compare (e.g., this week vs last week) */
  datasets: MoodCalendarData[];
  /** Labels for each dataset (e.g., ['This Week', 'Last Week']) */
  labels: string[];
  /** Use shared scale across all panels (Tufte: ALWAYS true for honest comparison) */
  sharedScale?: boolean;
  /** Show difference highlights between panels */
  showDifferences?: boolean;
  /** Layout: 'row' for horizontal, 'grid' for responsive */
  layout?: 'row' | 'grid';
  /** Annotations level: 'minimal' (Tufte-preferred) or 'none' */
  annotations?: 'minimal' | 'none';
}

/**
 * Build small multiples comparison view (Tufte-inspired).
 *
 * Tufte's Principle: "Small multiples are economical: once viewers understand
 * the design of one slice, they have immediate access to the data in all the
 * other slices. Thus as the eye moves from one slice to the next, the
 * constancy of the design allows the viewer to focus on changes in the data."
 */
function buildSmallMultiples(
  container: HTMLElement,
  config: SmallMultiplesConfig,
  context: DeviceContext
): VisualizationResult {
  container.replaceChildren();

  const { datasets, labels, sharedScale = true, showDifferences = false, layout = 'row', annotations = 'minimal' } = config;

  // Validate we have matching datasets and labels
  if (datasets.length !== labels.length || datasets.length < 2) {
    throw new Error('SmallMultiples requires at least 2 datasets with matching labels');
  }

  // Header
  const header = createElement('div', 'viz-header');
  const title = createElement('h3', 'viz-header__title', t('visualizations.moodCalendar.compare', 'Compare Periods'));
  const subtitle = createElement('p', 'viz-header__subtitle',
    t('visualizations.moodCalendar.compareSubtitle', 'Side-by-side mood comparison'));
  header.appendChild(title);
  header.appendChild(subtitle);
  container.appendChild(header);

  // Grid container for multiples
  const multiplesGrid = createElement('div', 'viz-small-multiples');
  const columns = context.type === 'mobile' ? 1 : Math.min(datasets.length, 4);

  setStyles(multiplesGrid, {
    display: 'grid',
    gridTemplateColumns: layout === 'row' ? `repeat(${columns}, 1fr)` : 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 'var(--viz-space-pause)',
    padding: 'var(--viz-space-breath)',
  });

  // Calculate shared scale if needed (Tufte: essential for honest comparison)
  let globalMoodCounts: Record<MoodType, number> | undefined;
  if (sharedScale) {
    // Initialize all MoodType values to 0
    globalMoodCounts = {
      calm: 0,
      joyful: 0,
      anxious: 0,
      tired: 0,
      focused: 0,
      reflective: 0,
      stressed: 0,
      energized: 0,
      peaceful: 0,
      uncertain: 0,
    };
    datasets.forEach(dataset => {
      dataset.entries.forEach(entry => {
        globalMoodCounts![entry.mood]++;
      });
    });
  }

  // Render each panel
  datasets.forEach((dataset, index) => {
    const panel = createElement('div', 'viz-small-multiple-panel viz-card viz-animate-slide');
    // Use data attribute for stagger animation instead of CSS custom property
    panel.dataset.staggerIndex = String(index);
    panel.style.setProperty('--stagger-delay', `${index * 50}ms`);

    // Panel label (Tufte: minimal, direct labeling)
    if (annotations === 'minimal') {
      const labelEl = createElement('div', 'viz-small-multiple-label');
      setStyles(labelEl, {
        fontSize: 'var(--viz-text-sm)',
        fontWeight: '500',
        color: CSS_COLOR_VARS.textPrimary,
        marginBottom: 'var(--viz-space-2xs)',
        textAlign: 'center',
      });
      labelEl.textContent = labels[index] ?? `Period ${index + 1}`;
      panel.appendChild(labelEl);
    }

    // Mini calendar grid (7 columns for week view)
    const miniGrid = createElement('div', 'viz-mini-calendar');
    const entries = getLastNEntries(dataset.entries, 7);

    setStyles(miniGrid, {
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gap: '2px',
      aspectRatio: '7/1',
    });

    // Day abbreviations (Tufte: minimal, only if first panel or annotations enabled)
    if (index === 0 && annotations === 'minimal') {
      const dayRow = createElement('div', 'viz-day-row');
      setStyles(dayRow, {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '2px',
        marginBottom: '4px',
      });

      DAYS_SHORT.forEach(day => {
        const dayLabel = createElement('span', 'viz-day-abbr');
        setStyles(dayLabel, {
          fontSize: '9px',
          textAlign: 'center',
          color: CSS_COLOR_VARS.textMuted,
          opacity: '0.7',
        });
        dayLabel.textContent = day;
        dayRow.appendChild(dayLabel);
      });
      panel.appendChild(dayRow);
    }

    // Mood cells
    entries.forEach((entry, dayIndex) => {
      const cell = createElement('div', 'viz-mood-cell-mini');

      setStyles(cell, {
        aspectRatio: '1',
        borderRadius: 'var(--viz-radius-xs)',
        background: entry ? MOOD_CSS_VARS[entry.mood] : 'var(--viz-border-subtle)',
        opacity: entry ? '0.85' : '0.2',
        transition: 'transform var(--viz-duration-fast) var(--viz-ease-spring)',
      });

      // Show difference indicator if enabled
      if (showDifferences && index > 0 && datasets[0]) {
        const firstDataset = datasets[0];
        const compareEntry = getLastNEntries(firstDataset.entries, 7)[dayIndex];
        if (entry && compareEntry && entry.mood !== compareEntry.mood) {
          // Different mood - add subtle indicator
          setStyles(cell, {
            boxShadow: '0 0 0 2px var(--viz-color-accent)',
          });
        }
      }

      if (entry) {
        cell.title = `${entry.date}: ${capitalize(entry.mood)}`;
      }

      miniGrid.appendChild(cell);
    });

    panel.appendChild(miniGrid);

    // Summary stat (Tufte: one key metric, directly labeled)
    if (annotations === 'minimal') {
      const stat = createElement('div', 'viz-mini-stat');
      setStyles(stat, {
        fontSize: 'var(--viz-text-xs)',
        color: CSS_COLOR_VARS.textMuted,
        textAlign: 'center',
        marginTop: 'var(--viz-space-2xs)',
      });
      stat.textContent = `${dataset.summary.calmDays} calm`;
      panel.appendChild(stat);
    }

    multiplesGrid.appendChild(panel);
  });

  container.appendChild(multiplesGrid);

  // Comparison insight (Tufte: let data speak, but one guiding sentence)
  if (datasets.length >= 2 && datasets[0] && datasets[1]) {
    const firstCalmDays = datasets[0].summary.calmDays;
    const secondCalmDays = datasets[1].summary.calmDays;
    const diff = firstCalmDays - secondCalmDays;

    if (Math.abs(diff) >= 1) {
      const insight = createElement('p', 'viz-insight viz-animate-fade');
      setStyles(insight, {
        fontSize: 'var(--viz-text-sm)',
        color: CSS_COLOR_VARS.textSecondary,
        textAlign: 'center',
        marginTop: 'var(--viz-space-breath)',
        fontStyle: 'italic',
      });

      const betterPeriod = diff > 0 ? labels[0] : labels[1];
      insight.textContent = t(
        'visualizations.moodCalendar.comparisonInsight',
        `${betterPeriod} had ${Math.abs(diff)} more calm ${Math.abs(diff) === 1 ? 'day' : 'days'}.`
      );
      container.appendChild(insight);
    }
  }

  // Screen reader summary
  const allCalmDays = datasets.map((d, i) => `${labels[i]}: ${d.summary.calmDays} calm days`).join(', ');
  container.appendChild(
    createScreenReaderLabel(`Mood comparison: ${allCalmDays}`)
  );

  return {
    element: container,
    type: 'mood-calendar',
    device: context.type,
    ariaLabel: `Mood calendar comparison with ${datasets.length} periods`,
  };
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build mood calendar visualization for the given device context.
 *
 * @param container - HTML element to render into
 * @param data - Single period mood data
 * @param context - Device context for responsive rendering
 * @param comparison - Optional: compare multiple periods (Tufte small multiples)
 */
export function buildMoodCalendar(
  container: HTMLElement,
  data: MoodCalendarData,
  context: DeviceContext,
  comparison?: SmallMultiplesConfig
): VisualizationResult {
  // If comparison config provided, use small multiples view
  if (comparison) {
    return buildSmallMultiples(container, comparison, context);
  }

  // Standard single-period view
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
    const entry = entries[i];
    result.push(entry ?? null);
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
