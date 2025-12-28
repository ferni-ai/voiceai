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
    z-index: var(--z-tooltip);
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
    background: rgba(44, 37, 32, 0.75);
  }
  
  .wellbeing-modal {
    position: relative;
    width: 95%;
    max-width: clamp(504px, 90vw, 720px);
    max-height: 90vh;
    background: var(--color-bg-elevated, #FFFDFB);
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    border-radius: var(--radius-xl, 20px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
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
    color: var(--color-ferni-text);
    margin-bottom: var(--space-1, 4px);
  }
  
  .wellbeing-modal__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 28px;
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0;
  }
  
  .wellbeing-modal__subtitle {
    font-size: 14px;
    color: var(--color-text-secondary);
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
    color: var(--color-text-secondary);
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .wellbeing-modal__close:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.1));
    color: var(--color-text-primary);
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
    width: min(160px, 100%);
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
    color: var(--color-text-primary);
    line-height: 1;
  }
  
  .wellbeing-score-ring__label {
    font-size: 12px;
    color: var(--color-text-secondary);
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
    color: var(--color-ferni-text);
  }
  
  .wellbeing-score-trend--stable {
    color: var(--color-text-secondary);
  }
  
  .wellbeing-score-trend--declining {
    color: var(--color-maya-text);
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
    color: var(--color-text-primary);
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
    color: var(--color-ferni-text);
  }
  
  .wellbeing-dimension-card__trend--stable {
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.1));
    color: var(--color-text-secondary);
  }
  
  .wellbeing-dimension-card__trend--down {
    background: var(--color-maya-tint, rgba(166, 122, 106, 0.1));
    color: var(--color-maya-text);
  }
  
  .wellbeing-dimension-card__sparkline {
    height: 40px;
    margin: var(--space-2, 8px) 0;
  }
  
  .wellbeing-dimension-card__insight {
    font-size: 13px;
    color: var(--color-text-secondary);
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
    color: var(--color-text-muted);
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
    color: var(--color-text-muted);
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
    z-index: var(--z-docked);
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
    display: inline-flex;
    width: 16px;
    height: 16px;
    color: var(--persona-text);
  }

  .wellbeing-achievement__icon svg {
    width: 100%;
    height: 100%;
  }
  
  .wellbeing-achievement__title {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-primary);
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
    color: var(--color-text-primary);
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
    color: var(--color-maya-text);
  }
  
  .wellbeing-prediction__factor-title--protective {
    color: var(--color-ferni-text);
  }
  
  .wellbeing-prediction__factor-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .wellbeing-prediction__factor-item {
    padding: var(--space-1, 4px) 0;
    color: var(--color-text-secondary);
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
    border-top-color: var(--color-ferni-text);
    border-radius: 50%;
    animation: wellbeing-spin var(--duration-entrance, 1000ms) linear infinite;
  }
  
  @keyframes wellbeing-spin {
    to { transform: rotate(360deg); }
  }
  
  /* Empty State - Storytelling Design */
  /* =========================================
   * MAGICAL EMPTY STATE 
   * - Animated gradients & glowing cards
   * - Shimmer effects & floating particles
   * - Full-color vibrant dimensions
   * ========================================= */

  @keyframes wellbeing-gradient-flow {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  @keyframes wellbeing-pulse-glow {
    0%, 100% { opacity: 0.6; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.05); }
  }

  @keyframes wellbeing-shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  /* Apple-style gentle breathing - organic, not bouncy */
  @keyframes wellbeing-breathe {
    0%, 100% { 
      transform: scale(1); 
      opacity: 1;
    }
    50% { 
      transform: scale(1.02); 
      opacity: 0.95;
    }
  }
  
  /* Heartbeat animation - alive and warm */
  @keyframes wellbeing-heartbeat {
    0%, 100% { transform: scale(1); }
    14% { transform: scale(1.15); }
    28% { transform: scale(1); }
    42% { transform: scale(1.1); }
    70% { transform: scale(1); }
  }

  @keyframes wellbeing-sparkle {
    0%, 100% { opacity: 0; transform: scale(0) rotate(0deg); }
    50% { opacity: 1; transform: scale(1) rotate(180deg); }
  }

  @keyframes wellbeing-fade-in-up {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes wellbeing-calendar-wave {
    0%, 100% { transform: scale(1); opacity: var(--base-opacity); }
    50% { transform: scale(1.1); opacity: calc(var(--base-opacity) * 1.5); }
  }

  .wellbeing-empty {
    position: relative;
    padding: var(--space-6, 24px) var(--space-4, 16px);
    color: var(--color-text-secondary);
    overflow: hidden;
    /* Subtle animated gradient background */
    background: 
      linear-gradient(
        135deg,
        rgba(74, 103, 65, 0.03) 0%,
        rgba(58, 107, 115, 0.03) 25%,
        rgba(166, 122, 106, 0.03) 50%,
        rgba(184, 149, 106, 0.03) 75%,
        rgba(74, 103, 65, 0.03) 100%
      );
    background-size: 400% 400%;
    animation: wellbeing-gradient-flow 15s ease infinite;
  }

  /* Floating sparkle particles */
  .wellbeing-empty::before,
  .wellbeing-empty::after {
    content: '';
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    pointer-events: none;
  }
  
  .wellbeing-empty::before {
    top: 20%;
    left: 15%;
    background: radial-gradient(circle, var(--color-ferni) 0%, transparent 70%);
    animation: wellbeing-sparkle 4s ease-in-out infinite;
    animation-delay: 0s;
  }
  
  .wellbeing-empty::after {
    top: 60%;
    right: 20%;
    background: radial-gradient(circle, var(--color-maya) 0%, transparent 70%);
    animation: wellbeing-sparkle 4s ease-in-out infinite;
    animation-delay: 2s;
  }
  
  /* Apple-style centered hero layout */
  .wellbeing-empty__hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-4, 16px);
    margin-bottom: var(--space-6, 24px);
    animation: wellbeing-fade-in-up 0.6s var(--ease-gentle, cubic-bezier(0.25, 0.1, 0.25, 1)) both;
  }
  
  .wellbeing-empty__icon {
    width: 56px;
    height: 56px;
    /* Ferni's warm sage green */
    color: var(--color-ferni, #4a6741);
    /* Soft glow for warmth */
    filter: drop-shadow(0 0 16px rgba(74, 103, 65, 0.3));
    /* Organic heartbeat - alive and gentle */
    animation: wellbeing-heartbeat 2.5s var(--ease-gentle, cubic-bezier(0.25, 0.1, 0.25, 1)) infinite;
  }

  .wellbeing-empty__icon svg {
    width: 100%;
    height: 100%;
    /* Fill the heart for warmth */
    fill: currentColor;
    stroke: none;
  }
  
  .wellbeing-empty__text {
    max-width: 320px;
  }
  
  .wellbeing-empty__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 22px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-3, 12px) 0;
    line-height: 1.35;
    letter-spacing: -0.01em;
  }
  
  .wellbeing-empty__subtitle {
    font-size: 15px;
    color: var(--color-text-secondary);
    line-height: 1.6;
    margin: 0;
  }
  
  /* Preview Section - What's Coming */
  .wellbeing-empty__preview {
    margin-bottom: var(--space-6, 24px);
    animation: wellbeing-fade-in-up 0.6s ease-out both;
    animation-delay: 0.1s;
  }
  
  .wellbeing-empty__preview-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-ferni-text);
    margin-bottom: var(--space-4, 16px);
    text-align: center;
  }
  
  .wellbeing-empty__dimensions {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3, 12px);
  }
  
  .wellbeing-empty__dimension {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-4, 16px) var(--space-2, 8px);
    background: var(--color-bg-elevated, #FFFDFB);
    border-radius: var(--radius-xl, 16px);
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    box-shadow: 
      0 2px 8px rgba(0, 0, 0, 0.04),
      0 0 0 1px rgba(255, 255, 255, 0.4) inset;
    /* Apple-style subtle transitions */
    transition: 
      transform 0.4s var(--ease-gentle, cubic-bezier(0.25, 0.1, 0.25, 1)),
      box-shadow 0.4s var(--ease-gentle, cubic-bezier(0.25, 0.1, 0.25, 1));
    /* Gentle breathing - organic, alive */
    animation: wellbeing-breathe 4s var(--ease-gentle, cubic-bezier(0.25, 0.1, 0.25, 1)) infinite;
    /* Stagger for natural feel - like a wave */
    animation-delay: calc(var(--dimension-index, 0) * 0.3s);
  }
  
  .wellbeing-empty__dimension:nth-child(1) { --dimension-index: 0; }
  .wellbeing-empty__dimension:nth-child(2) { --dimension-index: 1; }
  .wellbeing-empty__dimension:nth-child(3) { --dimension-index: 2; }
  .wellbeing-empty__dimension:nth-child(4) { --dimension-index: 3; }
  .wellbeing-empty__dimension:nth-child(5) { --dimension-index: 4; }
  .wellbeing-empty__dimension:nth-child(6) { --dimension-index: 5; }
  
  .wellbeing-empty__dimension:hover {
    /* Apple-style lift - subtle, refined */
    transform: translateY(-2px) scale(1.02);
    box-shadow: 
      0 8px 24px rgba(0, 0, 0, 0.08),
      0 0 0 1px rgba(255, 255, 255, 0.7) inset,
      0 0 24px var(--_glow-color, rgba(74, 103, 65, 0.15));
  }
  
  .wellbeing-empty__dimension-icon {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    color: inherit;
    /* Subtle glow, not overwhelming */
    filter: drop-shadow(0 0 6px currentColor);
    transition: 
      transform 0.4s var(--ease-gentle, cubic-bezier(0.25, 0.1, 0.25, 1)),
      filter 0.4s var(--ease-gentle, cubic-bezier(0.25, 0.1, 0.25, 1));
  }
  
  .wellbeing-empty__dimension:hover .wellbeing-empty__dimension-icon {
    /* Refined hover - not bouncy */
    transform: scale(1.08);
    filter: drop-shadow(0 0 10px currentColor);
  }
  
  .wellbeing-empty__dimension-icon svg {
    width: 100%;
    height: 100%;
    stroke: currentColor;
    stroke-width: 2;
  }
  
  .wellbeing-empty__dimension-name {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: inherit;
    opacity: 0.9;
  }
  
  /* Calendar Preview - Alive with possibility */
  .wellbeing-empty__calendar-preview {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    margin-bottom: var(--space-6, 24px);
    padding: var(--space-4, 16px);
    background: 
      linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.6)),
      linear-gradient(45deg, 
        rgba(74, 103, 65, 0.05) 0%, 
        rgba(166, 122, 106, 0.05) 50%,
        rgba(184, 149, 106, 0.05) 100%
      );
    border-radius: var(--radius-xl, 16px);
    box-shadow: 
      0 4px 24px rgba(0, 0, 0, 0.04),
      inset 0 1px 0 rgba(255, 255, 255, 0.8);
    animation: wellbeing-fade-in-up 0.6s ease-out both;
    animation-delay: 0.2s;
    /* Shimmer overlay */
    position: relative;
    overflow: hidden;
  }
  
  .wellbeing-empty__calendar-preview::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.4) 50%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: wellbeing-shimmer 3s ease-in-out infinite;
    pointer-events: none;
  }
  
  .wellbeing-empty__calendar-cell {
    aspect-ratio: 1;
    border-radius: var(--radius-md, 8px);
    background: var(--color-border-subtle, rgba(112, 96, 90, 0.08));
    --base-opacity: 0.5;
    opacity: var(--base-opacity);
    transition: all 0.3s ease;
  }
  
  .wellbeing-empty__calendar-cell--highlight {
    --base-opacity: 0.7;
    animation: wellbeing-calendar-wave 2s ease-in-out infinite;
    /* Each highlight gets a different color */
  }
  
  .wellbeing-empty__calendar-cell--highlight:nth-child(7n+1) {
    background: var(--color-ferni);
    animation-delay: 0s;
  }
  .wellbeing-empty__calendar-cell--highlight:nth-child(7n+2) {
    background: var(--color-peter);
    animation-delay: 0.3s;
  }
  .wellbeing-empty__calendar-cell--highlight:nth-child(7n+3) {
    background: var(--color-maya);
    animation-delay: 0.6s;
  }
  .wellbeing-empty__calendar-cell--highlight:nth-child(7n+4) {
    background: var(--color-alex);
    animation-delay: 0.9s;
  }
  .wellbeing-empty__calendar-cell--highlight:nth-child(7n+5) {
    background: var(--color-nayan);
    animation-delay: 1.2s;
  }
  .wellbeing-empty__calendar-cell--highlight:nth-child(7n+6) {
    background: var(--color-jack);
    animation-delay: 1.5s;
  }
  .wellbeing-empty__calendar-cell--highlight:nth-child(7n) {
    background: var(--color-ferni);
    animation-delay: 1.8s;
  }
  
  /* Vision Statement - Inspiring & alive */
  .wellbeing-empty__vision {
    text-align: center;
    font-size: 15px;
    line-height: 1.8;
    color: var(--color-text-secondary);
    padding: var(--space-5, 20px) var(--space-4, 16px);
    margin-bottom: var(--space-4, 16px);
    background: linear-gradient(
      135deg,
      rgba(74, 103, 65, 0.04) 0%,
      rgba(166, 122, 106, 0.04) 50%,
      rgba(184, 149, 106, 0.04) 100%
    );
    border-radius: var(--radius-xl, 16px);
    border: 1px solid rgba(74, 103, 65, 0.1);
    animation: wellbeing-fade-in-up 0.6s ease-out both;
    animation-delay: 0.3s;
    /* Subtle gradient text effect */
    font-weight: 500;
  }
  
  .wellbeing-empty__vision strong {
    color: var(--color-ferni-text);
    font-weight: 600;
  }
  
  /* CTA Section */
  .wellbeing-empty__cta {
    text-align: center;
    animation: wellbeing-fade-in-up 0.6s ease-out both;
    animation-delay: 0.4s;
  }
  
  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .wellbeing-empty,
    .wellbeing-empty__dimension,
    .wellbeing-empty__calendar-preview::after,
    .wellbeing-empty__calendar-cell--highlight,
    .wellbeing-empty::before,
    .wellbeing-empty::after,
    .wellbeing-empty__icon {
      animation: none;
    }
    .wellbeing-empty__hero,
    .wellbeing-empty__preview,
    .wellbeing-empty__calendar-preview,
    .wellbeing-empty__vision,
    .wellbeing-empty__cta {
      animation: none;
      opacity: 1;
    }
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
    color: var(--color-text-muted);
  }
  
  .wellbeing-btn {
    padding: var(--space-3, 12px) var(--space-5, 20px);
    border-radius: var(--radius-full, 9999px);
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    border: none;
    background: var(--color-ferni);
    color: white;
  }
  
  .wellbeing-btn:hover {
    background: var(--color-ferni-dark);
    transform: translateY(-1px);
  }
  
  .wellbeing-btn--secondary {
    background: transparent;
    color: var(--color-ferni-text);
    border: 1px solid var(--color-ferni);
    margin-top: var(--space-4, 16px);
  }
  
  .wellbeing-btn--secondary:hover {
    background: var(--persona-tint, rgba(74, 103, 65, 0.1));
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
    background: var(--color-background-elevated);
  }

  [data-theme="midnight"] .wellbeing-modal__header {
    border-bottom-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
  }

  [data-theme="midnight"] .wellbeing-modal__eyebrow {
    color: var(--color-accent-secondary);
  }

  [data-theme="midnight"] .wellbeing-modal__title,
  [data-theme="midnight"] .wellbeing-score-ring__number,
  [data-theme="midnight"] .wellbeing-dimension-card__name,
  [data-theme="midnight"] .wellbeing-achievement__title,
  [data-theme="midnight"] .wellbeing-prediction__forecast {
    color: var(--color-text-primary);
  }

  [data-theme="midnight"] .wellbeing-modal__subtitle,
  [data-theme="midnight"] .wellbeing-score-ring__label,
  [data-theme="midnight"] .wellbeing-dimension-card__insight,
  [data-theme="midnight"] .wellbeing-prediction__factor-item {
    color: var(--color-text-secondary);
  }

  [data-theme="midnight"] .wellbeing-section-title,
  [data-theme="midnight"] .wellbeing-calendar__day-label,
  [data-theme="midnight"] .wellbeing-modal__footer-info {
    color: var(--color-text-muted);
  }

  [data-theme="midnight"] .wellbeing-modal__close {
    background: var(--color-background-tertiary);
    color: var(--color-text-secondary);
  }

  [data-theme="midnight"] .wellbeing-modal__close:hover {
    background: var(--color-background-secondary);
    color: var(--color-text-primary);
  }

  [data-theme="midnight"] .wellbeing-dimension-card,
  [data-theme="midnight"] .wellbeing-achievement {
    background: var(--color-background-secondary);
  }

  [data-theme="midnight"] .wellbeing-dimension-card:hover {
    border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
  }

  [data-theme="midnight"] .wellbeing-score-ring__background {
    stroke: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
  }

  [data-theme="midnight"] .wellbeing-spinner {
    border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
    border-top-color: var(--color-accent-secondary);
  }

  /* Dark theme - Magical empty state with deep glows */
  [data-theme="midnight"] .wellbeing-empty {
    color: var(--color-text-secondary);
    background: 
      linear-gradient(
        135deg,
        rgba(74, 103, 65, 0.08) 0%,
        rgba(58, 107, 115, 0.08) 25%,
        rgba(166, 122, 106, 0.08) 50%,
        rgba(184, 149, 106, 0.08) 75%,
        rgba(74, 103, 65, 0.08) 100%
      );
    background-size: 400% 400%;
  }
  
  [data-theme="midnight"] .wellbeing-empty::before {
    background: radial-gradient(circle, var(--color-ferni) 0%, transparent 70%);
    opacity: 0.8;
  }
  
  [data-theme="midnight"] .wellbeing-empty::after {
    background: radial-gradient(circle, var(--color-maya) 0%, transparent 70%);
    opacity: 0.8;
  }
  
  [data-theme="midnight"] .wellbeing-empty__icon {
    filter: drop-shadow(0 0 16px rgba(74, 103, 65, 0.6));
  }
  
  [data-theme="midnight"] .wellbeing-empty__title {
    color: var(--color-text-primary);
    background: linear-gradient(
      135deg,
      var(--color-text-primary) 0%,
      var(--color-accent-secondary) 100%
    );
    -webkit-background-clip: text;
    background-clip: text;
  }
  
  [data-theme="midnight"] .wellbeing-empty__dimension {
    background: rgba(30, 30, 35, 0.95);
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 
      0 4px 24px rgba(0, 0, 0, 0.3),
      0 0 0 1px rgba(255, 255, 255, 0.05) inset,
      0 0 40px var(--_glow-color, rgba(74, 103, 65, 0.15));
  }
  
  [data-theme="midnight"] .wellbeing-empty__dimension:hover {
    box-shadow: 
      0 12px 40px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.1) inset,
      0 0 60px var(--_glow-color, rgba(74, 103, 65, 0.3));
  }
  
  [data-theme="midnight"] .wellbeing-empty__dimension-icon {
    filter: drop-shadow(0 0 12px currentColor);
  }
  
  [data-theme="midnight"] .wellbeing-empty__calendar-preview {
    background: 
      linear-gradient(135deg, rgba(30, 30, 35, 0.8), rgba(25, 25, 30, 0.6)),
      linear-gradient(45deg, 
        rgba(74, 103, 65, 0.1) 0%, 
        rgba(166, 122, 106, 0.1) 50%,
        rgba(184, 149, 106, 0.1) 100%
      );
    box-shadow: 
      0 8px 32px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
  
  [data-theme="midnight"] .wellbeing-empty__calendar-preview::after {
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.1) 50%,
      transparent 100%
    );
  }
  
  [data-theme="midnight"] .wellbeing-empty__calendar-cell {
    background: rgba(255, 255, 255, 0.06);
  }
  
  [data-theme="midnight"] .wellbeing-empty__calendar-cell--highlight {
    --base-opacity: 0.6;
    filter: brightness(1.1);
  }
  
  [data-theme="midnight"] .wellbeing-empty__vision {
    background: linear-gradient(
      135deg,
      rgba(74, 103, 65, 0.08) 0%,
      rgba(166, 122, 106, 0.08) 50%,
      rgba(184, 149, 106, 0.08) 100%
    );
    border-color: rgba(74, 103, 65, 0.2);
  }
  
  [data-theme="midnight"] .wellbeing-empty__preview-label {
    color: var(--color-accent-secondary);
  }

  [data-theme="midnight"] .wellbeing-modal__footer {
    border-top-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
  }

  [data-theme="midnight"] .wellbeing-btn {
    background: var(--color-accent-secondary);
    color: var(--color-text-primary-dark);
  }

  [data-theme="midnight"] .wellbeing-btn:hover {
    background: var(--color-accent-secondary-hover);
  }

  [data-theme="midnight"] .wellbeing-btn--secondary {
    background: transparent;
    color: var(--color-accent-secondary);
    border-color: var(--color-accent-secondary);
  }

  [data-theme="midnight"] .wellbeing-btn--secondary:hover {
    background: var(--persona-tint, rgba(124, 179, 107, 0.15));
  }

  [data-theme="midnight"] .wellbeing-score-trend--improving {
    color: var(--color-accent-secondary);
  }

  [data-theme="midnight"] .wellbeing-score-trend--declining {
    color: var(--color-semantic-warning);
  }

  [data-theme="midnight"] .wellbeing-dimension-card__trend--up {
    background: var(--persona-tint, rgba(124, 179, 107, 0.15));
    color: var(--color-accent-secondary);
  }

  [data-theme="midnight"] .wellbeing-dimension-card__trend--down {
    background: var(--color-maya-tint, rgba(201, 162, 85, 0.15));
    color: var(--color-semantic-warning);
  }

  [data-theme="midnight"] .wellbeing-prediction {
    background: var(--gradient-prediction-dark, linear-gradient(135deg, rgba(124, 179, 107, 0.08), rgba(58, 107, 115, 0.08)));
    border-color: var(--persona-tint, rgba(124, 179, 107, 0.2));
  }

  [data-theme="midnight"] .wellbeing-prediction__factor-title--risk {
    color: var(--color-semantic-warning);
  }

  [data-theme="midnight"] .wellbeing-prediction__factor-title--protective {
    color: var(--color-accent-secondary);
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
`;

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  trendUp: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  trendDown: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
  // Filled heart for warmth and life
  heart: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  // Achievement icons (Lucide - 2px stroke, rounded corners)
  smile: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  calm: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="12" y1="2" x2="12" y2="2.01"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  // Dimension preview icons (for empty state)
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  compass: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
  sunrise: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>`,
  sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
};

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let data: DashboardData | null = null;
let dataCacheTime = 0;
const DATA_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minute cache
let isLoading = false;

/** Check if cached data is still valid */
function isCacheValid(): boolean {
  return data !== null && Date.now() - dataCacheTime < DATA_CACHE_TTL_MS;
}

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
  mood: 'var(--color-ferni)',
  energy: 'var(--color-jack)',
  anxiety: 'var(--color-maya)',
  connection: 'var(--color-peter)',
  purpose: 'var(--color-nayan)',
  sleep: 'var(--color-alex)',
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
      icon: i.dimension === 'mood' ? ICONS.smile : i.dimension === 'anxiety' ? ICONS.calm : ICONS.star,
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
  if (!modal) return;
  
  modal.classList.remove('visible');
  document.body.style.overflow = '';
  
  // Remove modal after animation completes to free memory
  // Note: We keep data cached for quick re-open (TTL-based expiry)
  setTimeout(() => {
    modal?.remove();
    modal = null;
  }, 300); // Match --duration-slow
}

function createModal(): void {
  modal = document.createElement('div');
  modal.className = 'wellbeing-modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-labelledby', 'wellbeing-title');
  modal.setAttribute('aria-modal', 'true');

  modal.innerHTML = `
    <div class="wellbeing-modal-backdrop"></div>
    <div class="wellbeing-modal">
      <header class="wellbeing-modal__header">
        <p class="wellbeing-modal__eyebrow">Your Wellbeing</p>
        <h2 id="wellbeing-title" class="wellbeing-modal__title">State of Me</h2>
        <p class="wellbeing-modal__subtitle">How you've been feeling lately</p>
        <button class="wellbeing-modal__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>
      <div class="wellbeing-modal__content" id="wellbeing-content">
        <div class="wellbeing-loading">
          <div class="wellbeing-spinner"></div>
        </div>
      </div>
      <footer class="wellbeing-modal__footer">
        <span class="wellbeing-modal__footer-info" id="wellbeing-footer-info"></span>
        <button aria-label="Done" class="wellbeing-btn" data-action="close">Done</button>
      </footer>
    </div>
  `;

  modal
    .querySelector('.wellbeing-modal-backdrop')
    ?.addEventListener('click', hideWellbeingDashboard);
  modal.querySelector('.wellbeing-modal__close')?.addEventListener('click', hideWellbeingDashboard);
  modal.querySelector('[data-action="close"]')?.addEventListener('click', hideWellbeingDashboard);

  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideWellbeingDashboard();
  });

  document.body.appendChild(modal);
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Renders a compelling empty state with storytelling about what State of Me will become.
 * Shows preview dimensions and calendar to paint a picture of the future.
 */
function renderEmptyState(): string {
  // Preview dimensions to show what they'll track - now with hex fallbacks for glow
  const previewDimensions = [
    { name: 'Mood', icon: ICONS.smile, color: 'var(--color-ferni)', hex: '#4a6741' },
    { name: 'Energy', icon: ICONS.sun, color: 'var(--color-jack)', hex: '#c4a84a' },
    { name: 'Connection', icon: ICONS.users, color: 'var(--color-peter)', hex: '#3a6b73' },
    { name: 'Sleep', icon: ICONS.moon, color: 'var(--color-alex)', hex: '#5a6b8a' },
    { name: 'Purpose', icon: ICONS.compass, color: 'var(--color-nayan)', hex: '#b8956a' },
    { name: 'Hope', icon: ICONS.sunrise, color: 'var(--color-maya)', hex: '#a67a6a' },
  ];

  // Generate calendar preview cells (28 days = 4 weeks)
  // Scatter some highlights to hint at future data
  const calendarCells = Array.from({ length: 28 }, (_, i) => {
    const isHighlight = [3, 7, 8, 12, 15, 18, 21, 24, 26].includes(i);
    return `<div class="wellbeing-empty__calendar-cell${isHighlight ? ' wellbeing-empty__calendar-cell--highlight' : ''}"></div>`;
  }).join('');

  return `
    <div class="wellbeing-empty">
      <!-- Apple-style centered hero -->
      <div class="wellbeing-empty__hero">
        <div class="wellbeing-empty__icon">${ICONS.heart}</div>
        <div class="wellbeing-empty__text">
          <h3 class="wellbeing-empty__title">A portrait of you<br/>will take shape here</h3>
          <p class="wellbeing-empty__subtitle">
            As we talk, I'll notice patterns—your rhythms, your energy, what lights you up.
          </p>
        </div>
      </div>
      
      <!-- Preview: What you'll track -->
      <div class="wellbeing-empty__preview">
        <div class="wellbeing-empty__preview-label">What we'll explore together</div>
        <div class="wellbeing-empty__dimensions">
          ${previewDimensions
            .map(
              (dim) => `
            <div class="wellbeing-empty__dimension" style="
              --_glow-color: ${dim.hex}20;
              border-color: ${dim.hex}30;
            ">
              <div class="wellbeing-empty__dimension-icon" style="color: ${dim.hex};">${dim.icon}</div>
              <div class="wellbeing-empty__dimension-name" style="color: ${dim.hex};">${dim.name}</div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
      
      <!-- Calendar Preview -->
      <div class="wellbeing-empty__calendar-preview">
        ${calendarCells}
      </div>
      
      <!-- Vision Statement -->
      <div class="wellbeing-empty__vision">
        Over time, <strong>patterns will emerge</strong>. Days will connect to weeks. 
        You'll see yourself <strong>more clearly</strong>.
      </div>
      
      <!-- CTA -->
      <div class="wellbeing-empty__cta">
        <button aria-label="Start a Conversation" class="wellbeing-btn" data-action="start-conversation">
          Let's begin
        </button>
      </div>
    </div>
  `;
}

async function loadData(): Promise<void> {
  // If we have valid cached data, render immediately without loading state
  if (isCacheValid()) {
    renderContent();
    renderFooter();
    return;
  }

  isLoading = true;
  renderContent();

  data = await fetchDashboardData();
  dataCacheTime = Date.now();

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
    content.innerHTML = renderEmptyState();
    // Wire up CTA button
    content.querySelector('[data-action="start-conversation"]')?.addEventListener('click', () => {
      hideWellbeingDashboard();
      // Dispatch event to start a conversation
      window.dispatchEvent(new CustomEvent('ferni:request-connect'));
    });
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
      ? 'var(--color-ferni)'
      : overall.overallScore >= 50
        ? 'var(--color-jack)'
        : 'var(--color-maya)';

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

  // Handle edge case of single data point
  if (data.length === 0) return '';
  if (data.length === 1) {
    // Single point: draw a horizontal line at that value
    const y = height / 2;
    return `
      <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
        <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}"
          stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 4" />
      </svg>
    `;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const divisor = data.length - 1; // Safe: we know data.length >= 2 here
  const points = data
    .map((value, index) => {
      const x = padding + (index / divisor) * (width - 2 * padding);
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

  // Handle empty calendar - show empty state
  if (!calendar || calendar.length === 0) {
    return `
      <div class="wellbeing-calendar-section">
        <div class="wellbeing-calendar">
          ${days.map((d) => `<div class="wellbeing-calendar__day-label">${d}</div>`).join('')}
          ${Array(28)
            .fill(null)
            .map(() => '<div class="wellbeing-calendar__cell wellbeing-calendar__cell--empty"></div>')
            .join('')}
        </div>
        <p style="text-align: center; color: var(--color-text-muted); font-size: 13px; margin-top: var(--space-2, 8px);">
          Keep chatting to fill in your calendar!
        </p>
      </div>
    `;
  }

  // Get CSS class for score level (uses CSS variables for theming)
  const getScoreClass = (score: number): string => {
    if (score >= 0.7) return 'wellbeing-calendar__cell--high';
    if (score >= 0.5) return 'wellbeing-calendar__cell--medium';
    if (score >= 0.3) return 'wellbeing-calendar__cell--low';
    return 'wellbeing-calendar__cell--very-low';
  };

  // Pad to start on correct day
  const firstDate = new Date(calendar[0].date);
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
