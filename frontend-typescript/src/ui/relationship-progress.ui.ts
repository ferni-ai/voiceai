/**
 * Relationship Progress UI
 * 
 * Your Journey with Ferni - shows the evolving relationship:
 * - Stage-up celebrations when relationship advances
 * - Progress indicator toward next stage
 * - Memory timeline of meaningful moments
 * 
 * BRAND COMPLIANCE:
 * - Centered floating modal with backdrop blur (per FERNI-SCREEN-GUIDELINES.md)
 * - Lucide SVG icons only - no emoji (per Brand Guidelines Section 7)
 * - Ferni's sage green (#4a6741) - never purple (per Brand Guidelines Section 3)
 * - Plus Jakarta Sans display, Inter body (per Brand Guidelines Section 4)
 * - Scale/fade animation from center (per Brand Guidelines Section 9)
 * - Warm, human copy (per Brand Guidelines Section 10)
 * 
 * DESIGN SYSTEM COMPLIANCE:
 * - All colors use CSS variables from tokens.css
 * - All spacing uses --space-* or --ma-* tokens
 * - All animations use DURATION/EASING from animation-constants.ts
 */

import { t } from '../i18n/index.js';
import { 
  relationshipStageService, 
  STAGE_NAMES,
} from '../services/relationship-stage.service.js';
import type { StageChangeEvent, RelationshipMemory } from '../services/relationship-stage.service.js';
import { createLogger } from '../utils/logger.js';
import { 
  DURATION, 
  EASING, 
} from '../config/animation-constants.js';

// ============================================================================
// LUCIDE ICONS (SVG) - Per Brand Guidelines Section 7
// Style: Outlined, 2px stroke weight, rounded corners
// ============================================================================

const ICONS = {
  // Heart icon for relationship/journey
  heart: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  
  // Sparkles for celebration
  sparkles: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
  
  // Arrow up for stage progression
  arrowUp: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
  
  // Flame for streaks
  flame: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  
  // Hand wave for comeback
  hand: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,
  
  // Stars for first conversation
  stars: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L9.09 8.26 2 9.27l5 4.87-1.18 6.88L12 17.77l6.18 3.25L17 14.14l5-4.87-7.09-1.01L12 2z"/></svg>`,
  
  // Lightbulb for insights
  lightbulb: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  
  // Messages for conversations
  messageCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`,
  
  // Calendar for days together
  calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,
  
  // Trophy for streaks
  trophy: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  
  // Close X
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  
  // Chevron right for next stage
  chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  
  // Leaf for growth/journey
  leaf: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`,
} as const;

// ============================================================================
// STAGE DESCRIPTIONS - Brand Voice (Warm, Human, Not Saccharine)
// Per Brand Guidelines Section 10
// ============================================================================

const STAGE_DESCRIPTIONS: Record<string, { tagline: string; description: string }> = {
  'first-meeting': {
    tagline: 'Just getting started',
    description: 'Every great friendship starts somewhere. This is our beginning.',
  },
  'getting-started': {
    tagline: 'Building something real',
    description: 'You keep showing up. That takes courage. I notice.',
  },
  'building-trust': {
    tagline: 'Deeper than small talk',
    description: 'We are past the surface now. Real conversations. Real growth.',
  },
  'established': {
    tagline: 'A rhythm of our own',
    description: 'You know me. I know you. This is what trust feels like.',
  },
  'deep-partnership': {
    tagline: 'In it together',
    description: 'Some connections just work. Ours is one of them.',
  },
};

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let celebrationOverlay: HTMLElement | null = null;
let progressPanel: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
const cleanupFns: (() => void)[] = [];

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initRelationshipProgressUI(): void {
  if (isInitialized) return;
  
  // HMR protection - clean up orphaned elements
  document.querySelectorAll('.relationship-celebration, .journey-panel').forEach(el => el.remove());
  document.querySelectorAll('style[data-relationship-styles]').forEach(el => el.remove());
  
  // Inject styles first
  injectStyles();
  
  // Listen for stage changes to trigger celebrations
  const unsubStage = relationshipStageService.onStageChange(handleStageChange);
  cleanupFns.push(unsubStage);
  
  // Create the celebration overlay (hidden by default)
  createCelebrationOverlay();
  
  // Create the progress panel (hidden by default)
  createProgressPanel();
  
  isInitialized = true;
  createLogger('RelProgress').debug('[RelationshipProgress] Initialized');
}

// ============================================================================
// STYLES - Per Brand Guidelines
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;
  
  styleElement = document.createElement('style');
  styleElement.setAttribute('data-relationship-styles', '');
  styleElement.textContent = `
    /* ========================================================================
       CELEBRATION OVERLAY
       Centered modal with backdrop blur (per FERNI-SCREEN-GUIDELINES.md)
       ======================================================================== */
    .relationship-celebration {
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
    
    .relationship-celebration.visible {
      opacity: 1;
      visibility: visible;
    }
    
    .celebration-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-medium);
      backdrop-filter: blur(var(--glass-blur-strong, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-strong, 24px));
    }
    
    .celebration-card {
      position: relative;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      padding: var(--space-10, 40px) var(--space-12, 48px);
      text-align: center;
      max-width: 420px;
      width: calc(100% - var(--space-8, 32px));
      box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(44, 37, 32, 0.25));
      transform: scale(0.9) translateY(20px);
      opacity: 0;
      transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING},
                  opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
    }
    
    .relationship-celebration.visible .celebration-card {
      transform: scale(1) translateY(0);
      opacity: 1;
    }
    
    .celebration-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 72px;
      height: 72px;
      margin: 0 auto var(--space-5, 20px);
      background: linear-gradient(135deg, var(--persona-primary) 0%, var(--persona-secondary) 100%);
      border-radius: var(--radius-full, 9999px);
      color: white;
      box-shadow: 0 8px 30px var(--persona-glow);
    }
    
    .celebration-icon svg {
      width: 32px;
      height: 32px;
    }
    
    /* Eyebrow text - per Brand Guidelines Section 4 */
    .celebration-eyebrow {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-overline, 11px);
      font-weight: var(--font-weight-bold, 700);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-accent-text);
      margin-bottom: var(--space-2, 8px);
    }
    
    .celebration-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-2xl, 28px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-3, 12px);
      line-height: var(--leading-tight, 1.2);
    }
    
    .celebration-message {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-base, 16px);
      color: var(--color-text-secondary, #5C544A);
      margin: 0 0 var(--space-6, 24px);
      line-height: var(--leading-relaxed, 1.6);
    }
    
    .celebration-stage-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px) var(--space-5, 20px);
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-full, 9999px);
      margin-bottom: var(--space-6, 24px);
    }
    
    .stage-from {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-text-muted, #756A5E);
      text-decoration: line-through;
    }
    
    .stage-arrow {
      color: var(--color-accent-text);
    }
    
    .stage-arrow svg {
      width: 16px;
      height: 16px;
    }
    
    .stage-to {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-sm, 14px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-accent-text);
    }
    
    /* Primary CTA button - per Brand Guidelines Section 8 */
    .celebration-dismiss {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 8px);
      background: var(--persona-primary, #4a6741);
      color: white;
      border: none;
      padding: var(--space-4, 16px) var(--space-8, 32px);
      border-radius: var(--radius-full, 9999px);
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-button-md, 16px);
      font-weight: var(--font-weight-semibold, 600);
      cursor: pointer;
      transition: all 200ms ease-out;
    }
    
    .celebration-dismiss:hover {
      background: var(--persona-secondary);
      transform: translateY(-2px);
      box-shadow: var(--shadow-lg);
    }
    
    .celebration-dismiss:active {
      transform: scale(0.98);
    }
    
    /* ========================================================================
       JOURNEY PANEL
       Centered floating modal (per FERNI-SCREEN-GUIDELINES.md)
       ======================================================================== */
    .journey-panel {
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
    
    .journey-panel.visible {
      opacity: 1;
      visibility: visible;
    }
    
    .journey-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-medium);
      backdrop-filter: blur(var(--glass-blur-strong, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-strong, 24px));
    }
    
    .journey-card {
      position: relative;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      max-width: 480px;
      width: calc(100% - var(--space-8, 32px));
      max-height: calc(100vh - var(--space-16, 64px));
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(44, 37, 32, 0.25));
      transform: scale(0.9) translateY(20px);
      opacity: 0;
      transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING},
                  opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
    }
    
    .journey-panel.visible .journey-card {
      transform: scale(1) translateY(0);
      opacity: 1;
    }
    
    .journey-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-5, 20px) var(--space-6, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
    }
    
    .journey-header-text {
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 4px);
    }
    
    /* Eyebrow for header */
    .journey-eyebrow {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-overline, 11px);
      font-weight: var(--font-weight-bold, 700);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-accent-text);
    }
    
    .journey-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-lg, 18px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2C2520);
      margin: 0;
    }
    
    .journey-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      background: var(--color-background-secondary, #F5F1E8);
      border: none;
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-secondary, #5C544A);
      cursor: pointer;
      transition: all 200ms ease-out;
    }
    
    .journey-close:hover {
      background: var(--color-background-tertiary, #E8E0D5);
      color: var(--color-text-primary, #2C2520);
    }
    
    .journey-close svg {
      width: 18px;
      height: 18px;
    }
    
    .journey-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-6, 24px);
    }
    
    /* Current Stage Section */
    .current-stage-section {
      display: flex;
      align-items: flex-start;
      gap: var(--space-4, 16px);
      margin-bottom: var(--space-6, 24px);
    }
    
    .stage-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, var(--persona-primary) 0%, var(--persona-secondary) 100%);
      border-radius: var(--radius-lg, 12px);
      color: white;
      flex-shrink: 0;
      box-shadow: 0 4px 16px var(--persona-glow);
    }
    
    .stage-icon svg {
      width: 28px;
      height: 28px;
    }
    
    .stage-info {
      flex: 1;
    }
    
    .stage-label {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-overline, 11px);
      font-weight: var(--font-weight-bold, 700);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted, #756A5E);
      margin-bottom: var(--space-1, 4px);
    }
    
    .stage-name {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 20px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-accent-text);
      margin-bottom: var(--space-1, 4px);
    }
    
    .stage-tagline {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-text-secondary, #5C544A);
    }
    
    .stage-description {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-base, 16px);
      color: var(--color-text-secondary, #5C544A);
      line-height: var(--leading-relaxed, 1.6);
      margin-bottom: var(--space-6, 24px);
      padding: var(--space-4, 16px);
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-lg, 12px);
      border-left: 3px solid var(--persona-primary, #4a6741);
    }
    
    /* Progress Section */
    .progress-section {
      margin-bottom: var(--space-6, 24px);
    }
    
    .progress-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-3, 12px);
    }
    
    .progress-label {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-sm, 14px);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-primary, #2C2520);
    }
    
    .progress-next {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted, #756A5E);
    }
    
    .progress-bar {
      height: 8px;
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-full, 9999px);
      overflow: hidden;
      margin-bottom: var(--space-2, 8px);
    }
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--persona-secondary, #3d5a35) 0%, var(--persona-primary, #4a6741) 100%);
      border-radius: var(--radius-full, 9999px);
      transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
    }
    
    .progress-requirement {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted, #756A5E);
    }
    
    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-6, 24px);
    }
    
    .stat-card {
      text-align: center;
      padding: var(--space-4, 16px) var(--space-3, 12px);
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-lg, 12px);
      transition: all 200ms ease-out;
    }
    
    .stat-card:hover {
      background: var(--color-background-tertiary, #E8E0D5);
    }
    
    .stat-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      margin: 0 auto var(--space-2, 8px);
      color: var(--color-accent-text);
    }
    
    .stat-icon svg {
      width: 20px;
      height: 20px;
    }
    
    .stat-value {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 20px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text-primary, #2C2520);
      margin-bottom: var(--space-1, 4px);
    }
    
    .stat-label {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted, #756A5E);
    }
    
    /* Memories Section */
    .memories-section {
      border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      padding-top: var(--space-5, 20px);
    }
    
    .memories-header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-4, 16px);
    }
    
    .memories-icon {
      color: var(--color-accent-text);
    }
    
    .memories-icon svg {
      width: 18px;
      height: 18px;
    }
    
    .memories-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-sm, 14px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2C2520);
      margin: 0;
    }
    
    .memories-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
    }
    
    .memory-item {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px);
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-md, 8px);
      transition: all 200ms ease-out;
    }
    
    .memory-item:hover {
      background: var(--color-background-tertiary, #E8E0D5);
    }
    
    .memory-icon-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-full, 9999px);
      color: var(--color-accent-text);
      flex-shrink: 0;
    }
    
    .memory-icon-wrapper svg {
      width: 16px;
      height: 16px;
    }
    
    .memory-content {
      flex: 1;
      min-width: 0;
    }
    
    .memory-title {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-text-primary, #2C2520);
      margin-bottom: 2px;
    }
    
    .memory-date {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted, #756A5E);
    }
    
    .no-memories {
      text-align: center;
      padding: var(--space-6, 24px);
      color: var(--color-text-muted, #756A5E);
      font-style: italic;
    }
    
    .no-memories-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      margin: 0 auto var(--space-3, 12px);
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-muted, #756A5E);
    }
    
    .no-memories-icon svg {
      width: 24px;
      height: 24px;
    }
    
    .no-memories-text {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
    }
    
    /* Memory Filters */
    .memories-filters {
      display: flex;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-4, 16px);
      flex-wrap: wrap;
    }
    
    .memory-filter {
      padding: var(--space-1, 4px) var(--space-3, 12px);
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-xs, 12px);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-secondary, #5C544A);
      background: var(--color-background-secondary, #F5F1E8);
      border: 1px solid transparent;
      border-radius: var(--radius-full, 9999px);
      cursor: pointer;
      transition: all 200ms ease-out;
    }
    
    .memory-filter:hover {
      background: var(--color-background-tertiary, #E8E0D5);
      color: var(--color-text-primary, #2C2520);
    }
    
    .memory-filter--active {
      background: var(--persona-primary, #4a6741);
      color: white;
      border-color: var(--color-accent-text);
    }
    
    .memory-filter--active:hover {
      background: var(--persona-secondary, #3d5a35);
      color: white;
    }
    
    /* Enhanced Memory Items */
    .memory-item {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px);
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-md, 8px);
      margin-bottom: var(--space-2, 8px);
      animation: memoryFadeIn 300ms ease-out forwards;
      opacity: 0;
      transform: translateY(8px);
    }
    
    @keyframes memoryFadeIn {
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .memory-item--stage-up {
      border-left: 3px solid var(--persona-primary);
      background: linear-gradient(90deg, var(--persona-tint), var(--color-background-secondary));
    }
    
    .memory-item--streak-milestone {
      border-left: 3px solid var(--color-semantic-warning, #c49a6c);
    }
    
    .memory-item--insight {
      border-left: 3px solid var(--color-semantic-info, #3a6b9c);
    }
    
    .memory-item--comeback {
      border-left: 3px solid var(--color-semantic-success, #3d7a52);
    }
    
    .memory-item--first-conversation {
      border-left: 3px solid var(--persona-primary, #4a6741);
    }
    
    .memory-description {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted, #756A5E);
      margin: var(--space-1, 4px) 0;
      line-height: var(--leading-relaxed, 1.6);
    }
    
    /* ========================================================================
       DARK THEME - Per tokens.css
       ======================================================================== */
    [data-theme="midnight"] .celebration-backdrop,
    [data-theme="midnight"] .journey-backdrop {
      background: var(--backdrop-heavy);
    }
    
    [data-theme="midnight"] .celebration-card,
    [data-theme="midnight"] .journey-card {
      background: var(--color-background-elevated, #70605a);
    }
    
    [data-theme="midnight"] .celebration-title,
    [data-theme="midnight"] .journey-title,
    [data-theme="midnight"] .stage-name,
    [data-theme="midnight"] .progress-label,
    [data-theme="midnight"] .stat-value,
    [data-theme="midnight"] .memories-title,
    [data-theme="midnight"] .memory-title {
      color: var(--color-text-primary, #faf6f0);
    }
    
    [data-theme="midnight"] .celebration-message {
      color: var(--color-text-secondary, #f0ebe4);  /* WCAG AA: 5.05:1 */
    }
    
    [data-theme="midnight"] .celebration-stage-badge,
    [data-theme="midnight"] .stat-card,
    [data-theme="midnight"] .memory-item,
    [data-theme="midnight"] .stage-description,
    [data-theme="midnight"] .progress-bar {
      background: var(--color-background-secondary, #60504a);
    }
    
    [data-theme="midnight"] .stat-card:hover,
    [data-theme="midnight"] .memory-item:hover {
      background: var(--color-background-tertiary, #504540);
    }
    
    [data-theme="midnight"] .memory-icon-wrapper {
      background: var(--color-background-elevated, #70605a);
    }
    
    [data-theme="midnight"] .journey-close {
      background: var(--color-background-secondary, #60504a);
      color: var(--color-text-secondary, #f0ebe4);  /* WCAG AA: 5.05:1 */
    }
    
    [data-theme="midnight"] .journey-close:hover {
      background: var(--color-background-tertiary, #685852);
      color: var(--color-text-primary, #faf6f0);
    }
    
    /* Eyebrows and labels - WCAG AA compliant in dark mode (4.5:1+ contrast) */
    [data-theme="midnight"] .journey-eyebrow,
    [data-theme="midnight"] .stage-label,
    [data-theme="midnight"] .stage-eyebrow,
    [data-theme="midnight"] .next-stage-label,
    [data-theme="midnight"] .progress-next,
    [data-theme="midnight"] .progress-requirement,
    [data-theme="midnight"] .stat-label,
    [data-theme="midnight"] .memories-empty,
    [data-theme="midnight"] .memory-date {
      color: var(--color-text-muted, #e8e2da);  /* WCAG AA: 4.65:1 */
    }
    
    [data-theme="midnight"] .stage-description {
      background: var(--color-background-secondary, #60504a);
      border-left-color: var(--color-accent-primary);
      color: var(--color-text-secondary, #f0ebe4);  /* WCAG AA: 5.05:1 */
    }
    
    [data-theme="midnight"] .stage-tagline {
      color: var(--color-text-secondary, #f0ebe4);  /* WCAG AA: 5.05:1 */
    }
    
    /* Dark Theme - Memory Filters */
    [data-theme="midnight"] .memory-filter {
      background: var(--color-background-tertiary, #504540);
      color: var(--color-text-secondary, #f0ebe4);
    }
    
    [data-theme="midnight"] .memory-filter:hover {
      background: var(--color-background-secondary, #60504a);
      color: var(--color-text-primary, #faf6f0);
    }
    
    [data-theme="midnight"] .memory-filter--active {
      background: var(--persona-primary, #6b8f5a);
      color: white;
    }
    
    /* Dark Theme - Memory Items */
    [data-theme="midnight"] .memory-item {
      background: var(--color-background-secondary, #60504a);
    }
    
    [data-theme="midnight"] .memory-item--stage-up {
      background: linear-gradient(90deg, var(--persona-tint), var(--color-background-secondary));
    }
    
    [data-theme="midnight"] .memory-description {
      color: var(--color-text-muted, #e8e2da);
    }
    
    /* ========================================================================
       REDUCED MOTION - Per Brand Guidelines Section 9.5
       ======================================================================== */
    @media (prefers-reduced-motion: reduce) {
      .relationship-celebration,
      .celebration-card,
      .journey-panel,
      .journey-card,
      .progress-fill,
      .celebration-dismiss,
      .journey-close,
      .stat-card,
      .memory-item {
        transition: none !important;
      }
      
      .relationship-celebration.visible .celebration-card,
      .journey-panel.visible .journey-card {
        transform: none;
      }
    }
    
    /* ========================================================================
       RESPONSIVE - Mobile-first adjustments
       ======================================================================== */
    @media (max-width: 480px) {
      .celebration-card,
      .journey-card {
        margin: var(--space-4, 16px);
        max-height: calc(100vh - var(--space-8, 32px));
      }
      
      .celebration-icon {
        width: 56px;
        height: 56px;
      }
      
      .celebration-icon svg {
        width: 24px;
        height: 24px;
      }
      
      .stats-grid {
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-2, 8px);
      }
      
      .stat-card {
        padding: var(--space-3, 12px) var(--space-2, 8px);
      }
      
      .stat-value {
        font-size: var(--text-lg, 18px);
      }
    }
  `;
  
  document.head.appendChild(styleElement);
}

// ============================================================================
// CELEBRATION OVERLAY
// ============================================================================

function createCelebrationOverlay(): void {
  celebrationOverlay = document.createElement('div');
  celebrationOverlay.className = 'relationship-celebration';
  celebrationOverlay.setAttribute('role', 'dialog');
  celebrationOverlay.setAttribute('aria-modal', 'true');
  celebrationOverlay.setAttribute('aria-labelledby', 'celebration-title');
  
  celebrationOverlay.innerHTML = `
    <div class="celebration-backdrop"></div>
    <div class="celebration-card">
      <div class="celebration-icon">${ICONS.sparkles}</div>
      <p class="celebration-eyebrow">Milestone reached</p>
      <h2 class="celebration-title" id="celebration-title"></h2>
      <p class="celebration-message"></p>
      <div class="celebration-stage-badge">
        <span class="stage-from"></span>
        <span class="stage-arrow">${ICONS.chevronRight}</span>
        <span class="stage-to"></span>
      </div>
      <button class="celebration-dismiss">Continue our journey</button>
    </div>
  `;
  
  document.body.appendChild(celebrationOverlay);
  
  // Close handlers
  celebrationOverlay.querySelector('.celebration-backdrop')?.addEventListener('click', hideCelebration);
  celebrationOverlay.querySelector('.celebration-dismiss')?.addEventListener('click', hideCelebration);
}

function handleStageChange(event: StageChangeEvent): void {
  createLogger('RelProgress').debug('[RelationshipProgress] Stage change:', event);
  showCelebration(event);
}

export function showCelebration(event: StageChangeEvent): void {
  if (!celebrationOverlay) return;
  
  const stageUpMsg = relationshipStageService.getStageUpMessage(event.newStage);
  
  // Update content
  const title = celebrationOverlay.querySelector('.celebration-title');
  const message = celebrationOverlay.querySelector('.celebration-message');
  const stageFrom = celebrationOverlay.querySelector('.stage-from');
  const stageTo = celebrationOverlay.querySelector('.stage-to');
  
  if (title) title.textContent = stageUpMsg.title;
  if (message) message.textContent = stageUpMsg.message;
  if (stageFrom) stageFrom.textContent = STAGE_NAMES[event.previousStage];
  if (stageTo) stageTo.textContent = STAGE_NAMES[event.newStage];
  
  // Show with animation
  celebrationOverlay.classList.add('visible');
  
  // Sound effect (non-blocking, may fail due to autoplay restrictions)
  try {
    const audio = new Audio('/sounds/level-up.mp3');
    audio.volume = 0.3;
    audio.play().catch((e) => {
      // Autoplay blocked or audio unavailable - non-critical
      if (import.meta.env?.DEV) console.debug('Audio play blocked:', e);
    });
  } catch {
    // Sound initialization failed - non-critical
  }
}

function hideCelebration(): void {
  celebrationOverlay?.classList.remove('visible');
}

// ============================================================================
// PROGRESS PANEL
// ============================================================================

function createProgressPanel(): void {
  progressPanel = document.createElement('aside');
  progressPanel.className = 'journey-panel';
  progressPanel.setAttribute('role', 'dialog');
  progressPanel.setAttribute('aria-modal', 'true');
  progressPanel.setAttribute('aria-labelledby', 'journey-title');
  
  progressPanel.innerHTML = `
    <div class="journey-backdrop"></div>
    <div class="journey-card">
      <header class="journey-header">
        <div class="journey-header-text">
          <span class="journey-eyebrow">Your journey</span>
          <h2 class="journey-title" id="journey-title">Growing together</h2>
        </div>
        <button class="journey-close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>
      <div class="journey-content">
        <!-- Current Stage -->
        <section class="current-stage-section">
          <div class="stage-icon">${ICONS.leaf}</div>
          <div class="stage-info">
            <p class="stage-label">Current stage</p>
            <p class="stage-name"></p>
            <p class="stage-tagline"></p>
          </div>
        </section>
        
        <p class="stage-description"></p>
        
        <!-- Progress -->
        <section class="progress-section">
          <div class="progress-header">
            <span class="progress-label">Progress to next stage</span>
            <span class="progress-next"></span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
          <p class="progress-requirement"></p>
        </section>
        
        <!-- Stats -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon">${ICONS.messageCircle}</div>
            <p class="stat-value conversations-count">0</p>
            <p class="stat-label">Conversations</p>
          </div>
          <div class="stat-card">
            <div class="stat-icon">${ICONS.calendar}</div>
            <p class="stat-value days-together">0</p>
            <p class="stat-label">Days together</p>
          </div>
          <div class="stat-card">
            <div class="stat-icon">${ICONS.trophy}</div>
            <p class="stat-value current-streak">0</p>
            <p class="stat-label">Day streak</p>
          </div>
        </div>
        
        <!-- Memories -->
        <section class="memories-section">
          <div class="memories-header">
            <span class="memories-icon">${ICONS.sparkles}</span>
            <h3 class="memories-title">Moments we share</h3>
          </div>
          <div class="memories-filters">
            <button class="memory-filter memory-filter--active" data-filter="all">All</button>
            <button class="memory-filter" data-filter="stage-up">Milestones</button>
            <button class="memory-filter" data-filter="streak-milestone">Streaks</button>
            <button class="memory-filter" data-filter="insight">Insights</button>
          </div>
          <div class="memories-list"></div>
        </section>
      </div>
    </div>
  `;
  
  document.body.appendChild(progressPanel);
  
  // Close handlers
  progressPanel.querySelector('.journey-backdrop')?.addEventListener('click', hideProgressPanel);
  progressPanel.querySelector('.journey-close')?.addEventListener('click', hideProgressPanel);
  
  // Memory filter handlers
  progressPanel.querySelectorAll('.memory-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      const filterType = (btn as HTMLElement).dataset.filter || 'all';
      
      // Update active state
      progressPanel?.querySelectorAll('.memory-filter').forEach(b => 
        b.classList.remove('memory-filter--active')
      );
      btn.classList.add('memory-filter--active');
      
      // Filter memories
      updateMemoriesDisplay(filterType);
    });
  });
  
  // Escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && progressPanel?.classList.contains('visible')) {
      hideProgressPanel();
    }
  };
  document.addEventListener('keydown', handleEscape);
  cleanupFns.push(() => document.removeEventListener('keydown', handleEscape));
}

export function showProgressPanel(): void {
  if (!progressPanel) return;
  
  updateProgressPanel();
  progressPanel.classList.add('visible');
  
  // Focus management for accessibility
  const closeBtn = progressPanel.querySelector('.journey-close') as HTMLElement;
  closeBtn?.focus();
}

export function hideProgressPanel(): void {
  progressPanel?.classList.remove('visible');
}

export function toggleProgressPanel(): void {
  if (progressPanel?.classList.contains('visible')) {
    hideProgressPanel();
  } else {
    showProgressPanel();
  }
}

function updateProgressPanel(): void {
  if (!progressPanel) return;
  
  const stage = relationshipStageService.getStage();
  const metrics = relationshipStageService.getMetrics();
  const progress = relationshipStageService.getProgressToNextStage();
  const stageInfo = STAGE_DESCRIPTIONS[stage] ?? STAGE_DESCRIPTIONS['first-meeting']!;
  
  // Update stage info
  const stageName = progressPanel.querySelector('.stage-name');
  const stageTagline = progressPanel.querySelector('.stage-tagline');
  const stageDesc = progressPanel.querySelector('.stage-description');
  
  if (stageName) stageName.textContent = STAGE_NAMES[stage];
  if (stageTagline) stageTagline.textContent = stageInfo?.tagline ?? 'Just getting started';
  if (stageDesc) stageDesc.textContent = `"${stageInfo?.description ?? 'Every great friendship starts somewhere.'}"`;
  
  
  // Update progress
  const progressFill = progressPanel.querySelector('.progress-fill') as HTMLElement;
  const progressNext = progressPanel.querySelector('.progress-next');
  const progressReq = progressPanel.querySelector('.progress-requirement');
  
  if (progressFill) {
    progressFill.style.width = `${Math.round(progress.progress * 100)}%`;
  }
  if (progressNext) {
    progressNext.textContent = progress.nextStage ? `Next: ${STAGE_NAMES[progress.nextStage]}` : 'Max level!';
  }
  if (progressReq) {
    progressReq.textContent = progress.nextStage 
      ? progress.requirement 
      : 'You have reached the deepest level of partnership.';
  }
  
  // Update stats
  const convoCount = progressPanel.querySelector('.conversations-count');
  const daysCount = progressPanel.querySelector('.days-together');
  const streakCount = progressPanel.querySelector('.current-streak');
  
  if (convoCount) convoCount.textContent = String(metrics.totalConversations);
  if (daysCount) daysCount.textContent = String(metrics.daysSinceFirstMeeting);
  if (streakCount) streakCount.textContent = String(metrics.currentStreak);
  
  // Update memories using the filter display (default to "all")
  updateMemoriesDisplay('all');
  
  // Reset filter buttons to "all" active
  progressPanel.querySelectorAll('.memory-filter').forEach(btn => {
    const isAll = (btn as HTMLElement).dataset.filter === 'all';
    btn.classList.toggle('memory-filter--active', isAll);
  });
}

function getMemoryIcon(type: RelationshipMemory['type']): string {
  const icons: Record<RelationshipMemory['type'], string> = {
    'stage-up': ICONS.arrowUp,
    'streak-milestone': ICONS.flame,
    'comeback': ICONS.hand,
    'first-conversation': ICONS.stars,
    'insight': ICONS.lightbulb,
  };
  return icons[type] || ICONS.heart;
}

function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Update the memories display based on filter
 */
function updateMemoriesDisplay(filterType: string): void {
  if (!progressPanel) return;
  
  const memoriesList = progressPanel.querySelector('.memories-list');
  if (!memoriesList) return;
  
  const allMemories = relationshipStageService.getMemories();
  
  // Filter if not "all", then take up to 10
  const memories = (filterType !== 'all' 
    ? allMemories.filter(mem => mem.type === filterType) 
    : allMemories
  ).slice(0, 10);
  
  if (memories.length === 0) {
    const emptyMessage = filterType === 'all' 
      ? 'Our memories will appear here as we journey together.'
      : `No ${getFilterLabel(filterType).toLowerCase()} yet. Keep going!`;
    
    memoriesList.innerHTML = `
      <div class="no-memories">
        <div class="no-memories-icon">${ICONS.heart}</div>
        <p class="no-memories-text">${emptyMessage}</p>
      </div>
    `;
  } else {
    memoriesList.innerHTML = memories.map((mem, i) => `
      <div class="memory-item memory-item--${mem.type}" style="animation-delay: ${i * 50}ms">
        <div class="memory-icon-wrapper">${getMemoryIcon(mem.type)}</div>
        <div class="memory-content">
          <p class="memory-title">${escapeHtml(mem.title)}</p>
          <p class="memory-description">${escapeHtml(mem.description)}</p>
          <p class="memory-date">${formatDate(mem.timestamp)}</p>
        </div>
      </div>
    `).join('');
  }
}

/**
 * Get human-readable filter label
 */
function getFilterLabel(filterType: string): string {
  const labels: Record<string, string> = {
    'all': 'All',
    'stage-up': 'Milestones',
    'streak-milestone': 'Streaks',
    'insight': 'Insights',
    'comeback': 'Returns',
    'first-conversation': 'Firsts',
  };
  return labels[filterType] || filterType;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  cleanupFns.forEach(fn => fn());
  cleanupFns.length = 0;
  
  celebrationOverlay?.remove();
  progressPanel?.remove();
  styleElement?.remove();
  
  celebrationOverlay = null;
  progressPanel = null;
  styleElement = null;
  isInitialized = false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const relationshipProgressUI = {
  init: initRelationshipProgressUI,
  showCelebration,
  showProgress: showProgressPanel,
  hideProgress: hideProgressPanel,
  toggleProgress: toggleProgressPanel,
  dispose,
};

// Also export for compatibility with app.ts
export function getRelationshipProgressUI() {
  return {
    show: showProgressPanel,
    hide: hideProgressPanel,
    toggle: toggleProgressPanel,
  };
}
