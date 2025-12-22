/**
 * Relationship Progress Indicator
 * 
 * An always-visible, subtle indicator showing progress toward the next
 * relationship stage with Ferni. Lives in the bottom-left corner.
 * 
 * DESIGN PHILOSOPHY:
 * - Ambient, not attention-seeking
 * - Rewards curiosity (click to see details)
 * - Celebrates progress without gamifying the relationship
 * - Disappears during conversation (don't distract)
 * 
 * STATES:
 * - Collapsed: Small pill showing stage name + subtle progress arc
 * - Expanded: Shows detailed progress metrics
 * - Hidden: During active conversations
 * 
 * BRAND COMPLIANCE:
 * - Ferni's sage green for progress
 * - Warm, human copy
 * - Subtle animations
 * - Lucide icons
 */

import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { 
  relationshipStageService, 
  STAGE_NAMES,
  type RelationshipStage,
} from '../services/relationship-stage.service.js';

const log = createLogger('ProgressIndicator');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// ICONS (Lucide-style SVG)
// ============================================================================

const ICONS = {
  heart: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  messageCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`,
  calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,
  flame: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  chevronUp: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
  chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  sparkles: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
};

// ============================================================================
// STAGE DESCRIPTIONS
// ============================================================================

const STAGE_DESCRIPTIONS: Record<RelationshipStage, {
  current: string;
  next: string;
}> = {
  'first-meeting': {
    current: 'Just starting out',
    next: 'Keep talking! Each conversation builds our connection.',
  },
  'getting-started': {
    current: 'Getting to know each other',
    next: 'A few more days together will deepen our bond.',
  },
  'building-trust': {
    current: 'Building something real',
    next: 'Trust takes time. Keep showing up.',
  },
  'established': {
    current: 'A rhythm of our own',
    next: "We're on our way to a deep partnership.",
  },
  'deep-partnership': {
    current: 'Partners for life',
    next: "We've reached the deepest level.",
  },
};

// ============================================================================
// STATE
// ============================================================================

let indicator: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let isInitialized = false;
let isExpanded = false;
let isHidden = false;
let updateInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the progress indicator.
 */
export function initProgressIndicator(): void {
  if (isInitialized) return;
  
  cleanupOrphanedElements();
  injectStyles();
  createIndicator();
  
  // Subscribe to stage changes
  relationshipStageService.onStageChange(() => {
    updateIndicator();
  });
  
  // Update periodically (for days/streak changes)
  updateInterval = setInterval(updateIndicator, 60000);
  
  // Listen for conversation state changes
  window.addEventListener('ferni:conversation-start', handleConversationStart);
  window.addEventListener('ferni:conversation-end', handleConversationEnd);
  
  // Initial update
  updateIndicator();
  
  isInitialized = true;
  log.debug('Progress indicator initialized');
}

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.progress-indicator').forEach(el => el.remove());
  document.querySelectorAll('#progress-indicator-styles').forEach(el => el.remove());
}

function createIndicator(): void {
  indicator = document.createElement('div');
  indicator.className = 'progress-indicator';
  indicator.setAttribute('role', 'button');
  indicator.setAttribute('aria-expanded', 'false');
  indicator.setAttribute('aria-label', 'Relationship progress');
  indicator.tabIndex = 0;
  
  document.body.appendChild(indicator);
  
  // Click handler
  indicator.addEventListener('click', toggleExpanded);
  indicator.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpanded();
    }
  });
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the indicator.
 */
export function showIndicator(): void {
  if (!indicator) return;
  isHidden = false;
  indicator.classList.remove('progress-indicator--hidden');
}

/**
 * Hide the indicator.
 */
export function hideIndicator(): void {
  if (!indicator) return;
  isHidden = true;
  indicator.classList.add('progress-indicator--hidden');
}

/**
 * Toggle expanded state.
 */
export function toggleExpanded(): void {
  if (!indicator) return;
  
  isExpanded = !isExpanded;
  indicator.setAttribute('aria-expanded', String(isExpanded));
  indicator.classList.toggle('progress-indicator--expanded', isExpanded);
  
  // Re-render content
  updateIndicator();
  
  // Animate
  if (!prefersReducedMotion()) {
    const content = indicator.querySelector('.progress-content');
    if (content instanceof HTMLElement) {
      content.animate([
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], {
        duration: DURATION.NORMAL,
        easing: EASING.EXPO_OUT,
      });
    }
  }
}

/**
 * Collapse the indicator.
 */
export function collapse(): void {
  if (isExpanded) {
    toggleExpanded();
  }
}

// ============================================================================
// UPDATE & RENDERING
// ============================================================================

function updateIndicator(): void {
  if (!indicator) return;
  
  const stage = relationshipStageService.getStage();
  const metrics = relationshipStageService.getMetrics();
  const progress = relationshipStageService.getProgressToNextStage();
  const stageName = STAGE_NAMES[stage];
  const stageDesc = STAGE_DESCRIPTIONS[stage];
  
  const progressPercent = Math.round(progress.progress * 100);
  const isMaxStage = progress.nextStage === null;
  
  if (isExpanded) {
    renderExpanded(stage, stageName, stageDesc, metrics, progress, progressPercent, isMaxStage);
  } else {
    renderCollapsed(stageName, progressPercent, isMaxStage);
  }
}

function renderCollapsed(stageName: string, progressPercent: number, isMaxStage: boolean): void {
  if (!indicator) return;
  
  const circumference = 2 * Math.PI * 14; // radius = 14
  const strokeDashoffset = circumference - (circumference * progressPercent / 100);
  
  indicator.innerHTML = `
    <div class="progress-collapsed">
      <div class="progress-ring">
        <svg width="36" height="36" viewBox="0 0 36 36">
          <circle class="progress-ring-bg" cx="18" cy="18" r="14" />
          <circle class="progress-ring-fill" cx="18" cy="18" r="14" 
                  style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeDashoffset}" />
        </svg>
        <span class="progress-ring-icon">${isMaxStage ? ICONS.sparkles : ICONS.heart}</span>
      </div>
      <div class="progress-collapsed-text">
        <span class="progress-stage-name">${stageName}</span>
        ${!isMaxStage ? `<span class="progress-percent">${progressPercent}%</span>` : ''}
      </div>
      <span class="progress-expand-icon">${ICONS.chevronUp}</span>
    </div>
  `;
}

function renderExpanded(
  stage: RelationshipStage,
  stageName: string,
  stageDesc: { current: string; next: string },
  metrics: { totalConversations: number; daysSinceFirstMeeting: number; currentStreak: number },
  progress: { nextStage: RelationshipStage | null; progress: number; requirement: string },
  progressPercent: number,
  isMaxStage: boolean
): void {
  if (!indicator) return;
  
  const circumference = 2 * Math.PI * 40; // radius = 40
  const strokeDashoffset = circumference - (circumference * progressPercent / 100);
  
  indicator.innerHTML = `
    <div class="progress-expanded">
      <div class="progress-header">
        <span class="progress-eyebrow">YOUR JOURNEY</span>
        <button class="progress-collapse-btn" aria-label="${t('accessibility.collapse')}">
          ${ICONS.chevronDown}
        </button>
      </div>
      
      <!-- Progress ring -->
      <div class="progress-ring-large">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle class="progress-ring-bg" cx="50" cy="50" r="40" />
          <circle class="progress-ring-fill" cx="50" cy="50" r="40" 
                  style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeDashoffset}" />
        </svg>
        <div class="progress-ring-center">
          ${isMaxStage ? `
            <span class="progress-ring-icon-large">${ICONS.sparkles}</span>
          ` : `
            <span class="progress-ring-value">${progressPercent}%</span>
            <span class="progress-ring-label">progress</span>
          `}
        </div>
      </div>
      
      <!-- Stage info -->
      <div class="progress-stage">
        <h3 class="progress-stage-title">${stageName}</h3>
        <p class="progress-stage-desc">${stageDesc.current}</p>
      </div>
      
      <!-- Metrics -->
      <div class="progress-metrics">
        <div class="progress-metric">
          <span class="metric-icon">${ICONS.messageCircle}</span>
          <span class="metric-value">${metrics.totalConversations}</span>
          <span class="metric-label">conversations</span>
        </div>
        <div class="progress-metric">
          <span class="metric-icon">${ICONS.calendar}</span>
          <span class="metric-value">${metrics.daysSinceFirstMeeting}</span>
          <span class="metric-label">days together</span>
        </div>
        <div class="progress-metric">
          <span class="metric-icon">${ICONS.flame}</span>
          <span class="metric-value">${metrics.currentStreak}</span>
          <span class="metric-label">day streak</span>
        </div>
      </div>
      
      <!-- Next stage -->
      ${!isMaxStage && progress.nextStage ? `
        <div class="progress-next">
          <span class="progress-next-label">Next: ${STAGE_NAMES[progress.nextStage]}</span>
          <p class="progress-next-requirement">${progress.requirement}</p>
        </div>
      ` : `
        <div class="progress-complete">
          <p>${stageDesc.next}</p>
        </div>
      `}
    </div>
  `;
  
  // Collapse button handler
  const collapseBtn = indicator.querySelector('.progress-collapse-btn');
  collapseBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleExpanded();
  });
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleConversationStart(): void {
  hideIndicator();
}

function handleConversationEnd(): void {
  showIndicator();
  // Collapse after conversation ends
  trackedTimeout(() => {
    if (isExpanded) {
      collapse();
    }
  }, 2000);
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('progress-indicator-styles')) return;
  
  styleElement = document.createElement('style');
  styleElement.id = 'progress-indicator-styles';
  styleElement.textContent = `
    /* ========================================================================
       PROGRESS INDICATOR
       ======================================================================== */
    .progress-indicator {
      position: fixed;
      bottom: var(--space-4, 16px);
      left: var(--space-4, 16px);
      z-index: var(--z-sticky, 6000);
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-xl, 16px);
      box-shadow: 
        0 4px 16px rgba(44, 37, 32, 0.1),
        0 0 0 1px rgba(255, 255, 255, 0.8);
      cursor: pointer;
      transition: all ${DURATION.SLOW}ms ${EASING.STANDARD};
      outline: none;
    }
    
    .progress-indicator:hover {
      box-shadow: 
        0 8px 24px rgba(44, 37, 32, 0.15),
        0 0 0 1px rgba(255, 255, 255, 0.8);
      transform: translateY(-2px);
    }
    
    .progress-indicator:focus-visible {
      box-shadow: 
        0 4px 16px rgba(44, 37, 32, 0.1),
        0 0 0 2px var(--persona-primary, #4a6741);
    }
    
    .progress-indicator--hidden {
      opacity: 0;
      transform: translateY(20px);
      pointer-events: none;
    }
    
    .progress-indicator--expanded {
      cursor: default;
    }
    
    .progress-indicator--expanded:hover {
      transform: none;
    }
    
    /* ========================================================================
       COLLAPSED STATE
       ======================================================================== */
    .progress-collapsed {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
    }
    
    .progress-ring {
      position: relative;
      width: 36px;
      height: 36px;
    }
    
    .progress-ring svg {
      transform: rotate(-90deg);
    }
    
    .progress-ring-bg {
      fill: none;
      stroke: var(--color-background-tertiary, #E8E0D5);
      stroke-width: 4;
    }
    
    .progress-ring-fill {
      fill: none;
      stroke: var(--persona-primary, #4a6741);
      stroke-width: 4;
      stroke-linecap: round;
      transition: stroke-dashoffset ${DURATION.CELEBRATION}ms ${EASING.EXPO_OUT};
    }
    
    .progress-ring-icon {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: var(--persona-primary, #4a6741);
    }
    
    .progress-ring-icon svg {
      width: 16px;
      height: 16px;
    }
    
    .progress-collapsed-text {
      display: flex;
      flex-direction: column;
    }
    
    .progress-stage-name {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-sm, 14px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2C2520);
      line-height: 1.2;
    }
    
    .progress-percent {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted, #756A5E);
    }
    
    .progress-expand-icon {
      color: var(--color-text-muted, #756A5E);
      opacity: 0.5;
      transition: opacity ${DURATION.FAST}ms;
    }
    
    .progress-indicator:hover .progress-expand-icon {
      opacity: 1;
    }
    
    .progress-expand-icon svg {
      width: 16px;
      height: 16px;
    }
    
    /* ========================================================================
       EXPANDED STATE
       ======================================================================== */
    .progress-expanded {
      width: min(260px, 100%);
      padding: var(--space-4, 16px);
    }
    
    .progress-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-4, 16px);
    }
    
    .progress-eyebrow {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xs, 12px);
      font-weight: var(--font-weight-bold, 700);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--persona-primary, #4a6741);
    }
    
    .progress-collapse-btn {
      width: 28px;
      height: 28px;
      padding: 0;
      background: var(--color-background-secondary, #F5F1E8);
      border: none;
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-muted, #756A5E);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .progress-collapse-btn:hover {
      background: var(--color-background-tertiary, #E8E0D5);
      color: var(--color-text-primary, #2C2520);
    }
    
    .progress-collapse-btn svg {
      width: 16px;
      height: 16px;
    }
    
    /* Large ring */
    .progress-ring-large {
      position: relative;
      width: min(100px, 100%);
      height: 100px;
      margin: 0 auto var(--space-4, 16px);
    }
    
    .progress-ring-large svg {
      transform: rotate(-90deg);
    }
    
    .progress-ring-large .progress-ring-bg {
      stroke-width: 8;
    }
    
    .progress-ring-large .progress-ring-fill {
      stroke-width: 8;
    }
    
    .progress-ring-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }
    
    .progress-ring-value {
      display: block;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 24px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text-primary, #2C2520);
      line-height: 1;
    }
    
    .progress-ring-label {
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted, #756A5E);
    }
    
    .progress-ring-icon-large {
      color: var(--persona-primary, #4a6741);
    }
    
    .progress-ring-icon-large svg {
      width: 32px;
      height: 32px;
    }
    
    /* Stage info */
    .progress-stage {
      text-align: center;
      margin-bottom: var(--space-4, 16px);
    }
    
    .progress-stage-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-lg, 18px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-1, 4px);
    }
    
    .progress-stage-desc {
      font-size: var(--text-sm, 14px);
      color: var(--color-text-secondary, #5C544A);
      margin: 0;
    }
    
    /* Metrics */
    .progress-metrics {
      display: flex;
      justify-content: space-between;
      gap: var(--space-2, 8px);
      padding: var(--space-3, 12px);
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-lg, 12px);
      margin-bottom: var(--space-4, 16px);
    }
    
    .progress-metric {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex: 1;
    }
    
    .metric-icon {
      color: var(--color-text-muted, #756A5E);
      margin-bottom: var(--space-1, 4px);
    }
    
    .metric-icon svg {
      width: 16px;
      height: 16px;
    }
    
    .metric-value {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-lg, 18px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text-primary, #2C2520);
      line-height: 1;
    }
    
    .metric-label {
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted, #756A5E);
      text-align: center;
    }
    
    /* Next stage */
    .progress-next {
      text-align: center;
      padding: var(--space-3, 12px);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-lg, 12px);
    }
    
    .progress-next-label {
      display: block;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-sm, 14px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 4px);
    }
    
    .progress-next-requirement {
      font-size: var(--text-xs, 12px);
      color: var(--color-text-secondary, #5C544A);
      margin: 0;
    }
    
    .progress-complete {
      text-align: center;
      padding: var(--space-3, 12px);
    }
    
    .progress-complete p {
      font-size: var(--text-sm, 14px);
      font-style: italic;
      color: var(--color-text-secondary, #5C544A);
      margin: 0;
    }
    
    /* ========================================================================
       DARK THEME
       ======================================================================== */
    [data-theme="midnight"] .progress-indicator {
      background: var(--color-background-elevated, #70605a);
      box-shadow: 
        0 4px 16px rgba(0, 0, 0, 0.2),
        0 0 0 1px rgba(255, 255, 255, 0.1);
    }
    
    [data-theme="midnight"] .progress-stage-name,
    [data-theme="midnight"] .progress-stage-title,
    [data-theme="midnight"] .progress-ring-value,
    [data-theme="midnight"] .metric-value {
      color: var(--color-text-primary, #faf6f0);
    }
    
    [data-theme="midnight"] .progress-stage-desc,
    [data-theme="midnight"] .progress-next-requirement,
    [data-theme="midnight"] .progress-complete p {
      color: var(--color-text-secondary, #f0ebe4);
    }
    
    [data-theme="midnight"] .progress-ring-bg {
      stroke: var(--color-background-secondary, #60504a);
    }
    
    [data-theme="midnight"] .progress-metrics {
      background: var(--color-background-secondary, #60504a);
    }
    
    [data-theme="midnight"] .progress-collapse-btn {
      background: var(--color-background-secondary, #60504a);
    }
    
    [data-theme="midnight"] .progress-collapse-btn:hover {
      background: var(--color-background-tertiary, #504540);
    }
    
    /* ========================================================================
       REDUCED MOTION
       ======================================================================== */
    @media (prefers-reduced-motion: reduce) {
      .progress-indicator {
        transition: opacity ${DURATION.FAST}ms linear;
      }
      
      .progress-ring-fill {
        transition: none;
      }
    }
    
    /* ========================================================================
       MOBILE
       ======================================================================== */
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .progress-indicator {
        bottom: var(--space-20, 80px);
        left: var(--space-3, 12px);
      }
      
      .progress-expanded {
        width: calc(100vw - var(--space-6, 24px));
        max-width: min(280px, 100%);
      }
    }
  `;
  
  document.head.appendChild(styleElement);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function destroyProgressIndicator(): void {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
  
  window.removeEventListener('ferni:conversation-start', handleConversationStart);
  window.removeEventListener('ferni:conversation-end', handleConversationEnd);
  
  indicator?.remove();
  styleElement?.remove();
  indicator = null;
  styleElement = null;
  isInitialized = false;
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Toggle the visibility of the progress indicator.
 */
export function toggleProgressIndicator(): void {
  if (!indicator) return;
  
  if (isHidden) {
    showIndicator();
  } else {
    hideIndicator();
  }
}

/**
 * Expand the progress indicator to show detailed metrics.
 */
export function expandProgressIndicator(): void {
  if (!indicator) return;
  
  if (!isExpanded) {
    toggleExpanded();
  }
}

export const progressIndicator = {
  init: initProgressIndicator,
  show: showIndicator,
  hide: hideIndicator,
  toggle: toggleExpanded,
  toggleVisibility: toggleProgressIndicator,
  expand: expandProgressIndicator,
  collapse,
  destroy: destroyProgressIndicator,
};

export default progressIndicator;

