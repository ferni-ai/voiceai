/**
 * Visualization CSS Styles
 *
 * Production-ready styles for all visualization components.
 * Uses design system tokens consistently across all builders.
 *
 * Design Philosophy:
 * - MA (間) spacing: breath=8px, pause=13px, rest=21px, silence=34px, meditation=55px
 * - visionOS glass morphism with warm tints
 * - Pixar-inspired animations with spring easings
 * - Golden ratio typography scale
 *
 * @module visualizations/styles
 */

/**
 * Get the visualization CSS stylesheet content.
 * This should be injected into the document once.
 */
export function getVisualizationStyles(): string {
  return `
    /* ========================================================================
       VISUALIZATION STYLES - Design System Aligned
       Uses CSS variables for all colors, spacing, and typography
       ======================================================================== */

    /* ========================================================================
       CSS VARIABLES - Semantic tokens for visualizations
       These map to the main design system tokens
       ======================================================================== */

    :root {
      /* MA Spacing Philosophy */
      --viz-space-2xs: 0.25rem;       /* 4px - minimal */
      --viz-space-xs: 0.375rem;       /* 6px - tiny */
      --viz-space-breath: 0.5rem;     /* 8px - tightest */
      --viz-space-pause: 0.8125rem;   /* 13px - compact */
      --viz-space-rest: 1.3125rem;    /* 21px - comfortable */
      --viz-space-silence: 2.125rem;  /* 34px - spacious */
      --viz-space-meditation: 3.4375rem; /* 55px - expansive */

      /* Border radii */
      --viz-radius-xs: 0.25rem;       /* 4px */
      --viz-radius-sm: 0.375rem;      /* 6px */
      --viz-radius-md: 0.75rem;       /* 12px */
      --viz-radius-lg: 1rem;          /* 16px */
      --viz-radius-xl: 1.25rem;       /* 20px */

      /* Animation durations */
      --viz-duration-fast: 150ms;
      --viz-duration-normal: 200ms;
      --viz-duration-slow: 300ms;
      --viz-duration-moderate: 400ms;

      /* Animation easings */
      --viz-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
      --viz-ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
      --viz-ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);

      /* Golden Ratio Typography */
      --viz-text-2xs: 0.625rem;   /* 10px - tiny labels */
      --viz-text-xs: 0.6875rem;   /* 11px - labels */
      --viz-text-sm: 0.75rem;     /* 12px - captions */
      --viz-text-base: 0.8125rem; /* 13px - body small */
      --viz-text-md: 0.875rem;    /* 14px - body */
      --viz-text-lg: 1rem;        /* 16px - card title */
      --viz-text-xl: 1.125rem;    /* 18px - section title */
      --viz-text-2xl: 1.5rem;     /* 24px - hero metric */
      --viz-text-3xl: 2rem;       /* 32px - large metric */

      /* Visualization-specific semantic colors */
      --viz-energy-emotional: var(--persona-maya, #a67a6a);
      --viz-energy-mental: var(--persona-peter, #3a6b73);
      --viz-energy-physical: var(--persona-ferni, #4a6741);

      /* Status tokens - sourced from design system */
      --viz-status-thriving: var(--viz-status-thriving, #3d7a52);
      --viz-status-balanced: var(--viz-status-balanced, #3D5A45);
      --viz-status-stretched: var(--viz-status-stretched, #a67c35);
      --viz-status-depleted: var(--viz-status-depleted, #c67840);
      --viz-status-critical: var(--viz-status-critical, #b5453a);

      /* Priority tokens - sourced from design system */
      --viz-priority-high: var(--viz-priority-high, #b5453a);
      --viz-priority-medium: var(--viz-priority-medium, #a67c35);
      --viz-priority-low: var(--viz-priority-low, #756a5e);

      /* Mood tokens - sourced from design system (--viz-moods-*) */
      --viz-mood-calm: var(--viz-moods-calm, #3D5A45);
      --viz-mood-joyful: var(--viz-moods-joyful, #c4956a);
      --viz-mood-anxious: var(--viz-moods-anxious, #b5453a);
      --viz-mood-tired: var(--viz-moods-tired, #756a5e);
      --viz-mood-focused: var(--viz-moods-focused, #3a6b73);
      --viz-mood-reflective: var(--viz-moods-reflective, #7a6a8a);
      --viz-mood-stressed: var(--viz-moods-stressed, #a54545);
      --viz-mood-energized: var(--viz-moods-energized, #4a7a52);
      --viz-mood-peaceful: var(--viz-moods-peaceful, #5a8a73);
      --viz-mood-uncertain: var(--viz-moods-uncertain, #6a6a6a);

      /* Chapter tokens - sourced from design system (--viz-chapters-*) */
      --viz-chapter-growth: var(--viz-chapters-growth, #3D5A45);
      --viz-chapter-challenge: var(--viz-chapters-challenge, #b5453a);
      --viz-chapter-transition: var(--viz-chapters-transition, #c4956a);
      --viz-chapter-celebration: var(--viz-chapters-celebration, #4a7a52);
      --viz-chapter-reflection: var(--viz-chapters-reflection, #7a6a8a);

      /* Semantic colors for DOM elements */
      --viz-accent: var(--color-accent, #3D5A45);
      --viz-accent-secondary: var(--persona-ferni-secondary, #5a8b73);
      --viz-text-primary: var(--color-text-primary, #2C2520);
      --viz-text-secondary: var(--color-text-secondary, #5c544a);
      --viz-text-muted: var(--color-text-muted, #756a5e);
      --viz-border-subtle: var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      --viz-bg-elevated: var(--color-bg-elevated, #FFFDFB);

      /* Glass morphism layers */
      --viz-glass-bg: var(--glass-regular-background, rgba(255, 255, 255, 0.70));
      --viz-glass-blur: var(--glass-regular-blur, 16px);
      --viz-glass-border: var(--glass-regular-border, rgba(44, 37, 32, 0.08));
      --viz-glass-shadow: 0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
      --viz-glass-shadow-elevated: 0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04);
    }

    /* Dark mode overrides */
    [data-theme="midnight"] {
      --viz-glass-bg: var(--glass-regular-background, rgba(255, 255, 255, 0.08));
      --viz-glass-border: var(--glass-regular-border, rgba(255, 255, 255, 0.10));
      --viz-glass-shadow: 0 4px 24px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2);
      --viz-glass-shadow-elevated: 0 8px 32px rgba(0, 0, 0, 0.4), 0 2px 6px rgba(0, 0, 0, 0.25);
    }

    /* ========================================================================
       VIZ CARD - Primary container for all visualizations
       Glass morphism with warm tints
       ======================================================================== */

    .viz-card {
      background: var(--viz-glass-bg);
      backdrop-filter: blur(var(--viz-glass-blur));
      -webkit-backdrop-filter: blur(var(--viz-glass-blur));
      border: 1px solid var(--viz-glass-border);
      border-radius: var(--radius-xl, 1.25rem);
      padding: var(--viz-space-pause);
      box-shadow: var(--viz-glass-shadow);
      transition:
        transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
        box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .viz-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--viz-glass-shadow-elevated);
    }

    .viz-card--elevated {
      background: var(--color-bg-elevated, #FFFDFB);
      box-shadow: var(--viz-glass-shadow-elevated);
    }

    .viz-card--compact {
      padding: var(--viz-space-breath);
    }

    .viz-card--flush {
      padding: 0;
    }

    /* Card accent variants for Android-style indicators */
    .viz-card--accent-emotional {
      border-left: 3px solid var(--viz-energy-emotional);
    }

    .viz-card--accent-mental {
      border-left: 3px solid var(--viz-energy-mental);
    }

    .viz-card--accent-physical {
      border-left: 3px solid var(--viz-energy-physical);
    }

    .viz-card--accent-primary {
      border-left: 3px solid var(--color-accent, #3D5A45);
    }

    .viz-card--accent-warning {
      border-left: 3px solid var(--viz-status-stretched);
    }

    .viz-card--accent-high {
      border-left: 3px solid var(--viz-priority-high);
    }

    .viz-card--accent-secondary {
      border-left: 3px solid var(--persona-nayan, #b8956a);
    }

    .viz-card--priority-high {
      border-left: 3px solid var(--viz-priority-high);
    }

    .viz-card--warning {
      background: rgba(166, 124, 53, 0.06);
      border: 1px solid var(--viz-status-stretched);
    }

    /* ========================================================================
       VIZ HEADER - Section headers with accent bar
       ======================================================================== */

    .viz-header {
      margin-bottom: var(--viz-space-pause);
      padding-bottom: var(--viz-space-breath);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.06));
    }

    .viz-header__title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--viz-text-lg);
      font-weight: 600;
      line-height: 1.3;
      letter-spacing: -0.01em;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 0.25rem;
    }

    .viz-header__subtitle {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--viz-text-xs);
      font-weight: 500;
      color: var(--color-text-muted, #756a5e);
      margin: 0;
      letter-spacing: 0.01em;
    }

    .viz-header__title--compact {
      font-size: var(--viz-text-md);
    }

    /* ========================================================================
       VIZ METRIC - Large numeric displays
       ======================================================================== */

    .viz-metric {
      text-align: center;
      padding: var(--viz-space-breath) 0;
    }

    .viz-metric__value {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--viz-text-3xl);
      font-weight: 700;
      line-height: 1;
      letter-spacing: -0.02em;
      color: var(--color-text-primary, #2C2520);
    }

    .viz-metric__value--accent {
      color: var(--color-accent, #3D5A45);
    }

    .viz-metric__value--sm {
      font-size: var(--viz-text-2xl);
    }

    .viz-metric__value--lg {
      font-size: 2.5rem;
    }

    .viz-metric__label {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--viz-text-xs);
      font-weight: 500;
      color: var(--color-text-muted, #756a5e);
      margin-top: 0.25rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .viz-metric__unit {
      font-size: var(--viz-text-lg);
      font-weight: 400;
      opacity: 0.7;
    }

    .viz-metric--compact {
      padding: var(--viz-space-breath) 0;
    }

    .viz-metric--compact .viz-metric__value {
      font-size: var(--viz-text-xl);
    }

    .viz-metric--compact .viz-metric__label {
      font-size: var(--viz-text-xs);
      margin-top: 0.125rem;
    }

    /* ========================================================================
       VIZ STAT ROW - Horizontal stat display
       ======================================================================== */

    .viz-stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--viz-space-breath);
      padding: var(--viz-space-breath) 0;
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.04));
    }

    .viz-stat-row:last-of-type {
      border-bottom: none;
    }

    .viz-stat-row__label {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--viz-text-base);
      color: var(--color-text-secondary, #5c544a);
    }

    .viz-stat-row__value {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--viz-text-base);
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }

    .viz-stat-row__value--accent {
      font-size: var(--viz-text-lg);
      color: var(--color-accent, #3D5A45);
    }

    .viz-stat {
      display: flex;
      align-items: center;
      gap: var(--viz-space-breath);
    }

    .viz-stat__icon {
      width: 1.125rem;
      height: 1.125rem;
      color: var(--color-accent, #3D5A45);
      opacity: 0.85;
    }

    .viz-stat__value {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--viz-text-base);
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }

    .viz-stat__label {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--viz-text-base);
      color: var(--color-text-muted, #756a5e);
      margin-left: 0.25rem;
    }

    /* ========================================================================
       VIZ BADGE - Small pill indicators
       ======================================================================== */

    .viz-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.25rem 0.625rem;
      background: var(--color-accent-subtle, rgba(61, 90, 69, 0.08));
      color: var(--color-accent, #3D5A45);
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--viz-text-xs);
      font-weight: 600;
      letter-spacing: 0.02em;
      border-radius: var(--radius-full, 9999px);
      transition: background 150ms, transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .viz-badge:hover {
      transform: scale(1.02);
    }

    .viz-badge--status-thriving {
      background: rgba(77, 128, 92, 0.12);
      color: var(--viz-status-thriving);
    }

    .viz-badge--status-balanced {
      background: var(--color-accent-subtle, rgba(61, 90, 69, 0.08));
      color: var(--viz-status-balanced);
    }

    .viz-badge--status-stretched {
      background: rgba(166, 124, 53, 0.12);
      color: var(--viz-status-stretched);
    }

    .viz-badge--status-depleted {
      background: rgba(198, 120, 64, 0.12);
      color: var(--viz-status-depleted);
    }

    .viz-badge--status-critical {
      background: rgba(181, 69, 58, 0.12);
      color: var(--viz-status-critical);
    }

    /* ========================================================================
       VIZ PROGRESS BAR - Linear progress indicators
       ======================================================================== */

    .viz-progress {
      height: 8px;
      background: var(--tonal-surface1, rgba(44, 37, 32, 0.04));
      border-radius: var(--radius-full, 9999px);
      overflow: hidden;
    }

    .viz-progress--thin {
      height: 4px;
    }

    .viz-progress--thick {
      height: 12px;
    }

    .viz-progress__fill {
      height: 100%;
      border-radius: var(--radius-full, 9999px);
      background: var(--color-accent, #3D5A45);
      transition: width 500ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .viz-progress__fill--emotional {
      background: var(--viz-energy-emotional);
    }

    .viz-progress__fill--mental {
      background: var(--viz-energy-mental);
    }

    .viz-progress__fill--physical {
      background: var(--viz-energy-physical);
    }

    .viz-progress__fill--gradient {
      background: linear-gradient(
        90deg,
        var(--color-accent, #3D5A45) 0%,
        var(--viz-status-stretched) 50%,
        var(--viz-status-critical) 100%
      );
    }

    /* Progress fill by chapter type */
    .viz-progress__fill--growth { background: var(--viz-chapter-growth); }
    .viz-progress__fill--challenge { background: var(--viz-chapter-challenge); }
    .viz-progress__fill--transition { background: var(--viz-chapter-transition); }
    .viz-progress__fill--celebration { background: var(--viz-chapter-celebration); }
    .viz-progress__fill--reflection { background: var(--viz-chapter-reflection); }

    /* ========================================================================
       VIZ DOT - Color indicator dots
       ======================================================================== */

    .viz-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--color-accent, #3D5A45);
      flex-shrink: 0;
    }

    .viz-dot--sm {
      width: 6px;
      height: 6px;
    }

    .viz-dot--lg {
      width: 14px;
      height: 14px;
    }

    .viz-dot--emotional { background: var(--viz-energy-emotional); }
    .viz-dot--mental { background: var(--viz-energy-mental); }
    .viz-dot--physical { background: var(--viz-energy-physical); }
    .viz-dot--high { background: var(--viz-priority-high); }
    .viz-dot--medium { background: var(--viz-priority-medium); }
    .viz-dot--low { background: var(--viz-priority-low); }

    /* ========================================================================
       VIZ INSIGHT - Callout text boxes
       ======================================================================== */

    .viz-insight {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--viz-text-sm);
      line-height: 1.5;
      color: var(--color-text-secondary, #5c544a);
      padding: var(--viz-space-breath) var(--viz-space-pause);
      background: var(--tonal-surface1, rgba(44, 37, 32, 0.02));
      border-radius: var(--radius-md, 0.75rem);
      border-left: 2px solid var(--color-accent, rgba(61, 90, 69, 0.3));
      margin: 0;
    }

    .viz-insight--warning {
      background: rgba(166, 124, 53, 0.08);
      border-left-color: var(--viz-status-stretched);
    }

    .viz-insight--success {
      background: rgba(77, 128, 92, 0.08);
      border-left-color: var(--viz-status-thriving);
    }

    /* ========================================================================
       VIZ GRID - Layout containers
       ======================================================================== */

    .viz-grid {
      display: grid;
      gap: var(--viz-space-pause);
    }

    .viz-grid--2col {
      grid-template-columns: repeat(2, 1fr);
    }

    .viz-grid--3col {
      grid-template-columns: repeat(3, 1fr);
    }

    .viz-grid--7col {
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
    }

    .viz-flex {
      display: flex;
      gap: var(--viz-space-breath);
    }

    .viz-flex--row { flex-direction: row; }
    .viz-flex--col { flex-direction: column; }
    .viz-flex--center { align-items: center; }
    .viz-flex--between { justify-content: space-between; }
    .viz-flex--wrap { flex-wrap: wrap; }
    .viz-flex--gap-pause { gap: var(--viz-space-pause); }
    .viz-flex--gap-rest { gap: var(--viz-space-rest); }

    /* ========================================================================
       VIZ DIVIDER - Subtle separators
       ======================================================================== */

    .viz-divider {
      height: 1px;
      background: var(--color-border-subtle, rgba(44, 37, 32, 0.06));
      margin: var(--viz-space-pause) 0;
    }

    .viz-divider--vertical {
      width: 1px;
      height: auto;
      margin: 0 var(--viz-space-pause);
    }

    /* ========================================================================
       VIZ LABEL - Small uppercase labels
       ======================================================================== */

    .viz-label {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--viz-text-xs);
      font-weight: 600;
      color: var(--color-text-muted, #756a5e);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .viz-label--accent {
      color: var(--color-accent, #3D5A45);
    }

    .viz-label--section {
      margin-bottom: var(--viz-space-pause);
    }

    .viz-label--warning {
      color: var(--viz-status-stretched);
    }

    /* ========================================================================
       VIZ RING - Circular progress rings (Apple Watch style)
       ======================================================================== */

    .viz-ring {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .viz-ring__svg {
      transform: rotate(-90deg);
    }

    .viz-ring__bg {
      fill: none;
      stroke: var(--tonal-surface2, rgba(44, 37, 32, 0.06));
    }

    .viz-ring__progress {
      fill: none;
      stroke-linecap: round;
      transition: stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .viz-ring__progress--emotional { stroke: var(--viz-energy-emotional); }
    .viz-ring__progress--mental { stroke: var(--viz-energy-mental); }
    .viz-ring__progress--physical { stroke: var(--viz-energy-physical); }

    .viz-ring__center {
      position: absolute;
      text-align: center;
    }

    .viz-ring__value {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--viz-text-md);
      font-weight: 700;
    }

    /* Small variant for watch sizes */
    .viz-ring--sm {
      width: 80px;
      height: 80px;
    }

    .viz-ring--sm .viz-ring__value {
      font-size: var(--viz-text-md);
    }

    /* ========================================================================
       VIZ TIMELINE - Horizontal timelines
       ======================================================================== */

    .viz-timeline {
      position: relative;
      padding: var(--viz-space-rest) 0;
    }

    .viz-timeline__line {
      position: absolute;
      top: 50%;
      left: var(--viz-space-rest);
      right: var(--viz-space-rest);
      height: 2px;
      background: var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      transform: translateY(-50%);
    }

    .viz-timeline__items {
      display: flex;
      justify-content: space-between;
      position: relative;
      z-index: 1;
    }

    .viz-timeline__item {
      text-align: center;
    }

    .viz-timeline__dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--color-text-muted, #756a5e);
      margin: 0 auto var(--viz-space-breath);
      transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .viz-timeline__dot--active {
      width: 16px;
      height: 16px;
      background: var(--color-accent, #3D5A45);
      box-shadow: 0 0 0 4px var(--color-accent-glow, rgba(61, 90, 69, 0.2));
    }

    .viz-timeline__label {
      font-size: var(--viz-text-xs);
      color: var(--color-text-muted, #756a5e);
    }

    .viz-timeline__label--active {
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }

    /* Additional timeline classes for life-timeline */
    .viz-timeline-line {
      position: absolute;
      top: 50%;
      left: var(--viz-space-rest);
      right: var(--viz-space-rest);
      height: 2px;
      background: var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      transform: translateY(-50%);
    }

    .viz-timeline-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--color-text-muted, #756a5e);
      margin: 0 auto;
      transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .viz-timeline-dot--active {
      width: 14px;
      height: 14px;
      background: var(--color-accent, #3D5A45);
      box-shadow: 0 0 0 3px var(--color-accent-glow, rgba(61, 90, 69, 0.2));
    }

    /* Timeline dots by chapter type */
    .viz-timeline-dot--growth { background: var(--viz-chapter-growth); }
    .viz-timeline-dot--challenge { background: var(--viz-chapter-challenge); }
    .viz-timeline-dot--transition { background: var(--viz-chapter-transition); }
    .viz-timeline-dot--celebration { background: var(--viz-chapter-celebration); }
    .viz-timeline-dot--reflection { background: var(--viz-chapter-reflection); }

    .viz-timeline-chapter {
      text-align: center;
      position: relative;
    }

    .viz-timeline-chapter__title {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--viz-text-xs);
      color: var(--color-text-muted, #756a5e);
      margin-top: var(--viz-space-breath);
      font-weight: 400;
    }

    .viz-timeline-chapter__title--active {
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }

    .viz-timeline-chapter__year {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--viz-text-2xs);
      color: var(--color-text-muted, #756a5e);
      margin-top: 0.125rem;
    }

    .viz-chapter-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--viz-text-lg);
      font-weight: 600;
      color: var(--color-accent, #3D5A45);
      margin: var(--viz-space-breath) 0;
    }

    .viz-arrow {
      color: var(--color-text-muted, #756a5e);
      font-size: var(--viz-text-md);
    }

    /* ========================================================================
       VIZ CALENDAR - Mood calendar cells
       ======================================================================== */

    .viz-calendar {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
    }

    .viz-calendar__header {
      text-align: center;
      font-size: var(--viz-text-2xs);
      font-weight: 600;
      color: var(--color-text-muted, #756a5e);
      padding: var(--viz-space-breath) 0;
    }

    .viz-calendar__cell {
      aspect-ratio: 1;
      border-radius: var(--radius-sm, 0.5rem);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--viz-text-2xs);
      cursor: default;
      transition: transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .viz-calendar__cell--empty {
      background: var(--tonal-surface1, rgba(44, 37, 32, 0.02));
      opacity: 0.5;
    }

    .viz-calendar__cell--mood {
      color: white;
    }

    .viz-calendar__cell--today {
      box-shadow: 0 0 0 2px var(--color-accent, #3D5A45);
    }

    .viz-calendar__cell:hover:not(.viz-calendar__cell--empty) {
      transform: scale(1.1);
    }

    /* Mood colors for calendar cells */
    .viz-calendar__cell--calm { background: var(--viz-mood-calm); }
    .viz-calendar__cell--joyful { background: var(--viz-mood-joyful); }
    .viz-calendar__cell--anxious { background: var(--viz-mood-anxious); }
    .viz-calendar__cell--tired { background: var(--viz-mood-tired); }
    .viz-calendar__cell--focused { background: var(--viz-mood-focused); }
    .viz-calendar__cell--reflective { background: var(--viz-mood-reflective); }
    .viz-calendar__cell--stressed { background: var(--viz-mood-stressed); }
    .viz-calendar__cell--energized { background: var(--viz-mood-energized); }
    .viz-calendar__cell--peaceful { background: var(--viz-mood-peaceful); }
    .viz-calendar__cell--uncertain { background: var(--viz-mood-uncertain); }

    /* Heatmap cells - simplified mood calendar cells */
    .viz-heatmap-cell {
      border-radius: var(--radius-sm, 0.375rem);
      transition: transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .viz-heatmap-cell:hover {
      transform: scale(1.1);
    }

    /* Day labels for calendar headers */
    .viz-day-label {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--viz-text-2xs);
      color: var(--color-text-muted, #756a5e);
      text-align: center;
    }

    .viz-day-label--header {
      font-weight: 600;
      padding: var(--viz-space-breath) 0;
    }

    /* Grid variant for calendar */
    .viz-grid--calendar {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: var(--viz-space-2xs, 4px);
    }

    /* Calendar cell for tablet view */
    .viz-calendar-cell {
      aspect-ratio: 1;
      border-radius: var(--radius-sm, 0.375rem);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--viz-text-2xs);
      cursor: default;
      transition: transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .viz-calendar-cell:hover {
      transform: scale(1.05);
    }

    /* ========================================================================
       VIZ LOOP - Open loop items
       ======================================================================== */

    .viz-loop-item {
      display: flex;
      gap: var(--viz-space-breath);
      padding: var(--viz-space-breath) 0;
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.04));
    }

    .viz-loop-item:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .viz-loop-item__icon {
      font-size: var(--viz-text-md);
      line-height: 1;
    }

    .viz-loop-item__icon--commitment { color: var(--viz-priority-high); }
    .viz-loop-item__icon--question { color: var(--viz-energy-mental); }
    .viz-loop-item__icon--intention { color: var(--viz-status-balanced); }
    .viz-loop-item__icon--follow-up { color: var(--viz-status-stretched); }

    .viz-loop-item__content {
      flex: 1;
      min-width: 0;
    }

    .viz-loop-item__desc {
      font-size: var(--viz-text-md);
      color: var(--color-text-primary, #2C2520);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .viz-loop-item__meta {
      display: flex;
      gap: var(--viz-space-breath);
      margin-top: 0.25rem;
    }

    .viz-loop-item__category,
    .viz-loop-item__age {
      font-size: var(--viz-text-sm);
      color: var(--color-text-muted, #756a5e);
    }

    /* Priority dots */
    .viz-priority-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .viz-priority-dot--high { background: var(--viz-priority-high); }
    .viz-priority-dot--medium { background: var(--viz-priority-medium); }
    .viz-priority-dot--low { background: var(--viz-priority-low); }

    /* Loop icon with priority color */
    .viz-loop-icon {
      font-size: var(--viz-text-md);
      line-height: 1;
    }

    .viz-loop-icon--high { color: var(--viz-priority-high); }
    .viz-loop-icon--medium { color: var(--viz-priority-medium); }
    .viz-loop-icon--low { color: var(--viz-priority-low); }

    /* Loop description text */
    .viz-loop-desc {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--viz-text-md);
      color: var(--color-text-primary, #2C2520);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Category icon for loop categories */
    .viz-category-icon {
      font-size: var(--viz-text-md);
      color: var(--color-accent, #3D5A45);
    }

    /* ========================================================================
       VIZ NETWORK - Relationship nodes
       ======================================================================== */

    .viz-network {
      position: relative;
      min-height: 200px;
    }

    .viz-network__center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: var(--color-accent, #3D5A45);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 600;
      font-size: var(--viz-text-md);
      box-shadow: 0 4px 12px rgba(61, 90, 69, 0.3);
      z-index: 2;
    }

    .viz-network__node {
      position: absolute;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--tonal-surface3, rgba(44, 37, 32, 0.08));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--viz-text-xs);
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      box-shadow: var(--viz-glass-shadow);
      transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .viz-network__node:hover {
      transform: scale(1.15);
    }

    .viz-network__node--family { background: rgba(166, 122, 106, 0.15); }
    .viz-network__node--friend { background: rgba(58, 107, 115, 0.15); }
    .viz-network__node--colleague { background: rgba(90, 107, 138, 0.15); }
    .viz-network__node--mentor { background: rgba(184, 149, 106, 0.15); }

    /* ========================================================================
       ANIMATIONS - Pixar-inspired entrance animations
       ======================================================================== */

    @keyframes viz-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes viz-slide-up {
      from {
        opacity: 0;
        transform: translateY(1rem);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes viz-scale-in {
      from {
        opacity: 0;
        transform: scale(0.9);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    @keyframes viz-ring-fill {
      from {
        stroke-dashoffset: 100;
      }
    }

    .viz-animate-fade {
      animation: viz-fade-in 300ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }

    .viz-animate-slide {
      animation: viz-slide-up 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .viz-animate-scale {
      animation: viz-scale-in 400ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }

    /* Stagger animation delays */
    .viz-stagger-1 { animation-delay: 50ms; }
    .viz-stagger-2 { animation-delay: 100ms; }
    .viz-stagger-3 { animation-delay: 150ms; }
    .viz-stagger-4 { animation-delay: 200ms; }
    .viz-stagger-5 { animation-delay: 250ms; }
    .viz-stagger-6 { animation-delay: 300ms; }

    /* ========================================================================
       RESPONSIVE - Mobile adaptations
       ======================================================================== */

    @media (max-width: 639px) {
      .viz-card {
        padding: var(--viz-space-breath);
        border-radius: var(--radius-lg, 1rem);
      }

      .viz-header__title {
        font-size: var(--viz-text-md);
      }

      .viz-grid--2col,
      .viz-grid--3col {
        grid-template-columns: 1fr;
      }

      .viz-metric__value {
        font-size: var(--viz-text-2xl);
      }

      .viz-stat-row {
        gap: var(--viz-space-pause);
      }

      .viz-stat__value,
      .viz-stat__label {
        font-size: var(--viz-text-sm);
      }
    }

    /* ========================================================================
       REDUCED MOTION - Accessibility
       ======================================================================== */

    @media (prefers-reduced-motion: reduce) {
      .viz-card,
      .viz-badge,
      .viz-progress__fill,
      .viz-ring__progress,
      .viz-timeline__dot,
      .viz-calendar__cell,
      .viz-network__node {
        transition: none !important;
      }

      .viz-animate-fade,
      .viz-animate-slide,
      .viz-animate-scale {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
      }
    }
  `;
}

/**
 * Inject visualization styles into the document.
 * Should be called once when visualizations are first used.
 */
export function injectVisualizationStyles(): void {
  if (document.getElementById('viz-styles')) return;

  const style = document.createElement('style');
  style.id = 'viz-styles';
  style.textContent = getVisualizationStyles();
  document.head.appendChild(style);
}

/**
 * Remove visualization styles from the document.
 * Cleanup function for when visualizations are no longer needed.
 */
export function removeVisualizationStyles(): void {
  document.getElementById('viz-styles')?.remove();
}
