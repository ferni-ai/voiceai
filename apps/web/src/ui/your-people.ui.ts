/**
 * Your People UI
 *
 * "Better Than Human" relationship management hub.
 * See everyone you care about at a glance, with intelligent nudges.
 *
 * This replaces the old "Contacts" panel with a relationship-centric view.
 * Each person opens a Relationship Card with their full story.
 *
 * @module ui/your-people
 */

import { createLogger } from '../utils/logger.js';
import { toast } from './toast.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiFetch } from '../utils/api-helpers.js';
import { openRelationshipCard } from './relationship-card.ui.js';
import { openAddPerson } from './add-person.ui.js';
import { openRelationshipInsights } from './relationship-insights.ui.js';
import { openImportContacts } from './import-contacts.ui.js';
import { shouldUseDemoData } from '../utils/environment.js';
import { getAllMockContacts, MOCK_NUDGES, addMockContact } from '../data/mock-contacts.js';

const log = createLogger('YourPeopleUI');

// ============================================================================
// TYPES
// ============================================================================

interface Person {
  id: string;
  contactId: string;
  name: string;
  email?: string;
  phone?: string;
  relationship?: string;
  strengthScore?: number;
  strengthTrend?: 'growing' | 'stable' | 'fading';
  lastInteraction?: Date | string;
  daysSinceContact?: number;
  upcomingDate?: {
    type: string;
    label?: string;
    daysUntil: number;
  };
  needsAttention?: boolean;
  groups?: string[];
}

interface Nudge {
  id: string;
  contactId: string;
  contactName: string;
  type: 'reconnect' | 'birthday' | 'anniversary' | 'custom';
  priority: 'high' | 'medium' | 'low';
  message: string;
  daysUntil?: number;
}

interface PersonGroup {
  id: string;
  name: string;
  memberCount: number;
}

// ============================================================================
// STATE
// ============================================================================

interface YourPeopleState {
  isOpen: boolean;
  isLoading: boolean;
  people: Person[];
  nudges: Nudge[];
  groups: PersonGroup[];
  searchQuery: string;
  activeFilter: 'all' | 'attention' | 'recent';
}

let state: YourPeopleState = {
  isOpen: false,
  isLoading: false,
  people: [],
  nudges: [],
  groups: [],
  searchQuery: '',
  activeFilter: 'all',
};

let panelContainer: HTMLElement | null = null;
let previouslyFocusedElement: HTMLElement | null = null;

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  search: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  plus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
  users: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  heart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  clock: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  alertCircle: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
  calendar: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  trendUp: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  trendDown: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>`,
  chevronRight: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  sparkles: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/></svg>`,
  chart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`,
  upload: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
};

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('your-people-styles')) return;

  const style = document.createElement('style');
  style.id = 'your-people-styles';
  style.textContent = `
    /* =========================================================================
       YOUR PEOPLE - Relationship Hub
       ========================================================================= */
    
    .your-people-overlay {
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

    .your-people-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .your-people-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy, rgba(44, 37, 32, 0.5));
      backdrop-filter: blur(var(--glass-blur-strong, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-strong, 24px));
    }

    .your-people-panel {
      position: relative;
      width: 94%;
      max-width: 560px;
      max-height: 85vh;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.96) translateY(8px);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .your-people-overlay.open .your-people-panel {
      transform: scale(1) translateY(0);
    }

    /* =========================================================================
       HEADER
       ========================================================================= */
    
    .yp-header {
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
    }

    .yp-header-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: var(--space-4, 1rem);
    }

    .yp-header-text {
      flex: 1;
    }

    .yp-eyebrow {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 0.25rem);
    }

    .yp-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-2xl, 1.5rem);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
      line-height: 1.2;
    }

    .yp-header-actions {
      display: flex;
      align-items: center;
      gap: var(--space-1, 0.25rem);
    }

    .yp-action-btn {
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
    }

    .yp-action-btn:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      color: var(--persona-primary, #4a6741);
    }

    .yp-action-btn:focus-visible {
      outline: 2px solid var(--persona-primary, #4a6741);
      outline-offset: 2px;
    }

    .yp-close {
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
    }

    .yp-close:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      color: var(--color-text-primary, #2C2520);
    }

    .yp-close:focus-visible {
      outline: 2px solid var(--persona-primary, #4a6741);
      outline-offset: 2px;
    }

    /* Search */
    .yp-search {
      position: relative;
    }

    .yp-search-icon {
      position: absolute;
      left: var(--space-3, 0.75rem);
      top: 50%;
      transform: translateY(-50%);
      color: var(--color-text-muted, #70605a);
      pointer-events: none;
    }

    .yp-search-icon svg {
      width: 18px;
      height: 18px;
    }

    .yp-search-input {
      width: 100%;
      padding: var(--space-2-5, 0.625rem) var(--space-3, 0.75rem) var(--space-2-5, 0.625rem) var(--space-10, 2.5rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      background: var(--color-background-elevated, #FFFDFB);
      color: var(--color-text-primary, #2C2520);
      outline: none;
      transition: border-color ${DURATION.FAST}ms, box-shadow ${DURATION.FAST}ms;
    }

    .yp-search-input:focus {
      border-color: var(--persona-primary, #4a6741);
      box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.1);
    }

    .yp-search-input::placeholder {
      color: var(--color-text-muted, #70605a);
    }

    /* Filters */
    .yp-filters {
      display: flex;
      gap: var(--space-2, 0.5rem);
      margin-top: var(--space-3, 0.75rem);
    }

    .yp-filter {
      padding: var(--space-1-5, 0.375rem) var(--space-3, 0.75rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-full, 50%);
      background: transparent;
      font-size: var(--text-xs, 0.75rem);
      font-weight: 500;
      color: var(--color-text-muted, #70605a);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .yp-filter:hover {
      border-color: var(--color-text-muted, #70605a);
      color: var(--color-text-secondary, #5a4a42);
    }

    .yp-filter.active {
      background: var(--persona-primary, #4a6741);
      border-color: var(--persona-primary, #4a6741);
      color: white;
    }

    .yp-filter:focus-visible {
      outline: 2px solid var(--persona-primary, #4a6741);
      outline-offset: 2px;
    }

    /* =========================================================================
       NUDGES SECTION (Who needs your attention)
       ========================================================================= */
    
    .yp-nudges {
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
      background: var(--persona-tint, rgba(74, 103, 65, 0.04));
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.06));
    }

    .yp-nudges-header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      margin-bottom: var(--space-3, 0.75rem);
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--persona-primary, #4a6741);
    }

    .yp-nudges-header svg {
      width: 16px;
      height: 16px;
    }

    .yp-nudge {
      display: flex;
      align-items: center;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-3, 0.75rem);
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-lg, 1rem);
      margin-bottom: var(--space-2, 0.5rem);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
      border: 1px solid transparent;
    }

    .yp-nudge:hover,
    .yp-nudge:focus {
      border-color: var(--persona-primary, #4a6741);
      outline: none;
    }

    .yp-nudge:focus-visible {
      box-shadow: 0 0 0 2px var(--persona-primary, #4a6741);
    }

    .yp-nudge:last-child {
      margin-bottom: 0;
    }

    .yp-nudge-avatar {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-full, 50%);
      background: linear-gradient(
        135deg,
        var(--persona-primary, #4a6741),
        var(--persona-secondary, #3d5a35)
      );
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: var(--text-sm, 0.875rem);
      flex-shrink: 0;
    }

    .yp-nudge-content {
      flex: 1;
      min-width: 0;
    }

    .yp-nudge-name {
      font-weight: 600;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-primary, #2C2520);
    }

    .yp-nudge-reason {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-secondary, #5a4a42);
      margin-top: var(--space-0-5, 0.125rem);
    }

    .yp-nudge-badge {
      padding: var(--space-1, 0.25rem) var(--space-2, 0.5rem);
      border-radius: var(--radius-full, 50%);
      font-size: var(--text-xxs, 0.625rem);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .yp-nudge-badge.high {
      background: rgba(204, 68, 68, 0.1);
      color: var(--color-semantic-error, #c44);
    }

    .yp-nudge-badge.medium {
      background: rgba(184, 149, 106, 0.15);
      color: var(--nayan-primary, #b8956a);
    }

    .yp-nudge-arrow {
      color: var(--color-text-muted, #70605a);
    }

    /* =========================================================================
       PEOPLE LIST
       ========================================================================= */
    
    .yp-content {
      flex: 1;
      overflow-y: auto;
    }

    .yp-section {
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
    }

    .yp-section + .yp-section {
      border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.06));
    }

    .yp-section-title {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--color-text-muted, #70605a);
      margin-bottom: var(--space-3, 0.75rem);
    }

    .yp-person {
      display: flex;
      align-items: center;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-3, 0.75rem);
      margin: 0 calc(-1 * var(--space-3, 0.75rem));
      border-radius: var(--radius-lg, 1rem);
      cursor: pointer;
      transition: background ${DURATION.FAST}ms;
    }

    .yp-person:hover,
    .yp-person:focus {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.04));
      outline: none;
    }

    .yp-person:focus-visible {
      box-shadow: 0 0 0 2px var(--persona-primary, #4a6741);
      border-radius: var(--radius-lg, 0.75rem);
    }

    .yp-person:active {
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
    }

    .yp-person-avatar {
      width: 48px;
      height: 48px;
      border-radius: var(--radius-full, 50%);
      background: linear-gradient(
        135deg,
        var(--persona-primary, #4a6741),
        var(--persona-secondary, #3d5a35)
      );
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: var(--text-base, 1rem);
      flex-shrink: 0;
    }

    .yp-person-info {
      flex: 1;
      min-width: 0;
    }

    .yp-person-name {
      font-weight: 600;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-primary, #2C2520);
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }

    .yp-person-trend {
      display: flex;
      align-items: center;
    }

    .yp-person-trend.growing { color: var(--persona-primary, #4a6741); }
    .yp-person-trend.fading { color: var(--color-semantic-error, #c44); }

    .yp-person-meta {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      margin-top: var(--space-0-5, 0.125rem);
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }

    .yp-person-upcoming {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1, 0.25rem);
      padding: var(--space-0-5, 0.125rem) var(--space-2, 0.5rem);
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
      border-radius: var(--radius-full, 50%);
      font-size: var(--text-xxs, 0.625rem);
      font-weight: 600;
      color: var(--persona-primary, #4a6741);
    }

    .yp-person-upcoming svg {
      width: 10px;
      height: 10px;
    }

    .yp-person-strength {
      width: 6px;
      height: 6px;
      border-radius: var(--radius-full, 50%);
      flex-shrink: 0;
    }

    .yp-person-arrow {
      color: var(--color-text-muted, #70605a);
      flex-shrink: 0;
    }

    /* =========================================================================
       EMPTY & ADD STATES
       ========================================================================= */
    
    .yp-empty {
      text-align: center;
      padding: var(--space-10, 2.5rem) var(--space-6, 1.5rem);
    }

    .yp-empty-icon {
      width: 56px;
      height: 56px;
      margin: 0 auto var(--space-4, 1rem);
      color: var(--color-text-muted, #70605a);
      opacity: 0.4;
    }

    .yp-empty-title {
      font-size: var(--text-lg, 1.125rem);
      font-weight: 600;
      color: var(--color-text-secondary, #5a4a42);
      margin-bottom: var(--space-2, 0.5rem);
    }

    .yp-empty-text {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      line-height: 1.5;
      max-width: 280px;
      margin: 0 auto;
    }

    .yp-add-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 0.5rem);
      width: 100%;
      padding: var(--space-3, 0.75rem);
      margin: var(--space-4, 1rem) 0 0;
      border: 2px dashed var(--color-border, rgba(44, 37, 32, 0.15));
      border-radius: var(--radius-lg, 1rem);
      background: transparent;
      color: var(--color-text-muted, #70605a);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .yp-add-btn:hover {
      border-color: var(--persona-primary, #4a6741);
      color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.03));
    }

    .yp-add-btn:focus-visible {
      outline: 2px solid var(--persona-primary, #4a6741);
      outline-offset: 2px;
    }

    .yp-add-btn svg {
      width: 18px;
      height: 18px;
    }

    .yp-secondary-btn {
      background: var(--color-background-elevated, #f8f5f2);
      color: var(--color-text-secondary, #5a524a);
      border: 1px solid var(--color-border-subtle, rgba(0,0,0,0.1));
    }

    .yp-secondary-btn:hover {
      background: var(--color-background-tertiary, #f0ebe4);
      color: var(--color-text-primary, #2C2520);
    }

    .yp-action-buttons {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
    }

    /* =========================================================================
       LOADING
       ========================================================================= */
    
    .yp-loading {
      text-align: center;
      padding: var(--space-10, 2.5rem);
      color: var(--color-text-muted, #70605a);
      font-size: var(--text-sm, 0.875rem);
    }

    /* =========================================================================
       RESPONSIVE
       ========================================================================= */
    
    @media (max-width: 640px) {
      .your-people-panel {
        width: 100%;
        max-width: none;
        max-height: 95vh;
        border-radius: var(--radius-xl, 1.25rem) var(--radius-xl, 1.25rem) 0 0;
        margin-top: auto;
      }

      .yp-filters {
        overflow-x: auto;
        padding-bottom: var(--space-1, 0.25rem);
      }

      .yp-filter {
        white-space: nowrap;
      }
    }

    /* =========================================================================
       REDUCED MOTION
       ========================================================================= */
    
    @media (prefers-reduced-motion: reduce) {
      .your-people-overlay,
      .your-people-panel,
      .yp-person,
      .yp-nudge,
      .yp-filter,
      .yp-add-btn,
      .yp-close {
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
  if (!panelContainer) return;

  const panel = panelContainer.querySelector('.your-people-panel');
  if (!panel) return;

  panel.innerHTML = `
    ${renderHeader()}
    ${renderNudges()}
    <div class="yp-content">
      ${state.isLoading ? renderLoading() : renderPeopleList()}
    </div>
  `;

  bindEvents();
}

function renderHeader(): string {
  return `
    <div class="yp-header">
      <div class="yp-header-top">
        <div class="yp-header-text">
          <div class="yp-eyebrow" id="yp-desc">Relationships</div>
          <h2 class="yp-title" id="yp-title">Your People</h2>
        </div>
        <div class="yp-header-actions">
          <button class="yp-action-btn" id="yp-insights-btn" aria-label="View relationship insights" title="Insights">${ICONS.chart}</button>
          <button class="yp-close" aria-label="Close">${ICONS.close}</button>
        </div>
      </div>
      
      <div class="yp-search">
        <span class="yp-search-icon">${ICONS.search}</span>
        <input 
          type="search" 
          class="yp-search-input" 
          placeholder="Search your people..."
          value="${escapeHtml(state.searchQuery)}"
          aria-label="Search contacts"
          autocomplete="off"
        />
      </div>
      
      <div class="yp-filters">
        <button class="yp-filter ${state.activeFilter === 'all' ? 'active' : ''}" data-filter="all">
          All
        </button>
        <button class="yp-filter ${state.activeFilter === 'attention' ? 'active' : ''}" data-filter="attention">
          Needs attention
        </button>
        <button class="yp-filter ${state.activeFilter === 'recent' ? 'active' : ''}" data-filter="recent">
          Recent
        </button>
      </div>
    </div>
  `;
}

function renderNudges(): string {
  // Filter nudges by search query if present
  let filteredNudges = state.nudges;
  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    filteredNudges = filteredNudges.filter(nudge =>
      nudge.contactName.toLowerCase().includes(query) ||
      nudge.message?.toLowerCase().includes(query)
    );
  }
  
  const visibleNudges = filteredNudges.slice(0, 3);
  if (visibleNudges.length === 0) return '';

  return `
    <div class="yp-nudges">
      <div class="yp-nudges-header">
        ${ICONS.sparkles} Ferni suggests
      </div>
      ${visibleNudges.map(nudge => `
        <div class="yp-nudge" data-contact-id="${nudge.contactId}" role="button" tabindex="0" aria-label="Contact ${escapeHtml(nudge.contactName)}. ${escapeHtml(nudge.message)}">
          <div class="yp-nudge-avatar" aria-hidden="true">${getInitials(nudge.contactName)}</div>
          <div class="yp-nudge-content">
            <div class="yp-nudge-name">${escapeHtml(nudge.contactName)}</div>
            <div class="yp-nudge-reason">${escapeHtml(nudge.message)}</div>
          </div>
          ${nudge.priority === 'high' ? `<span class="yp-nudge-badge high">Soon</span>` : ''}
          ${nudge.priority === 'medium' ? `<span class="yp-nudge-badge medium">Check in</span>` : ''}
          <span class="yp-nudge-arrow" aria-hidden="true">${ICONS.chevronRight}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderPeopleList(): string {
  // Filter people
  let filteredPeople = state.people;

  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    filteredPeople = filteredPeople.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.email?.toLowerCase().includes(query) ||
      p.phone?.includes(query) ||
      p.relationship?.toLowerCase().includes(query) ||
      p.notes?.toLowerCase().includes(query)
    );
  }

  if (state.activeFilter === 'attention') {
    filteredPeople = filteredPeople.filter(p => p.needsAttention || (p.daysSinceContact && p.daysSinceContact > 14));
  } else if (state.activeFilter === 'recent') {
    filteredPeople = filteredPeople
      .filter(p => p.lastInteraction)
      .sort((a, b) => {
        const aDate = a.lastInteraction ? new Date(a.lastInteraction).getTime() : 0;
        const bDate = b.lastInteraction ? new Date(b.lastInteraction).getTime() : 0;
        return bDate - aDate;
      })
      .slice(0, 10);
  }

  if (filteredPeople.length === 0) {
    if (state.searchQuery) {
      return `
        <div class="yp-section">
          <div class="yp-empty">
            <p class="yp-empty-text">No people matching "${escapeHtml(state.searchQuery)}"</p>
          </div>
        </div>
      `;
    }

    if (state.people.length === 0) {
      return `
        <div class="yp-section">
          <div class="yp-empty">
            <div class="yp-empty-icon">${ICONS.users}</div>
            <div class="yp-empty-title">No one here yet</div>
            <p class="yp-empty-text">Add people you care about and we'll help you nurture those relationships.</p>
          </div>
          <button class="yp-add-btn" data-action="add-person">
            ${ICONS.plus} Add Someone
          </button>
          <button class="yp-add-btn yp-import-btn" data-action="import-contacts" style="margin-top: var(--space-2);">
            ${ICONS.upload} Import from Google or CSV
          </button>
        </div>
      `;
    }

    return `
      <div class="yp-section">
        <div class="yp-empty">
          <p class="yp-empty-text">No people match this filter</p>
        </div>
      </div>
    `;
  }

  // Group by relationship type or just show flat list
  const grouped = groupByRelationship(filteredPeople);

  let html = '';
  for (const [groupName, people] of Object.entries(grouped)) {
    html += `
      <div class="yp-section">
        <div class="yp-section-title">${groupName}</div>
        ${people.map(person => renderPersonItem(person)).join('')}
      </div>
    `;
  }

  html += `
    <div class="yp-section yp-action-buttons">
      <button class="yp-add-btn" data-action="add-person">
        ${ICONS.plus} Add Someone
      </button>
      <button class="yp-add-btn yp-secondary-btn" data-action="import-contacts">
        ${ICONS.upload} Import Contacts
      </button>
    </div>
  `;

  return html;
}

function renderPersonItem(person: Person): string {
  const initials = getInitials(person.name);
  const strengthColor = getStrengthColor(person.strengthScore || 50);
  
  const lastContactText = person.daysSinceContact !== undefined
    ? person.daysSinceContact === 0 ? 'Today'
    : person.daysSinceContact === 1 ? 'Yesterday'
    : `${person.daysSinceContact}d ago`
    : '';

  const trendIcon = person.strengthTrend === 'growing' ? ICONS.trendUp :
                    person.strengthTrend === 'fading' ? ICONS.trendDown : '';

  const metaText = [
    person.relationship || 'Contact',
    lastContactText,
    person.upcomingDate ? `${person.upcomingDate.label || person.upcomingDate.type} in ${person.upcomingDate.daysUntil} days` : ''
  ].filter(Boolean).join('. ');

  return `
    <div class="yp-person" data-contact-id="${person.contactId}" role="button" tabindex="0" aria-label="View ${escapeHtml(person.name)}. ${metaText}">
      <div class="yp-person-avatar" aria-hidden="true">${initials}</div>
      <div class="yp-person-info">
        <div class="yp-person-name">
          ${escapeHtml(person.name)}
          ${trendIcon ? `<span class="yp-person-trend ${person.strengthTrend}" aria-hidden="true">${trendIcon}</span>` : ''}
        </div>
        <div class="yp-person-meta">
          <span>${person.relationship || 'Contact'}</span>
          ${lastContactText ? `<span>${lastContactText}</span>` : ''}
          ${person.upcomingDate ? `
            <span class="yp-person-upcoming">
              ${ICONS.calendar}
              ${person.upcomingDate.label || person.upcomingDate.type} in ${person.upcomingDate.daysUntil}d
            </span>
          ` : ''}
        </div>
      </div>
      <span class="yp-person-strength" style="background: ${strengthColor};" aria-hidden="true"></span>
      <span class="yp-person-arrow" aria-hidden="true">${ICONS.chevronRight}</span>
    </div>
  `;
}

function renderLoading(): string {
  return `<div class="yp-loading">Loading your people...</div>`;
}

// ============================================================================
// EVENT BINDING
// ============================================================================

function bindEvents(): void {
  if (!panelContainer) return;

  // Close
  panelContainer.querySelector('.yp-close')?.addEventListener('click', closeYourPeople);
  panelContainer.querySelector('.your-people-backdrop')?.addEventListener('click', closeYourPeople);

  // Search
  const searchInput = panelContainer.querySelector('.yp-search-input') as HTMLInputElement;
  searchInput?.addEventListener('input', (e) => {
    state.searchQuery = (e.target as HTMLInputElement).value;
    render();
  });

  // Filters
  panelContainer.querySelectorAll('.yp-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-filter') as YourPeopleState['activeFilter'];
      if (filter) {
        state.activeFilter = filter;
        render();
      }
    });
  });

  // Nudges - click to open relationship card
  panelContainer.querySelectorAll('.yp-nudge').forEach(nudge => {
    const handleNudgeActivation = () => {
      const contactId = nudge.getAttribute('data-contact-id');
      if (contactId) {
        openPersonCard(contactId);
      }
    };
    nudge.addEventListener('click', handleNudgeActivation);
    nudge.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        handleNudgeActivation();
      }
    });
  });

  // People list - click to open relationship card
  panelContainer.querySelectorAll('.yp-person').forEach(person => {
    const handlePersonActivation = () => {
      const contactId = person.getAttribute('data-contact-id');
      if (contactId) {
        openPersonCard(contactId);
      }
    };
    person.addEventListener('click', handlePersonActivation);
    person.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        handlePersonActivation();
      }
    });
  });

  // Add button
  panelContainer.querySelectorAll('[data-action="add-person"]').forEach(btn => {
    btn.addEventListener('click', () => {
      openAddPerson({
        onSuccess: () => {
          // Reload the people list after adding
          loadPeopleData();
        },
      });
    });
  });

  // Import button
  panelContainer.querySelectorAll('[data-action="import-contacts"]').forEach(btn => {
    btn.addEventListener('click', () => {
      openImportContacts({
        onSuccess: (count) => {
          toast.success(`Imported ${count} contacts!`);
          loadPeopleData();
        },
      });
    });
  });

  // Insights button
  panelContainer.querySelector('#yp-insights-btn')?.addEventListener('click', () => {
    openRelationshipInsights({
      onSelectPerson: (contactId) => {
        openPersonCard(contactId);
      },
    });
  });

  // Escape key
  document.addEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && state.isOpen) {
    closeYourPeople();
  }
}

function openPersonCard(contactId: string): void {
  // Close this panel and open relationship card
  closeYourPeople();
  
  // Small delay for animation
  setTimeout(() => {
    openRelationshipCard(contactId, {
      onClose: () => {
        // Optionally reopen Your People when relationship card closes
        // openYourPeople();
      },
    });
  }, DURATION.FAST);
}

// ============================================================================
// HELPERS
// ============================================================================

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getStrengthColor(score: number): string {
  if (score >= 70) return 'var(--persona-primary, var(--color-ferni))';
  if (score >= 40) return 'var(--nayan-primary, var(--color-nayan))';
  return 'var(--color-semantic-error, var(--color-error))';
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function groupByRelationship(people: Person[]): Record<string, Person[]> {
  const groups: Record<string, Person[]> = {};
  
  for (const person of people) {
    const group = capitalizeFirst(person.relationship || 'other');
    if (!groups[group]) groups[group] = [];
    groups[group].push(person);
  }

  // Sort groups: Family, Friends, Work, then Others
  const orderedGroups: Record<string, Person[]> = {};
  const order = ['Family', 'Friend', 'Colleague', 'Mentor', 'Acquaintance', 'Other'];
  
  for (const key of order) {
    if (groups[key]) {
      orderedGroups[key === 'Friend' ? 'Friends' : key === 'Colleague' ? 'Work' : key] = groups[key];
    }
  }

  return orderedGroups;
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================================
// API CALLS
// ============================================================================

async function loadPeopleData(): Promise<void> {
  state.isLoading = true;
  render();

  let useMockData = shouldUseDemoData();

  try {
    // Load contacts
    const contactsRes = await apiFetch('/api/contacts');
    if (contactsRes.ok) {
      const contactsData = await contactsRes.json();
      const contacts = Array.isArray(contactsData) ? contactsData : (contactsData.contacts || []);
      // If API returned empty and we're in dev mode, use mock data
      if (contacts.length === 0 && useMockData) {
        state.people = getAllMockContacts();
        log.debug('Using mock contact data (API returned empty)');
      } else {
        state.people = contacts;
      }
    } else if (useMockData) {
      // API failed, use mock data in dev
      state.people = getAllMockContacts();
      log.debug('Using mock contact data (API unavailable)');
    }

    // Load nudges
    const nudgesRes = await apiFetch('/api/contacts/nudges');
    if (nudgesRes.ok) {
      state.nudges = await nudgesRes.json();
    } else if (useMockData) {
      state.nudges = MOCK_NUDGES;
      log.debug('Using mock nudge data');
    }
  } catch (error) {
    log.error('Failed to load people data:', error);
    // Use mock data in dev mode when API fails
    if (useMockData) {
      state.people = getAllMockContacts();
      state.nudges = MOCK_NUDGES;
      log.debug('Using mock data due to API error');
    }
  } finally {
    state.isLoading = false;
    render();
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the Your People panel
 */
export async function openYourPeople(): Promise<void> {
  if (state.isOpen) return;

  // Store previously focused element for restoration
  previouslyFocusedElement = document.activeElement as HTMLElement | null;

  // Cleanup any existing panels
  cleanupOrphanedPanels();
  injectStyles();

  // Reset state
  state = {
    isOpen: true,
    isLoading: true,
    people: [],
    nudges: [],
    groups: [],
    searchQuery: '',
    activeFilter: 'all',
  };

  // Create container
  panelContainer = document.createElement('div');
  panelContainer.className = 'your-people-overlay';
  panelContainer.innerHTML = `
    <div class="your-people-backdrop"></div>
    <div class="your-people-panel" role="dialog" aria-modal="true" aria-labelledby="yp-title" aria-describedby="yp-desc">
      <div class="yp-loading">Loading...</div>
    </div>
  `;
  document.body.appendChild(panelContainer);

  // Animate in
  requestAnimationFrame(() => {
    panelContainer?.classList.add('open');
  });

  // Load data
  await loadPeopleData();

  // Focus management - focus search input after render
  setTimeout(() => {
    const searchInput = panelContainer?.querySelector<HTMLInputElement>('.yp-search-input');
    searchInput?.focus();
  }, DURATION.FAST);

  log.info('Opened Your People panel');
}

/**
 * Close the Your People panel
 */
export function closeYourPeople(): void {
  if (!state.isOpen || !panelContainer) return;

  document.removeEventListener('keydown', handleEscapeKey);
  
  panelContainer.classList.remove('open');
  
  setTimeout(() => {
    panelContainer?.remove();
    panelContainer = null;
    
    // Restore focus to previously focused element
    if (previouslyFocusedElement && document.body.contains(previouslyFocusedElement)) {
      previouslyFocusedElement.focus();
    }
    previouslyFocusedElement = null;
  }, DURATION.NORMAL);

  state.isOpen = false;
  log.info('Closed Your People panel');
}

function cleanupOrphanedPanels(): void {
  document.querySelectorAll('.your-people-overlay').forEach(el => el.remove());
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initYourPeopleUI(): void {
  // Listen for open events
  document.addEventListener('ferni:open-your-people', () => {
    openYourPeople();
  });

  // Also support old event name for backward compatibility
  document.addEventListener('ferni:open-contacts', () => {
    openYourPeople();
  });

  log.debug('Your People UI initialized');
}

// Export for use in other modules
export const yourPeople = {
  init: initYourPeopleUI,
  open: openYourPeople,
  close: closeYourPeople,
};

export default yourPeople;

