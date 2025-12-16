/**
 * Wellbeing Dashboard UI
 *
 * Phase 22: Beautiful "State of Me" visualization.
 * Shows mood calendar, dimension cards, achievements, and predictions.
 *
 * Design: Inspired by Apple Health with warm Ferni aesthetics.
 */

// Design system animation constants available via CSS variables:
// --duration-normal, --duration-slow, --duration-entrance, --ease-spring, etc.
import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { addTapListener, cleanupTapListeners } from '../utils/ios-touch.js';

const log = createLogger('WellbeingDashboard');

// ============================================================================
// TYPES
// ============================================================================

export interface WellbeingData {
  overallScore: number; // 0-100
  trend: 'improving' | 'stable' | 'declining';
  comparisonToLastMonth: number; // percentage change
}

export interface DimensionCard {
  dimension: string;
  displayName: string;
  currentScore: number; // 0-1
  trend: 'up' | 'stable' | 'down';
  sparkline: number[]; // Last 30 days
  insight: string;
  color: string;
}

export interface MoodCalendarEntry {
  date: string; // ISO date
  score: number; // 0-1
  note?: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  earnedAt: string;
  icon: string;
}

export interface Prediction {
  nextWeekForecast: string;
  riskFactors: string[];
  protectiveFactors: string[];
}

export interface DashboardData {
  overall: WellbeingData;
  dimensions: DimensionCard[];
  calendar: MoodCalendarEntry[];
  achievements: Achievement[];
  prediction: Prediction | null;
  lastUpdated: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Human-friendly dimension names (exported for UI display) */
export const DIMENSION_NAMES: Record<string, string> = {
  mood: 'Mood',
  energy: 'Energy',
  worry: 'Worry',
  loneliness: 'Connection',
  hopefulness: 'Hope',
  sleepQuality: 'Sleep',
  motivation: 'Motivation',
  meaningfulness: 'Purpose',
};

// ============================================================================
// STYLES
// ============================================================================

const styles = `
  .wellbeing-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-normal, 200ms) ease-out;
  }
  
  .wellbeing-modal-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }
  
  .wellbeing-modal-backdrop {
    position: absolute;
    inset: 0;
    background: var(--backdrop-page, rgba(44, 37, 32, 0.4));
    backdrop-filter: blur(var(--glass-blur-strong, 24px));
  }
  
  .wellbeing-modal {
    position: relative;
    width: 95%;
    max-width: 720px;
    max-height: 90vh;
    background: var(--color-background-elevated, #fffdfb);
    border-radius: var(--radius-2xl, 24px);
    box-shadow: var(--shadow-2xl);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transform: scale(0.95);
    transition: transform var(--duration-slow, 300ms) var(--ease-spring);
  }
  
  .wellbeing-modal-overlay.visible .wellbeing-modal {
    transform: scale(1);
  }
  
  .wellbeing-modal__header {
    padding: var(--space-6, 24px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    flex-shrink: 0;
    text-align: center;
  }
  
  .wellbeing-modal__eyebrow {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-ferni, #4a6741);
    margin-bottom: var(--space-1, 4px);
  }
  
  .wellbeing-modal__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 28px;
    font-weight: 700;
    color: var(--color-text-primary, #2c2520);
    margin: 0;
  }
  
  .wellbeing-modal__subtitle {
    font-size: 14px;
    color: var(--color-text-secondary, #70605a);
    margin-top: var(--space-1, 4px);
  }
  
  .wellbeing-modal__close {
    position: absolute;
    top: var(--space-4, 16px);
    right: var(--space-4, 16px);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.05));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary, #70605a);
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .wellbeing-modal__close:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.1));
    color: var(--color-text-primary, #2c2520);
  }
  
  .wellbeing-modal__content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-6, 24px);
  }
  
  /* Overall Score Ring */
  .wellbeing-score-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: var(--space-8, 32px);
  }
  
  .wellbeing-score-ring {
    position: relative;
    width: 160px;
    height: 160px;
  }
  
  .wellbeing-score-ring svg {
    transform: rotate(-90deg);
  }
  
  .wellbeing-score-ring__background {
    fill: none;
    stroke: var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    stroke-width: 12;
  }
  
  .wellbeing-score-ring__progress {
    fill: none;
    stroke-width: 12;
    stroke-linecap: round;
    transition: stroke-dashoffset var(--duration-entrance, 1000ms) var(--ease-expo-out, ease-out);
  }
  
  .wellbeing-score-ring__value {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  
  .wellbeing-score-ring__number {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 48px;
    font-weight: 700;
    color: var(--color-text-primary, #2c2520);
    line-height: 1;
  }
  
  .wellbeing-score-ring__label {
    font-size: 12px;
    color: var(--color-text-secondary, #70605a);
    margin-top: var(--space-1, 4px);
  }
  
  .wellbeing-score-trend {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    margin-top: var(--space-3, 12px);
    font-size: 14px;
    font-weight: 500;
  }
  
  .wellbeing-score-trend--improving {
    color: var(--color-ferni, #4a6741);
  }
  
  .wellbeing-score-trend--stable {
    color: var(--color-text-secondary, #70605a);
  }
  
  .wellbeing-score-trend--declining {
    color: var(--color-maya, #a67a6a);
  }
  
  /* Dimension Cards */
  .wellbeing-dimensions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-4, 16px);
    margin-bottom: var(--space-8, 32px);
  }
  
  .wellbeing-dimension-card {
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.03));
    border-radius: var(--radius-lg, 12px);
    padding: var(--space-4, 16px);
    border: 1px solid transparent;
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .wellbeing-dimension-card:hover {
    border-color: var(--color-border-subtle, rgba(112, 96, 90, 0.1));
  }
  
  .wellbeing-dimension-card__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-3, 12px);
  }
  
  .wellbeing-dimension-card__name {
    font-weight: 600;
    font-size: 15px;
    color: var(--color-text-primary, #2c2520);
  }
  
  .wellbeing-dimension-card__score {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 24px;
    font-weight: 700;
  }
  
  .wellbeing-dimension-card__trend {
    font-size: 12px;
    padding: 2px 6px;
    border-radius: var(--radius-full, 9999px);
    font-weight: 500;
  }
  
  .wellbeing-dimension-card__trend--up {
    background: var(--persona-tint, rgba(74, 103, 65, 0.1));
    color: var(--color-ferni, #4a6741);
  }
  
  .wellbeing-dimension-card__trend--stable {
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.1));
    color: var(--color-text-secondary, #70605a);
  }
  
  .wellbeing-dimension-card__trend--down {
    background: var(--color-maya-tint, rgba(166, 122, 106, 0.1));
    color: var(--color-maya, #a67a6a);
  }
  
  .wellbeing-dimension-card__sparkline {
    height: 40px;
    margin: var(--space-2, 8px) 0;
  }
  
  .wellbeing-dimension-card__insight {
    font-size: 13px;
    color: var(--color-text-secondary, #70605a);
    line-height: 1.4;
  }
  
  /* Mood Calendar */
  .wellbeing-calendar-section {
    margin-bottom: var(--space-8, 32px);
  }
  
  .wellbeing-section-title {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-text-muted, #a89a94);
    margin-bottom: var(--space-3, 12px);
  }
  
  .wellbeing-calendar {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }
  
  .wellbeing-calendar__day-label {
    font-size: 10px;
    text-align: center;
    color: var(--color-text-muted, #a89a94);
    padding: var(--space-1, 4px) 0;
  }
  
  .wellbeing-calendar__cell {
    aspect-ratio: 1;
    border-radius: 4px;
    cursor: pointer;
    transition: transform var(--duration-fast, 100ms) ease;
  }
  
  .wellbeing-calendar__cell:hover {
    transform: scale(1.2);
    z-index: 1;
  }
  
  .wellbeing-calendar__cell--empty {
    background: transparent;
    cursor: default;
  }
  
  .wellbeing-calendar__cell--empty:hover {
    transform: none;
  }

  /* Calendar cell score levels - use CSS variables for theming */
  .wellbeing-calendar__cell--high {
    background: var(--color-calendar-high, rgba(74, 103, 65, 0.8));
  }
  .wellbeing-calendar__cell--medium {
    background: var(--color-calendar-medium, rgba(154, 123, 90, 0.8));
  }
  .wellbeing-calendar__cell--low {
    background: var(--color-calendar-low, rgba(166, 122, 106, 0.6));
  }
  .wellbeing-calendar__cell--very-low {
    background: var(--color-calendar-very-low, rgba(166, 122, 106, 0.3));
  }
  
  /* Achievements */
  .wellbeing-achievements {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3, 12px);
    margin-bottom: var(--space-8, 32px);
  }
  
  .wellbeing-achievement {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-2, 8px) var(--space-3, 12px);
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.03));
    border-radius: var(--radius-full, 9999px);
  }
  
  .wellbeing-achievement__icon {
    font-size: 16px;
  }
  
  .wellbeing-achievement__title {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-primary, #2c2520);
  }
  
  /* Prediction */
  .wellbeing-prediction {
    background: var(--gradient-prediction, linear-gradient(135deg, rgba(74, 103, 65, 0.05), rgba(58, 107, 115, 0.05)));
    border-radius: var(--radius-lg, 12px);
    padding: var(--space-5, 20px);
    border: 1px solid var(--persona-tint, rgba(74, 103, 65, 0.1));
  }
  
  .wellbeing-prediction__forecast {
    font-size: 16px;
    font-weight: 500;
    color: var(--color-text-primary, #2c2520);
    margin-bottom: var(--space-4, 16px);
  }
  
  .wellbeing-prediction__factors {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4, 16px);
  }
  
  .wellbeing-prediction__factor-group {
    font-size: 13px;
  }
  
  .wellbeing-prediction__factor-title {
    font-weight: 600;
    margin-bottom: var(--space-2, 8px);
  }
  
  .wellbeing-prediction__factor-title--risk {
    color: var(--color-maya, #a67a6a);
  }
  
  .wellbeing-prediction__factor-title--protective {
    color: var(--color-ferni, #4a6741);
  }
  
  .wellbeing-prediction__factor-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .wellbeing-prediction__factor-item {
    padding: var(--space-1, 4px) 0;
    color: var(--color-text-secondary, #70605a);
  }
  
  /* Loading */
  .wellbeing-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-12, 48px);
  }
  
  .wellbeing-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    border-top-color: var(--color-ferni, #4a6741);
    border-radius: 50%;
    animation: wellbeing-spin var(--duration-entrance, 1000ms) linear infinite;
  }
  
  @keyframes wellbeing-spin {
    to { transform: rotate(360deg); }
  }
  
  /* Empty State */
  .wellbeing-empty {
    text-align: center;
    padding: var(--space-12, 48px) var(--space-4, 16px);
    color: var(--color-text-secondary, #70605a);
  }
  
  .wellbeing-empty__icon {
    font-size: 48px;
    margin-bottom: var(--space-3, 12px);
    opacity: 0.5;
  }
  
  /* Footer */
  .wellbeing-modal__footer {
    padding: var(--space-4, 16px) var(--space-6, 24px);
    border-top: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }
  
  .wellbeing-modal__footer-info {
    font-size: 12px;
    color: var(--color-text-muted, #a89a94);
  }
  
  .wellbeing-btn {
    padding: var(--space-3, 12px) var(--space-5, 20px);
    border-radius: var(--radius-full, 9999px);
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    border: none;
    background: var(--color-ferni, #4a6741);
    color: white;
  }
  
  .wellbeing-btn:hover {
    background: var(--color-ferni-dark, #3d5a35);
    transform: translateY(-1px);
  }
  
  @media (prefers-reduced-motion: reduce) {
    .wellbeing-modal-overlay,
    .wellbeing-modal,
    .wellbeing-dimension-card,
    .wellbeing-calendar__cell,
    .wellbeing-btn,
    .wellbeing-score-ring__progress {
      transition: none;
    }
    .wellbeing-spinner {
      animation: none;
    }
  }

  /* ========================================================================
     DARK THEME - WCAG AA Compliant
     ======================================================================== */
  [data-theme="midnight"] .wellbeing-modal {
    background: var(--color-background-elevated, #70605a);
  }

  [data-theme="midnight"] .wellbeing-modal__header {
    border-bottom-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
  }

  [data-theme="midnight"] .wellbeing-modal__eyebrow {
    color: var(--color-accent-secondary, #7cb36b);
  }

  [data-theme="midnight"] .wellbeing-modal__title,
  [data-theme="midnight"] .wellbeing-score-ring__number,
  [data-theme="midnight"] .wellbeing-dimension-card__name,
  [data-theme="midnight"] .wellbeing-achievement__title,
  [data-theme="midnight"] .wellbeing-prediction__forecast {
    color: var(--color-text-primary, #faf6f0);
  }

  [data-theme="midnight"] .wellbeing-modal__subtitle,
  [data-theme="midnight"] .wellbeing-score-ring__label,
  [data-theme="midnight"] .wellbeing-dimension-card__insight,
  [data-theme="midnight"] .wellbeing-prediction__factor-item {
    color: var(--color-text-secondary, #f0ebe4);
  }

  [data-theme="midnight"] .wellbeing-section-title,
  [data-theme="midnight"] .wellbeing-calendar__day-label,
  [data-theme="midnight"] .wellbeing-modal__footer-info {
    color: var(--color-text-muted, #e8e2da);
  }

  [data-theme="midnight"] .wellbeing-modal__close {
    background: var(--color-background-tertiary, #685852);
    color: var(--color-text-secondary, #f0ebe4);
  }

  [data-theme="midnight"] .wellbeing-modal__close:hover {
    background: var(--color-background-secondary, #60504a);
    color: var(--color-text-primary, #faf6f0);
  }

  [data-theme="midnight"] .wellbeing-dimension-card,
  [data-theme="midnight"] .wellbeing-achievement {
    background: var(--color-background-secondary, #60504a);
  }

  [data-theme="midnight"] .wellbeing-dimension-card:hover {
    border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
  }

  [data-theme="midnight"] .wellbeing-score-ring__background {
    stroke: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
  }

  [data-theme="midnight"] .wellbeing-spinner {
    border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
    border-top-color: var(--color-accent-secondary, #7cb36b);
  }

  [data-theme="midnight"] .wellbeing-empty {
    color: var(--color-text-secondary, #f0ebe4);
  }

  [data-theme="midnight"] .wellbeing-modal__footer {
    border-top-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
  }

  [data-theme="midnight"] .wellbeing-btn {
    background: var(--color-accent-secondary, #7cb36b);
    color: var(--color-text-primary-dark, #2c2520);
  }

  [data-theme="midnight"] .wellbeing-btn:hover {
    background: var(--color-accent-secondary-hover, #8dc47c);
  }

  [data-theme="midnight"] .wellbeing-score-trend--improving {
    color: var(--color-accent-secondary, #7cb36b);
  }

  [data-theme="midnight"] .wellbeing-score-trend--declining {
    color: var(--color-semantic-warning, #c9a255);
  }

  [data-theme="midnight"] .wellbeing-dimension-card__trend--up {
    background: var(--persona-tint, rgba(124, 179, 107, 0.15));
    color: var(--color-accent-secondary, #7cb36b);
  }

  [data-theme="midnight"] .wellbeing-dimension-card__trend--down {
    background: var(--color-maya-tint, rgba(201, 162, 85, 0.15));
    color: var(--color-semantic-warning, #c9a255);
  }

  [data-theme="midnight"] .wellbeing-prediction {
    background: var(--gradient-prediction-dark, linear-gradient(135deg, rgba(124, 179, 107, 0.08), rgba(58, 107, 115, 0.08)));
    border-color: var(--persona-tint, rgba(124, 179, 107, 0.2));
  }

  [data-theme="midnight"] .wellbeing-prediction__factor-title--risk {
    color: var(--color-semantic-warning, #c9a255);
  }

  [data-theme="midnight"] .wellbeing-prediction__factor-title--protective {
    color: var(--color-accent-secondary, #7cb36b);
  }

  /* Dark theme calendar cells */
  [data-theme="midnight"] .wellbeing-calendar__cell--high {
    background: var(--color-calendar-high-dark, rgba(124, 179, 107, 0.8));
  }
  [data-theme="midnight"] .wellbeing-calendar__cell--medium {
    background: var(--color-calendar-medium-dark, rgba(184, 149, 106, 0.7));
  }
  [data-theme="midnight"] .wellbeing-calendar__cell--low {
    background: var(--color-calendar-low-dark, rgba(201, 162, 85, 0.5));
  }
  [data-theme="midnight"] .wellbeing-calendar__cell--very-low {
    background: var(--color-calendar-very-low-dark, rgba(201, 162, 85, 0.25));
  }
  
  /* ========================================
     ACCESSIBILITY - Focus Styles
     ======================================== */
  .wellbeing-modal__close:focus-visible,
  .wellbeing-btn:focus-visible {
    outline: 2px solid var(--persona-primary, #4a6741);
    outline-offset: 2px;
  }
  
  /* ========================================
     ACCESSIBILITY - Reduced Motion
     ======================================== */
  @media (prefers-reduced-motion: reduce) {
    .wellbeing-modal-overlay,
    .wellbeing-modal,
    .wellbeing-modal__close,
    .wellbeing-btn,
    .wellbeing-spinner {
      transition: none !important;
      animation: none !important;
    }
  }
`;

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  trendUp: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  trendDown: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
  heart: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
};

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let data: DashboardData | null = null;
let isLoading = false;

// ============================================================================
// API
// ============================================================================

/** API response format from /api/wellbeing/dashboard */
interface ApiDashboardResponse {
  userId: string;
  currentState: {
    mood: number;
    energy: number;
    anxiety: number;
    connection: number;
    purpose: number;
    sleep: number;
    lastUpdated: string;
  };
  trends: {
    period: 'week' | 'month';
    direction: 'improving' | 'stable' | 'declining';
    changedDimensions: string[];
  };
  insights: Array<{
    type: 'pattern' | 'suggestion' | 'celebration';
    message: string;
    dimension?: string;
  }>;
  warnings: Array<{
    type: string;
    severity: 'watch' | 'concern' | 'urgent';
    message: string;
  }>;
  streaks: {
    currentDays: number;
    bestDays: number;
    lastCheckIn: string;
  };
}

/** API response format from /api/wellbeing/trends */
interface ApiTrendsResponse {
  userId: string;
  period: 'week' | 'month' | 'quarter';
  dataPoints: Array<{
    date: string;
    mood: number | null;
    energy: number | null;
    anxiety: number | null;
    connection: number | null;
    purpose: number | null;
    sleep: number | null;
  }>;
  averages: {
    mood: number;
    energy: number;
    anxiety: number;
    connection: number;
    purpose: number;
    sleep: number;
  };
}

/** Color mapping for dimensions */
const DIMENSION_COLORS: Record<string, string> = {
  mood: 'var(--color-ferni, #4a6741)',
  energy: 'var(--color-jack, #9a7b5a)',
  anxiety: 'var(--color-maya, #a67a6a)',
  connection: 'var(--color-peter, #3a6b73)',
  purpose: 'var(--color-nayan, #b8956a)',
  sleep: 'var(--color-alex, #5a6b8a)',
};

/** Get insight message for a dimension based on score */
function getDimensionInsight(
  dimension: string,
  score: number,
  _trend: 'up' | 'stable' | 'down'
): string {
  const insights: Record<string, Record<string, string>> = {
    mood: {
      high: 'Your mood has been consistently positive!',
      medium: 'Mood is steady. Small wins add up.',
      low: "Some heavier days lately. That's okay.",
    },
    energy: {
      high: 'Energy levels are strong!',
      medium: 'Maintaining balance.',
      low: 'Energy has been lower. Rest matters.',
    },
    anxiety: {
      high: 'Some tension lately. Breathing helps.',
      medium: 'Managing stress reasonably well.',
      low: 'Feeling calm and centered.',
    },
    connection: {
      high: 'Strong sense of connection!',
      medium: 'Some good moments with others.',
      low: 'Feeling a bit isolated. Reach out.',
    },
    purpose: {
      high: 'Feeling aligned with what matters.',
      medium: 'Finding meaning in the routine.',
      low: "Searching for direction. That's growth.",
    },
    sleep: {
      high: 'Rest is going well!',
      medium: 'Sleep could be better.',
      low: 'Sleep quality needs attention.',
    },
  };

  const level = score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';
  // Invert for anxiety (high anxiety = low score interpretation)
  const effectiveLevel =
    dimension === 'anxiety' ? (score >= 0.7 ? 'low' : score >= 0.4 ? 'medium' : 'high') : level;

  return insights[dimension]?.[effectiveLevel] || 'Keep tracking for insights.';
}

/** Transform API response into UI expected format */
function transformApiResponse(
  dashboardData: ApiDashboardResponse,
  trendsData: ApiTrendsResponse | null
): DashboardData {
  const { currentState, trends, insights } = dashboardData;

  // Calculate overall score as weighted average of dimensions
  // Invert anxiety for the calculation (lower anxiety = better)
  const dimensionScores = [
    currentState.mood,
    currentState.energy,
    1 - currentState.anxiety, // Invert anxiety
    currentState.connection,
    currentState.purpose,
    currentState.sleep,
  ];
  const overallScore = Math.round(
    (dimensionScores.reduce((a, b) => a + b, 0) / dimensionScores.length) * 100
  );

  // Build dimension cards
  const dimensions: DimensionCard[] = [
    { dimension: 'mood', displayName: 'Mood', currentScore: currentState.mood },
    { dimension: 'energy', displayName: 'Energy', currentScore: currentState.energy },
    { dimension: 'anxiety', displayName: 'Anxiety', currentScore: currentState.anxiety },
    { dimension: 'connection', displayName: 'Connection', currentScore: currentState.connection },
    { dimension: 'purpose', displayName: 'Purpose', currentScore: currentState.purpose },
    { dimension: 'sleep', displayName: 'Sleep', currentScore: currentState.sleep },
  ].map((dim) => {
    // Determine trend for this dimension
    const isTrending = trends.changedDimensions.includes(dim.dimension);
    let trend: 'up' | 'stable' | 'down' = 'stable';
    if (isTrending) {
      // For anxiety, "improving" means going down
      if (dim.dimension === 'anxiety') {
        trend =
          trends.direction === 'improving'
            ? 'down'
            : trends.direction === 'declining'
              ? 'up'
              : 'stable';
      } else {
        trend =
          trends.direction === 'improving'
            ? 'up'
            : trends.direction === 'declining'
              ? 'down'
              : 'stable';
      }
    }

    // Build sparkline from trends data
    const sparkline =
      trendsData?.dataPoints
        .map((dp) => dp[dim.dimension as keyof typeof dp] as number | null)
        .filter((v): v is number => v !== null) || Array(7).fill(dim.currentScore); // Fallback to flat line

    return {
      ...dim,
      trend,
      sparkline,
      insight: getDimensionInsight(dim.dimension, dim.currentScore, trend),
      color: DIMENSION_COLORS[dim.dimension] || 'var(--color-text-secondary)',
    };
  });

  // Build calendar from trends data points
  const calendar: MoodCalendarEntry[] =
    trendsData?.dataPoints
      .filter((dp) => dp.mood !== null)
      .map((dp) => ({
        date: dp.date,
        score: dp.mood || 0.5,
      })) || [];

  // Build achievements from insights
  const achievements: Achievement[] = insights
    .filter((i) => i.type === 'celebration')
    .map((i, idx) => ({
      id: `achievement-${idx}`,
      title: i.dimension ? DIMENSION_NAMES[i.dimension] || i.dimension : 'Milestone',
      description: i.message,
      earnedAt: currentState.lastUpdated,
      icon: i.dimension === 'mood' ? '😊' : i.dimension === 'anxiety' ? '😌' : '⭐',
    }));

  // Build prediction from insights
  const riskFactors = insights
    .filter(
      (i) =>
        i.type === 'pattern' || (i.type === 'suggestion' && i.message.toLowerCase().includes('low'))
    )
    .map((i) => i.message);
  const protectiveFactors = insights.filter((i) => i.type === 'celebration').map((i) => i.message);

  const prediction: Prediction | null =
    riskFactors.length > 0 || protectiveFactors.length > 0
      ? {
          nextWeekForecast:
            trends.direction === 'improving'
              ? 'Things are looking up! Keep the momentum going.'
              : trends.direction === 'declining'
                ? 'Some challenges ahead. Be gentle with yourself.'
                : 'Steady week ahead. Small consistent actions help.',
          riskFactors: riskFactors.length > 0 ? riskFactors : ['Nothing major to watch for'],
          protectiveFactors:
            protectiveFactors.length > 0 ? protectiveFactors : ['Your consistency in checking in'],
        }
      : null;

  return {
    overall: {
      overallScore,
      trend: trends.direction,
      comparisonToLastMonth:
        trends.direction === 'improving' ? 5 : trends.direction === 'declining' ? -5 : 0,
    },
    dimensions,
    calendar,
    achievements,
    prediction,
    lastUpdated: currentState.lastUpdated,
  };
}

async function fetchDashboardData(): Promise<DashboardData | null> {
  try {
    const userId = localStorage.getItem('ferni_user_id');
    const headers: HeadersInit = userId ? { 'X-User-ID': userId } : {};

    // Fetch dashboard and trends in parallel
    const [dashboardResponse, trendsResponse] = await Promise.all([
      fetch(`/api/wellbeing/dashboard${userId ? `?userId=${userId}` : ''}`, { headers }),
      fetch(`/api/wellbeing/trends?period=month${userId ? `&userId=${userId}` : ''}`, { headers }),
    ]);

    if (!dashboardResponse.ok) {
      log.warn('Dashboard API returned error:', dashboardResponse.status);
      return null;
    }

    const dashboardData: ApiDashboardResponse = await dashboardResponse.json();
    const trendsData: ApiTrendsResponse | null = trendsResponse.ok
      ? await trendsResponse.json()
      : null;

    // Check if there's meaningful data
    const hasData =
      dashboardData.currentState &&
      (dashboardData.streaks.currentDays > 0 ||
        dashboardData.currentState.lastUpdated !== new Date().toISOString().split('T')[0]);

    if (!hasData) {
      // Return null to show empty state for new users
      log.debug('No meaningful wellbeing data yet');
      return null;
    }

    // Transform API response to UI format
    return transformApiResponse(dashboardData, trendsData);
  } catch (error) {
    log.warn('Failed to fetch wellbeing data:', error);
    return null;
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the wellbeing dashboard.
 */
export function initWellbeingDashboard(): void {
  cleanupWellbeingDashboard();

  const styleEl = document.createElement('style');
  styleEl.id = 'wellbeing-dashboard-styles';
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  log.debug('Wellbeing dashboard initialized');
}

/**
 * Cleanup the wellbeing dashboard.
 */
export function cleanupWellbeingDashboard(): void {
  document.getElementById('wellbeing-dashboard-styles')?.remove();
  document.querySelector('.wellbeing-modal-overlay')?.remove();
  modal = null;
  data = null;
}

// ============================================================================
// MODAL
// ============================================================================

/**
 * Show the wellbeing dashboard.
 */
export async function showWellbeingDashboard(): Promise<void> {
  if (!modal) {
    createModal();
  }

  modal?.classList.add('visible');
  document.body.style.overflow = 'hidden';

  await loadData();
}

/**
 * Hide the wellbeing dashboard.
 */
export function hideWellbeingDashboard(): void {
  // Clean up iOS tap listeners
  if (modal) {
    cleanupTapListeners(modal);
  }
  modal?.classList.remove('visible');
  document.body.style.overflow = '';
}

function createModal(): void {
  modal = document.createElement('div');
  modal.className = 'wellbeing-modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-labelledby', 'wellbeing-title');
  modal.setAttribute('aria-modal', 'true');

  modal.innerHTML = `
    <div class="wellbeing-modal-backdrop"></div>
    <div class="wellbeing-modal" role="dialog" aria-labelledby="wellbeing-title" aria-modal="true">
      <header class="wellbeing-modal__header">
        <p class="wellbeing-modal__eyebrow">Your Journey</p>
        <h2 id="wellbeing-title" class="wellbeing-modal__title">State of Me</h2>
        <p class="wellbeing-modal__subtitle">How you've been feeling lately</p>
        <button class="wellbeing-modal__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>
      <div class="wellbeing-modal__content" id="wellbeing-content" role="region" aria-live="polite">
        <div class="wellbeing-loading">
          <div class="wellbeing-spinner"></div>
        </div>
      </div>
      <footer class="wellbeing-modal__footer">
        <span class="wellbeing-modal__footer-info" id="wellbeing-footer-info"></span>
        <button class="wellbeing-btn" data-action="close">Done</button>
      </footer>
    </div>
  `;

  // Bind events (iOS-compatible)
  addTapListener(modal.querySelector('.wellbeing-modal-backdrop'), hideWellbeingDashboard);
  addTapListener(modal.querySelector('.wellbeing-modal__close'), hideWellbeingDashboard);
  addTapListener(modal.querySelector('[data-action="close"]'), hideWellbeingDashboard);

  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideWellbeingDashboard();
  });

  document.body.appendChild(modal);
}

// ============================================================================
// RENDERING
// ============================================================================

async function loadData(): Promise<void> {
  isLoading = true;
  renderContent();

  data = await fetchDashboardData();

  isLoading = false;
  renderContent();
  renderFooter();
}

function renderContent(): void {
  const content = document.getElementById('wellbeing-content');
  if (!content) return;

  if (isLoading) {
    content.innerHTML = `
      <div class="wellbeing-loading">
        <div class="wellbeing-spinner"></div>
      </div>
    `;
    return;
  }

  if (!data) {
    content.innerHTML = `
      <div class="wellbeing-empty">
        <div class="wellbeing-empty__icon">${ICONS.heart}</div>
        <p>Not enough data yet. Keep chatting with Ferni to build your wellbeing profile!</p>
      </div>
    `;
    return;
  }

  content.innerHTML = `
    ${renderScoreSection(data.overall)}
    <h3 class="wellbeing-section-title">How You're Doing</h3>
    ${renderDimensions(data.dimensions)}
    <h3 class="wellbeing-section-title">Last 4 Weeks</h3>
    ${renderCalendar(data.calendar)}
    ${
      data.achievements.length > 0
        ? `
      <h3 class="wellbeing-section-title">Achievements</h3>
      ${renderAchievements(data.achievements)}
    `
        : ''
    }
    ${
      data.prediction
        ? `
      <h3 class="wellbeing-section-title">Looking Ahead</h3>
      ${renderPrediction(data.prediction)}
    `
        : ''
    }
  `;
}

function renderScoreSection(overall: WellbeingData): string {
  const circumference = 2 * Math.PI * 60;
  const progress = (overall.overallScore / 100) * circumference;
  const offset = circumference - progress;

  const color =
    overall.overallScore >= 70
      ? 'var(--color-ferni, #4a6741)'
      : overall.overallScore >= 50
        ? 'var(--color-jack, #9a7b5a)'
        : 'var(--color-maya, #a67a6a)';

  const trendIcon =
    overall.trend === 'improving'
      ? ICONS.trendUp
      : overall.trend === 'declining'
        ? ICONS.trendDown
        : '';
  const trendText =
    overall.trend === 'improving'
      ? `+${overall.comparisonToLastMonth}% from last month`
      : overall.trend === 'declining'
        ? `${overall.comparisonToLastMonth}% from last month`
        : 'Stable';

  return `
    <div class="wellbeing-score-section">
      <div class="wellbeing-score-ring">
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle
            class="wellbeing-score-ring__background"
            cx="80" cy="80" r="60"
          />
          <circle
            class="wellbeing-score-ring__progress"
            cx="80" cy="80" r="60"
            stroke="${color}"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${offset}"
          />
        </svg>
        <div class="wellbeing-score-ring__value">
          <span class="wellbeing-score-ring__number">${overall.overallScore}</span>
          <span class="wellbeing-score-ring__label">Wellbeing</span>
        </div>
      </div>
      <div class="wellbeing-score-trend wellbeing-score-trend--${overall.trend}">
        ${trendIcon} ${trendText}
      </div>
    </div>
  `;
}

function renderDimensions(dimensions: DimensionCard[]): string {
  return `
    <div class="wellbeing-dimensions">
      ${dimensions.map((dim) => renderDimensionCard(dim)).join('')}
    </div>
  `;
}

function renderDimensionCard(dim: DimensionCard): string {
  const score = Math.round(dim.currentScore * 100);
  const trendClass = dim.trend === 'up' ? 'up' : dim.trend === 'down' ? 'down' : 'stable';
  const trendLabel = dim.trend === 'up' ? '↑' : dim.trend === 'down' ? '↓' : '→';

  return `
    <div class="wellbeing-dimension-card">
      <div class="wellbeing-dimension-card__header">
        <div>
          <div class="wellbeing-dimension-card__name">${dim.displayName}</div>
          <span class="wellbeing-dimension-card__trend wellbeing-dimension-card__trend--${trendClass}">
            ${trendLabel} ${trendClass}
          </span>
        </div>
        <div class="wellbeing-dimension-card__score" style="color: ${dim.color}">${score}</div>
      </div>
      <div class="wellbeing-dimension-card__sparkline">
        ${renderSparkline(dim.sparkline, dim.color)}
      </div>
      <div class="wellbeing-dimension-card__insight">${dim.insight}</div>
    </div>
  `;
}

function renderSparkline(data: number[], color: string): string {
  const width = 180;
  const height = 40;
  const padding = 4;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = padding + (index / (data.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((value - min) / range) * (height - 2 * padding);
      return `${x},${y}`;
    })
    .join(' ');

  return `
    <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <polyline
        points="${points}"
        fill="none"
        stroke="${color}"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `;
}

function renderCalendar(calendar: MoodCalendarEntry[]): string {
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // Get CSS class for score level (uses CSS variables for theming)
  const getScoreClass = (score: number): string => {
    if (score >= 0.7) return 'wellbeing-calendar__cell--high';
    if (score >= 0.5) return 'wellbeing-calendar__cell--medium';
    if (score >= 0.3) return 'wellbeing-calendar__cell--low';
    return 'wellbeing-calendar__cell--very-low';
  };

  // Pad to start on correct day
  const firstDate = new Date(calendar[0]?.date || new Date());
  const startPadding = firstDate.getDay();
  const paddedCalendar = Array(startPadding).fill(null).concat(calendar);

  return `
    <div class="wellbeing-calendar-section">
      <div class="wellbeing-calendar">
        ${days.map((d) => `<div class="wellbeing-calendar__day-label">${d}</div>`).join('')}
        ${paddedCalendar
          .map((entry) => {
            if (!entry) {
              return '<div class="wellbeing-calendar__cell wellbeing-calendar__cell--empty"></div>';
            }
            return `
            <div
              class="wellbeing-calendar__cell ${getScoreClass(entry.score)}"
              title="${new Date(entry.date).toLocaleDateString()}: ${Math.round(entry.score * 100)}%"
            ></div>
          `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function renderAchievements(achievements: Achievement[]): string {
  return `
    <div class="wellbeing-achievements">
      ${achievements
        .map(
          (a) => `
        <div class="wellbeing-achievement" title="${a.description}">
          <span class="wellbeing-achievement__icon">${a.icon}</span>
          <span class="wellbeing-achievement__title">${a.title}</span>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

function renderPrediction(prediction: Prediction): string {
  return `
    <div class="wellbeing-prediction">
      <div class="wellbeing-prediction__forecast">${prediction.nextWeekForecast}</div>
      <div class="wellbeing-prediction__factors">
        <div class="wellbeing-prediction__factor-group">
          <div class="wellbeing-prediction__factor-title wellbeing-prediction__factor-title--risk">
            Watch For
          </div>
          <ul class="wellbeing-prediction__factor-list">
            ${prediction.riskFactors
              .map(
                (f) => `
              <li class="wellbeing-prediction__factor-item">• ${f}</li>
            `
              )
              .join('')}
          </ul>
        </div>
        <div class="wellbeing-prediction__factor-group">
          <div class="wellbeing-prediction__factor-title wellbeing-prediction__factor-title--protective">
            Helping You
          </div>
          <ul class="wellbeing-prediction__factor-list">
            ${prediction.protectiveFactors
              .map(
                (f) => `
              <li class="wellbeing-prediction__factor-item">• ${f}</li>
            `
              )
              .join('')}
          </ul>
        </div>
      </div>
    </div>
  `;
}

function renderFooter(): void {
  const footerInfo = document.getElementById('wellbeing-footer-info');
  if (!footerInfo || !data) return;

  const lastUpdated = new Date(data.lastUpdated).toLocaleDateString();
  footerInfo.textContent = `Last updated ${lastUpdated}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const wellbeingDashboard = {
  init: initWellbeingDashboard,
  cleanup: cleanupWellbeingDashboard,
  show: showWellbeingDashboard,
  hide: hideWellbeingDashboard,
};

export default wellbeingDashboard;
