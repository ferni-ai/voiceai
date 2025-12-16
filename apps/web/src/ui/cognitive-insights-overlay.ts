/**
 * Cognitive Insights Overlay
 *
 * A subtle UI component that surfaces cognitive adaptations to users.
 * Shows when the AI is adapting its approach to match the user's style.
 *
 * Design Philosophy:
 * - Non-intrusive: appears briefly, fades gracefully
 * - Informative: explains WHY the AI is adapting
 * - Human: uses warm, conversational language
 * - On-brand: uses design system tokens
 *
 * Usage:
 * ```typescript
 * import { showCognitiveInsight } from './cognitive-insights-overlay.js';
 *
 * showCognitiveInsight({
 *   type: 'style_match',
 *   message: "I notice we think similarly",
 *   detail: "Matching your analytical approach",
 * });
 * ```
 */

import { createTimeoutTracker } from '../utils/tracked-timeout.js';

// Track setTimeout calls for memory leak prevention
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export type InsightType =
  | 'style_match'      // AI matching user's cognitive style
  | 'empathy_shift'    // AI shifting to empathetic mode
  | 'clarity_boost'    // AI simplifying explanation
  | 'depth_increase'   // AI going deeper on a topic
  | 'confidence_check' // AI expressing uncertainty
  | 'quirk_active';    // Persona quirk triggered

export interface CognitiveInsightOptions {
  type: InsightType;
  message: string;
  detail?: string;
  duration?: number;
  position?: 'top-right' | 'bottom-right' | 'bottom-center';
}

// ============================================================================
// INSIGHT TEMPLATES
// ============================================================================

const INSIGHT_ICONS: Record<InsightType, string> = {
  style_match: `<svg viewBox="0 0 24 24" class="insight-icon"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  empathy_shift: `<svg viewBox="0 0 24 24" class="insight-icon"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  clarity_boost: `<svg viewBox="0 0 24 24" class="insight-icon"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  depth_increase: `<svg viewBox="0 0 24 24" class="insight-icon"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>`,
  confidence_check: `<svg viewBox="0 0 24 24" class="insight-icon"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`,
  quirk_active: `<svg viewBox="0 0 24 24" class="insight-icon"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
};

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  .cognitive-insight {
    position: fixed;
    z-index: var(--z-notification);
    max-width: 320px;
    padding: var(--ma-pause, 13px) var(--ma-rest, 21px);
    background: var(--glass-surface-2, rgba(26, 26, 46, 0.8));
    backdrop-filter: blur(var(--glass-blur-medium, 16px));
    -webkit-backdrop-filter: blur(var(--glass-blur-medium, 16px));
    border: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.08));
    border-radius: var(--radius-lg, 1rem);
    box-shadow: var(--shadow-lg, 0 8px 16px rgba(0, 0, 0, 0.3));
    font-family: var(--font-body, 'Inter', sans-serif);
    color: var(--color-text-primary, #faf6f0);
    opacity: 0;
    transform: translateX(20px);
    transition: opacity 0.3s ease, transform 0.3s ease;
    pointer-events: none;
  }
  
  .cognitive-insight.visible {
    opacity: 1;
    transform: translateX(0);
    pointer-events: auto;
  }
  
  .cognitive-insight.top-right {
    top: var(--ma-rest, 21px);
    right: var(--ma-rest, 21px);
  }
  
  .cognitive-insight.bottom-right {
    bottom: var(--ma-rest, 21px);
    right: var(--ma-rest, 21px);
  }
  
  .cognitive-insight.bottom-center {
    bottom: var(--ma-rest, 21px);
    left: 50%;
    transform: translateX(-50%) translateY(10px);
  }
  
  .cognitive-insight.bottom-center.visible {
    transform: translateX(-50%) translateY(0);
  }
  
  .insight-header {
    display: flex;
    align-items: center;
    gap: var(--ma-breath, 8px);
    margin-bottom: var(--space-2, 0.5rem);
  }
  
  .insight-icon {
    width: 20px;
    height: 20px;
    stroke: var(--persona-primary, #4a6741);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
    flex-shrink: 0;
  }
  
  .insight-label {
    font-size: var(--text-2xs, 0.625rem);
    font-weight: var(--font-weight-semibold, 600);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider, 0.05em);
    color: var(--color-text-muted);
  }
  
  .insight-message {
    font-size: var(--text-sm, 0.8125rem);
    font-weight: var(--font-weight-medium, 500);
    line-height: var(--leading-snug, 1.35);
    margin-bottom: var(--space-1, 0.25rem);
  }
  
  .insight-detail {
    font-size: var(--text-xs, 0.75rem);
    color: var(--color-text-muted);
    line-height: var(--leading-normal, 1.6);
  }
  
  /* Dark Theme - WCAG AA Compliant */
  [data-theme="midnight"] .insight-label,
  [data-theme="midnight"] .insight-detail {
    color: var(--color-text-muted, #e8e2da);
  }
  
  [data-theme="midnight"] .insight-message {
    color: var(--color-text-primary, #faf6f0);
  }
  
  .insight-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--color-border-subtle, rgba(255, 255, 255, 0.08));
    border-radius: 0 0 var(--radius-lg, 1rem) var(--radius-lg, 1rem);
    overflow: hidden;
  }
  
  .insight-progress-bar {
    height: 100%;
    background: var(--persona-primary, #4a6741);
    transform-origin: left;
    animation: insightProgress var(--insight-duration, 4000ms) linear forwards;
  }
  
  @keyframes insightProgress {
    from { transform: scaleX(1); }
    to { transform: scaleX(0); }
  }
  
  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .cognitive-insight {
      transition: opacity 0.1s ease;
      transform: none !important;
    }
    .insight-progress-bar {
      animation: none;
    }
  }
`;

// ============================================================================
// IMPLEMENTATION
// ============================================================================

let styleInjected = false;
let currentInsight: HTMLElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

function injectStyles(): void {
  if (styleInjected || typeof document === 'undefined') return;
  
  const style = document.createElement('style');
  style.textContent = STYLES;
  document.head.appendChild(style);
  styleInjected = true;
}

function getInsightLabel(type: InsightType): string {
  switch (type) {
    case 'style_match': return 'Adapting';
    case 'empathy_shift': return 'Feeling with you';
    case 'clarity_boost': return 'Clarifying';
    case 'depth_increase': return 'Going deeper';
    case 'confidence_check': return 'Thinking...';
    case 'quirk_active': return 'Just me being me';
    default: return 'Insight';
  }
}

/**
 * Show a cognitive insight overlay
 */
export function showCognitiveInsight(options: CognitiveInsightOptions): void {
  if (typeof document === 'undefined') return;
  
  injectStyles();
  
  // Clear existing insight
  if (currentInsight) {
    currentInsight.remove();
    if (hideTimeout) clearTimeout(hideTimeout);
  }
  
  const {
    type,
    message,
    detail,
    duration = 4000,
    position = 'bottom-right',
  } = options;
  
  // Create element
  const el = document.createElement('div');
  el.className = `cognitive-insight ${position}`;
  el.style.setProperty('--insight-duration', `${duration}ms`);
  
  el.innerHTML = `
    <div class="insight-header">
      ${INSIGHT_ICONS[type]}
      <span class="insight-label">${getInsightLabel(type)}</span>
    </div>
    <div class="insight-message">${message}</div>
    ${detail ? `<div class="insight-detail">${detail}</div>` : ''}
    <div class="insight-progress">
      <div class="insight-progress-bar"></div>
    </div>
  `;
  
  document.body.appendChild(el);
  currentInsight = el;
  
  // Trigger animation
  requestAnimationFrame(() => {
    el.classList.add('visible');
  });
  
  // Auto-hide
  hideTimeout = trackedTimeout(() => {
    el.classList.remove('visible');
    trackedTimeout(() => {
      if (el.parentNode) {
        el.remove();
      }
      if (currentInsight === el) {
        currentInsight = null;
      }
    }, 300);
  }, duration);
}

/**
 * Hide the current insight immediately
 */
export function hideCognitiveInsight(): void {
  if (currentInsight) {
    currentInsight.classList.remove('visible');
    trackedTimeout(() => {
      if (currentInsight) {
        currentInsight.remove();
        currentInsight = null;
      }
    }, 300);
  }
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
}

/**
 * Convenience methods for common insight types
 */
export const cognitiveInsights = {
  styleMatch: (detail?: string) => showCognitiveInsight({
    type: 'style_match',
    message: 'Matching your thinking style',
    detail,
  }),
  
  empathyShift: (detail?: string) => showCognitiveInsight({
    type: 'empathy_shift',
    message: 'I hear you',
    detail,
  }),
  
  clarityBoost: (detail?: string) => showCognitiveInsight({
    type: 'clarity_boost',
    message: 'Let me put that more simply',
    detail,
  }),
  
  depthIncrease: (detail?: string) => showCognitiveInsight({
    type: 'depth_increase',
    message: 'Let me dive deeper',
    detail,
  }),
  
  confidenceCheck: (detail?: string) => showCognitiveInsight({
    type: 'confidence_check',
    message: "I'm not entirely sure, but...",
    detail,
    duration: 3000,
  }),
  
  quirkActive: (quirkName: string) => showCognitiveInsight({
    type: 'quirk_active',
    message: quirkName,
    duration: 2500,
  }),
};

export default { showCognitiveInsight, hideCognitiveInsight, cognitiveInsights };


