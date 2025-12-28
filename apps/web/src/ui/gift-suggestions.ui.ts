/**
 * AI Gift Suggestions UI
 *
 * Get personalized gift ideas based on their interests,
 * past gifts, and the occasion.
 *
 * @module ui/gift-suggestions
 */

import { createLogger } from '../utils/logger.js';
import { toast } from './toast.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiFetch } from '../utils/api-helpers.js';
import { shouldUseDemoData } from '../utils/environment.js';
import { getMockGiftSuggestions } from '../data/mock-contacts.js';

const log = createLogger('GiftSuggestionsUI');

// ============================================================================
// TYPES
// ============================================================================

export interface GiftSuggestion {
  id: string;
  name: string;
  description: string;
  priceRange: string;
  reasoning: string;
  category: string;
  personalTouch?: string;
}

export interface GiftSuggestionsOptions {
  contactId: string;
  contactName: string;
  occasion?: string;
  budget?: string;
  interests?: string[];
  onSelect?: (suggestion: GiftSuggestion) => void;
  onClose?: () => void;
}

// ============================================================================
// STATE
// ============================================================================

interface GiftSuggestionsState {
  isOpen: boolean;
  contactId: string;
  contactName: string;
  occasion: string;
  budget: string;
  suggestions: GiftSuggestion[];
  isLoading: boolean;
  hasGenerated: boolean;
  error: string | null;
}

let state: GiftSuggestionsState = {
  isOpen: false,
  contactId: '',
  contactName: '',
  occasion: '',
  budget: '',
  suggestions: [],
  isLoading: false,
  hasGenerated: false,
  error: null,
};

let modalContainer: HTMLElement | null = null;
let callbacks: { onSelect?: (suggestion: GiftSuggestion) => void; onClose?: () => void } = {};

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  sparkles: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
  gift: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect width="20" height="5" x="2" y="7" rx="1"/><line x1="12" x2="12" y1="22" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
  heart: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  tag: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>`,
  loader: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="gs-spinner"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
  refresh: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  check: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
};

// Occasion options
const OCCASIONS = [
  { value: '', label: 'Any occasion' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'christmas', label: 'Christmas' },
  { value: 'anniversary', label: 'Anniversary' },
  { value: 'thank_you', label: 'Thank you' },
  { value: 'just_because', label: 'Just because' },
  { value: 'graduation', label: 'Graduation' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'baby_shower', label: 'Baby shower' },
  { value: 'housewarming', label: 'Housewarming' },
];

// Budget options
const BUDGETS = [
  { value: '', label: 'Any budget' },
  { value: 'under_25', label: 'Under $25' },
  { value: '25_50', label: '$25 - $50' },
  { value: '50_100', label: '$50 - $100' },
  { value: '100_200', label: '$100 - $200' },
  { value: 'over_200', label: 'Over $200' },
];

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('gift-suggestions-styles')) return;

  const style = document.createElement('style');
  style.id = 'gift-suggestions-styles';
  style.textContent = `
    /* =========================================================================
       GIFT SUGGESTIONS UI
       ========================================================================= */
    
    .gift-suggestions-overlay {
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

    .gift-suggestions-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .gift-suggestions-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .gift-suggestions-modal {
      position: relative;
      width: 94%;
      max-width: clamp(364px, 90vw, 520px);
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

    .gift-suggestions-overlay.open .gift-suggestions-modal {
      transform: scale(1) translateY(0);
    }

    /* =========================================================================
       HEADER
       ========================================================================= */
    
    .gs-header {
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
    }

    .gs-header-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
    }

    .gs-header-title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }

    .gs-icon {
      color: var(--persona-primary, #4a6741);
    }

    .gs-eyebrow {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 0.25rem);
    }

    .gs-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
      line-height: 1.2;
    }

    .gs-close {
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

    .gs-close:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      color: var(--color-text-primary, #2C2520);
    }

    /* =========================================================================
       FILTERS
       ========================================================================= */
    
    .gs-filters {
      display: flex;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.06));
    }

    .gs-filter {
      flex: 1;
    }

    .gs-filter-label {
      font-size: var(--text-xxs, 0.625rem);
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--color-text-muted, #70605a);
      margin-bottom: var(--space-1, 0.25rem);
      display: block;
    }

    .gs-select {
      width: 100%;
      padding: var(--space-2, 0.5rem) var(--space-2-5, 0.625rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-md, 0.5rem);
      font-size: var(--text-sm, 0.875rem);
      background: var(--color-background-elevated, #FFFDFB);
      color: var(--color-text-primary, #2C2520);
      outline: none;
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2370605a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      padding-right: var(--space-8, 2rem);
    }

    .gs-select:focus {
      border-color: var(--persona-primary, #4a6741);
    }

    /* =========================================================================
       CONTENT
       ========================================================================= */
    
    .gs-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
    }

    /* =========================================================================
       LOADING STATE
       ========================================================================= */
    
    .gs-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-12, 3rem) var(--space-4, 1rem);
      text-align: center;
    }

    .gs-loading-icon {
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-3, 0.75rem);
    }

    .gs-spinner {
      animation: gs-spin 1s linear infinite;
    }

    @keyframes gs-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .gs-loading-text {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
    }

    /* =========================================================================
       INITIAL STATE
       ========================================================================= */
    
    .gs-initial {
      text-align: center;
      padding: var(--space-8, 2rem) var(--space-4, 1rem);
    }

    .gs-initial-icon {
      width: 56px;
      height: 56px;
      margin: 0 auto var(--space-4, 1rem);
      border-radius: var(--radius-full, 50%);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      color: var(--persona-primary, #4a6741);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .gs-initial-icon svg {
      width: 28px;
      height: 28px;
    }

    .gs-initial-title {
      font-size: var(--text-base, 1rem);
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin-bottom: var(--space-2, 0.5rem);
    }

    .gs-initial-text {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      line-height: 1.5;
      margin-bottom: var(--space-4, 1rem);
    }

    .gs-generate-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      padding: var(--space-2-5, 0.625rem) var(--space-5, 1.25rem);
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      background: var(--persona-primary, #4a6741);
      border: 1px solid var(--persona-primary, #4a6741);
      color: white;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .gs-generate-btn:hover {
      background: var(--persona-secondary, #3d5a35);
      border-color: var(--persona-secondary, #3d5a35);
    }

    /* =========================================================================
       SUGGESTIONS LIST
       ========================================================================= */
    
    .gs-suggestions {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 0.75rem);
    }

    .gs-suggestion {
      background: var(--color-bg-secondary, rgba(250, 248, 245, 0.5));
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-lg, 1rem);
      padding: var(--space-4, 1rem);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .gs-suggestion:hover {
      border-color: var(--persona-primary, #4a6741);
      background: var(--color-background-elevated, #FFFDFB);
    }

    .gs-suggestion-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: var(--space-2, 0.5rem);
    }

    .gs-suggestion-name {
      font-weight: 600;
      font-size: var(--text-base, 1rem);
      color: var(--color-text-primary, #2C2520);
    }

    .gs-suggestion-price {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 500;
      color: var(--persona-primary, #4a6741);
      padding: var(--space-0-5, 0.125rem) var(--space-2, 0.5rem);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-full, 9999px);
    }

    .gs-suggestion-desc {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4a42);
      line-height: 1.5;
      margin-bottom: var(--space-3, 0.75rem);
    }

    .gs-suggestion-meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 0.5rem);
    }

    .gs-suggestion-tag {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1, 0.25rem);
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      padding: var(--space-0-5, 0.125rem) var(--space-2, 0.5rem);
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.04));
      border-radius: var(--radius-sm, 0.25rem);
    }

    .gs-suggestion-tag svg {
      width: 12px;
      height: 12px;
    }

    .gs-personal-touch {
      margin-top: var(--space-3, 0.75rem);
      padding: var(--space-2-5, 0.625rem) var(--space-3, 0.75rem);
      background: var(--persona-tint, rgba(74, 103, 65, 0.06));
      border-radius: var(--radius-md, 0.5rem);
      border-left: 3px solid var(--persona-primary, #4a6741);
    }

    .gs-personal-touch-label {
      font-size: var(--text-xxs, 0.625rem);
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 0.25rem);
    }

    .gs-personal-touch-text {
      font-size: var(--text-sm, 0.875rem);
      font-style: italic;
      color: var(--color-text-secondary, #5a4a42);
    }

    /* =========================================================================
       ERROR STATE
       ========================================================================= */
    
    .gs-error {
      text-align: center;
      padding: var(--space-8, 2rem) var(--space-4, 1rem);
      color: var(--color-semantic-error, #c44);
    }

    .gs-error-text {
      font-size: var(--text-sm, 0.875rem);
      margin-bottom: var(--space-3, 0.75rem);
    }

    .gs-retry-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
      border-radius: var(--radius-md, 0.5rem);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      background: transparent;
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.15));
      color: var(--color-text-secondary, #5a4a42);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .gs-retry-btn:hover {
      border-color: var(--color-text-muted, #70605a);
    }

    /* =========================================================================
       FOOTER
       ========================================================================= */
    
    .gs-footer {
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
      border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .gs-footer-hint {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
    }

    .gs-regenerate-btn {
      display: flex;
      align-items: center;
      gap: var(--space-1-5, 0.375rem);
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      border-radius: var(--radius-md, 0.5rem);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      background: transparent;
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.15));
      color: var(--color-text-secondary, #5a4a42);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .gs-regenerate-btn:hover {
      border-color: var(--persona-primary, #4a6741);
      color: var(--persona-primary, #4a6741);
    }

    .gs-regenerate-btn svg {
      width: 16px;
      height: 16px;
    }

    /* =========================================================================
       RESPONSIVE
       ========================================================================= */
    
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .gift-suggestions-modal {
        width: 100%;
        max-width: none;
        max-height: 95vh;
        border-radius: var(--radius-xl, 1.25rem) var(--radius-xl, 1.25rem) 0 0;
        margin-top: auto;
      }

      .gs-filters {
        flex-direction: column;
        gap: var(--space-2, 0.5rem);
      }
    }

    /* =========================================================================
       REDUCED MOTION
       ========================================================================= */
    
    @media (prefers-reduced-motion: reduce) {
      .gift-suggestions-overlay,
      .gift-suggestions-modal,
      .gs-suggestion,
      .gs-generate-btn,
      .gs-spinner {
        transition: none;
        animation: none;
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

  const modal = modalContainer.querySelector('.gift-suggestions-modal');
  if (!modal) return;

  modal.innerHTML = `
    <div class="gs-header">
      <div class="gs-header-row">
        <div class="gs-header-title">
          <span class="gs-icon">${ICONS.sparkles}</span>
          <div>
            <div class="gs-eyebrow">Gift Ideas</div>
            <h2 class="gs-title">For ${escapeHtml(state.contactName)}</h2>
          </div>
        </div>
        <button class="gs-close" aria-label="Close">${ICONS.close}</button>
      </div>
    </div>
    
    <div class="gs-filters">
      <div class="gs-filter">
        <label class="gs-filter-label">Occasion</label>
        <select class="gs-select" id="gs-occasion">
          ${OCCASIONS.map(o => `
            <option value="${o.value}" ${state.occasion === o.value ? 'selected' : ''}>${o.label}</option>
          `).join('')}
        </select>
      </div>
      <div class="gs-filter">
        <label class="gs-filter-label">Budget</label>
        <select class="gs-select" id="gs-budget">
          ${BUDGETS.map(b => `
            <option value="${b.value}" ${state.budget === b.value ? 'selected' : ''}>${b.label}</option>
          `).join('')}
        </select>
      </div>
    </div>
    
    <div class="gs-content">
      ${renderContent()}
    </div>
    
    ${state.hasGenerated && state.suggestions.length > 0 ? `
      <div class="gs-footer">
        <span class="gs-footer-hint">Tap a gift to record it</span>
        <button aria-label="Refresh" class="gs-regenerate-btn" id="gs-regenerate">
          ${ICONS.refresh} New ideas
        </button>
      </div>
    ` : ''}
  `;

  bindEvents();
}

function renderContent(): string {
  if (state.isLoading) {
    return `
      <div class="gs-loading">
        <div class="gs-loading-icon">${ICONS.loader}</div>
        <p class="gs-loading-text">Finding perfect gift ideas...</p>
      </div>
    `;
  }

  if (state.error) {
    return `
      <div class="gs-error">
        <p class="gs-error-text">${escapeHtml(state.error)}</p>
        <button aria-label="Refresh" class="gs-retry-btn" id="gs-retry">
          ${ICONS.refresh} Try again
        </button>
      </div>
    `;
  }

  if (!state.hasGenerated) {
    return `
      <div class="gs-initial">
        <div class="gs-initial-icon">${ICONS.gift}</div>
        <h3 class="gs-initial-title">Find the perfect gift</h3>
        <p class="gs-initial-text">
          Based on ${escapeHtml(state.contactName)}'s interests and your relationship,
          Ferni will suggest thoughtful gift ideas.
        </p>
        <button aria-label="Generate Ideas" class="gs-generate-btn" id="gs-generate">
          ${ICONS.sparkles} Generate Ideas
        </button>
      </div>
    `;
  }

  if (state.suggestions.length === 0) {
    return `
      <div class="gs-initial">
        <div class="gs-initial-icon">${ICONS.gift}</div>
        <h3 class="gs-initial-title">No suggestions yet</h3>
        <p class="gs-initial-text">Try adjusting the occasion or budget.</p>
      </div>
    `;
  }

  return `
    <div class="gs-suggestions">
      ${state.suggestions.map(suggestion => `
        <div class="gs-suggestion" data-id="${suggestion.id}">
          <div class="gs-suggestion-header">
            <span class="gs-suggestion-name">${escapeHtml(suggestion.name)}</span>
            <span class="gs-suggestion-price">${escapeHtml(suggestion.priceRange)}</span>
          </div>
          <p class="gs-suggestion-desc">${escapeHtml(suggestion.description)}</p>
          <div class="gs-suggestion-meta">
            <span class="gs-suggestion-tag">${ICONS.tag} ${escapeHtml(suggestion.category)}</span>
            <span class="gs-suggestion-tag">${ICONS.heart} ${escapeHtml(suggestion.reasoning)}</span>
          </div>
          ${suggestion.personalTouch ? `
            <div class="gs-personal-touch">
              <div class="gs-personal-touch-label">Personal touch</div>
              <div class="gs-personal-touch-text">"${escapeHtml(suggestion.personalTouch)}"</div>
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================================
// EVENT BINDING
// ============================================================================

function bindEvents(): void {
  if (!modalContainer) return;

  // Close
  modalContainer.querySelector('.gs-close')?.addEventListener('click', closeGiftSuggestions);
  modalContainer.querySelector('.gift-suggestions-backdrop')?.addEventListener('click', closeGiftSuggestions);

  // Filters
  const occasionSelect = modalContainer.querySelector('#gs-occasion') as HTMLSelectElement;
  const budgetSelect = modalContainer.querySelector('#gs-budget') as HTMLSelectElement;

  occasionSelect?.addEventListener('change', (e) => {
    state.occasion = (e.target as HTMLSelectElement).value;
    if (state.hasGenerated) {
      void generateSuggestions();
    }
  });

  budgetSelect?.addEventListener('change', (e) => {
    state.budget = (e.target as HTMLSelectElement).value;
    if (state.hasGenerated) {
      void generateSuggestions();
    }
  });

  // Generate button
  modalContainer.querySelector('#gs-generate')?.addEventListener('click', generateSuggestions);
  modalContainer.querySelector('#gs-regenerate')?.addEventListener('click', generateSuggestions);
  modalContainer.querySelector('#gs-retry')?.addEventListener('click', generateSuggestions);

  // Suggestion selection
  modalContainer.querySelectorAll('.gs-suggestion').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      const suggestion = state.suggestions.find(s => s.id === id);
      if (suggestion && callbacks.onSelect) {
        callbacks.onSelect(suggestion);
        closeGiftSuggestions();
      }
    });
  });

  // Escape key
  document.addEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && state.isOpen) {
    closeGiftSuggestions();
  }
}

// ============================================================================
// ACTIONS
// ============================================================================

async function generateSuggestions(): Promise<void> {
  state.isLoading = true;
  state.error = null;
  render();

  try {
    const response = await apiFetch(`/api/contacts/${state.contactId}/gift-suggestions`, {
      method: 'POST',
      body: JSON.stringify({
        occasion: state.occasion || undefined,
        budget: state.budget || undefined,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate suggestions');
    }

    const data = await response.json();
    state.suggestions = data.suggestions || [];
    state.hasGenerated = true;
    state.isLoading = false;
    render();

    if (state.suggestions.length > 0) {
      toast.success(`${state.suggestions.length} ideas found!`);
    }
  } catch (error) {
    log.error('Failed to generate gift suggestions:', error);
    
    // In dev mode, fall back to mock suggestions
    if (shouldUseDemoData()) {
      const mockSuggestions = getMockGiftSuggestions(state.contactId);
      state.suggestions = mockSuggestions.map(s => ({
        id: s.id,
        name: s.item,
        description: s.reason,
        priceRange: s.priceRange,
        reasoning: s.reason,
        category: 'general',
      }));
      state.hasGenerated = true;
      state.isLoading = false;
      render();
      log.debug('Using mock gift suggestions');
      toast.success(`${state.suggestions.length} ideas found! (mock)`);
      return;
    }
    
    state.error = 'Could not generate suggestions. Try again?';
    state.isLoading = false;
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
 * Open the Gift Suggestions modal
 */
export function openGiftSuggestions(options: GiftSuggestionsOptions): void {
  closeGiftSuggestions();
  
  injectStyles();

  state = {
    isOpen: true,
    contactId: options.contactId,
    contactName: options.contactName,
    occasion: options.occasion || '',
    budget: options.budget || '',
    suggestions: [],
    isLoading: false,
    hasGenerated: false,
    error: null,
  };

  callbacks = {
    onSelect: options.onSelect,
    onClose: options.onClose,
  };

  modalContainer = document.createElement('div');
  modalContainer.className = 'gift-suggestions-overlay';
  modalContainer.innerHTML = `
    <div class="gift-suggestions-backdrop"></div>
    <div class="gift-suggestions-modal" role="dialog" aria-modal="true" aria-label="Gift suggestions">
    </div>
  `;
  document.body.appendChild(modalContainer);

  render();

  requestAnimationFrame(() => {
    modalContainer?.classList.add('open');
  });

  log.info({ contactId: options.contactId }, 'Opened Gift Suggestions');
}

/**
 * Close the Gift Suggestions modal
 */
export function closeGiftSuggestions(): void {
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
  log.info('Closed Gift Suggestions');
}

export const giftSuggestions = {
  open: openGiftSuggestions,
  close: closeGiftSuggestions,
};

export default giftSuggestions;

