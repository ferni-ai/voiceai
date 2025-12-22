/**
 * Record a Gift UI
 *
 * Quick-capture form for recording gifts given and received.
 * Tracks what you gave, when, the occasion, and most importantly - their reaction.
 *
 * Design Philosophy:
 * - Never repeat a gift
 * - Remember what they loved
 * - Build a history for better future gift ideas
 *
 * @module ui/record-gift
 */

import { createLogger } from '../utils/logger.js';
import { toast } from './toast.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiFetch } from '../utils/api-helpers.js';

const log = createLogger('RecordGiftUI');

// ============================================================================
// TYPES
// ============================================================================

export type GiftOccasion =
  | 'birthday'
  | 'christmas'
  | 'anniversary'
  | 'valentines'
  | 'mothers_day'
  | 'fathers_day'
  | 'graduation'
  | 'wedding'
  | 'baby_shower'
  | 'housewarming'
  | 'thank_you'
  | 'just_because'
  | 'other';

export type GiftReaction = 'loved' | 'liked' | 'neutral' | 'disliked';

export interface RecordGiftData {
  contactId: string;
  direction: 'given' | 'received';
  item: string;
  description?: string;
  occasion: GiftOccasion | string;
  date: string;
  price?: number;
  reaction?: GiftReaction;
  notes?: string;
  tags?: string[];
}

export interface RecordGiftOptions {
  contactId: string;
  contactName: string;
  preselectedDirection?: 'given' | 'received';
  onSuccess?: (data: RecordGiftData) => void;
  onClose?: () => void;
}

// ============================================================================
// STATE
// ============================================================================

interface RecordGiftState {
  isOpen: boolean;
  contactId: string;
  contactName: string;
  direction: 'given' | 'received';
  item: string;
  description: string;
  occasion: GiftOccasion | string;
  customOccasion: string;
  date: string;
  price: string;
  reaction: GiftReaction | '';
  notes: string;
  tags: string;
  isSubmitting: boolean;
  showAdvanced: boolean;
}

let state: RecordGiftState = {
  isOpen: false,
  contactId: '',
  contactName: '',
  direction: 'given',
  item: '',
  description: '',
  occasion: 'birthday',
  customOccasion: '',
  date: new Date().toISOString().split('T')[0],
  price: '',
  reaction: '',
  notes: '',
  tags: '',
  isSubmitting: false,
  showAdvanced: false,
};

let modalContainer: HTMLElement | null = null;
let callbacks: { onSuccess?: (data: RecordGiftData) => void; onClose?: () => void } = {};

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  gift: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6"/><rect x="2" y="7" width="20" height="5" rx="2"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
  send: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/></svg>`,
  inbox: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  heart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  thumbsUp: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg>`,
  meh: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" x2="16" y1="15" y2="15"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/></svg>`,
  thumbsDown: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"/></svg>`,
  chevronDown: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
};

// Occasion definitions
const OCCASIONS: { id: GiftOccasion; label: string }[] = [
  { id: 'birthday', label: 'Birthday' },
  { id: 'christmas', label: 'Christmas' },
  { id: 'anniversary', label: 'Anniversary' },
  { id: 'valentines', label: "Valentine's Day" },
  { id: 'mothers_day', label: "Mother's Day" },
  { id: 'fathers_day', label: "Father's Day" },
  { id: 'graduation', label: 'Graduation' },
  { id: 'wedding', label: 'Wedding' },
  { id: 'baby_shower', label: 'Baby Shower' },
  { id: 'housewarming', label: 'Housewarming' },
  { id: 'thank_you', label: 'Thank You' },
  { id: 'just_because', label: 'Just Because' },
  { id: 'other', label: 'Other...' },
];

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('record-gift-styles')) return;

  const style = document.createElement('style');
  style.id = 'record-gift-styles';
  style.textContent = `
    /* =========================================================================
       RECORD A GIFT - Gift Capture Form
       ========================================================================= */
    
    .record-gift-overlay {
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

    .record-gift-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .record-gift-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy, rgba(44, 37, 32, 0.5));
      backdrop-filter: blur(var(--glass-blur-strong, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-strong, 24px));
    }

    .record-gift-modal {
      position: relative;
      width: 94%;
      max-width: clamp(308px, 90vw, 440px);
      max-height: 90vh;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.96) translateY(8px);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .record-gift-overlay.open .record-gift-modal {
      transform: scale(1) translateY(0);
    }

    /* =========================================================================
       HEADER
       ========================================================================= */
    
    .rg-header {
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem) var(--space-4, 1rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
    }

    .rg-header-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
    }

    .rg-eyebrow {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 0.25rem);
    }

    .rg-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
      line-height: 1.2;
    }

    .rg-close {
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

    .rg-close:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      color: var(--color-text-primary, #2C2520);
    }

    /* =========================================================================
       CONTENT
       ========================================================================= */
    
    .rg-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
    }

    .rg-section {
      margin-bottom: var(--space-5, 1.25rem);
    }

    .rg-section:last-child {
      margin-bottom: 0;
    }

    .rg-label {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.03em;
      color: var(--color-text-muted, #70605a);
      margin-bottom: var(--space-2, 0.5rem);
      display: block;
    }

    /* =========================================================================
       DIRECTION SELECTOR
       ========================================================================= */
    
    .rg-directions {
      display: flex;
      gap: var(--space-3, 0.75rem);
    }

    .rg-direction {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      padding: var(--space-4, 1rem);
      border: 2px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-xl, 1.25rem);
      background: transparent;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .rg-direction:hover {
      border-color: var(--color-text-muted, #70605a);
    }

    .rg-direction.selected {
      border-color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.05));
    }

    .rg-direction-icon {
      width: 32px;
      height: 32px;
      color: var(--color-text-muted, #70605a);
      transition: color ${DURATION.FAST}ms;
    }

    .rg-direction.selected .rg-direction-icon {
      color: var(--persona-primary, #4a6741);
    }

    .rg-direction-label {
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      color: var(--color-text-secondary, #5a4a42);
    }

    .rg-direction.selected .rg-direction-label {
      color: var(--persona-primary, #4a6741);
      font-weight: 600;
    }

    /* =========================================================================
       INPUT FIELDS
       ========================================================================= */
    
    .rg-input {
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

    .rg-input:focus {
      border-color: var(--persona-primary, #4a6741);
      box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.1);
    }

    .rg-input::placeholder {
      color: var(--color-text-muted, #70605a);
    }

    .rg-select {
      width: 100%;
      padding: var(--space-2-5, 0.625rem) var(--space-3, 0.75rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      background: var(--color-background-elevated, #FFFDFB);
      color: var(--color-text-primary, #2C2520);
      outline: none;
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2370605a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      padding-right: var(--space-10, 2.5rem);
    }

    .rg-select:focus {
      border-color: var(--persona-primary, #4a6741);
      box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.1);
    }

    .rg-row {
      display: flex;
      gap: var(--space-3, 0.75rem);
    }

    .rg-field {
      flex: 1;
    }

    /* =========================================================================
       REACTION SELECTOR
       ========================================================================= */
    
    .rg-reactions {
      display: flex;
      gap: var(--space-2, 0.5rem);
    }

    .rg-reaction {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1, 0.25rem);
      padding: var(--space-3, 0.75rem) var(--space-2, 0.5rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-lg, 1rem);
      background: transparent;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .rg-reaction:hover {
      border-color: var(--color-text-muted, #70605a);
    }

    .rg-reaction.selected {
      border-color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
    }

    .rg-reaction-icon {
      color: var(--color-text-muted, #70605a);
      transition: color ${DURATION.FAST}ms;
    }

    .rg-reaction.selected .rg-reaction-icon {
      color: var(--persona-primary, #4a6741);
    }

    .rg-reaction-icon svg {
      width: 22px;
      height: 22px;
    }

    .rg-reaction-label {
      font-size: var(--text-xxs, 0.625rem);
      font-weight: 500;
      color: var(--color-text-muted, #70605a);
    }

    .rg-reaction.selected .rg-reaction-label {
      color: var(--persona-primary, #4a6741);
    }

    /* =========================================================================
       ADVANCED OPTIONS
       ========================================================================= */
    
    .rg-advanced-toggle {
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

    .rg-advanced-toggle:hover {
      color: var(--persona-primary, #4a6741);
    }

    .rg-advanced-toggle svg {
      transition: transform ${DURATION.FAST}ms;
    }

    .rg-advanced-toggle.open svg {
      transform: rotate(180deg);
    }

    .rg-advanced-content {
      display: none;
      margin-top: var(--space-4, 1rem);
    }

    .rg-advanced-content.open {
      display: block;
    }

    .rg-textarea {
      width: 100%;
      min-height: 60px;
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

    .rg-textarea:focus {
      border-color: var(--persona-primary, #4a6741);
      box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.1);
    }

    /* =========================================================================
       FOOTER
       ========================================================================= */
    
    .rg-footer {
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
      border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      display: flex;
      gap: var(--space-3, 0.75rem);
    }

    .rg-btn {
      flex: 1;
      padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .rg-btn-secondary {
      background: transparent;
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.15));
      color: var(--color-text-secondary, #5a4a42);
    }

    .rg-btn-secondary:hover {
      border-color: var(--color-text-muted, #70605a);
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.04));
    }

    .rg-btn-primary {
      background: var(--persona-primary, #4a6741);
      border: 1px solid var(--persona-primary, #4a6741);
      color: white;
    }

    .rg-btn-primary:hover {
      background: var(--persona-secondary, #3d5a35);
      border-color: var(--persona-secondary, #3d5a35);
    }

    .rg-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* =========================================================================
       RESPONSIVE
       ========================================================================= */
    
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .record-gift-modal {
        width: 100%;
        max-width: none;
        max-height: 95vh;
        border-radius: var(--radius-xl, 1.25rem) var(--radius-xl, 1.25rem) 0 0;
        margin-top: auto;
      }
    }

    /* =========================================================================
       REDUCED MOTION
       ========================================================================= */
    
    @media (prefers-reduced-motion: reduce) {
      .record-gift-overlay,
      .record-gift-modal,
      .rg-direction,
      .rg-reaction,
      .rg-btn,
      .rg-close {
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

  const modal = modalContainer.querySelector('.record-gift-modal');
  if (!modal) return;

  modal.innerHTML = `
    <div class="rg-header">
      <div class="rg-header-row">
        <div>
          <div class="rg-eyebrow">Record a Gift</div>
          <h2 class="rg-title">${state.direction === 'given' ? 'for' : 'from'} ${escapeHtml(state.contactName)}</h2>
        </div>
        <button class="rg-close" aria-label="Close">${ICONS.close}</button>
      </div>
    </div>
    
    <div class="rg-content">
      <!-- Direction Selector -->
      <div class="rg-section">
        <div class="rg-directions">
          <button aria-label="You gave" class="rg-direction ${state.direction === 'given' ? 'selected' : ''}" data-direction="given">
            <span class="rg-direction-icon">${ICONS.send}</span>
            <span class="rg-direction-label">You gave</span>
          </button>
          <button aria-label="You received" class="rg-direction ${state.direction === 'received' ? 'selected' : ''}" data-direction="received">
            <span class="rg-direction-icon">${ICONS.inbox}</span>
            <span class="rg-direction-label">You received</span>
          </button>
        </div>
      </div>
      
      <!-- Gift Item -->
      <div class="rg-section">
        <label class="rg-label">What was the gift?</label>
        <input type="text" class="rg-input" id="rg-item" placeholder="e.g., Cashmere scarf, Book about astronomy" value="${escapeHtml(state.item)}" />
      </div>
      
      <!-- Occasion & Date -->
      <div class="rg-section">
        <div class="rg-row">
          <div class="rg-field">
            <label class="rg-label">Occasion</label>
            <select class="rg-select" id="rg-occasion">
              ${OCCASIONS.map(occ => `
                <option value="${occ.id}" ${state.occasion === occ.id ? 'selected' : ''}>${occ.label}</option>
              `).join('')}
            </select>
          </div>
          <div class="rg-field">
            <label class="rg-label">When</label>
            <input type="date" class="rg-input" id="rg-date" value="${state.date}" />
          </div>
        </div>
        ${state.occasion === 'other' ? `
          <div style="margin-top: var(--space-2, 0.5rem);">
            <input type="text" class="rg-input" id="rg-custom-occasion" placeholder="What was the occasion?" value="${escapeHtml(state.customOccasion)}" />
          </div>
        ` : ''}
      </div>
      
      <!-- Reaction (only for given gifts) -->
      ${state.direction === 'given' ? `
        <div class="rg-section">
          <label class="rg-label">How did they react?</label>
          <div class="rg-reactions" role="button" tabindex="0">
            <button aria-label="Loved it" class="rg-reaction ${state.reaction === 'loved' ? 'selected' : ''}" data-reaction="loved">
              <span class="rg-reaction-icon" role="button" tabindex="0">${ICONS.heart}</span>
              <span class="rg-reaction-label" role="button" tabindex="0">Loved it</span>
            </button>
            <button aria-label="Liked it" class="rg-reaction ${state.reaction === 'liked' ? 'selected' : ''}" data-reaction="liked">
              <span class="rg-reaction-icon" role="button" tabindex="0">${ICONS.thumbsUp}</span>
              <span class="rg-reaction-label" role="button" tabindex="0">Liked it</span>
            </button>
            <button aria-label="Meh" class="rg-reaction ${state.reaction === 'neutral' ? 'selected' : ''}" data-reaction="neutral">
              <span class="rg-reaction-icon" role="button" tabindex="0">${ICONS.meh}</span>
              <span class="rg-reaction-label" role="button" tabindex="0">Meh</span>
            </button>
            <button aria-label="Nope" class="rg-reaction ${state.reaction === 'disliked' ? 'selected' : ''}" data-reaction="disliked">
              <span class="rg-reaction-icon" role="button" tabindex="0">${ICONS.thumbsDown}</span>
              <span class="rg-reaction-label" role="button" tabindex="0">Nope</span>
            </button>
          </div>
        </div>
      ` : ''}
      
      <!-- Advanced Options -->
      <div class="rg-section">
        <button aria-label="Move down" class="rg-advanced-toggle ${state.showAdvanced ? 'open' : ''}" id="rg-advanced-toggle">
          More details ${ICONS.chevronDown}
        </button>
        
        <div class="rg-advanced-content ${state.showAdvanced ? 'open' : ''}" id="rg-advanced-content">
          <div style="margin-bottom: var(--space-4, 1rem);">
            <label class="rg-label">Price (optional)</label>
            <input type="number" class="rg-input" id="rg-price" placeholder="$" value="${state.price}" />
          </div>
          
          <div>
            <label class="rg-label">Notes (optional)</label>
            <textarea class="rg-textarea" id="rg-notes" placeholder="Any additional details to remember...">${escapeHtml(state.notes)}</textarea>
          </div>
        </div>
      </div>
    </div>
    
    <div class="rg-footer">
      <button aria-label="Cancel" class="rg-btn rg-btn-secondary" id="rg-cancel">Cancel</button>
      <button aria-label="Submit" class="rg-btn rg-btn-primary" id="rg-save" ${state.isSubmitting || !state.item.trim() ? 'disabled' : ''}>
        ${state.isSubmitting ? 'Saving...' : 'Save Gift'}
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
  modalContainer.querySelector('.rg-close')?.addEventListener('click', closeRecordGift);
  modalContainer.querySelector('.record-gift-backdrop')?.addEventListener('click', closeRecordGift);
  modalContainer.querySelector('#rg-cancel')?.addEventListener('click', closeRecordGift);

  // Direction selection
  modalContainer.querySelectorAll('.rg-direction').forEach(btn => {
    btn.addEventListener('click', () => {
      const direction = btn.getAttribute('data-direction') as 'given' | 'received';
      if (direction) {
        state.direction = direction;
        render();
      }
    });
  });

  // Reaction selection
  modalContainer.querySelectorAll('.rg-reaction').forEach(btn => {
    btn.addEventListener('click', () => {
      const reaction = btn.getAttribute('data-reaction') as GiftReaction;
      if (reaction) {
        state.reaction = reaction;
        render();
      }
    });
  });

  // Advanced toggle
  modalContainer.querySelector('#rg-advanced-toggle')?.addEventListener('click', () => {
    state.showAdvanced = !state.showAdvanced;
    render();
  });

  // Input fields
  const itemInput = modalContainer.querySelector('#rg-item') as HTMLInputElement;
  const occasionSelect = modalContainer.querySelector('#rg-occasion') as HTMLSelectElement;
  const dateInput = modalContainer.querySelector('#rg-date') as HTMLInputElement;
  const customOccasionInput = modalContainer.querySelector('#rg-custom-occasion') as HTMLInputElement;
  const priceInput = modalContainer.querySelector('#rg-price') as HTMLInputElement;
  const notesInput = modalContainer.querySelector('#rg-notes') as HTMLTextAreaElement;

  itemInput?.addEventListener('input', (e) => { 
    state.item = (e.target as HTMLInputElement).value;
    // Enable/disable save button based on item
    const saveBtn = modalContainer?.querySelector('#rg-save') as HTMLButtonElement;
    if (saveBtn) {
      saveBtn.disabled = !state.item.trim() || state.isSubmitting;
    }
  });
  occasionSelect?.addEventListener('change', (e) => { 
    state.occasion = (e.target as HTMLSelectElement).value as GiftOccasion;
    if (state.occasion === 'other') {
      render();
    }
  });
  dateInput?.addEventListener('change', (e) => { state.date = (e.target as HTMLInputElement).value; });
  customOccasionInput?.addEventListener('input', (e) => { state.customOccasion = (e.target as HTMLInputElement).value; });
  priceInput?.addEventListener('input', (e) => { state.price = (e.target as HTMLInputElement).value; });
  notesInput?.addEventListener('input', (e) => { state.notes = (e.target as HTMLTextAreaElement).value; });

  // Save button
  modalContainer.querySelector('#rg-save')?.addEventListener('click', handleSave);

  // Escape key
  document.addEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && state.isOpen) {
    closeRecordGift();
  }
}

// ============================================================================
// SAVE HANDLER
// ============================================================================

async function handleSave(): Promise<void> {
  if (state.isSubmitting || !state.item.trim()) return;

  state.isSubmitting = true;
  render();

  try {
    const data: RecordGiftData = {
      contactId: state.contactId,
      direction: state.direction,
      item: state.item.trim(),
      occasion: state.occasion === 'other' ? state.customOccasion.trim() || 'other' : state.occasion,
      date: state.date,
    };

    if (state.price) {
      data.price = parseFloat(state.price);
    }

    if (state.reaction) {
      data.reaction = state.reaction;
    }

    if (state.notes.trim()) {
      data.notes = state.notes.trim();
    }

    // Send to API
    const response = await apiFetch('/api/gifts', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (response.ok) {
      toast.success('Gift recorded!');
      
      if (callbacks.onSuccess) {
        callbacks.onSuccess(data);
      }
      
      closeRecordGift();
    } else {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      toast.error(error.error || 'Could not save gift');
      state.isSubmitting = false;
      render();
    }
  } catch (error) {
    log.error('Failed to save gift:', error);
    toast.error('Could not save gift');
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
 * Open the Record a Gift modal
 */
export function openRecordGift(options: RecordGiftOptions): void {
  // Cleanup any existing modal
  closeRecordGift();
  
  injectStyles();

  // Reset state
  state = {
    isOpen: true,
    contactId: options.contactId,
    contactName: options.contactName,
    direction: options.preselectedDirection || 'given',
    item: '',
    description: '',
    occasion: 'birthday',
    customOccasion: '',
    date: new Date().toISOString().split('T')[0],
    price: '',
    reaction: '',
    notes: '',
    tags: '',
    isSubmitting: false,
    showAdvanced: false,
  };

  callbacks = {
    onSuccess: options.onSuccess,
    onClose: options.onClose,
  };

  // Create container
  modalContainer = document.createElement('div');
  modalContainer.className = 'record-gift-overlay';
  modalContainer.innerHTML = `
    <div class="record-gift-backdrop"></div>
    <div class="record-gift-modal" role="dialog" aria-modal="true" aria-label="Record a gift">
    </div>
  `;
  document.body.appendChild(modalContainer);

  // Render content
  render();

  // Animate in
  requestAnimationFrame(() => {
    modalContainer?.classList.add('open');
  });

  log.info({ contactId: options.contactId }, 'Opened Record a Gift');
}

/**
 * Close the Record a Gift modal
 */
export function closeRecordGift(): void {
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
  log.info('Closed Record a Gift');
}

// Export for use in other modules
export const recordGift = {
  open: openRecordGift,
  close: closeRecordGift,
};

export default recordGift;

