/**
 * Actions Taken Visualization Builder
 *
 * Displays what Ferni has done on behalf of the user as a narrative of care.
 * Part of the "Better than Human" story - not a transaction log.
 *
 * Adapts to different device sizes:
 * - Watch: Count with care indicator
 * - Mobile: Card-based list by recency
 * - Tablet/Desktop: Full view with stats and care moments
 *
 * @module visualizations/builders/actions-taken
 */

import {
  createElement,
  createSvgElement,
  setStyles,
  createScreenReaderLabel,
  getCssVar,
  DURATION,
  EASING,
} from '../utils/dom.js';
import type { DeviceContext, VisualizationResult } from '../types.js';
import { t } from '../../../i18n/index.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Care moment types - emphasizing the narrative, not the transaction
 */
export type CareMomentType =
  | 'called_for_you'
  | 'messaged_for_you'
  | 'remembered'
  | 'protected_time'
  | 'kept_commitment';

/**
 * A care moment - a narrative-framed action
 */
export interface CareMoment {
  id: string;
  type: CareMomentType;
  /** Human-readable narrative description */
  narrative: string;
  /** When this happened */
  timestamp: string;
  /** Which persona did this */
  persona: string;
  /** Target of the action */
  target?: string;
  /** Whether it was successful */
  success: boolean;
  /** Additional context */
  details?: string;
}

/**
 * Actions taken data for the visualization
 */
export interface ActionsTakenData {
  /** Recent care moments */
  recentCare: CareMoment[];
  /** Summary stats */
  summary: {
    callsMade: number;
    messagesSent: number;
    remindersKept: number;
    commitmentsFulfilled: number;
  };
  /** Commitment progress */
  commitmentProgress: {
    kept: number;
    pending: number;
    total: number;
  };
  /** Total actions */
  totalActions: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Icons for care moment types
 */
const CARE_TYPE_ICONS: Record<CareMomentType, string> = {
  called_for_you: '📞',
  messaged_for_you: '💬',
  remembered: '💭',
  protected_time: '📅',
  kept_commitment: '✓',
};

/**
 * Labels for care moment types
 */
const CARE_TYPE_LABELS: Record<CareMomentType, string> = {
  called_for_you: 'Call',
  messaged_for_you: 'Message',
  remembered: 'Followed up',
  protected_time: 'Calendar',
  kept_commitment: 'Commitment',
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format a timestamp as a relative time string
 */
function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ============================================================================
// WATCH BUILDER
// ============================================================================

/**
 * Build compact actions display for watch.
 */
function buildWatch(
  container: HTMLElement,
  data: ActionsTakenData
): VisualizationResult {
  container.replaceChildren();

  // Header with design system classes
  const header = createElement('div', 'viz-header');
  const title = createElement(
    'h3',
    'viz-header__title viz-header__title--compact',
    t('visualizations.actionsTaken.titleShort', 'Care')
  );
  const subtitle = createElement(
    'p',
    'viz-header__subtitle',
    t('visualizations.actionsTaken.subtitleShort', 'What I did for you')
  );
  header.appendChild(title);
  header.appendChild(subtitle);
  container.appendChild(header);

  // Heart visualization for care
  const heartContainer = createElement('div', 'viz-flex viz-flex--center');
  setStyles(heartContainer, { margin: 'var(--viz-space-breath) 0' });

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 60 60');
  setStyles(svg as unknown as HTMLElement, {
    width: '60px',
    height: '60px',
  });

  // Draw heart shape - @design-tokens-ignore (SVG)
  const heart = createSvgElement('path');
  heart.setAttribute(
    'd',
    'M30 50 L15 35 A10 10 0 0 1 30 20 A10 10 0 0 1 45 35 Z'
  );
  heart.setAttribute('fill', getCssVar('--viz-accent', '#3D5A45'));
  heart.setAttribute('opacity', '0.8');
  svg.appendChild(heart);

  // Center count - @design-tokens-ignore (SVG)
  const countText = createSvgElement('text');
  countText.setAttribute('x', '30');
  countText.setAttribute('y', '38');
  countText.setAttribute('text-anchor', 'middle');
  countText.setAttribute('font-size', '12');
  countText.setAttribute('font-weight', '600');
  countText.setAttribute('fill', getCssVar('--viz-text-on-accent', '#FFFFFF'));
  countText.textContent = String(data.totalActions);
  svg.appendChild(countText);

  heartContainer.appendChild(svg);
  container.appendChild(heartContainer);

  // Primary metric
  const metric = createElement('div', 'viz-metric viz-metric--compact');
  const metricValue = createElement('span', 'viz-metric__value');
  metricValue.textContent = String(data.totalActions);
  const metricLabel = createElement('span', 'viz-metric__label');
  metricLabel.textContent = t('visualizations.actionsTaken.actions', 'things done');
  metric.appendChild(metricValue);
  metric.appendChild(metricLabel);
  container.appendChild(metric);

  // Screen reader label
  container.appendChild(
    createScreenReaderLabel(
      `${data.totalActions} actions taken on your behalf`
    )
  );

  return {
    cleanup: () => {},
    update: (newData: ActionsTakenData) => buildWatch(container, newData),
  };
}

// ============================================================================
// MOBILE BUILDER
// ============================================================================

/**
 * Build card-based actions display for mobile.
 */
function buildMobile(
  container: HTMLElement,
  data: ActionsTakenData
): VisualizationResult {
  container.replaceChildren();

  // Header
  const header = createElement('div', 'viz-header');
  const title = createElement(
    'h3',
    'viz-header__title',
    t('visualizations.actionsTaken.title', "What I've Done for You")
  );
  const subtitle = createElement(
    'p',
    'viz-header__subtitle',
    t('visualizations.actionsTaken.subtitle', 'Calls, messages, and commitments kept')
  );
  header.appendChild(title);
  header.appendChild(subtitle);
  container.appendChild(header);

  // Stats row
  const statsRow = createElement('div', 'viz-stats-row');
  setStyles(statsRow, {
    display: 'flex',
    gap: 'var(--viz-space-breath)',
    marginBottom: 'var(--viz-space-breath)',
    justifyContent: 'space-around',
  });

  const stats = [
    { value: data.summary.callsMade, label: 'Calls' },
    { value: data.summary.messagesSent, label: 'Messages' },
    { value: data.summary.commitmentsFulfilled, label: 'Kept' },
  ];

  for (const stat of stats) {
    const statBox = createElement('div', 'viz-stat');
    setStyles(statBox, {
      textAlign: 'center',
      padding: 'var(--viz-space-tight)',
    });

    const valueEl = createElement('div', 'viz-stat__value');
    setStyles(valueEl, {
      fontSize: 'var(--font-size-xl)',
      fontWeight: '600',
      color: 'var(--viz-text-primary)',
    });
    valueEl.textContent = String(stat.value);

    const labelEl = createElement('div', 'viz-stat__label');
    setStyles(labelEl, {
      fontSize: 'var(--font-size-sm)',
      color: 'var(--viz-text-muted)',
    });
    labelEl.textContent = stat.label;

    statBox.appendChild(valueEl);
    statBox.appendChild(labelEl);
    statsRow.appendChild(statBox);
  }
  container.appendChild(statsRow);

  // Care moments list
  const list = createElement('div', 'viz-care-list');
  setStyles(list, {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--viz-space-tight)',
  });

  const moments = data.recentCare.slice(0, 5);
  if (moments.length === 0) {
    const emptyState = createElement('div', 'viz-empty');
    setStyles(emptyState, {
      textAlign: 'center',
      padding: 'var(--viz-space-breath)',
      color: 'var(--viz-text-muted)',
    });
    emptyState.textContent = t(
      'visualizations.actionsTaken.empty',
      'Ask me to call someone or send a message!'
    );
    list.appendChild(emptyState);
  } else {
    for (const moment of moments) {
      const card = createElement('div', 'viz-care-card');
      setStyles(card, {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--viz-space-tight)',
        padding: 'var(--viz-space-tight)',
        background: 'var(--viz-bg-secondary)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--viz-border-subtle)',
      });

      // Icon
      const icon = createElement('span', 'viz-care-card__icon');
      setStyles(icon, { fontSize: '1.25rem' });
      icon.textContent = CARE_TYPE_ICONS[moment.type];
      card.appendChild(icon);

      // Content
      const content = createElement('div', 'viz-care-card__content');
      setStyles(content, { flex: '1', minWidth: '0' });

      const narrative = createElement('div', 'viz-care-card__narrative');
      setStyles(narrative, {
        fontSize: 'var(--font-size-sm)',
        color: 'var(--viz-text-primary)',
        lineHeight: '1.4',
      });
      narrative.textContent = moment.narrative;

      const time = createElement('div', 'viz-care-card__time');
      setStyles(time, {
        fontSize: 'var(--font-size-xs)',
        color: 'var(--viz-text-muted)',
        marginTop: 'var(--viz-space-micro)',
      });
      time.textContent = formatRelativeTime(moment.timestamp);

      content.appendChild(narrative);
      content.appendChild(time);
      card.appendChild(content);

      // Success indicator
      if (moment.success) {
        const check = createElement('span', 'viz-care-card__status');
        setStyles(check, {
          color: 'var(--color-semantic-success)',
          fontSize: '0.875rem',
        });
        check.textContent = '✓';
        card.appendChild(check);
      }

      list.appendChild(card);
    }
  }

  container.appendChild(list);

  // Screen reader label
  container.appendChild(
    createScreenReaderLabel(
      `${data.totalActions} actions taken: ${data.summary.callsMade} calls, ${data.summary.messagesSent} messages, ${data.summary.commitmentsFulfilled} commitments kept`
    )
  );

  return {
    cleanup: () => {},
    update: (newData: ActionsTakenData) => buildMobile(container, newData),
  };
}

// ============================================================================
// TABLET/DESKTOP BUILDER
// ============================================================================

/**
 * Build full actions display for tablet/desktop.
 */
function buildTablet(
  container: HTMLElement,
  data: ActionsTakenData,
  context: DeviceContext
): VisualizationResult {
  container.replaceChildren();

  // Header with commitment progress
  const header = createElement('div', 'viz-header');
  const headerTop = createElement('div', 'viz-header__top');
  setStyles(headerTop, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  });

  const titleArea = createElement('div');
  const title = createElement(
    'h3',
    'viz-header__title',
    t('visualizations.actionsTaken.title', "What I've Done for You")
  );
  const subtitle = createElement(
    'p',
    'viz-header__subtitle',
    t(
      'visualizations.actionsTaken.subtitle',
      'Calls, messages, and commitments kept'
    )
  );
  titleArea.appendChild(title);
  titleArea.appendChild(subtitle);
  headerTop.appendChild(titleArea);

  // Commitment progress badge
  if (data.commitmentProgress.total > 0) {
    const badge = createElement('div', 'viz-badge');
    setStyles(badge, {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--viz-space-micro)',
      padding: 'var(--viz-space-micro) var(--viz-space-tight)',
      background: 'var(--viz-bg-tertiary)',
      borderRadius: 'var(--radius-full)',
      fontSize: 'var(--font-size-sm)',
      color: 'var(--viz-text-secondary)',
    });
    badge.textContent = `${data.commitmentProgress.kept}/${data.commitmentProgress.total} kept`;
    headerTop.appendChild(badge);
  }

  header.appendChild(headerTop);
  container.appendChild(header);

  // Stats grid
  const statsGrid = createElement('div', 'viz-stats-grid');
  setStyles(statsGrid, {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 'var(--viz-space-tight)',
    marginBottom: 'var(--viz-space-breath)',
  });

  const allStats = [
    { value: data.summary.callsMade, label: 'Calls made', icon: '📞' },
    { value: data.summary.messagesSent, label: 'Messages sent', icon: '💬' },
    { value: data.summary.remindersKept, label: 'Reminders', icon: '🔔' },
    { value: data.summary.commitmentsFulfilled, label: 'Commitments', icon: '✓' },
  ];

  for (const stat of allStats) {
    const statCard = createElement('div', 'viz-stat-card');
    setStyles(statCard, {
      padding: 'var(--viz-space-tight)',
      background: 'var(--viz-bg-secondary)',
      borderRadius: 'var(--radius-md)',
      textAlign: 'center',
    });

    const iconEl = createElement('div', 'viz-stat-card__icon');
    setStyles(iconEl, { fontSize: '1.5rem', marginBottom: 'var(--viz-space-micro)' });
    iconEl.textContent = stat.icon;

    const valueEl = createElement('div', 'viz-stat-card__value');
    setStyles(valueEl, {
      fontSize: 'var(--font-size-2xl)',
      fontWeight: '600',
      color: 'var(--viz-text-primary)',
    });
    valueEl.textContent = String(stat.value);

    const labelEl = createElement('div', 'viz-stat-card__label');
    setStyles(labelEl, {
      fontSize: 'var(--font-size-xs)',
      color: 'var(--viz-text-muted)',
    });
    labelEl.textContent = stat.label;

    statCard.appendChild(iconEl);
    statCard.appendChild(valueEl);
    statCard.appendChild(labelEl);
    statsGrid.appendChild(statCard);
  }

  container.appendChild(statsGrid);

  // Recent care moments section
  const momentsSection = createElement('div', 'viz-moments-section');

  const momentsHeader = createElement('h4', 'viz-section-title');
  setStyles(momentsHeader, {
    fontSize: 'var(--font-size-sm)',
    fontWeight: '600',
    color: 'var(--viz-text-secondary)',
    marginBottom: 'var(--viz-space-tight)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  });
  momentsHeader.textContent = t('visualizations.actionsTaken.recent', 'Recent');
  momentsSection.appendChild(momentsHeader);

  // Care moments list
  const list = createElement('div', 'viz-care-list');
  setStyles(list, {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--viz-space-tight)',
  });

  const moments = data.recentCare.slice(0, 8);
  if (moments.length === 0) {
    const emptyState = createElement('div', 'viz-empty');
    setStyles(emptyState, {
      textAlign: 'center',
      padding: 'var(--viz-space-breath)',
      color: 'var(--viz-text-muted)',
      fontStyle: 'italic',
    });
    emptyState.textContent = t(
      'visualizations.actionsTaken.empty',
      'Ask me to call someone or send a message!'
    );
    list.appendChild(emptyState);
  } else {
    for (const moment of moments) {
      const card = createElement('div', 'viz-care-card');
      setStyles(card, {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--viz-space-tight)',
        padding: 'var(--viz-space-tight)',
        background: 'var(--viz-bg-secondary)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--viz-border-subtle)',
        transition: `border-color ${DURATION.FAST}ms ${EASING.STANDARD}`,
      });

      // Hover effect
      card.addEventListener('mouseenter', () => {
        setStyles(card, { borderColor: 'var(--viz-border-medium)' });
      });
      card.addEventListener('mouseleave', () => {
        setStyles(card, { borderColor: 'var(--viz-border-subtle)' });
      });

      // Icon
      const icon = createElement('span', 'viz-care-card__icon');
      setStyles(icon, { fontSize: '1.25rem', flexShrink: '0' });
      icon.textContent = CARE_TYPE_ICONS[moment.type];
      card.appendChild(icon);

      // Content
      const content = createElement('div', 'viz-care-card__content');
      setStyles(content, { flex: '1', minWidth: '0' });

      const narrative = createElement('div', 'viz-care-card__narrative');
      setStyles(narrative, {
        fontSize: 'var(--font-size-sm)',
        color: 'var(--viz-text-primary)',
        lineHeight: '1.4',
      });
      narrative.textContent = moment.narrative;

      const meta = createElement('div', 'viz-care-card__meta');
      setStyles(meta, {
        display: 'flex',
        gap: 'var(--viz-space-tight)',
        marginTop: 'var(--viz-space-micro)',
      });

      const time = createElement('span', 'viz-care-card__time');
      setStyles(time, {
        fontSize: 'var(--font-size-xs)',
        color: 'var(--viz-text-muted)',
      });
      time.textContent = formatRelativeTime(moment.timestamp);
      meta.appendChild(time);

      if (moment.target) {
        const target = createElement('span', 'viz-care-card__target');
        setStyles(target, {
          fontSize: 'var(--font-size-xs)',
          color: 'var(--viz-text-muted)',
        });
        target.textContent = `• ${moment.target}`;
        meta.appendChild(target);
      }

      content.appendChild(narrative);
      content.appendChild(meta);
      card.appendChild(content);

      // Success indicator
      const status = createElement('span', 'viz-care-card__status');
      setStyles(status, {
        fontSize: '0.875rem',
        flexShrink: '0',
      });
      if (moment.success) {
        setStyles(status, { color: 'var(--color-semantic-success)' });
        status.textContent = '✓';
        status.title = 'Completed';
      } else {
        setStyles(status, { color: 'var(--color-semantic-warning)' });
        status.textContent = '○';
        status.title = 'In progress';
      }
      card.appendChild(status);

      list.appendChild(card);
    }
  }

  momentsSection.appendChild(list);
  container.appendChild(momentsSection);

  // Screen reader label
  container.appendChild(
    createScreenReaderLabel(
      `${data.totalActions} actions taken on your behalf: ${data.summary.callsMade} calls, ${data.summary.messagesSent} messages, ${data.summary.remindersKept} reminders, ${data.summary.commitmentsFulfilled} commitments kept`
    )
  );

  return {
    cleanup: () => {},
    update: (newData: ActionsTakenData) => buildTablet(container, newData, context),
  };
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build actions taken visualization.
 * Adapts to device type automatically.
 */
export function buildActionsTaken(
  container: HTMLElement,
  data: ActionsTakenData,
  context: DeviceContext
): VisualizationResult {
  // Add base visualization classes
  container.classList.add('viz-container', 'viz-actions-taken');

  switch (context.type) {
    case 'watch':
      return buildWatch(container, data);
    case 'mobile':
      return buildMobile(container, data);
    case 'tablet':
    case 'desktop':
    case 'tv':
    default:
      return buildTablet(container, data, context);
  }
}

/**
 * Inject styles for actions taken visualization.
 * Call once on app initialization.
 */
export function injectActionsTakenStyles(): void {
  if (document.getElementById('viz-actions-taken-styles')) return;

  const style = document.createElement('style');
  style.id = 'viz-actions-taken-styles';
  style.textContent = `
    .viz-actions-taken {
      --viz-bg-secondary: var(--color-bg-secondary, rgba(0, 0, 0, 0.03));
      --viz-bg-tertiary: var(--color-bg-tertiary, rgba(0, 0, 0, 0.05));
      --viz-border-subtle: var(--color-border-subtle, rgba(0, 0, 0, 0.08));
      --viz-border-medium: var(--color-border-medium, rgba(0, 0, 0, 0.15));
      --viz-text-primary: var(--color-text-primary, #2C2520);
      --viz-text-secondary: var(--color-text-secondary, #5a5248);
      --viz-text-muted: var(--color-text-muted, #9a8f85);
      --viz-accent: var(--color-accent, #3D5A45);
      --viz-text-on-accent: var(--color-text-on-accent, #FFFFFF);
    }

    .viz-care-card {
      cursor: default;
    }

    .viz-empty {
      min-height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    @media (prefers-color-scheme: dark) {
      .viz-actions-taken {
        --viz-bg-secondary: var(--color-bg-secondary, rgba(255, 255, 255, 0.05));
        --viz-bg-tertiary: var(--color-bg-tertiary, rgba(255, 255, 255, 0.08));
        --viz-border-subtle: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
        --viz-border-medium: var(--color-border-medium, rgba(255, 255, 255, 0.2));
        --viz-text-primary: var(--color-text-primary, #faf6f0);
        --viz-text-secondary: var(--color-text-secondary, #e8e2da);
        --viz-text-muted: var(--color-text-muted, #b0a89e);
      }
    }
  `;

  document.head.appendChild(style);
}
