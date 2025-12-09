/**
 * Trust Journey UI - "Better Than Human" Relationship Visualization
 * 
 * A beautiful, cinematic visualization of the user's relationship with Ferni.
 * Shows growth, boundaries respected, shared moments, wins celebrated, and proactive care.
 * 
 * DESIGN PHILOSOPHY:
 * - Warm, intimate feel - like looking at a scrapbook with a close friend
 * - Focus on the positive - celebrating growth, not highlighting failures
 * - Privacy-first - boundaries shown as counts, not content
 * - Delightful animations - Pixar-inspired, meaningful motion
 * 
 * BRAND COMPLIANCE:
 * - Centered floating modal with backdrop blur
 * - Lucide SVG icons only - no emoji
 * - Ferni's sage green palette
 * - Plus Jakarta Sans display, Inter body
 * - Scale/fade animation from center
 * - Warm, human copy
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING, STAGGER } from '../config/animation-constants.js';

const log = createLogger('TrustJourney');

// ============================================================================
// TYPES
// ============================================================================

interface TrustJourneyData {
  userId: string;
  generatedAt: string;
  summary: {
    relationshipStrength: number;
    trustSignalsDetected: number;
    boundariesRespected: number;
    growthMomentsNoticed: number;
    sharedMomentsCount: number;
    winsCelebrated: number;
    proactiveOutreach: number;
  };
  growth: {
    patterns: Array<{
      type: string;
      count: number;
      mostRecent: string | null;
      examples: string[];
    }>;
    reflections: Array<{
      id: string;
      date: string;
      type: string;
      observation: string;
      surfacedToUser: boolean;
    }>;
  };
  boundaries: {
    totalBoundaries: number;
    typeCounts: Record<string, number>;
    message: string;
  };
  sharedHistory: {
    insideJokes: Array<{
      id: string;
      type: string;
      hint: string;
      firstMentioned: string;
      timesReferenced: number;
    }>;
    runningGags: number;
  };
  celebrations: {
    wins: Array<{
      id: string;
      date: string;
      type: string;
      whatHappened: string;
      celebrationUsed: string | null;
    }>;
    intentionsTracked: number;
  };
  timeline: Array<{
    date: string;
    type: 'growth' | 'boundary' | 'win' | 'callback' | 'outreach';
    title: string;
    description: string;
  }>;
}

// ============================================================================
// LUCIDE ICONS
// ============================================================================

const ICONS = {
  heart: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  sparkles: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
  leaf: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`,
  shield: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>`,
  trophy: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  messageHeart: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M15.8 9.2a2.5 2.5 0 0 0-3.5 0l-.3.4-.3-.4a2.5 2.5 0 0 0-3.5 0 2.5 2.5 0 0 0 0 3.5l3.8 3.8 3.8-3.8a2.5 2.5 0 0 0 0-3.5Z"/></svg>`,
  users: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  arrowRight: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`,
  clock: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  download: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
};

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let journeyPanel: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let cachedData: TrustJourneyData | null = null;
let isLoading = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initTrustJourneyUI(): void {
  if (isInitialized) return;
  
  // HMR protection
  document.querySelectorAll('.trust-journey-panel').forEach(el => el.remove());
  document.querySelectorAll('style[data-trust-journey-styles]').forEach(el => el.remove());
  
  injectStyles();
  createJourneyPanel();
  
  isInitialized = true;
  log.debug('Trust Journey UI initialized');
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;
  
  styleElement = document.createElement('style');
  styleElement.setAttribute('data-trust-journey-styles', '');
  styleElement.textContent = `
    /* ========================================================================
       TRUST JOURNEY PANEL - Full-screen immersive experience
       ======================================================================== */
    .trust-journey-panel {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 9999);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      visibility: hidden;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD}, 
                  visibility ${DURATION.SLOW}ms ${EASING.STANDARD};
    }
    
    .trust-journey-panel.visible {
      opacity: 1;
      visibility: visible;
    }
    
    .trust-journey-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy, rgba(44, 37, 32, 0.6));
      backdrop-filter: blur(var(--glass-blur-strong, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-strong, 24px));
    }
    
    .trust-journey-card {
      position: relative;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      max-width: 720px;
      width: calc(100% - var(--space-8, 32px));
      max-height: calc(100vh - var(--space-12, 48px));
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(44, 37, 32, 0.25)),
                  0 0 0 1px rgba(255, 255, 255, 0.1);
      transform: scale(0.92) translateY(30px);
      opacity: 0;
      transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING},
                  opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
    }
    
    .trust-journey-panel.visible .trust-journey-card {
      transform: scale(1) translateY(0);
      opacity: 1;
    }
    
    /* Header */
    .trust-journey-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: var(--space-6, 24px) var(--space-6, 24px) var(--space-4, 16px);
      background: linear-gradient(to bottom, var(--persona-tint, rgba(74, 103, 65, 0.05)), transparent);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
    }
    
    .trust-journey-header-content {
      flex: 1;
    }
    
    .trust-journey-eyebrow {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-overline, 11px);
      font-weight: var(--font-weight-bold, 700);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-accent-text, var(--persona-primary, #4a6741));
      margin-bottom: var(--space-1, 4px);
    }
    
    .trust-journey-eyebrow svg {
      width: 14px;
      height: 14px;
    }
    
    .trust-journey-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-2xl, 28px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-1, 4px);
      line-height: var(--leading-tight, 1.2);
    }
    
    .trust-journey-subtitle {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-text-secondary, #5C544A);
      margin: 0;
    }
    
    .trust-journey-actions {
      display: flex;
      gap: var(--space-2, 8px);
    }
    
    .trust-journey-action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 0;
      background: var(--color-background-secondary, #F5F1E8);
      border: none;
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-secondary, #5C544A);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .trust-journey-action-btn:hover {
      background: var(--color-background-tertiary, #E8E0D5);
      color: var(--color-text-primary, #2C2520);
      transform: scale(1.05);
    }
    
    .trust-journey-action-btn:active {
      transform: scale(0.95);
    }
    
    .trust-journey-action-btn svg {
      width: 18px;
      height: 18px;
    }
    
    .trust-journey-action-btn.loading svg {
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    /* Content */
    .trust-journey-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-6, 24px);
    }
    
    /* Relationship Strength Meter */
    .trust-strength-section {
      margin-bottom: var(--space-8, 32px);
    }
    
    .trust-strength-ring {
      position: relative;
      width: 180px;
      height: 180px;
      margin: 0 auto var(--space-4, 16px);
    }
    
    .trust-strength-ring svg {
      transform: rotate(-90deg);
    }
    
    .trust-strength-bg {
      fill: none;
      stroke: var(--color-background-tertiary, #E8E0D5);
      stroke-width: 12;
    }
    
    .trust-strength-fill {
      fill: none;
      stroke: url(#trustGradient);
      stroke-width: 12;
      stroke-linecap: round;
      stroke-dasharray: 440;
      stroke-dashoffset: 440;
      transition: stroke-dashoffset 1.5s ${EASING.EXPO_OUT};
    }
    
    .trust-strength-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }
    
    .trust-strength-value {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-4xl, 40px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text-primary, #2C2520);
      line-height: 1;
    }
    
    .trust-strength-label {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted, #756A5E);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .trust-strength-description {
      text-align: center;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-base, 16px);
      color: var(--color-text-secondary, #5C544A);
      max-width: 400px;
      margin: 0 auto;
      line-height: var(--leading-relaxed, 1.6);
    }
    
    /* Stats Grid */
    .trust-stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-8, 32px);
    }
    
    .trust-stat-card {
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
      text-align: center;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      cursor: default;
    }
    
    .trust-stat-card:hover {
      background: var(--color-background-tertiary, #E8E0D5);
      transform: translateY(-2px);
    }
    
    .trust-stat-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      margin: 0 auto var(--space-2, 8px);
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-full, 9999px);
      color: var(--color-accent-text, var(--persona-primary, #4a6741));
    }
    
    .trust-stat-icon svg {
      width: 20px;
      height: 20px;
    }
    
    .trust-stat-value {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-2xl, 28px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text-primary, #2C2520);
      line-height: 1;
      margin-bottom: var(--space-1, 4px);
    }
    
    .trust-stat-label {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted, #756A5E);
    }
    
    /* Section Headers */
    .trust-section {
      margin-bottom: var(--space-6, 24px);
    }
    
    .trust-section-header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-4, 16px);
    }
    
    .trust-section-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, var(--persona-primary, #4a6741) 0%, var(--persona-secondary, #3d5a35) 100%);
      border-radius: var(--radius-md, 8px);
      color: white;
    }
    
    .trust-section-icon svg {
      width: 16px;
      height: 16px;
    }
    
    .trust-section-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-lg, 18px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2C2520);
      margin: 0;
    }
    
    /* Growth Patterns */
    .growth-patterns-list {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
    }
    
    .growth-pattern-tag {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-full, 9999px);
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-accent-text, var(--persona-primary, #4a6741));
    }
    
    .growth-pattern-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      background: var(--persona-primary, #4a6741);
      border-radius: var(--radius-full, 9999px);
      font-size: var(--text-xs, 12px);
      font-weight: var(--font-weight-bold, 700);
      color: white;
    }
    
    /* Timeline */
    .trust-timeline {
      position: relative;
      padding-left: var(--space-6, 24px);
    }
    
    .trust-timeline::before {
      content: '';
      position: absolute;
      left: 8px;
      top: 4px;
      bottom: 4px;
      width: 2px;
      background: linear-gradient(to bottom, var(--persona-primary, #4a6741), transparent);
      border-radius: 1px;
    }
    
    .timeline-item {
      position: relative;
      padding-bottom: var(--space-4, 16px);
      animation: timelineFadeIn ${DURATION.SLOW}ms ${EASING.STANDARD} forwards;
      opacity: 0;
      transform: translateX(-10px);
    }
    
    @keyframes timelineFadeIn {
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    
    .timeline-item::before {
      content: '';
      position: absolute;
      left: calc(-1 * var(--space-6, 24px) + 4px);
      top: 6px;
      width: 10px;
      height: 10px;
      background: var(--color-background-elevated, #FFFDFB);
      border: 2px solid var(--persona-primary, #4a6741);
      border-radius: var(--radius-full, 9999px);
    }
    
    .timeline-item--growth::before { border-color: var(--color-semantic-success, #3d7a52); }
    .timeline-item--win::before { border-color: var(--color-semantic-warning, #c49a6c); }
    .timeline-item--callback::before { border-color: var(--color-semantic-info, #3a6b9c); }
    
    .timeline-date {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted, #756A5E);
      margin-bottom: var(--space-1, 4px);
    }
    
    .timeline-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-sm, 14px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2C2520);
      margin-bottom: var(--space-1, 4px);
    }
    
    .timeline-description {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-text-secondary, #5C544A);
      line-height: var(--leading-relaxed, 1.5);
    }
    
    /* Boundaries Message */
    .boundaries-message {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px);
      background: linear-gradient(135deg, var(--persona-tint, rgba(74, 103, 65, 0.05)), transparent);
      border-radius: var(--radius-lg, 12px);
      border-left: 3px solid var(--persona-primary, #4a6741);
    }
    
    .boundaries-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      background: var(--persona-primary, #4a6741);
      border-radius: var(--radius-full, 9999px);
      color: white;
      flex-shrink: 0;
    }
    
    .boundaries-icon svg {
      width: 22px;
      height: 22px;
    }
    
    .boundaries-text {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-base, 16px);
      color: var(--color-text-secondary, #5C544A);
      line-height: var(--leading-relaxed, 1.6);
    }
    
    /* Loading State */
    .trust-journey-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-16, 64px);
      text-align: center;
    }
    
    .trust-journey-loading-spinner {
      width: 48px;
      height: 48px;
      border: 3px solid var(--color-background-tertiary, #E8E0D5);
      border-top-color: var(--color-text-secondary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: var(--space-4, 16px);
    }
    
    .trust-journey-loading-text {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-base, 16px);
      color: var(--color-text-secondary, #5C544A);
    }
    
    /* Empty State */
    .trust-journey-empty {
      text-align: center;
      padding: var(--space-12, 48px) var(--space-6, 24px);
    }
    
    .trust-journey-empty-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 80px;
      height: 80px;
      margin: 0 auto var(--space-4, 16px);
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-muted, #756A5E);
    }
    
    .trust-journey-empty-icon svg {
      width: 36px;
      height: 36px;
    }
    
    .trust-journey-empty-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 20px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2C2520);
      margin-bottom: var(--space-2, 8px);
    }
    
    .trust-journey-empty-text {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-base, 16px);
      color: var(--color-text-secondary, #5C544A);
      max-width: 320px;
      margin: 0 auto;
    }
    
    /* ========================================================================
       DARK THEME
       ======================================================================== */
    [data-theme="midnight"] .trust-journey-backdrop {
      background: var(--backdrop-heavy, rgba(20, 18, 16, 0.8));
    }
    
    [data-theme="midnight"] .trust-journey-card {
      background: var(--color-background-elevated, #70605a);
    }
    
    [data-theme="midnight"] .trust-journey-title,
    [data-theme="midnight"] .trust-section-title,
    [data-theme="midnight"] .trust-stat-value,
    [data-theme="midnight"] .trust-strength-value,
    [data-theme="midnight"] .timeline-title {
      color: var(--color-text-primary, #faf6f0);
    }
    
    [data-theme="midnight"] .trust-journey-subtitle,
    [data-theme="midnight"] .trust-strength-description,
    [data-theme="midnight"] .boundaries-text,
    [data-theme="midnight"] .timeline-description {
      color: var(--color-text-secondary, #f0ebe4);
    }
    
    [data-theme="midnight"] .trust-stat-card,
    [data-theme="midnight"] .growth-pattern-tag,
    [data-theme="midnight"] .trust-journey-action-btn {
      background: var(--color-background-secondary, #60504a);
    }
    
    [data-theme="midnight"] .trust-stat-card:hover,
    [data-theme="midnight"] .trust-journey-action-btn:hover {
      background: var(--color-background-tertiary, #504540);
    }
    
    [data-theme="midnight"] .trust-stat-icon {
      background: var(--color-background-elevated, #70605a);
    }
    
    [data-theme="midnight"] .trust-strength-bg {
      stroke: var(--color-background-secondary, #60504a);
    }
    
    [data-theme="midnight"] .trust-journey-eyebrow,
    [data-theme="midnight"] .trust-strength-label,
    [data-theme="midnight"] .trust-stat-label,
    [data-theme="midnight"] .timeline-date {
      color: var(--color-text-muted, #e8e2da);
    }
    
    /* ========================================================================
       RESPONSIVE
       ======================================================================== */
    @media (max-width: 640px) {
      .trust-journey-card {
        max-height: calc(100vh - var(--space-4, 16px));
        border-radius: var(--radius-xl, 20px);
      }
      
      .trust-stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      
      .trust-strength-ring {
        width: 140px;
        height: 140px;
      }
      
      .trust-strength-value {
        font-size: var(--text-3xl, 32px);
      }
    }
    
    /* ========================================================================
       REDUCED MOTION
       ======================================================================== */
    @media (prefers-reduced-motion: reduce) {
      .trust-journey-panel,
      .trust-journey-card,
      .trust-stat-card,
      .trust-strength-fill,
      .timeline-item {
        transition: none !important;
        animation: none !important;
      }
      
      .timeline-item {
        opacity: 1;
        transform: none;
      }
      
      .trust-journey-action-btn.loading svg {
        animation: none;
      }
    }
  `;
  
  document.head.appendChild(styleElement);
}

// ============================================================================
// PANEL CREATION
// ============================================================================

function createJourneyPanel(): void {
  journeyPanel = document.createElement('div');
  journeyPanel.className = 'trust-journey-panel';
  journeyPanel.setAttribute('role', 'dialog');
  journeyPanel.setAttribute('aria-modal', 'true');
  journeyPanel.setAttribute('aria-labelledby', 'trust-journey-title');
  
  journeyPanel.innerHTML = `
    <div class="trust-journey-backdrop"></div>
    <div class="trust-journey-card">
      <header class="trust-journey-header">
        <div class="trust-journey-header-content">
          <div class="trust-journey-eyebrow">
            ${ICONS.heart}
            <span>Our Story</span>
          </div>
          <h2 class="trust-journey-title" id="trust-journey-title">Your Trust Journey</h2>
          <p class="trust-journey-subtitle">How we've grown together</p>
        </div>
        <div class="trust-journey-actions">
          <button class="trust-journey-action-btn" data-action="refresh" title="Refresh data">
            ${ICONS.refresh}
          </button>
          <button class="trust-journey-action-btn" data-action="export" title="Export your data">
            ${ICONS.download}
          </button>
          <button class="trust-journey-action-btn" data-action="close" title="Close">
            ${ICONS.close}
          </button>
        </div>
      </header>
      <div class="trust-journey-content">
        <div class="trust-journey-loading">
          <div class="trust-journey-loading-spinner"></div>
          <p class="trust-journey-loading-text">Gathering your journey...</p>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(journeyPanel);
  
  // Event handlers
  journeyPanel.querySelector('.trust-journey-backdrop')?.addEventListener('click', hideTrustJourney);
  
  journeyPanel.querySelectorAll('.trust-journey-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action;
      if (action === 'close') hideTrustJourney();
      else if (action === 'refresh') refreshJourneyData();
      else if (action === 'export') exportTrustData();
    });
  });
  
  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && journeyPanel?.classList.contains('visible')) {
      hideTrustJourney();
    }
  });
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchJourneyData(forceRefresh = false): Promise<TrustJourneyData | null> {
  if (cachedData && !forceRefresh) return cachedData;
  
  try {
    isLoading = true;
    updateLoadingState();
    
    // Get user ID from storage or state
    const userId = localStorage.getItem('ferni_user_id') || 'anonymous';
    
    const response = await fetch(`/api/trust-journey?userId=${encodeURIComponent(userId)}`, {
      headers: {
        'x-user-id': userId,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    
    cachedData = await response.json();
    return cachedData;
  } catch (err) {
    log.error('Failed to fetch trust journey data:', err);
    return null;
  } finally {
    isLoading = false;
  }
}

async function refreshJourneyData(): Promise<void> {
  const refreshBtn = journeyPanel?.querySelector('[data-action="refresh"]');
  if (refreshBtn) {
    refreshBtn.classList.add('loading');
  }
  
  cachedData = null;
  const data = await fetchJourneyData(true);
  
  if (refreshBtn) {
    refreshBtn.classList.remove('loading');
  }
  
  if (data) {
    renderJourneyContent(data);
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function updateLoadingState(): void {
  const content = journeyPanel?.querySelector('.trust-journey-content');
  if (!content || !isLoading) return;
  
  content.innerHTML = `
    <div class="trust-journey-loading">
      <div class="trust-journey-loading-spinner"></div>
      <p class="trust-journey-loading-text">Gathering your journey...</p>
    </div>
  `;
}

function renderJourneyContent(data: TrustJourneyData): void {
  const content = journeyPanel?.querySelector('.trust-journey-content');
  if (!content) return;
  
  // Check if we have meaningful data
  const hasData = data.summary.trustSignalsDetected > 0 || 
                  data.summary.winsCelebrated > 0 ||
                  data.timeline.length > 0;
  
  if (!hasData) {
    content.innerHTML = `
      <div class="trust-journey-empty">
        <div class="trust-journey-empty-icon">${ICONS.heart}</div>
        <h3 class="trust-journey-empty-title">Our story is just beginning</h3>
        <p class="trust-journey-empty-text">
          As we talk more, I'll notice your growth, celebrate your wins, 
          and remember what matters to you. Check back soon.
        </p>
      </div>
    `;
    return;
  }
  
  const strengthPercent = data.summary.relationshipStrength;
  const circumference = 440; // 2 * π * 70 (radius)
  const strokeDashoffset = circumference - (circumference * strengthPercent / 100);
  
  content.innerHTML = `
    <!-- SVG Gradient Definition -->
    <svg width="0" height="0">
      <defs>
        <linearGradient id="trustGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="var(--persona-secondary, #3d5a35)" />
          <stop offset="100%" stop-color="var(--persona-primary, #4a6741)" />
        </linearGradient>
      </defs>
    </svg>
    
    <!-- Relationship Strength -->
    <section class="trust-strength-section">
      <div class="trust-strength-ring">
        <svg width="180" height="180" viewBox="0 0 180 180">
          <circle class="trust-strength-bg" cx="90" cy="90" r="70" />
          <circle class="trust-strength-fill" cx="90" cy="90" r="70" 
                  style="stroke-dashoffset: ${strokeDashoffset}" />
        </svg>
        <div class="trust-strength-center">
          <div class="trust-strength-value">${strengthPercent}</div>
          <div class="trust-strength-label">Trust Score</div>
        </div>
      </div>
      <p class="trust-strength-description">
        ${getStrengthDescription(strengthPercent)}
      </p>
    </section>
    
    <!-- Stats Grid -->
    <div class="trust-stats-grid">
      <div class="trust-stat-card">
        <div class="trust-stat-icon">${ICONS.leaf}</div>
        <div class="trust-stat-value">${data.summary.growthMomentsNoticed}</div>
        <div class="trust-stat-label">Growth Moments</div>
      </div>
      <div class="trust-stat-card">
        <div class="trust-stat-icon">${ICONS.trophy}</div>
        <div class="trust-stat-value">${data.summary.winsCelebrated}</div>
        <div class="trust-stat-label">Wins Celebrated</div>
      </div>
      <div class="trust-stat-card">
        <div class="trust-stat-icon">${ICONS.messageHeart}</div>
        <div class="trust-stat-value">${data.summary.sharedMomentsCount}</div>
        <div class="trust-stat-label">Shared Moments</div>
      </div>
    </div>
    
    <!-- Boundaries Section -->
    ${data.boundaries.totalBoundaries > 0 ? `
      <section class="trust-section">
        <div class="boundaries-message">
          <div class="boundaries-icon">${ICONS.shield}</div>
          <p class="boundaries-text">${data.boundaries.message}</p>
        </div>
      </section>
    ` : ''}
    
    <!-- Growth Patterns -->
    ${data.growth.patterns.length > 0 ? `
      <section class="trust-section">
        <div class="trust-section-header">
          <div class="trust-section-icon">${ICONS.leaf}</div>
          <h3 class="trust-section-title">How you've grown</h3>
        </div>
        <div class="growth-patterns-list">
          ${data.growth.patterns.map(p => `
            <span class="growth-pattern-tag">
              ${formatGrowthType(p.type)}
              <span class="growth-pattern-count">${p.count}</span>
            </span>
          `).join('')}
        </div>
      </section>
    ` : ''}
    
    <!-- Timeline -->
    ${data.timeline.length > 0 ? `
      <section class="trust-section">
        <div class="trust-section-header">
          <div class="trust-section-icon">${ICONS.clock}</div>
          <h3 class="trust-section-title">Our journey together</h3>
        </div>
        <div class="trust-timeline">
          ${data.timeline.slice(0, 10).map((item, i) => `
            <div class="timeline-item timeline-item--${item.type}" 
                 style="animation-delay: ${i * STAGGER.NORMAL}ms">
              <div class="timeline-date">${formatRelativeDate(item.date)}</div>
              <div class="timeline-title">${escapeHtml(item.title)}</div>
              <div class="timeline-description">${escapeHtml(item.description)}</div>
            </div>
          `).join('')}
        </div>
      </section>
    ` : ''}
  `;
  
  // Animate the strength ring after render
  requestAnimationFrame(() => {
    const fill = content.querySelector('.trust-strength-fill') as SVGCircleElement;
    if (fill) {
      fill.style.strokeDashoffset = String(strokeDashoffset);
    }
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function getStrengthDescription(percent: number): string {
  if (percent >= 80) return "We have built something real together. I know you, and you trust me.";
  if (percent >= 60) return "Our connection is growing deeper. I'm learning what matters to you.";
  if (percent >= 40) return "We're building trust. Every conversation helps me understand you better.";
  if (percent >= 20) return "We're just getting started. Keep talking to me - I'm listening.";
  return "Every journey begins with a first step. I'm here whenever you're ready.";
}

function formatGrowthType(type: string): string {
  const labels: Record<string, string> = {
    emotional_regulation: 'Emotional balance',
    perspective_shift: 'Fresh perspectives',
    boundary_setting: 'Healthy boundaries',
    behavior_change: 'New habits',
    self_awareness: 'Self-awareness',
    coping_upgrade: 'Better coping',
  };
  return labels[type] || type.replace(/_/g, ' ');
}

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return date.toLocaleDateString();
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// EXPORT FUNCTIONALITY (Phase 2 hook)
// ============================================================================

async function exportTrustData(): Promise<void> {
  const exportBtn = journeyPanel?.querySelector('[data-action="export"]');
  if (exportBtn) {
    exportBtn.classList.add('loading');
  }
  
  try {
    const userId = localStorage.getItem('ferni_user_id') || 'anonymous';
    
    const response = await fetch(`/api/trust-journey?userId=${encodeURIComponent(userId)}`, {
      headers: { 'x-user-id': userId },
    });
    
    if (!response.ok) throw new Error('Failed to fetch data');
    
    const data = await response.json();
    
    // Create downloadable JSON file
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ferni-trust-journey-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    log.info('Trust journey exported');
  } catch (err) {
    log.error('Failed to export trust data:', err);
    // Could show a toast here
  } finally {
    if (exportBtn) {
      exportBtn.classList.remove('loading');
    }
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function showTrustJourney(): Promise<void> {
  if (!journeyPanel) return;
  
  journeyPanel.classList.add('visible');
  
  const data = await fetchJourneyData();
  if (data) {
    renderJourneyContent(data);
  }
  
  // Focus management
  const closeBtn = journeyPanel.querySelector('[data-action="close"]') as HTMLElement;
  closeBtn?.focus();
}

export function hideTrustJourney(): void {
  journeyPanel?.classList.remove('visible');
}

export function toggleTrustJourney(): void {
  if (journeyPanel?.classList.contains('visible')) {
    hideTrustJourney();
  } else {
    showTrustJourney();
  }
}

export function dispose(): void {
  journeyPanel?.remove();
  styleElement?.remove();
  journeyPanel = null;
  styleElement = null;
  cachedData = null;
  isInitialized = false;
}

export const trustJourneyUI = {
  init: initTrustJourneyUI,
  show: showTrustJourney,
  hide: hideTrustJourney,
  toggle: toggleTrustJourney,
  dispose,
};

