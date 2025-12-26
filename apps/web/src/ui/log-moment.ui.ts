/**
 * Log a Moment UI
 *
 * Quick-capture form for recording interactions with people you care about.
 * Every call, text, coffee date, and hangout becomes part of your story together.
 *
 * Design Philosophy:
 * - Fast capture: Get the moment logged in seconds
 * - Smart defaults: Pre-fill what we can
 * - Optional depth: Add details if you want, skip if you don't
 *
 * @module ui/log-moment
 */

import { createLogger } from '../utils/logger.js';
import { toast } from './toast.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiFetch } from '../utils/api-helpers.js';

const log = createLogger('LogMomentUI');

// ============================================================================
// TYPES
// ============================================================================

export type MomentType =
  | 'call'
  | 'text'
  | 'email'
  | 'video_call'
  | 'voice_message'
  | 'hangout'
  | 'dinner'
  | 'coffee'
  | 'activity'
  | 'trip'
  | 'visit'
  | 'meeting'
  | 'social'
  | 'other';

export interface LogMomentData {
  contactId: string;
  contactName: string;
  type: MomentType;
  direction: 'outbound' | 'inbound' | 'mutual';
  date: string; // ISO date string
  duration?: number; // minutes
  summary?: string;
  topics?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  platform?: string;
}

export interface LogMomentOptions {
  contactId: string;
  contactName: string;
  preselectedType?: MomentType;
  onSuccess?: (data: LogMomentData) => void;
  onClose?: () => void;
}

// ============================================================================
// STATE
// ============================================================================

interface LogMomentState {
  isOpen: boolean;
  contactId: string;
  contactName: string;
  selectedType: MomentType;
  direction: 'outbound' | 'inbound' | 'mutual';
  date: string;
  time: string;
  duration: string;
  summary: string;
  topics: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  platform: string;
  isSubmitting: boolean;
  showAdvanced: boolean;
}

let state: LogMomentState = {
  isOpen: false,
  contactId: '',
  contactName: '',
  selectedType: 'call',
  direction: 'outbound',
  date: new Date().toISOString().split('T')[0],
  time: new Date().toTimeString().slice(0, 5),
  duration: '',
  summary: '',
  topics: '',
  sentiment: 'positive',
  platform: '',
  isSubmitting: false,
  showAdvanced: false,
};

let modalContainer: HTMLElement | null = null;
let callbacks: { onSuccess?: (data: LogMomentData) => void; onClose?: () => void } = {};

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  phone: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  message: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  mail: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  video: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`,
  mic: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`,
  coffee: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>`,
  utensils: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>`,
  users: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  plane: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`,
  home: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  calendar: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  share: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>`,
  more: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
  arrowUp: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>`,
  arrowDown: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`,
  arrowsUpDown: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>`,
  chevronDown: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  check: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
};

// Moment type definitions
const MOMENT_TYPES: { id: MomentType; label: string; icon: string }[] = [
  { id: 'call', label: 'Call', icon: ICONS.phone },
  { id: 'text', label: 'Text', icon: ICONS.message },
  { id: 'email', label: 'Email', icon: ICONS.mail },
  { id: 'video_call', label: 'Video', icon: ICONS.video },
  { id: 'voice_message', label: 'Voice', icon: ICONS.mic },
  { id: 'coffee', label: 'Coffee', icon: ICONS.coffee },
  { id: 'dinner', label: 'Meal', icon: ICONS.utensils },
  { id: 'hangout', label: 'Hangout', icon: ICONS.users },
  { id: 'activity', label: 'Activity', icon: ICONS.users },
  { id: 'trip', label: 'Trip', icon: ICONS.plane },
  { id: 'visit', label: 'Visit', icon: ICONS.home },
  { id: 'meeting', label: 'Meeting', icon: ICONS.calendar },
  { id: 'social', label: 'Social', icon: ICONS.share },
  { id: 'other', label: 'Other', icon: ICONS.more },
];

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('log-moment-styles')) return;

  const style = document.createElement('style');
  style.id = 'log-moment-styles';
  style.textContent = `
    /* =========================================================================
       LOG A MOMENT - Quick Interaction Capture
       ========================================================================= */
    
    .log-moment-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }

    .log-moment-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .log-moment-backdrop {
      position: absolute;
      inset: 0;
      background: var(--glass-backdrop-bg, rgba(44, 37, 32, 0.4));
      backdrop-filter: blur(var(--glass-blur-thick, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
    }

    .log-moment-modal {
      position: relative;
      width: 94%;
      max-width: clamp(308px, 90vw, 440px);
      max-height: 90vh;
      /* Glass modal styling */
      background: var(--glass-thick-bg, rgba(255, 255, 255, 0.12));
      backdrop-filter: blur(var(--glass-blur-thick, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
      border: 1px solid var(--glass-thick-border, rgba(255, 255, 255, 0.14));
      border-radius: var(--radius-xl, 20px);
      box-shadow: var(--glass-shadow-thick, 0 8px 12px rgba(0, 0, 0, 0.10), 0 16px 32px rgba(0, 0, 0, 0.08));
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.96) translateY(8px);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    @supports not (backdrop-filter: blur(1px)) {
      .log-moment-modal {
        background: var(--color-background-elevated, #FFFDFB);
      }
    }

    .log-moment-overlay.open .log-moment-modal {
      transform: scale(1) translateY(0);
    }

    /* =========================================================================
       HEADER
       ========================================================================= */
    
    .lm-header {
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem) var(--space-4, 1rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
    }

    .lm-header-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
    }

    .lm-eyebrow {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 0.25rem);
    }

    .lm-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
      line-height: 1.2;
    }

    .lm-subtitle {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4a42);
      margin-top: var(--space-1, 0.25rem);
    }

    .lm-close {
      width: var(--space-10, 2.5rem);
      height: var(--space-10, 2.5rem);
      border: none;
      background: transparent;
      border-radius: var(--radius-full, 50%);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted, #70605a);
      transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
      margin: calc(-1 * var(--space-2, 0.5rem)) calc(-1 * var(--space-2, 0.5rem)) 0 0;
    }

    .lm-close:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      color: var(--color-text-primary, #2C2520);
    }

    /* =========================================================================
       CONTENT
       ========================================================================= */
    
    .lm-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
    }

    .lm-section {
      margin-bottom: var(--space-5, 1.25rem);
    }

    .lm-section:last-child {
      margin-bottom: 0;
    }

    .lm-label {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.03em;
      color: var(--color-text-muted, #70605a);
      margin-bottom: var(--space-2, 0.5rem);
      display: block;
    }

    /* =========================================================================
       TYPE SELECTOR
       ========================================================================= */
    
    .lm-types {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: var(--space-2, 0.5rem);
    }

    .lm-type {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1, 0.25rem);
      padding: var(--space-2-5, 0.625rem) var(--space-1, 0.25rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-lg, 1rem);
      background: transparent;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .lm-type:hover {
      border-color: var(--color-text-muted, #70605a);
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.03));
    }

    .lm-type.selected {
      border-color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
    }

    .lm-type-icon {
      color: var(--color-text-muted, #70605a);
      transition: color ${DURATION.FAST}ms;
    }

    .lm-type.selected .lm-type-icon {
      color: var(--persona-primary, #4a6741);
    }

    .lm-type-icon svg {
      width: 20px;
      height: 20px;
    }

    .lm-type-label {
      font-size: var(--text-xxs, 0.625rem);
      font-weight: 500;
      color: var(--color-text-muted, #70605a);
      transition: color ${DURATION.FAST}ms;
    }

    .lm-type.selected .lm-type-label {
      color: var(--persona-primary, #4a6741);
      font-weight: 600;
    }

    /* =========================================================================
       DIRECTION SELECTOR
       ========================================================================= */
    
    .lm-directions {
      display: flex;
      gap: var(--space-2, 0.5rem);
    }

    .lm-direction {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-1-5, 0.375rem);
      padding: var(--space-2-5, 0.625rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-lg, 1rem);
      background: transparent;
      cursor: pointer;
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      color: var(--color-text-muted, #70605a);
      transition: all ${DURATION.FAST}ms;
    }

    .lm-direction:hover {
      border-color: var(--color-text-muted, #70605a);
    }

    .lm-direction.selected {
      border-color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
      color: var(--persona-primary, #4a6741);
    }

    .lm-direction svg {
      width: 16px;
      height: 16px;
    }

    /* =========================================================================
       DATE/TIME
       ========================================================================= */
    
    .lm-datetime {
      display: flex;
      gap: var(--space-3, 0.75rem);
    }

    .lm-datetime-field {
      flex: 1;
    }

    .lm-input {
      width: 100%;
      padding: var(--space-2-5, 0.625rem) var(--space-3, 0.75rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      background: var(--color-background-elevated, #FFFDFB);
      color: var(--color-text-primary, #2C2520);
      outline: none;
      transition: border-color ${DURATION.FAST}ms, box-shadow ${DURATION.FAST}ms;
    }

    .lm-input:focus {
      border-color: var(--persona-primary, #4a6741);
      box-shadow: 0 0 0 3px var(--color-utility-focus-ring-subtle);
    }

    .lm-input::placeholder {
      color: var(--color-text-muted, #70605a);
    }

    /* =========================================================================
       SUMMARY TEXTAREA
       ========================================================================= */
    
    .lm-textarea {
      width: 100%;
      min-height: 80px;
      padding: var(--space-3, 0.75rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      font-family: inherit;
      background: var(--color-background-elevated, #FFFDFB);
      color: var(--color-text-primary, #2C2520);
      outline: none;
      resize: vertical;
      transition: border-color ${DURATION.FAST}ms, box-shadow ${DURATION.FAST}ms;
    }

    .lm-textarea:focus {
      border-color: var(--persona-primary, #4a6741);
      box-shadow: 0 0 0 3px var(--color-utility-focus-ring-subtle);
    }

    .lm-textarea::placeholder {
      color: var(--color-text-muted, #70605a);
    }

    /* =========================================================================
       ADVANCED OPTIONS
       ========================================================================= */
    
    .lm-advanced-toggle {
      display: flex;
      align-items: center;
      gap: var(--space-1, 0.25rem);
      padding: 0;
      border: none;
      background: none;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      cursor: pointer;
      transition: color ${DURATION.FAST}ms;
    }

    .lm-advanced-toggle:hover {
      color: var(--persona-primary, #4a6741);
    }

    .lm-advanced-toggle svg {
      transition: transform ${DURATION.FAST}ms;
    }

    .lm-advanced-toggle.open svg {
      transform: rotate(180deg);
    }

    .lm-advanced-content {
      display: none;
      margin-top: var(--space-4, 1rem);
    }

    .lm-advanced-content.open {
      display: block;
    }

    /* =========================================================================
       SENTIMENT SELECTOR
       ========================================================================= */
    
    .lm-sentiments {
      display: flex;
      gap: var(--space-2, 0.5rem);
    }

    .lm-sentiment {
      flex: 1;
      padding: var(--space-2, 0.5rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-lg, 1rem);
      background: transparent;
      cursor: pointer;
      font-size: var(--text-sm, 0.875rem);
      text-align: center;
      transition: all ${DURATION.FAST}ms;
    }

    .lm-sentiment:hover {
      border-color: var(--color-text-muted, #70605a);
    }

    .lm-sentiment.selected {
      border-color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
    }

    .lm-sentiment.positive.selected {
      border-color: var(--persona-primary, #4a6741);
      color: var(--persona-primary, #4a6741);
    }

    .lm-sentiment.neutral.selected {
      border-color: var(--color-text-muted, #70605a);
      color: var(--color-text-secondary, #5a4a42);
    }

    .lm-sentiment.negative.selected {
      border-color: var(--color-semantic-error, #c44);
      color: var(--color-semantic-error, #c44);
    }

    /* =========================================================================
       FOOTER
       ========================================================================= */
    
    .lm-footer {
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
      border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      display: flex;
      gap: var(--space-3, 0.75rem);
    }

    .lm-btn {
      flex: 1;
      padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .lm-btn-secondary {
      background: var(--tonal-surface-2);
      border: none;
      color: var(--color-text-secondary, #5a4a42);
    }

    .lm-btn-secondary:hover {
      background: var(--tonal-surface-3);
    }

    .lm-btn-secondary:active {
      background: var(--tonal-surface-active);
    }

    .lm-btn-primary {
      background: var(--persona-primary, #4a6741);
      border: 1px solid var(--persona-primary, #4a6741);
      color: white;
    }

    .lm-btn-primary:hover {
      background: var(--persona-secondary, #3d5a35);
      border-color: var(--persona-secondary, #3d5a35);
    }

    .lm-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .lm-btn svg {
      width: 18px;
      height: 18px;
      margin-right: var(--space-1, 0.25rem);
    }

    /* =========================================================================
       RESPONSIVE
       ========================================================================= */
    
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .log-moment-modal {
        width: 100%;
        max-width: none;
        max-height: 95vh;
        border-radius: var(--radius-xl, 1.25rem) var(--radius-xl, 1.25rem) 0 0;
        margin-top: auto;
      }

      .lm-types {
        grid-template-columns: repeat(4, 1fr);
      }
    }

    /* =========================================================================
       REDUCED MOTION
       ========================================================================= */
    
    @media (prefers-reduced-motion: reduce) {
      .log-moment-overlay,
      .log-moment-modal,
      .lm-type,
      .lm-direction,
      .lm-sentiment,
      .lm-btn,
      .lm-close {
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// RENDER
// ============================================================================

function render(): void {
  if (!modalContainer) return;

  const modal = modalContainer.querySelector('.log-moment-modal');
  if (!modal) return;

  modal.innerHTML = `
    <div class="lm-header">
      <div class="lm-header-row">
        <div>
          <div class="lm-eyebrow">Log a Moment</div>
          <h2 class="lm-title">with ${escapeHtml(state.contactName)}</h2>
        </div>
        <button class="lm-close" aria-label="Close">${ICONS.close}</button>
      </div>
    </div>
    
    <div class="lm-content">
      <!-- Type Selector -->
      <div class="lm-section">
        <label class="lm-label">What happened?</label>
        <div class="lm-types">
          ${MOMENT_TYPES.map(type => `
            <button class="lm-type ${state.selectedType === type.id ? 'selected' : ''}" data-type="${type.id}">
              <span class="lm-type-icon">${type.icon}</span>
              <span class="lm-type-label">${type.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
      
      <!-- Direction Selector -->
      <div class="lm-section">
        <label class="lm-label">Who initiated?</label>
        <div class="lm-directions">
          <button aria-label="Move up" class="lm-direction ${state.direction === 'outbound' ? 'selected' : ''}" data-direction="outbound">
            ${ICONS.arrowUp} You reached out
          </button>
          <button aria-label="Move down" class="lm-direction ${state.direction === 'inbound' ? 'selected' : ''}" data-direction="inbound">
            ${ICONS.arrowDown} They reached out
          </button>
          <button aria-label="Together" class="lm-direction ${state.direction === 'mutual' ? 'selected' : ''}" data-direction="mutual">
            ${ICONS.arrowsUpDown} Together
          </button>
        </div>
      </div>
      
      <!-- Date/Time -->
      <div class="lm-section">
        <label class="lm-label">When?</label>
        <div class="lm-datetime">
          <div class="lm-datetime-field">
            <input type="date" class="lm-input" id="lm-date" value="${state.date}" />
          </div>
          <div class="lm-datetime-field">
            <input type="time" class="lm-input" id="lm-time" value="${state.time}" />
          </div>
        </div>
      </div>
      
      <!-- Quick Summary -->
      <div class="lm-section">
        <label class="lm-label">Quick note (optional)</label>
        <textarea class="lm-textarea" id="lm-summary" placeholder="What did you talk about? How did it go?">${escapeHtml(state.summary)}</textarea>
      </div>
      
      <!-- Advanced Options Toggle -->
      <div class="lm-section">
        <button aria-label="Move down" class="lm-advanced-toggle ${state.showAdvanced ? 'open' : ''}" id="lm-advanced-toggle">
          More options ${ICONS.chevronDown}
        </button>
        
        <div class="lm-advanced-content ${state.showAdvanced ? 'open' : ''}" id="lm-advanced-content">
          <!-- Sentiment -->
          <div style="margin-bottom: var(--space-4, 1rem);">
            <label class="lm-label">How did it feel?</label>
            <div class="lm-sentiments">
              <button aria-label="Great" class="lm-sentiment positive ${state.sentiment === 'positive' ? 'selected' : ''}" data-sentiment="positive">
                Great
              </button>
              <button aria-label="Okay" class="lm-sentiment neutral ${state.sentiment === 'neutral' ? 'selected' : ''}" data-sentiment="neutral">
                Okay
              </button>
              <button aria-label="Tough" class="lm-sentiment negative ${state.sentiment === 'negative' ? 'selected' : ''}" data-sentiment="negative">
                Tough
              </button>
            </div>
          </div>
          
          <!-- Duration -->
          <div style="margin-bottom: var(--space-4, 1rem);">
            <label class="lm-label">Duration (minutes)</label>
            <input type="number" class="lm-input" id="lm-duration" placeholder="e.g., 30" value="${state.duration}" />
          </div>
          
          <!-- Topics -->
          <div>
            <label class="lm-label">Topics discussed (comma-separated)</label>
            <input type="text" class="lm-input" id="lm-topics" placeholder="e.g., work, family, travel plans" value="${state.topics}" />
          </div>
        </div>
      </div>
    </div>
    
    <div class="lm-footer">
      <button aria-label="Cancel" class="lm-btn lm-btn-secondary" id="lm-cancel">Cancel</button>
      <button aria-label="Submit" class="lm-btn lm-btn-primary" id="lm-save" ${state.isSubmitting ? 'disabled' : ''}>
        ${state.isSubmitting ? 'Saving...' : 'Save Moment'}
      </button>
    </div>
  `;

  bindEvents();
}

// ============================================================================
// EVENT BINDING
// ============================================================================

function bindEvents(): void {
  if (!modalContainer) return;

  // Close
  modalContainer.querySelector('.lm-close')?.addEventListener('click', closeLogMoment);
  modalContainer.querySelector('.log-moment-backdrop')?.addEventListener('click', closeLogMoment);
  modalContainer.querySelector('#lm-cancel')?.addEventListener('click', closeLogMoment);

  // Type selection
  modalContainer.querySelectorAll('.lm-type').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-type') as MomentType;
      if (type) {
        state.selectedType = type;
        render();
      }
    });
  });

  // Direction selection
  modalContainer.querySelectorAll('.lm-direction').forEach(btn => {
    btn.addEventListener('click', () => {
      const direction = btn.getAttribute('data-direction') as LogMomentState['direction'];
      if (direction) {
        state.direction = direction;
        render();
      }
    });
  });

  // Sentiment selection
  modalContainer.querySelectorAll('.lm-sentiment').forEach(btn => {
    btn.addEventListener('click', () => {
      const sentiment = btn.getAttribute('data-sentiment') as LogMomentState['sentiment'];
      if (sentiment) {
        state.sentiment = sentiment;
        render();
      }
    });
  });

  // Advanced toggle
  modalContainer.querySelector('#lm-advanced-toggle')?.addEventListener('click', () => {
    state.showAdvanced = !state.showAdvanced;
    render();
  });

  // Input fields
  const dateInput = modalContainer.querySelector('#lm-date') as HTMLInputElement;
  const timeInput = modalContainer.querySelector('#lm-time') as HTMLInputElement;
  const summaryInput = modalContainer.querySelector('#lm-summary') as HTMLTextAreaElement;
  const durationInput = modalContainer.querySelector('#lm-duration') as HTMLInputElement;
  const topicsInput = modalContainer.querySelector('#lm-topics') as HTMLInputElement;

  dateInput?.addEventListener('change', (e) => { state.date = (e.target as HTMLInputElement).value; });
  timeInput?.addEventListener('change', (e) => { state.time = (e.target as HTMLInputElement).value; });
  summaryInput?.addEventListener('input', (e) => { state.summary = (e.target as HTMLTextAreaElement).value; });
  durationInput?.addEventListener('input', (e) => { state.duration = (e.target as HTMLInputElement).value; });
  topicsInput?.addEventListener('input', (e) => { state.topics = (e.target as HTMLInputElement).value; });

  // Save button
  modalContainer.querySelector('#lm-save')?.addEventListener('click', () => { void handleSave(); });

  // Escape key
  document.addEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && state.isOpen) {
    closeLogMoment();
  }
}

// ============================================================================
// SAVE HANDLER
// ============================================================================

async function handleSave(): Promise<void> {
  if (state.isSubmitting) return;

  state.isSubmitting = true;
  render();

  try {
    // Build the data
    const dateTime = new Date(`${state.date}T${state.time}`);
    
    const data: LogMomentData = {
      contactId: state.contactId,
      contactName: state.contactName,
      type: state.selectedType,
      direction: state.direction,
      date: dateTime.toISOString(),
      sentiment: state.sentiment,
    };

    if (state.duration) {
      data.duration = parseInt(state.duration, 10);
    }

    if (state.summary.trim()) {
      data.summary = state.summary.trim();
    }

    if (state.topics.trim()) {
      data.topics = state.topics.split(',').map(t => t.trim()).filter(Boolean);
    }

    // Send to API
    const response = await apiFetch(`/api/contacts/${state.contactId}/interaction`, {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (response.ok) {
      toast.success('Moment saved!');
      
      if (callbacks.onSuccess) {
        callbacks.onSuccess(data);
      }
      
      closeLogMoment();
    } else {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      toast.error(error.error || 'Could not save moment');
      state.isSubmitting = false;
      render();
    }
  } catch (error) {
    log.error('Failed to save moment:', error);
    toast.error('Could not save moment');
    state.isSubmitting = false;
    render();
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the Log a Moment modal
 */
export function openLogMoment(options: LogMomentOptions): void {
  // Cleanup any existing modal
  closeLogMoment();
  
  injectStyles();

  // Reset state
  state = {
    isOpen: true,
    contactId: options.contactId,
    contactName: options.contactName,
    selectedType: options.preselectedType || 'call',
    direction: 'outbound',
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().slice(0, 5),
    duration: '',
    summary: '',
    topics: '',
    sentiment: 'positive',
    platform: '',
    isSubmitting: false,
    showAdvanced: false,
  };

  callbacks = {
    onSuccess: options.onSuccess,
    onClose: options.onClose,
  };

  // Create container
  modalContainer = document.createElement('div');
  modalContainer.className = 'log-moment-overlay';
  modalContainer.innerHTML = `
    <div class="log-moment-backdrop"></div>
    <div class="log-moment-modal" role="dialog" aria-modal="true" aria-label="Log a moment">
    </div>
  `;
  document.body.appendChild(modalContainer);

  // Render content
  render();

  // Animate in
  requestAnimationFrame(() => {
    modalContainer?.classList.add('open');
  });

  log.info({ contactId: options.contactId }, 'Opened Log a Moment');
}

/**
 * Close the Log a Moment modal
 */
export function closeLogMoment(): void {
  if (!modalContainer) return;

  document.removeEventListener('keydown', handleEscapeKey);

  modalContainer.classList.remove('open');

  setTimeout(() => {
    modalContainer?.remove();
    modalContainer = null;
    
    if (callbacks.onClose) {
      callbacks.onClose();
    }
    callbacks = {};
  }, DURATION.NORMAL);

  state.isOpen = false;
  log.info('Closed Log a Moment');
}

// Export for use in other modules
export const logMoment = {
  open: openLogMoment,
  close: closeLogMoment,
};

export default logMoment;

