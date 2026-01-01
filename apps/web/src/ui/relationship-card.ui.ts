// TODO: Fix type errors - array indexing and date parsing undefined checks
/**
 * Relationship Card UI
 *
 * "Better Than Human" unified relationship view.
 * Everything about a person in one place: timeline, gifts, events, notes.
 *
 * Design Philosophy:
 * - A human friend forgets. Ferni remembers everything.
 * - Gifts, calls, texts, hangouts - all part of your story together.
 * - Intelligent insights surface what matters.
 *
 * @module ui/relationship-card
 */

import { createLogger } from '../utils/logger.js';
import { toast } from './whisper.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiFetch } from '../utils/api-helpers.js';
import { openLogMoment } from './log-moment.ui.js';
import { openRecordGift } from './record-gift.ui.js';
import { openEditPerson, type PersonData } from './edit-person.ui.js';
import { openImportantDates } from './important-dates.ui.js';
import { openSendMessage } from './send-message.ui.js';
import { openGiftSuggestions } from './gift-suggestions.ui.js';
import { openConversationStarters } from './conversation-starters.ui.js';
import { shouldUseDemoData } from '../utils/environment.js';
import { getMockContact, getMockInteractions, getMockGifts } from '../data/mock-contacts.ts';
import { t } from '../i18n/index.js';

const log = createLogger('RelationshipCard');

// ============================================================================
// TYPES
// ============================================================================

export interface RelationshipPerson {
  id: string;
  contactId: string;
  name: string;
  aliases?: string[];
  email?: string;
  phone?: string;
  relationship?: 'family' | 'friend' | 'colleague' | 'mentor' | 'acquaintance' | 'other';
  notes?: string;
  
  // Relationship health
  strengthScore: number;
  strengthTrend?: 'growing' | 'stable' | 'fading';
  lastInteraction?: Date | string;
  daysSinceContact?: number;
  
  // Important dates
  importantDates?: ImportantDate[];
  
  // Interests & context (for gift suggestions, conversation starters)
  interests?: string[];
  recentTopics?: string[];
  sensitiveTopics?: string[]; // Things NOT to bring up
  
  // Communication patterns
  preferredChannel?: 'call' | 'text' | 'email' | 'in_person';
  bestTimeToReach?: string;
  avgResponseTimeHours?: number;
  
  // Metadata
  createdAt?: Date | string;
  howWeMet?: string;

  // Visual
  photo?: string;
}

export interface ImportantDate {
  date: string; // MM-DD or YYYY-MM-DD
  type: 'birthday' | 'anniversary' | 'memorial' | 'custom';
  label?: string;
  daysUntil?: number;
}

export interface TimelineItem {
  id: string;
  date: Date | string;
  type: TimelineItemType;
  direction: 'inbound' | 'outbound' | 'mutual';
  title: string;
  summary?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  duration?: number; // minutes
  topics?: string[];
  linkedGiftId?: string;
  platform?: string;
}

export type TimelineItemType =
  | 'call' | 'text' | 'email' | 'video_call' | 'voice_message'
  | 'hangout' | 'dinner' | 'activity' | 'trip' | 'visit'
  | 'gift_given' | 'gift_received' | 'card_sent' | 'card_received'
  | 'social_interaction' | 'meeting' | 'milestone' | 'other';

export interface Gift {
  id: string;
  direction: 'given' | 'received';
  item: string;
  description?: string;
  occasion: string;
  date: Date | string;
  price?: number;
  reaction?: 'loved' | 'liked' | 'neutral' | 'disliked';
  notes?: string;
  tags?: string[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: Date | string;
  endDate?: Date | string;
  location?: string;
  type: 'upcoming' | 'past';
  attendees?: string[];
}

export interface SharedCalendarContext {
  upcoming: CalendarEvent[];
  past: CalendarEvent[];
  nextMeetingDaysUntil?: number;
}

export interface FerniNotice {
  id: string;
  type: 'insight' | 'reminder' | 'suggestion' | 'celebration';
  priority: 'high' | 'medium' | 'low';
  message: string;
  actionLabel?: string;
  actionType?: string;
}

// ============================================================================
// STATE
// ============================================================================

interface RelationshipCardState {
  person: RelationshipPerson | null;
  activeTab: 'overview' | 'timeline' | 'gifts' | 'events' | 'notes';
  timeline: TimelineItem[];
  gifts: Gift[];
  events: CalendarEvent[];
  sharedCalendar: SharedCalendarContext | null;
  notices: FerniNotice[];
  isLoading: boolean;
  isLoadingSection: boolean;
}

let state: RelationshipCardState = {
  person: null,
  activeTab: 'overview',
  timeline: [],
  gifts: [],
  events: [],
  sharedCalendar: null,
  notices: [],
  isLoading: false,
  isLoadingSection: false,
};

let cardContainer: HTMLElement | null = null;
let onCloseCallback: (() => void) | null = null;

// ============================================================================
// ICONS (Lucide SVG)
// ============================================================================

const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  phone: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  message: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  mail: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  video: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`,
  gift: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6"/><rect x="2" y="7" width="20" height="5" rx="2"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
  calendar: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  clock: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  users: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  heart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  sparkles: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/></svg>`,
  trendUp: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  trendDown: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>`,
  minus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>`,
  edit: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  plus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
  send: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/></svg>`,
  coffee: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>`,
  mapPin: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  star: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  camera: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`,
  lightbulb: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  fileText: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>`,
};

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('relationship-card-styles')) return;

  const style = document.createElement('style');
  style.id = 'relationship-card-styles';
  style.textContent = `
    /* =========================================================================
       RELATIONSHIP CARD - "Better Than Human" Unified View
       ========================================================================= */
    
    .relationship-card-overlay {
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

    .relationship-card-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .relationship-card-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .relationship-card {
      position: relative;
      width: 94%;
      max-width: clamp(476px, 90vw, 680px);
      max-height: 90vh;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.96) translateY(8px);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .relationship-card-overlay.open .relationship-card {
      transform: scale(1) translateY(0);
    }

    /* =========================================================================
       HEADER
       ========================================================================= */
    
    .rc-header {
      position: relative;
      padding: var(--space-6, 1.5rem);
      background: linear-gradient(
        135deg,
        var(--persona-tint, rgba(74, 103, 65, 0.08)) 0%,
        transparent 60%
      );
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
    }

    .rc-close {
      position: absolute;
      top: var(--space-4, 1rem);
      right: var(--space-4, 1rem);
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

    .rc-close:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      color: var(--color-text-primary, #2C2520);
    }

    .rc-close:focus-visible {
      outline: 2px solid var(--persona-primary, #4a6741);
      outline-offset: 2px;
    }

    .rc-person {
      display: flex;
      align-items: flex-start;
      gap: var(--space-5, 1.25rem);
    }

    .rc-avatar {
      position: relative;
      width: 72px;
      height: 72px;
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
      font-size: var(--text-2xl, 1.5rem);
      flex-shrink: 0;
      box-shadow: var(--shadow-md);
      cursor: pointer;
      overflow: hidden;
    }
    
    .rc-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .rc-avatar-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity ${DURATION.FAST}ms ${EASING.STANDARD};
      color: white;
    }
    
    .rc-avatar:hover .rc-avatar-overlay {
      opacity: 1;
    }
    
    .rc-avatar-input {
      display: none;
    }

    .rc-info {
      flex: 1;
      min-width: 0;
    }

    .rc-name {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-2xl, 1.5rem);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-1, 0.25rem);
      line-height: 1.2;
    }

    .rc-relationship-type {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4a42);
      text-transform: capitalize;
      margin-bottom: var(--space-3, 0.75rem);
    }

    /* Strength indicator */
    .rc-strength {
      display: flex;
      align-items: center;
      gap: var(--space-3, 0.75rem);
    }

    .rc-strength-bar {
      flex: 1;
      max-width: min(140px, 100%);
      height: 6px;
      background: var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-full, 50%);
      overflow: hidden;
    }

    .rc-strength-fill {
      height: 100%;
      border-radius: var(--radius-full, 50%);
      transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
    }

    .rc-strength-label {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      display: flex;
      align-items: center;
      gap: var(--space-1, 0.25rem);
    }

    .rc-strength-trend {
      display: flex;
      align-items: center;
    }

    .rc-strength-trend.growing { color: var(--persona-primary, #4a6741); }
    .rc-strength-trend.fading { color: var(--color-semantic-error, #c44); }
    .rc-strength-trend.stable { color: var(--color-text-muted, #70605a); }

    .rc-last-contact {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      margin-top: var(--space-2, 0.5rem);
    }

    /* Quick actions in header */
    .rc-quick-actions {
      display: flex;
      gap: var(--space-2, 0.5rem);
      margin-top: var(--space-4, 1rem);
    }

    .rc-quick-action {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-1-5, 0.375rem);
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.15));
      border-radius: var(--radius-lg, 1rem);
      background: var(--color-background-elevated, #FFFDFB);
      color: var(--color-text-secondary, #5a4a42);
      font-size: var(--text-xs, 0.75rem);
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .rc-quick-action:hover {
      border-color: var(--persona-primary, #4a6741);
      color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.05));
    }

    .rc-quick-action:focus-visible {
      outline: 2px solid var(--persona-primary, #4a6741);
      outline-offset: 2px;
    }

    .rc-quick-action svg {
      width: 14px;
      height: 14px;
    }

    /* =========================================================================
       FERNI NOTICES - The "Better Than Human" Magic
       ========================================================================= */
    
    .rc-notices {
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
      background: var(--persona-tint, rgba(74, 103, 65, 0.04));
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.06));
    }

    .rc-notices-header {
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

    .rc-notices-header svg {
      width: 14px;
      height: 14px;
    }

    .rc-notice {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-2-5, 0.625rem) 0;
    }

    .rc-notice + .rc-notice {
      border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.06));
    }

    .rc-notice-icon {
      width: 20px;
      height: 20px;
      color: var(--persona-primary, #4a6741);
      flex-shrink: 0;
      margin-top: 1px;
    }

    .rc-notice-content {
      flex: 1;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4a42);
      line-height: 1.5;
    }

    .rc-notice-action {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      color: var(--persona-primary, #4a6741);
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .rc-notice-action:hover {
      color: var(--persona-secondary, #3d5a35);
    }

    /* =========================================================================
       TABS
       ========================================================================= */
    
    .rc-tabs {
      display: flex;
      gap: var(--space-1, 0.25rem);
      padding: var(--space-3, 0.75rem) var(--space-6, 1.5rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      background: var(--color-background-elevated, #FFFDFB);
    }

    .rc-tab {
      padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
      border: none;
      background: transparent;
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      color: var(--color-text-muted, #70605a);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
      display: flex;
      align-items: center;
      gap: var(--space-1-5, 0.375rem);
    }

    .rc-tab svg {
      width: 16px;
      height: 16px;
    }

    .rc-tab:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.04));
      color: var(--color-text-secondary, #5a4a42);
    }

    .rc-tab.active {
      background: var(--persona-primary, #4a6741);
      color: white;
    }

    .rc-tab:focus-visible {
      outline: 2px solid var(--persona-primary, #4a6741);
      outline-offset: 2px;
    }

    /* =========================================================================
       CONTENT AREA
       ========================================================================= */
    
    .rc-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
    }

    .rc-section {
      margin-bottom: var(--space-6, 1.5rem);
    }

    .rc-section:last-child {
      margin-bottom: 0;
    }

    .rc-section-title {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--color-text-muted, #70605a);
      margin-bottom: var(--space-3, 0.75rem);
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }

    .rc-section-title svg {
      width: 14px;
      height: 14px;
    }

    /* =========================================================================
       TIMELINE ITEMS
       ========================================================================= */
    
    .rc-timeline-item {
      display: flex;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-3, 0.75rem) 0;
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.06));
    }

    .rc-timeline-item:last-child {
      border-bottom: none;
    }

    .rc-timeline-icon {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-lg, 1rem);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .rc-timeline-icon.outbound {
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      color: var(--persona-primary, #4a6741);
    }

    .rc-timeline-icon.inbound {
      background: rgba(184, 149, 106, 0.12);
      color: var(--nayan-primary, #b8956a);
    }

    .rc-timeline-icon.mutual {
      background: rgba(90, 107, 138, 0.1);
      color: var(--alex-primary, #5a6b8a);
    }

    .rc-timeline-icon svg {
      width: 18px;
      height: 18px;
    }

    .rc-timeline-content {
      flex: 1;
      min-width: 0;
    }

    .rc-timeline-title {
      font-weight: 500;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-primary, #2C2520);
      line-height: 1.4;
    }

    .rc-timeline-meta {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      margin-top: var(--space-0-5, 0.125rem);
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }

    .rc-timeline-summary {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4a42);
      margin-top: var(--space-2, 0.5rem);
      line-height: 1.5;
    }

    .rc-timeline-topics {
      display: flex;
      gap: var(--space-1, 0.25rem);
      flex-wrap: wrap;
      margin-top: var(--space-2, 0.5rem);
    }

    .rc-topic-tag {
      padding: var(--space-0-5, 0.125rem) var(--space-2, 0.5rem);
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
      border-radius: var(--radius-full, 50%);
      font-size: var(--text-xs, 0.75rem);
      color: var(--persona-primary, #4a6741);
      font-weight: 500;
    }

    .rc-sentiment-dot {
      width: 6px;
      height: 6px;
      border-radius: var(--radius-full, 50%);
    }

    .rc-sentiment-dot.positive { background: var(--persona-primary, #4a6741); }
    .rc-sentiment-dot.neutral { background: var(--color-text-muted, #70605a); }
    .rc-sentiment-dot.negative { background: var(--color-semantic-error, #c44); }

    /* =========================================================================
       GIFT ITEMS
       ========================================================================= */
    
    .rc-gift-item {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-3, 0.75rem);
      background: var(--color-bg-secondary, rgba(250, 248, 245, 0.5));
      border-radius: var(--radius-lg, 1rem);
      margin-bottom: var(--space-2, 0.5rem);
    }

    .rc-gift-direction {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-lg, 1rem);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .rc-gift-direction.given {
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      color: var(--persona-primary, #4a6741);
    }

    .rc-gift-direction.received {
      background: rgba(184, 149, 106, 0.12);
      color: var(--nayan-primary, #b8956a);
    }

    .rc-gift-direction svg {
      width: 18px;
      height: 18px;
    }

    .rc-gift-info {
      flex: 1;
      min-width: 0;
    }

    .rc-gift-name {
      font-weight: 600;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-primary, #2C2520);
    }

    .rc-gift-meta {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      margin-top: var(--space-0-5, 0.125rem);
    }

    .rc-gift-reaction {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1, 0.25rem);
      padding: var(--space-1, 0.25rem) var(--space-2, 0.5rem);
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
      border-radius: var(--radius-full, 50%);
      font-size: var(--text-xs, 0.75rem);
      font-weight: 500;
      margin-top: var(--space-2, 0.5rem);
    }

    .rc-gift-reaction.loved { color: var(--persona-primary, #4a6741); }
    .rc-gift-reaction.liked { color: var(--alex-primary, #5a6b8a); }
    .rc-gift-reaction.neutral { color: var(--color-text-muted, #70605a); }
    .rc-gift-reaction.disliked { color: var(--color-semantic-error, #c44); }

    /* =========================================================================
       EVENT ITEMS
       ========================================================================= */
    
    .rc-event-item {
      display: flex;
      align-items: center;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-3, 0.75rem) 0;
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.06));
    }

    .rc-event-item:last-child {
      border-bottom: none;
    }

    /* Important dates styling */
    .rc-date-item {
      display: flex;
      align-items: center;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-2, 0.5rem) 0;
    }

    .rc-date-label {
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      color: var(--color-text-primary, #2C2520);
      min-width: 90px;
    }

    .rc-date-value {
      flex: 1;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
    }

    .rc-date-badge {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      padding: var(--space-0-5, 0.125rem) var(--space-2, 0.5rem);
      border-radius: var(--radius-full, 9999px);
    }

    .rc-empty-inline {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      padding: var(--space-2, 0.5rem) 0;
    }

    .rc-event-date {
      width: 48px;
      height: 48px;
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
      border-radius: var(--radius-md, 0.5rem);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .rc-event-date-month {
      font-size: var(--text-xxs, 0.625rem);
      font-weight: 600;
      text-transform: uppercase;
      color: var(--persona-primary, #4a6741);
    }

    .rc-event-date-day {
      font-size: var(--text-lg, 1.125rem);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      line-height: 1;
    }

    .rc-event-info {
      flex: 1;
      min-width: 0;
    }

    .rc-event-title {
      font-weight: 500;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-primary, #2C2520);
    }

    .rc-event-meta {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      margin-top: var(--space-0-5, 0.125rem);
    }

    /* =========================================================================
       NOTES TAB
       ========================================================================= */
    
    .rc-notes-section {
      margin-bottom: var(--space-5, 1.25rem);
    }

    .rc-notes-label {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      color: var(--color-text-muted, #70605a);
      margin-bottom: var(--space-2, 0.5rem);
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }

    .rc-notes-content {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4a42);
      line-height: 1.6;
    }

    .rc-interests {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 0.5rem);
    }

    .rc-interest-tag {
      padding: var(--space-1-5, 0.375rem) var(--space-3, 0.75rem);
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
      border-radius: var(--radius-full, 50%);
      font-size: var(--text-sm, 0.875rem);
      color: var(--persona-primary, #4a6741);
      font-weight: 500;
    }

    .rc-sensitive-tag {
      padding: var(--space-1-5, 0.375rem) var(--space-3, 0.75rem);
      background: rgba(204, 68, 68, 0.08);
      border-radius: var(--radius-full, 50%);
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-semantic-error, #c44);
      font-weight: 500;
    }

    /* =========================================================================
       EMPTY STATES
       ========================================================================= */
    
    .rc-empty {
      text-align: center;
      padding: var(--space-10, 2.5rem) var(--space-6, 1.5rem);
      color: var(--color-text-muted, #70605a);
    }

    .rc-empty-icon {
      width: 48px;
      height: 48px;
      margin: 0 auto var(--space-4, 1rem);
      opacity: 0.4;
    }

    .rc-empty-title {
      font-size: var(--text-base, 1rem);
      font-weight: 500;
      color: var(--color-text-secondary, #5a4a42);
      margin-bottom: var(--space-2, 0.5rem);
    }

    .rc-empty-text {
      font-size: var(--text-sm, 0.875rem);
      line-height: 1.5;
      max-width: min(280px, 100%);
      margin: 0 auto;
    }

    /* =========================================================================
       ADD BUTTON
       ========================================================================= */
    
    .rc-add-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 0.5rem);
      width: 100%;
      padding: var(--space-3, 0.75rem);
      margin-top: var(--space-4, 1rem);
      border: 2px dashed var(--color-border, rgba(44, 37, 32, 0.15));
      border-radius: var(--radius-lg, 1rem);
      background: transparent;
      color: var(--color-text-muted, #70605a);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .rc-add-btn:hover {
      border-color: var(--persona-primary, #4a6741);
      color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.03));
    }

    .rc-add-btn:focus-visible {
      outline: 2px solid var(--persona-primary, #4a6741);
      outline-offset: 2px;
    }

    .rc-add-btn svg {
      width: 18px;
      height: 18px;
    }

    /* =========================================================================
       LOADING STATE
       ========================================================================= */
    
    .rc-loading {
      text-align: center;
      padding: var(--space-10, 2.5rem);
      color: var(--color-text-muted, #70605a);
      font-size: var(--text-sm, 0.875rem);
    }

    /* =========================================================================
       RESPONSIVE
       ========================================================================= */
    
    @media (max-width: clamp(448px, 90vw, 640px)) {
      .relationship-card {
        width: 100%;
        max-width: none;
        max-height: 100vh;
        border-radius: var(--radius-xl, 1.25rem) var(--radius-xl, 1.25rem) 0 0;
        margin-top: auto;
      }

      .rc-person {
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      .rc-strength {
        justify-content: center;
      }

      .rc-quick-actions {
        justify-content: center;
        flex-wrap: wrap;
      }

      .rc-tabs {
        overflow-x: auto;
        padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
      }

      .rc-tab {
        white-space: nowrap;
      }
    }

    /* =========================================================================
       REDUCED MOTION
       ========================================================================= */
    
    @media (prefers-reduced-motion: reduce) {
      .relationship-card-overlay,
      .relationship-card,
      .rc-tab,
      .rc-quick-action,
      .rc-add-btn,
      .rc-close {
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function render(): void {
  if (!cardContainer || !state.person) return;

  const card = cardContainer.querySelector('.relationship-card');
  if (!card) return;

  card.innerHTML = `
    ${renderHeader()}
    ${renderNotices()}
    ${renderTabs()}
    <div class="rc-content">
      ${renderTabContent()}
    </div>
  `;

  bindEvents();
}

function renderHeader(): string {
  const person = state.person!;
  const initials = getInitials(person.name);
  const strengthPercent = person.strengthScore || 50;
  const strengthColor = getStrengthColor(strengthPercent);
  const trendIcon = person.strengthTrend === 'growing' ? ICONS.trendUp :
                    person.strengthTrend === 'fading' ? ICONS.trendDown : ICONS.minus;
  const trendLabel = person.strengthTrend === 'growing' ? 'Growing stronger' :
                     person.strengthTrend === 'fading' ? 'Needs attention' : 'Stable';

  const lastContactText = person.daysSinceContact !== undefined
    ? person.daysSinceContact === 0 ? 'Connected today'
    : person.daysSinceContact === 1 ? 'Last connected yesterday'
    : `Last connected ${person.daysSinceContact} days ago`
    : '';

  return `
    <div class="rc-header">
      <button class="rc-close" aria-label="${t('accessibility.close')}">${ICONS.close}</button>
      
      <div class="rc-person">
        <label class="rc-avatar" for="rc-avatar-input" title="Click to change photo">
          ${person.photo 
            ? `<img src="${escapeHtml(person.photo)}" alt="${escapeHtml(person.name)}">`
            : initials
          }
          <div class="rc-avatar-overlay">${ICONS.camera}</div>
        </label>
        <input type="file" id="rc-avatar-input" class="rc-avatar-input" accept="image/*">
        <div class="rc-info">
          <h2 class="rc-name">${escapeHtml(person.name)}</h2>
          <div class="rc-relationship-type">${person.relationship || 'Contact'}</div>
          
          <div class="rc-strength">
            <div class="rc-strength-bar">
              <div class="rc-strength-fill" style="width: ${strengthPercent}%; background: ${strengthColor};"></div>
            </div>
            <span class="rc-strength-label">
              <span class="rc-strength-trend ${person.strengthTrend || 'stable'}">${trendIcon}</span>
              ${trendLabel}
            </span>
          </div>
          
          ${lastContactText ? `<div class="rc-last-contact">${lastContactText}</div>` : ''}
        </div>
      </div>
      
      <div class="rc-quick-actions" role="button" tabindex="0">
        ${person.phone ? `<button aria-label="${t('accessibility.call')}" class="rc-quick-action" data-action="call">${ICONS.phone} Call</button>` : ''}
        ${person.phone ? `<button aria-label="${t('accessibility.text')}" class="rc-quick-action" data-action="text">${ICONS.message} Text</button>` : ''}
        ${person.email ? `<button aria-label="${t('accessibility.email')}" class="rc-quick-action" data-action="email">${ICONS.mail} Email</button>` : ''}
        <button aria-label="${t('accessibility.add')}" class="rc-quick-action" data-action="record">${ICONS.plus} Log Moment</button>
        <button aria-label="${t('accessibility.edit')}" class="rc-quick-action" data-action="edit">${ICONS.edit} Edit</button>
      </div>
    </div>
  `;
}

function renderNotices(): string {
  if (state.notices.length === 0) return '';

  return `
    <div class="rc-notices">
      <div class="rc-notices-header">
        ${ICONS.sparkles} Ferni Notices
      </div>
      ${state.notices.map(notice => `
        <div class="rc-notice">
          <div class="rc-notice-icon">${getNoticeIcon(notice.type)}</div>
          <div class="rc-notice-content">
            ${escapeHtml(notice.message)}
            ${notice.actionLabel ? `
              <button class="rc-notice-action" data-notice-action="${notice.actionType}">${notice.actionLabel}</button>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderTabs(): string {
  const tabs = [
    { id: 'overview', label: 'Overview', icon: ICONS.heart },
    { id: 'timeline', label: 'Timeline', icon: ICONS.clock },
    { id: 'gifts', label: 'Gifts', icon: ICONS.gift },
    { id: 'events', label: 'Events', icon: ICONS.calendar },
    { id: 'notes', label: 'Notes', icon: ICONS.fileText },
  ];

  return `
    <div class="rc-tabs">
      ${tabs.map(tab => `
        <button class="rc-tab ${state.activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
          ${tab.icon}
          ${tab.label}
        </button>
      `).join('')}
    </div>
  `;
}

function renderTabContent(): string {
  switch (state.activeTab) {
    case 'overview': return renderOverviewTab();
    case 'timeline': return renderTimelineTab();
    case 'gifts': return renderGiftsTab();
    case 'events': return renderEventsTab();
    case 'notes': return renderNotesTab();
    default: return renderOverviewTab();
  }
}

function renderOverviewTab(): string {
  const person = state.person!;
  
  // Upcoming dates
  const upcomingDates = (person.importantDates || [])
    .filter(d => d.daysUntil !== undefined && d.daysUntil >= 0 && d.daysUntil <= 60)
    .sort((a, b) => (a.daysUntil || 0) - (b.daysUntil || 0));

  // Recent timeline (last 5)
  const recentTimeline = state.timeline.slice(0, 5);

  // Upcoming meetings with this person
  const upcomingMeetings = state.sharedCalendar?.upcoming || [];

  return `
    ${upcomingMeetings.length > 0 ? `
      <div class="rc-section">
        <div class="rc-section-title">${ICONS.calendar} Scheduled Together</div>
        ${upcomingMeetings.slice(0, 3).map(meeting => {
          const meetingDate = new Date(meeting.date);
          const daysUntil = Math.ceil((meetingDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return `
            <div class="rc-event-item">
              <div class="rc-event-date">
                <span class="rc-event-date-month">${meetingDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</span>
                <span class="rc-event-date-day">${meetingDate.getDate()}</span>
              </div>
              <div class="rc-event-info">
                <div class="rc-event-title">${escapeHtml(meeting.title)}</div>
                <div class="rc-event-meta">
                  ${daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`}
                  · ${meetingDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  ${meeting.location ? ` · ${escapeHtml(meeting.location)}` : ''}
                </div>
              </div>
            </div>
          `;
        }).join('')}
        ${upcomingMeetings.length > 3 ? `
          <button aria-label="${t('accessibility.viewAllScheduledMeetings')}" class="rc-add-btn" data-action="view-all-events" style="margin-top: var(--space-2, 0.5rem);">
            View all ${upcomingMeetings.length} scheduled meetings
          </button>
        ` : ''}
      </div>
    ` : ''}
    
    ${upcomingDates.length > 0 ? `
      <div class="rc-section">
        <div class="rc-section-title">${ICONS.heart} Coming Up</div>
        ${upcomingDates.map(date => `
          <div class="rc-event-item">
            <div class="rc-event-date">
              <span class="rc-event-date-month">${getMonthAbbrev(date.date)}</span>
              <span class="rc-event-date-day">${getDayNumber(date.date)}</span>
            </div>
            <div class="rc-event-info">
              <div class="rc-event-title">${date.label || date.type}</div>
              <div class="rc-event-meta">${date.daysUntil === 0 ? 'Today!' : date.daysUntil === 1 ? 'Tomorrow' : `In ${date.daysUntil} days`}</div>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}
    
    <div class="rc-section">
      <div class="rc-section-title">${ICONS.clock} Recent Activity</div>
      ${recentTimeline.length > 0 ? 
        recentTimeline.map(item => renderTimelineItem(item)).join('') :
        `<div class="rc-empty">
          <p class="rc-empty-text">No activity recorded yet. Log your first moment together!</p>
        </div>`
      }
      ${state.timeline.length > 5 ? `
        <button aria-label="${t('accessibility.viewAllMoments')}" class="rc-add-btn" data-action="view-all-timeline">
          View all ${state.timeline.length} moments
        </button>
      ` : ''}
    </div>
    
    ${person.interests && person.interests.length > 0 ? `
      <div class="rc-section">
        <div class="rc-section-title">${ICONS.star} Their Interests</div>
        <div class="rc-interests">
          ${person.interests.map(interest => `
            <span class="rc-interest-tag">${escapeHtml(interest)}</span>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

function renderTimelineTab(): string {
  if (state.isLoadingSection) {
    return '<div class="rc-loading">Loading your story together...</div>';
  }

  if (state.timeline.length === 0) {
    return `
      <div class="rc-empty">
        <div class="rc-empty-icon">${ICONS.clock}</div>
        <div class="rc-empty-title">No moments recorded</div>
        <p class="rc-empty-text">Every call, text, coffee date, and hangout becomes part of your story together.</p>
      </div>
      <button aria-label="${t('accessibility.add')}" class="rc-add-btn" data-action="add-interaction">
        ${ICONS.plus} Log a Moment
      </button>
    `;
  }

  // Group by month
  const grouped = groupTimelineByMonth(state.timeline);

  return Object.entries(grouped).map(([month, items]) => `
    <div class="rc-section">
      <div class="rc-section-title">${month}</div>
      ${items.map(item => renderTimelineItem(item)).join('')}
    </div>
  `).join('') + `
    <button aria-label="${t('accessibility.add')}" class="rc-add-btn" data-action="add-interaction">
      ${ICONS.plus} Log a Moment
    </button>
  `;
}

function renderTimelineItem(item: TimelineItem): string {
  const date = new Date(item.date);
  const icon = getTimelineIcon(item.type);
  
  return `
    <div class="rc-timeline-item">
      <div class="rc-timeline-icon ${item.direction}">
        ${icon}
      </div>
      <div class="rc-timeline-content">
        <div class="rc-timeline-title">${escapeHtml(item.title)}</div>
        <div class="rc-timeline-meta">
          ${formatDate(date)}
          ${item.duration ? ` · ${item.duration} min` : ''}
          ${item.platform ? ` · ${item.platform}` : ''}
          ${item.sentiment ? `<span class="rc-sentiment-dot ${item.sentiment}"></span>` : ''}
        </div>
        ${item.summary ? `<div class="rc-timeline-summary">${escapeHtml(item.summary)}</div>` : ''}
        ${item.topics && item.topics.length > 0 ? `
          <div class="rc-timeline-topics">
            ${item.topics.map(topic => `<span class="rc-topic-tag">${escapeHtml(topic)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderGiftsTab(): string {
  if (state.isLoadingSection) {
    return '<div class="rc-loading">Loading gift history...</div>';
  }

  const givenGifts = state.gifts.filter(g => g.direction === 'given');
  const receivedGifts = state.gifts.filter(g => g.direction === 'received');

  if (state.gifts.length === 0) {
    return `
      <div class="rc-empty">
        <div class="rc-empty-icon">${ICONS.gift}</div>
        <div class="rc-empty-title">No gifts recorded</div>
        <p class="rc-empty-text">Track what you give and receive. Never repeat a gift or forget a reaction.</p>
      </div>
      <button aria-label="${t('accessibility.add')}" class="rc-add-btn" data-action="add-gift">
        ${ICONS.plus} Record a Gift
      </button>
    `;
  }

  return `
    ${givenGifts.length > 0 ? `
      <div class="rc-section">
        <div class="rc-section-title">Gifts You've Given</div>
        ${givenGifts.map(gift => renderGiftItem(gift)).join('')}
      </div>
    ` : ''}
    
    ${receivedGifts.length > 0 ? `
      <div class="rc-section">
        <div class="rc-section-title">Gifts You've Received</div>
        ${receivedGifts.map(gift => renderGiftItem(gift)).join('')}
      </div>
    ` : ''}
    
    <button aria-label="${t('accessibility.add')}" class="rc-add-btn" data-action="add-gift">
      ${ICONS.plus} Record a Gift
    </button>
  `;
}

function renderGiftItem(gift: Gift): string {
  const date = new Date(gift.date);
  const reactionLabel = gift.reaction === 'loved' ? 'Loved it' :
                        gift.reaction === 'liked' ? 'Liked it' :
                        gift.reaction === 'neutral' ? 'Meh' :
                        gift.reaction === 'disliked' ? 'Not their thing' : null;

  return `
    <div class="rc-gift-item">
      <div class="rc-gift-direction ${gift.direction}">
        ${gift.direction === 'given' ? ICONS.send : ICONS.gift}
      </div>
      <div class="rc-gift-info">
        <div class="rc-gift-name">${escapeHtml(gift.item)}</div>
        <div class="rc-gift-meta">
          ${escapeHtml(gift.occasion)} · ${formatDate(date)}
          ${gift.price ? ` · $${gift.price}` : ''}
        </div>
        ${reactionLabel && gift.direction === 'given' ? `
          <span class="rc-gift-reaction ${gift.reaction}" role="button" tabindex="0">${reactionLabel}</span>
        ` : ''}
      </div>
    </div>
  `;
}

function renderEventsTab(): string {
  if (state.isLoadingSection) {
    return '<div class="rc-loading">Loading events...</div>';
  }

  const person = state.person!;
  const upcomingEvents = state.events.filter(e => e.type === 'upcoming');
  const pastEvents = state.events.filter(e => e.type === 'past');
  const importantDates = person.importantDates || [];

  return `
    <!-- Important Dates Section -->
    <div class="rc-section">
      <div class="rc-section-title">${ICONS.star} Important Dates</div>
      ${importantDates.length > 0 ? `
        ${importantDates.map(d => {
          const typeLabel = d.type === 'birthday' ? 'Birthday' :
                           d.type === 'anniversary' ? 'Anniversary' :
                           d.type === 'memorial' ? 'Memorial' : d.label || 'Custom';
          return `
            <div class="rc-date-item">
              <div class="rc-date-label">${typeLabel}</div>
              <div class="rc-date-value">${formatDateStr(d.date)}</div>
              ${d.daysUntil !== undefined && d.daysUntil >= 0 && d.daysUntil <= 30 ? `
                <span class="rc-date-badge">${d.daysUntil === 0 ? 'Today!' : d.daysUntil === 1 ? 'Tomorrow' : `In ${d.daysUntil} days`}</span>
              ` : ''}
            </div>
          `;
        }).join('')}
      ` : `
        <p class="rc-empty-inline">No important dates yet</p>
      `}
      <button aria-label="${t('accessibility.edit')}" class="rc-add-btn" data-action="manage-dates">
        ${ICONS.edit} ${importantDates.length > 0 ? 'Manage Dates' : 'Add Birthday, Anniversary...'}
      </button>
    </div>
    
    <!-- Calendar Events Section -->
    ${upcomingEvents.length > 0 ? `
      <div class="rc-section">
        <div class="rc-section-title">${ICONS.calendar} Upcoming Together</div>
        ${upcomingEvents.map(event => renderEventItem(event)).join('')}
      </div>
    ` : ''}
    
    ${pastEvents.length > 0 ? `
      <div class="rc-section">
        <div class="rc-section-title">Past Events</div>
        ${pastEvents.map(event => renderEventItem(event)).join('')}
      </div>
    ` : ''}
    
    ${upcomingEvents.length === 0 && pastEvents.length === 0 ? `
      <div class="rc-empty-inline" style="margin-top: var(--space-4, 1rem);">
        <p>No calendar events found with ${escapeHtml(person.name)}.</p>
      </div>
    ` : ''}
  `;
}

function renderEventItem(event: CalendarEvent): string {
  const date = new Date(event.date);
  
  return `
    <div class="rc-event-item">
      <div class="rc-event-date">
        <span class="rc-event-date-month">${date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</span>
        <span class="rc-event-date-day">${date.getDate()}</span>
      </div>
      <div class="rc-event-info">
        <div class="rc-event-title">${escapeHtml(event.title)}</div>
        ${event.location ? `<div class="rc-event-meta">${ICONS.mapPin} ${escapeHtml(event.location)}</div>` : ''}
      </div>
    </div>
  `;
}

function renderNotesTab(): string {
  const person = state.person!;

  return `
    ${person.howWeMet ? `
      <div class="rc-notes-section">
        <div class="rc-notes-label">${ICONS.users} How you met</div>
        <div class="rc-notes-content">${escapeHtml(person.howWeMet)}</div>
      </div>
    ` : ''}
    
    ${person.interests && person.interests.length > 0 ? `
      <div class="rc-notes-section">
        <div class="rc-notes-label">${ICONS.star} Their interests</div>
        <div class="rc-interests">
          ${person.interests.map(i => `<span class="rc-interest-tag">${escapeHtml(i)}</span>`).join('')}
        </div>
      </div>
    ` : ''}
    
    ${person.recentTopics && person.recentTopics.length > 0 ? `
      <div class="rc-notes-section">
        <div class="rc-notes-label">${ICONS.message} Recent topics</div>
        <div class="rc-interests">
          ${person.recentTopics.map(t => `<span class="rc-interest-tag">${escapeHtml(t)}</span>`).join('')}
        </div>
      </div>
    ` : ''}
    
    ${person.sensitiveTopics && person.sensitiveTopics.length > 0 ? `
      <div class="rc-notes-section">
        <div class="rc-notes-label">Things to avoid</div>
        <div class="rc-interests">
          ${person.sensitiveTopics.map(t => `<span class="rc-sensitive-tag">${escapeHtml(t)}</span>`).join('')}
        </div>
      </div>
    ` : ''}
    
    ${person.notes ? `
      <div class="rc-notes-section">
        <div class="rc-notes-label">${ICONS.fileText} Your notes</div>
        <div class="rc-notes-content">${escapeHtml(person.notes)}</div>
      </div>
    ` : ''}
    
    <button aria-label="${t('accessibility.edit')}" class="rc-add-btn" data-action="edit-notes">
      ${ICONS.edit} ${person.notes ? 'Edit Notes' : 'Add Notes'}
    </button>
  `;
}

// ============================================================================
// EVENT BINDING
// ============================================================================

function bindEvents(): void {
  if (!cardContainer) return;

  // Close button
  cardContainer.querySelector('.rc-close')?.addEventListener('click', closeRelationshipCard);

  // Backdrop click
  cardContainer.querySelector('.relationship-card-backdrop')?.addEventListener('click', closeRelationshipCard);

  // Tabs
  cardContainer.querySelectorAll('.rc-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab') as RelationshipCardState['activeTab'];
      if (tabId) {
        state.activeTab = tabId;
        render();
      }
    });
  });

  // Quick actions
  cardContainer.querySelectorAll('.rc-quick-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      handleQuickAction(action);
    });
  });

  // Add buttons
  cardContainer.querySelectorAll('.rc-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      handleAddAction(action);
    });
  });

  // Avatar photo upload
  const avatarInput = cardContainer.querySelector('#rc-avatar-input') as HTMLInputElement;
  if (avatarInput) {
    avatarInput.addEventListener('change', async () => {
      if (avatarInput.files && avatarInput.files[0] && state.person) {
        await handlePhotoUpload(avatarInput.files[0]);
      }
    });
  }

  // Escape key
  document.addEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closeRelationshipCard();
  }
}

function handleQuickAction(action: string | null): void {
  if (!state.person) return;

  switch (action) {
    case 'call':
      openSendMessage({
        contactId: state.person.contactId,
        contactName: state.person.name,
        phone: state.person.phone,
        email: state.person.email,
        defaultChannel: 'call',
      });
      break;
    case 'text':
      openSendMessage({
        contactId: state.person.contactId,
        contactName: state.person.name,
        phone: state.person.phone,
        email: state.person.email,
        defaultChannel: 'text',
      });
      break;
    case 'email':
      openSendMessage({
        contactId: state.person.contactId,
        contactName: state.person.name,
        phone: state.person.phone,
        email: state.person.email,
        defaultChannel: 'email',
      });
      break;
    case 'record':
      // Open the Log a Moment modal
      openLogMoment({
        contactId: state.person.contactId,
        contactName: state.person.name,
        onSuccess: () => {
          // Reload timeline after logging
          if (state.person) {
            loadRelationshipData(state.person.contactId);
          }
        },
      });
      break;
    case 'edit':
      // Open the Edit Person modal
      openEditPerson({
        person: {
          id: state.person.id,
          contactId: state.person.contactId,
          name: state.person.name,
          relationship: state.person.relationship,
          email: state.person.email,
          phone: state.person.phone,
          howWeMet: state.person.howWeMet,
          notes: state.person.notes,
          interests: state.person.interests,
          sensitiveTopics: state.person.sensitiveTopics,
          preferredChannel: state.person.preferredChannel,
          bestTimeToReach: state.person.bestTimeToReach,
        } as PersonData,
        onSuccess: () => {
          // Reload person data after editing
          if (state.person) {
            loadRelationshipData(state.person.contactId);
          }
        },
        onDelete: () => {
          // Close the relationship card after deletion
          closeRelationshipCard();
        },
      });
      break;
  }
}

function handleAddAction(action: string | null): void {
  switch (action) {
    case 'add-interaction':
      if (state.person) {
        openLogMoment({
          contactId: state.person.contactId,
          contactName: state.person.name,
          onSuccess: () => {
            // Reload timeline after logging
            if (state.person) {
              loadRelationshipData(state.person.contactId);
            }
          },
        });
      }
      break;
    case 'view-all-timeline':
      state.activeTab = 'timeline';
      render();
      break;
    case 'add-gift':
      if (state.person) {
        openRecordGift({
          contactId: state.person.contactId,
          contactName: state.person.name,
          onSuccess: () => {
            // Reload gifts after recording
            if (state.person) {
              loadRelationshipData(state.person.contactId);
            }
          },
        });
      }
      break;
    case 'manage-dates':
      if (state.person) {
        // Convert to ImportantDates UI format (add recurring field)
        const existingDates = (state.person.importantDates || []).map(d => ({
          date: d.date,
          type: d.type,
          label: d.label,
          recurring: true, // Default to recurring for birthdays/anniversaries
        }));
        openImportantDates({
          contactId: state.person.contactId,
          contactName: state.person.name,
          existingDates,
          onSuccess: () => {
            // Reload after saving dates
            if (state.person) {
              loadRelationshipData(state.person.contactId);
            }
          },
        });
      }
      break;
    case 'gift-ideas':
      if (state.person) {
        openGiftSuggestions({
          contactId: state.person.contactId,
          contactName: state.person.name,
          interests: state.person.interests,
          onSelect: () => {
            // After selecting a gift idea, open the record gift form
            openRecordGift({
              contactId: state.person!.contactId,
              contactName: state.person!.name,
              onSuccess: () => {
                if (state.person) {
                  loadRelationshipData(state.person.contactId);
                }
              },
            });
          },
        });
      }
      break;
    case 'conversation-starters':
      if (state.person) {
        const lastContactDate = state.person.lastInteraction 
          ? new Date(state.person.lastInteraction).toISOString()
          : undefined;
        openConversationStarters({
          contactId: state.person.contactId,
          contactName: state.person.name,
          lastContact: lastContactDate,
          sharedInterests: state.person.interests,
          onSelect: (_starter) => {
            // Copy the opener to clipboard (handled internally)
            // Could also open send message with the starter pre-filled
          },
        });
      }
      break;
    case 'edit-notes':
      toast.info(t('toasts.editNotesComingSoon'));
      break;
  }
}

async function handlePhotoUpload(file: File): Promise<void> {
  if (!state.person) return;

  // Validate file
  if (!file.type.startsWith('image/')) {
    toast.error(t('toasts.pleaseSelectAnImageFile'));
    return;
  }

  if (file.size > 5 * 1024 * 1024) { // 5MB limit
    toast.error(t('toasts.imageMustBeLessThan5mb'));
    return;
  }

  toast.info(t('toasts.uploadingPhoto'));

  try {
    // Convert to base64 for simple storage (in production, use Cloud Storage)
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Update contact with photo
    const response = await apiFetch(`/api/contacts/${state.person.contactId}`, {
      method: 'PUT',
      body: JSON.stringify({ photo: base64 }),
    });

    if (response.ok) {
      state.person.photo = base64;
      render();
      toast.success(t('toasts.photoUpdated'));
    } else {
      toast.error(t('toasts.couldNotSavePhoto'));
    }
  } catch (error) {
    log.error('Failed to upload photo:', error);
    toast.error(t('toasts.couldNotUploadPhoto'));
  }
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

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateStr(dateStr: string): string {
  // Handle MM-DD or YYYY-MM-DD format
  const parts = dateStr.split('-');
  let month: number, day: number;
  
  if (parts.length === 3) {
    month = parseInt(parts[1] ?? '1', 10) - 1;
    day = parseInt(parts[2] ?? '1', 10);
  } else {
    month = parseInt(parts[0] ?? '1', 10) - 1;
    day = parseInt(parts[1] ?? '1', 10);
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  return `${monthNames[month] ?? 'January'} ${day}`;
}

function getMonthAbbrev(dateStr: string): string {
  // Handle MM-DD or YYYY-MM-DD format
  const parts = dateStr.split('-');
  const monthNum = parts.length === 3 ? parseInt(parts[1] ?? '1') : parseInt(parts[0] ?? '1');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return months[monthNum - 1] ?? 'JAN';
}

function getDayNumber(dateStr: string): string {
  const parts = dateStr.split('-');
  return parts.length === 3 ? (parts[2] ?? '1') : (parts[1] ?? '1');
}

function groupTimelineByMonth(items: TimelineItem[]): Record<string, TimelineItem[]> {
  return items.reduce((acc, item) => {
    const date = new Date(item.date);
    const key = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, TimelineItem[]>);
}

function getTimelineIcon(type: TimelineItemType): string {
  const icons: Record<string, string> = {
    call: ICONS.phone,
    text: ICONS.message,
    email: ICONS.mail,
    video_call: ICONS.video,
    voice_message: ICONS.phone,
    hangout: ICONS.coffee,
    dinner: ICONS.coffee,
    activity: ICONS.users,
    trip: ICONS.mapPin,
    visit: ICONS.mapPin,
    gift_given: ICONS.gift,
    gift_received: ICONS.gift,
    card_sent: ICONS.mail,
    card_received: ICONS.mail,
    social_interaction: ICONS.users,
    meeting: ICONS.calendar,
    milestone: ICONS.star,
  };
  return icons[type] || ICONS.clock;
}

function getNoticeIcon(type: string): string {
  switch (type) {
    case 'insight': return ICONS.lightbulb;
    case 'reminder': return ICONS.calendar;
    case 'suggestion': return ICONS.gift;
    case 'celebration': return ICONS.star;
    default: return ICONS.sparkles;
  }
}

// ============================================================================
// API CALLS
// ============================================================================

async function loadRelationshipData(contactId: string): Promise<void> {
  state.isLoading = true;
  const useMockData = shouldUseDemoData();

  try {
    // Load person details
    const personRes = await apiFetch(`/api/contacts/${contactId}`);
    if (personRes.ok) {
      const personData = await personRes.json();
      state.person = personData.contact || personData;
    } else if (useMockData) {
      // Fall back to mock data
      const mockPerson = getMockContact(contactId);
      if (mockPerson) {
        state.person = {
          id: mockPerson.id,
          contactId: mockPerson.contactId,
          name: mockPerson.name,
          relationship: mockPerson.relationship,
          email: mockPerson.email,
          phone: mockPerson.phone,
          howWeMet: mockPerson.howWeMet,
          notes: mockPerson.notes,
          interests: mockPerson.interests,
          strengthScore: mockPerson.relationshipStrength,
          lastInteraction: mockPerson.lastContact,
          importantDates: mockPerson.importantDates?.map(d => ({
            type: d.type,
            date: d.date,
            label: d.label,
          })),
        };
        log.debug('Using mock person data');
      }
    }

    // Load timeline
    const timelineRes = await apiFetch(`/api/contacts/${contactId}/interactions`);
    if (timelineRes.ok) {
      const timelineData = await timelineRes.json();
      state.timeline = (timelineData.history || []).map((item: TimelineItem) => ({
        ...item,
        title: formatInteractionTitle(item),
      }));
    } else if (useMockData) {
      // Fall back to mock interactions
      const mockInteractions = getMockInteractions(contactId);
      state.timeline = mockInteractions.map(item => ({
        ...item,
        direction: 'outbound' as const,
        title: item.summary || item.type,
      })) as TimelineItem[];
      log.debug('Using mock timeline data');
    }

    // Load gifts
    const giftsRes = await apiFetch(`/api/gifts/contact/${contactId}/history`);
    if (giftsRes.ok) {
      const giftsData = await giftsRes.json();
      state.gifts = [
        ...(giftsData.history?.given || []).map((g: Gift) => ({ ...g, direction: 'given' as const })),
        ...(giftsData.history?.received || []).map((g: Gift) => ({ ...g, direction: 'received' as const })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } else if (useMockData) {
      // Fall back to mock gifts
      const mockGifts = getMockGifts(contactId);
      state.gifts = mockGifts.map(g => ({
        ...g,
        direction: g.direction as 'given' | 'received',
      })) as Gift[];
      log.debug('Using mock gift data');
    }

    // Load shared calendar context (meetings with this person)
    if (state.person?.email) {
      try {
        const calendarRes = await apiFetch(`/api/calendar/with/${encodeURIComponent(state.person.email)}`);
        if (calendarRes.ok) {
          const calendarData = await calendarRes.json();
          state.sharedCalendar = {
            upcoming: (calendarData.upcoming || []).map((e: { id: string; title: string; startTime: string; endTime: string; location?: string; attendees?: string[] }) => ({
              id: e.id,
              title: e.title,
              date: new Date(e.startTime),
              endDate: new Date(e.endTime),
              location: e.location,
              type: 'upcoming' as const,
              attendees: e.attendees,
            })),
            past: (calendarData.past || []).map((e: { id: string; title: string; startTime: string; endTime: string; location?: string; attendees?: string[] }) => ({
              id: e.id,
              title: e.title,
              date: new Date(e.startTime),
              endDate: new Date(e.endTime),
              location: e.location,
              type: 'past' as const,
              attendees: e.attendees,
            })),
          };

          // Calculate days until next meeting
          const nextMeeting = state.sharedCalendar.upcoming[0];
          if (nextMeeting) {
            const today = new Date();
            const meetingDate = new Date(nextMeeting.date);
            state.sharedCalendar.nextMeetingDaysUntil = Math.ceil(
              (meetingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
            );
          }
        }
      } catch (calError) {
        log.debug('Could not fetch shared calendar:', calError);
        state.sharedCalendar = null;
      }
    }

    // Generate Ferni notices (intelligent insights)
    state.notices = generateNotices();

  } catch (error) {
    log.error('Failed to load relationship data:', error);
    
    // In dev mode, try to use mock data on exception
    if (useMockData) {
      const mockPerson = getMockContact(contactId);
      if (mockPerson) {
        state.person = {
          id: mockPerson.id,
          contactId: mockPerson.contactId,
          name: mockPerson.name,
          relationship: mockPerson.relationship,
          email: mockPerson.email,
          phone: mockPerson.phone,
          howWeMet: mockPerson.howWeMet,
          notes: mockPerson.notes,
          interests: mockPerson.interests,
          strengthScore: mockPerson.relationshipStrength,
          lastInteraction: mockPerson.lastContact,
          importantDates: mockPerson.importantDates?.map(d => ({
            type: d.type,
            date: d.date,
            label: d.label,
          })),
        };
        state.timeline = getMockInteractions(contactId).map(item => ({
          ...item,
          direction: 'outbound' as const,
          title: item.summary || item.type,
        })) as TimelineItem[];
        state.gifts = getMockGifts(contactId).map(g => ({
          ...g,
          direction: g.direction as 'given' | 'received',
        })) as Gift[];
        state.notices = generateNotices();
        log.debug('Using mock data due to API error');
      } else {
        toast.error(t('toasts.couldNotLoadRelationship'));
      }
    } else {
      toast.error(t('toasts.couldNotLoadRelationship'));
    }
  } finally {
    state.isLoading = false;
    render();
  }
}

function formatInteractionTitle(item: TimelineItem): string {
  const typeLabels: Record<string, string> = {
    call: 'Phone call',
    text: 'Text message',
    email: 'Email',
    video_call: 'Video call',
    voice_message: 'Voice message',
    hangout: 'Hung out',
    dinner: 'Had dinner',
    activity: 'Did something together',
    trip: 'Trip together',
    visit: 'Visited',
    gift_given: 'Gave a gift',
    gift_received: 'Received a gift',
    card_sent: 'Sent a card',
    card_received: 'Received a card',
    social_interaction: 'Social interaction',
    meeting: 'Meeting',
    milestone: 'Milestone',
  };
  
  const base = typeLabels[item.type] || 'Connected';
  const direction = item.direction === 'inbound' ? ' (they reached out)' :
                    item.direction === 'outbound' ? ' (you reached out)' : '';
  return base + direction;
}

function generateNotices(): FerniNotice[] {
  const notices: FerniNotice[] = [];
  const person = state.person;
  if (!person) return notices;

  // Days since contact notice
  if (person.daysSinceContact && person.daysSinceContact > 14) {
    notices.push({
      id: 'reconnect',
      type: 'reminder',
      priority: 'medium',
      message: `It's been ${person.daysSinceContact} days since you connected. Might be time to reach out?`,
      actionLabel: 'Send a message',
      actionType: 'send-message',
    });
  }

  // Upcoming date notice
  const upcomingDate = (person.importantDates || []).find(d => d.daysUntil !== undefined && d.daysUntil >= 0 && d.daysUntil <= 7);
  if (upcomingDate) {
    notices.push({
      id: 'upcoming-date',
      type: 'reminder',
      priority: 'high',
      message: `${upcomingDate.label || upcomingDate.type} is ${upcomingDate.daysUntil === 0 ? 'today!' : upcomingDate.daysUntil === 1 ? 'tomorrow!' : `in ${upcomingDate.daysUntil} days`}`,
    });
  }

  // Last gift insight
  const lastGift = state.gifts.find(g => g.direction === 'given');
  if (lastGift?.reaction) {
    const reactionText = lastGift.reaction === 'loved' ? 'loved' :
                         lastGift.reaction === 'liked' ? 'liked' :
                         lastGift.reaction === 'neutral' ? 'was meh about' : 'didn\'t love';
    notices.push({
      id: 'last-gift',
      type: 'insight',
      priority: 'low',
      message: `Last time, you gave ${lastGift.item} and they ${reactionText} it.`,
    });
  }

  // Strength trend notice
  if (person.strengthTrend === 'growing') {
    notices.push({
      id: 'growing',
      type: 'celebration',
      priority: 'low',
      message: `Your relationship with ${person.name} is getting stronger!`,
    });
  }

  return notices.slice(0, 3); // Max 3 notices
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the relationship card for a person
 */
export async function openRelationshipCard(
  contactId: string,
  options?: { onClose?: () => void }
): Promise<void> {
  // Cleanup any existing card
  closeRelationshipCard();

  injectStyles();

  onCloseCallback = options?.onClose || null;

  // Reset state
  state = {
    person: null,
    activeTab: 'overview',
    timeline: [],
    gifts: [],
    events: [],
    sharedCalendar: null,
    notices: [],
    isLoading: true,
    isLoadingSection: false,
  };

  // Create container
  cardContainer = document.createElement('div');
  cardContainer.className = 'relationship-card-overlay';
  cardContainer.innerHTML = `
    <div class="relationship-card-backdrop"></div>
    <div class="relationship-card" role="dialog" aria-modal="true">
      <div class="rc-loading">Loading...</div>
    </div>
  `;
  document.body.appendChild(cardContainer);

  // Animate in
  requestAnimationFrame(() => {
    cardContainer?.classList.add('open');
  });

  // Load data
  await loadRelationshipData(contactId);

  log.info({ contactId }, 'Opened relationship card');
}

/**
 * Close the relationship card
 */
export function closeRelationshipCard(): void {
  if (!cardContainer) return;

  document.removeEventListener('keydown', handleEscapeKey);
  
  cardContainer.classList.remove('open');
  
  setTimeout(() => {
    cardContainer?.remove();
    cardContainer = null;
    
    if (onCloseCallback) {
      onCloseCallback();
      onCloseCallback = null;
    }
  }, DURATION.NORMAL);

  log.info('Closed relationship card');
}

// Export for use in other modules
export const relationshipCard = {
  open: openRelationshipCard,
  close: closeRelationshipCard,
};

export default relationshipCard;

