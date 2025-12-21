/**
 * Gift Tracking UI
 *
 * "Better Than Human" gift management interface.
 * Track gifts given/received, get AI suggestions, and never forget a gift again.
 *
 * Design: Warm, organic design following Ferni brand guidelines.
 * No emojis. Clean typography. Earthy color palette.
 *
 * @module ui/gifts
 */

import { createLogger } from '../utils/logger.js';
import { toast } from './toast.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiFetch } from '../utils/api-helpers.js';

const log = createLogger('GiftsUI');

// ============================================================================
// TYPES
// ============================================================================

interface Gift {
  id: string;
  contactId: string;
  contactName: string;
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

interface GiftSuggestion {
  idea: string;
  description: string;
  priceRange: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  tags: string[];
}

interface UpcomingOccasion {
  contactId: string;
  contactName: string;
  occasion: string;
  date: Date | string;
  daysUntil: number;
  suggestedBudget?: number;
  lastGiftGiven?: Gift;
}

// ============================================================================
// STATE
// ============================================================================

let gifts: Gift[] = [];
let upcomingOccasions: UpcomingOccasion[] = [];
const selectedGiftId: string | null = null;
let currentContactId: string | null = null;
let isLoading = false;

// ============================================================================
// API HELPERS
// ============================================================================

async function fetchAllGifts(): Promise<Gift[]> {
  try {
    const response = await apiFetch('/api/gifts');
    if (!response.ok) throw new Error('Failed to fetch gifts');
    const data = await response.json();
    return data.gifts || [];
  } catch (error) {
    log.error('Failed to fetch gifts:', error);
    return [];
  }
}

async function fetchGiftHistory(contactId: string): Promise<{ given: Gift[]; received: Gift[] }> {
  try {
    const response = await apiFetch(`/api/gifts/contact/${contactId}/history`);
    if (!response.ok) throw new Error('Failed to fetch gift history');
    const data = await response.json();
    return data.history || { given: [], received: [] };
  } catch (error) {
    log.error('Failed to fetch gift history:', error);
    return { given: [], received: [] };
  }
}

async function fetchUpcomingOccasions(daysAhead = 60): Promise<UpcomingOccasion[]> {
  try {
    const response = await apiFetch(`/api/gifts/upcoming?daysAhead=${daysAhead}`);
    if (!response.ok) throw new Error('Failed to fetch upcoming occasions');
    const data = await response.json();
    return data.occasions || [];
  } catch (error) {
    log.error('Failed to fetch upcoming occasions:', error);
    return [];
  }
}

async function fetchGiftSuggestions(
  contactId: string,
  occasion: string,
  budget?: { min: number; max: number }
): Promise<GiftSuggestion[]> {
  try {
    let url = `/api/gifts/contact/${contactId}/suggestions?occasion=${encodeURIComponent(occasion)}`;
    if (budget) {
      url += `&minBudget=${budget.min}&maxBudget=${budget.max}`;
    }
    const response = await apiFetch(url);
    if (!response.ok) throw new Error('Failed to fetch suggestions');
    const data = await response.json();
    return data.suggestions || [];
  } catch (error) {
    log.error('Failed to fetch gift suggestions:', error);
    return [];
  }
}

async function saveGift(gift: Omit<Gift, 'id'>): Promise<Gift | null> {
  try {
    const response = await apiFetch('/api/gifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gift),
    });
    if (!response.ok) throw new Error('Failed to save gift');
    const data = await response.json();
    return data.gift;
  } catch (error) {
    log.error('Failed to save gift:', error);
    return null;
  }
}

async function updateGiftReaction(
  giftId: string,
  reaction: Gift['reaction']
): Promise<Gift | null> {
  try {
    const response = await apiFetch(`/api/gifts/${giftId}/reaction`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction }),
    });
    if (!response.ok) throw new Error('Failed to update reaction');
    const data = await response.json();
    return data.gift;
  } catch (error) {
    log.error('Failed to update gift reaction:', error);
    return null;
  }
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

/**
 * Create the main gifts panel
 */
export function createGiftsPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'gifts-panel';
  panel.innerHTML = `
    <style>
      .gifts-panel {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
      }

      .gifts-panel.open {
        opacity: 1;
        pointer-events: auto;
      }

      .gifts-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(44, 37, 32, 0.4);
        backdrop-filter: blur(20px);
      }

      .gifts-card {
        position: relative;
        width: 90%;
        max-width: 800px;
        max-height: 85vh;
        background: var(--color-background-elevated, #FFFDFB);
        border-radius: var(--radius-2xl, 24px);
        box-shadow: var(--shadow-2xl);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: scale(0.95);
        transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
      }

      .gifts-panel.open .gifts-card {
        transform: scale(1);
      }

      .gifts-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-6, 1.5rem);
        border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.1));
      }

      .gifts-header-left {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 0.25rem);
      }

      .gifts-eyebrow {
        font-size: var(--text-xs, 0.75rem);
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--persona-primary, var(--color-ferni, #4a6741));
      }

      .gifts-title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xl, 1.5rem);
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
        margin: 0;
      }

      .gifts-close {
        width: 40px;
        height: 40px;
        border: none;
        background: transparent;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-secondary, #5a4a42);
        transition: background ${DURATION.FAST}ms;
      }

      .gifts-close:hover {
        background: rgba(44, 37, 32, 0.05);
      }

      .gifts-tabs {
        display: flex;
        gap: var(--space-2, 0.5rem);
        padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
        border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.1));
      }

      .gifts-tab {
        padding: var(--space-2-5, 0.625rem) var(--space-5, 1.25rem);
        border: none;
        background: transparent;
        border-radius: var(--radius-md, 8px);
        font-size: var(--text-sm, 0.875rem);
        font-weight: 500;
        color: var(--color-text-secondary, #5a4a42);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms;
      }

      .gifts-tab:hover {
        background: rgba(44, 37, 32, 0.03);
      }

      .gifts-tab.active {
        background: var(--color-ferni, #4a6741);
        color: white;
      }

      .gifts-body {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-6, 1.5rem);
      }

      .upcoming-card {
        display: flex;
        align-items: center;
        gap: var(--space-4, 1rem);
        padding: var(--space-4, 1rem);
        background: var(--persona-tint, rgba(74, 103, 65, 0.08));
        border-radius: var(--radius-lg, 12px);
        margin-bottom: var(--space-3, 0.75rem);
      }

      .upcoming-days {
        width: 60px;
        height: 60px;
        background: var(--color-ferni, #4a6741);
        border-radius: var(--radius-md, 8px);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: white;
      }

      .upcoming-days-number {
        font-size: var(--text-xl, 1.5rem);
        font-weight: 700;
        line-height: 1;
      }

      .upcoming-days-label {
        font-size: var(--text-xxs, 0.625rem);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.8;
      }

      .upcoming-info {
        flex: 1;
      }

      .upcoming-name {
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
        margin-bottom: var(--space-1, 0.25rem);
      }

      .upcoming-occasion {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5a4a42);
      }

      .upcoming-last-gift {
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #8a7a72);
        margin-top: var(--space-1, 0.25rem);
      }

      .upcoming-actions {
        display: flex;
        gap: var(--space-2, 0.5rem);
      }

      .upcoming-btn {
        padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
        border-radius: var(--radius-md, 8px);
        font-size: var(--text-sm, 0.875rem);
        font-weight: 500;
        cursor: pointer;
        transition: all ${DURATION.FAST}ms;
        border: none;
        background: var(--persona-primary, var(--color-ferni, #4a6741));
        color: white;
      }

      .upcoming-btn:hover {
        background: var(--color-ferni-dark, #3d5a35);
      }

      .upcoming-btn-secondary {
        background: transparent;
        border: 1px solid var(--color-border, rgba(44, 37, 32, 0.2));
        color: var(--color-text-secondary, #5a4a42);
      }

      .upcoming-btn-secondary:hover {
        background: rgba(44, 37, 32, 0.03);
      }

      .gift-item {
        display: flex;
        align-items: flex-start;
        gap: var(--space-4, 1rem);
        padding: var(--space-4, 1rem);
        border: 1px solid var(--color-border, rgba(44, 37, 32, 0.1));
        border-radius: var(--radius-lg, 12px);
        margin-bottom: var(--space-3, 0.75rem);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms;
      }

      .gift-item:hover {
        border-color: var(--color-ferni, #4a6741);
        background: rgba(74, 103, 65, 0.02);
      }

      .gift-direction {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .gift-direction.given {
        background: rgba(74, 103, 65, 0.1);
        color: var(--color-ferni, #4a6741);
      }

      .gift-direction.received {
        background: rgba(184, 149, 106, 0.15);
        color: var(--nayan-primary, #b8956a);
      }

      .gift-info {
        flex: 1;
        min-width: 0;
      }

      .gift-name {
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
        margin-bottom: var(--space-1, 0.25rem);
      }

      .gift-meta {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5a4a42);
      }

      .gift-reaction {
        display: flex;
        gap: var(--space-1, 0.25rem);
        margin-top: var(--space-2, 0.5rem);
      }

      .reaction-btn {
        padding: var(--space-1, 0.25rem) var(--space-3, 0.75rem);
        border: 1px solid var(--color-border, rgba(44, 37, 32, 0.15));
        border-radius: var(--radius-full, 999px);
        background: transparent;
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #8a7a72);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms;
      }

      .reaction-btn:hover {
        border-color: var(--color-ferni, #4a6741);
        color: var(--color-ferni, #4a6741);
      }

      .reaction-btn.selected {
        background: var(--color-ferni, #4a6741);
        border-color: var(--color-ferni, #4a6741);
        color: white;
      }

      .suggestion-card {
        padding: var(--space-4, 1rem);
        border: 1px solid var(--color-border, rgba(44, 37, 32, 0.1));
        border-radius: var(--radius-lg, 12px);
        margin-bottom: var(--space-3, 0.75rem);
      }

      .suggestion-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-2, 0.5rem);
      }

      .suggestion-idea {
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
      }

      .suggestion-confidence {
        font-size: var(--text-xs, 0.75rem);
        padding: var(--space-1, 0.25rem) var(--space-2, 0.5rem);
        border-radius: var(--radius-full, 999px);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .suggestion-confidence.high {
        background: rgba(74, 103, 65, 0.1);
        color: var(--color-ferni, #4a6741);
      }

      .suggestion-confidence.medium {
        background: rgba(184, 149, 106, 0.15);
        color: var(--nayan-primary, #b8956a);
      }

      .suggestion-confidence.low {
        background: rgba(44, 37, 32, 0.08);
        color: var(--color-text-muted, #8a7a72);
      }

      .suggestion-description {
        font-size: 14px;
        color: var(--color-text-secondary, #5a4a42);
        margin-bottom: 8px;
      }

      .suggestion-price {
        font-size: 14px;
        color: var(--color-ferni, #4a6741);
        font-weight: 500;
      }

      .suggestion-reasoning {
        font-size: 13px;
        color: var(--color-text-muted, #8a7a72);
        font-style: italic;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      }

      .add-gift-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        padding: 16px;
        margin-top: 16px;
        border: 2px dashed var(--color-border, rgba(44, 37, 32, 0.2));
        border-radius: var(--radius-lg, 12px);
        background: transparent;
        color: var(--color-text-secondary, #5a4a42);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all ${DURATION.FAST}ms;
      }

      .add-gift-btn:hover {
        border-color: var(--color-ferni, #4a6741);
        color: var(--color-ferni, #4a6741);
        background: rgba(74, 103, 65, 0.03);
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 40px;
        text-align: center;
        color: var(--color-text-muted, #8a7a72);
      }

      .empty-state-icon {
        width: 64px;
        height: 64px;
        margin-bottom: 16px;
        opacity: 0.5;
      }

      .form-field {
        margin-bottom: 16px;
      }

      .form-label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        color: var(--color-text-secondary, #5a4a42);
        margin-bottom: 6px;
      }

      .form-input {
        width: 100%;
        padding: 12px 16px;
        border: 1px solid var(--color-border, rgba(44, 37, 32, 0.15));
        border-radius: var(--radius-md, 8px);
        font-size: 14px;
        color: var(--color-text-primary, #2C2520);
        background: white;
        outline: none;
        transition: border-color ${DURATION.FAST}ms;
        box-sizing: border-box;
      }

      .form-input:focus {
        border-color: var(--color-ferni, #4a6741);
      }

      .form-select {
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%235a4a42' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 12px center;
        padding-right: 40px;
      }

      .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }

      .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding-top: 16px;
        border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.1));
        margin-top: 8px;
      }

      .btn {
        padding: 12px 24px;
        border-radius: var(--radius-md, 8px);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all ${DURATION.FAST}ms;
        border: none;
      }

      .btn-primary {
        background: var(--color-ferni, #4a6741);
        color: white;
      }

      .btn-primary:hover {
        background: var(--color-ferni-dark, #3d5a35);
      }

      .btn-secondary {
        background: transparent;
        color: var(--color-text-secondary, #5a4a42);
        border: 1px solid var(--color-border, rgba(44, 37, 32, 0.2));
      }

      .btn-secondary:hover {
        background: rgba(44, 37, 32, 0.03);
      }

      .tags-input {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 8px;
        border: 1px solid var(--color-border, rgba(44, 37, 32, 0.15));
        border-radius: var(--radius-md, 8px);
        min-height: 48px;
      }

      .tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: rgba(74, 103, 65, 0.1);
        border-radius: var(--radius-full, 999px);
        font-size: 13px;
        color: var(--color-ferni, #4a6741);
      }

      .tag-remove {
        width: 16px;
        height: 16px;
        border: none;
        background: transparent;
        color: inherit;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }

      .tag-input {
        border: none;
        outline: none;
        font-size: 14px;
        padding: 4px;
        flex: 1;
        min-width: 100px;
        background: transparent;
        color: var(--color-text-primary, #2C2520);
      }

      @media (max-width: 640px) {
        .form-row {
          grid-template-columns: 1fr;
        }

        .upcoming-card {
          flex-direction: column;
          align-items: flex-start;
        }

        .upcoming-actions {
          width: 100%;
          justify-content: flex-end;
        }
      }
    </style>

    <div class="gifts-backdrop"></div>
    <div class="gifts-card">
      <div class="gifts-header">
        <div class="gifts-header-left">
          <span class="gifts-eyebrow">Never Forget</span>
          <h2 class="gifts-title">Gift Tracker</h2>
        </div>
        <button class="gifts-close" aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="gifts-tabs">
        <button class="gifts-tab active" data-tab="upcoming">Upcoming</button>
        <button class="gifts-tab" data-tab="history">History</button>
        <button class="gifts-tab" data-tab="suggestions">Get Ideas</button>
      </div>
      <div class="gifts-body" id="gifts-body"></div>
    </div>
  `;

  // Event listeners
  const backdrop = panel.querySelector('.gifts-backdrop') as HTMLElement;
  const closeBtn = panel.querySelector('.gifts-close') as HTMLElement;
  const tabs = panel.querySelectorAll('.gifts-tab');

  backdrop.addEventListener('click', () => closeGiftsPanel());
  closeBtn.addEventListener('click', () => closeGiftsPanel());

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const tabId = tab.getAttribute('data-tab');
      if (tabId) renderTab(tabId);
    });
  });

  return panel;
}

/**
 * Open gifts panel
 */
export async function openGiftsPanel(contactId?: string): Promise<void> {
  cleanupOrphanedPanels();

  currentContactId = contactId || null;

  let panel = document.querySelector('.gifts-panel') as HTMLElement;
  if (!panel) {
    panel = createGiftsPanel();
    document.body.appendChild(panel);
  }

  // Load data
  isLoading = true;
  renderLoading();

  [gifts, upcomingOccasions] = await Promise.all([fetchAllGifts(), fetchUpcomingOccasions()]);

  isLoading = false;
  renderTab('upcoming');

  // Animate open
  requestAnimationFrame(() => {
    panel.classList.add('open');
  });
}

/**
 * Close gifts panel
 */
export function closeGiftsPanel(): void {
  const panel = document.querySelector('.gifts-panel') as HTMLElement;
  if (panel) {
    panel.classList.remove('open');
    setTimeout(() => panel.remove(), DURATION.NORMAL);
  }
}

/**
 * Render current tab
 */
function renderTab(tabId: string): void {
  switch (tabId) {
    case 'upcoming':
      renderUpcomingTab();
      break;
    case 'history':
      renderHistoryTab();
      break;
    case 'suggestions':
      renderSuggestionsTab();
      break;
  }
}

/**
 * Render upcoming occasions tab
 */
function renderUpcomingTab(): void {
  const bodyEl = document.getElementById('gifts-body');
  if (!bodyEl) return;

  if (upcomingOccasions.length === 0) {
    bodyEl.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
          <line x1="16" x2="16" y1="2" y2="6"/>
          <line x1="8" x2="8" y1="2" y2="6"/>
          <line x1="3" x2="21" y1="10" y2="10"/>
        </svg>
        <p style="margin: 0 0 8px 0; font-size: 16px; color: var(--color-text-secondary);">No upcoming occasions</p>
        <p style="margin: 0; font-size: 14px;">Add important dates to your contacts to see reminders here</p>
      </div>
    `;
    return;
  }

  bodyEl.innerHTML =
    upcomingOccasions
      .map(
        (occasion) => `
      <div class="upcoming-card" data-contact-id="${occasion.contactId}">
        <div class="upcoming-days">
          <span class="upcoming-days-number">${occasion.daysUntil}</span>
          <span class="upcoming-days-label">${occasion.daysUntil === 1 ? 'day' : 'days'}</span>
        </div>
        <div class="upcoming-info">
          <div class="upcoming-name">${escapeHtml(occasion.contactName)}</div>
          <div class="upcoming-occasion">${escapeHtml(occasion.occasion)}</div>
          ${
            occasion.lastGiftGiven
              ? `
            <div class="upcoming-last-gift">
              Last gift: ${escapeHtml(occasion.lastGiftGiven.item)}
            </div>
          `
              : ''
          }
        </div>
        <div class="upcoming-actions">
          <button class="upcoming-btn upcoming-btn-secondary" data-action="ideas">Get Ideas</button>
          <button class="upcoming-btn" data-action="record">Record Gift</button>
        </div>
      </div>
    `
      )
      .join('') +
    `
      <button class="add-gift-btn" id="add-gift-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Record a Gift
      </button>
    `;

  // Event listeners
  bodyEl.querySelectorAll('.upcoming-card').forEach((card) => {
    const contactId = card.getAttribute('data-contact-id');
    const occasion = upcomingOccasions.find((o) => o.contactId === contactId);
    if (!occasion) return;

    card.querySelector('[data-action="ideas"]')?.addEventListener('click', () => {
      currentContactId = contactId;
      const tabs = document.querySelectorAll('.gifts-tab');
      tabs.forEach((t) => t.classList.remove('active'));
      tabs[2]?.classList.add('active');
      renderSuggestionsTab(occasion.occasion);
    });

    card.querySelector('[data-action="record"]')?.addEventListener('click', () => {
      showGiftForm(contactId || undefined, occasion.contactName, occasion.occasion);
    });
  });

  bodyEl.querySelector('#add-gift-btn')?.addEventListener('click', () => {
    showGiftForm();
  });
}

/**
 * Render history tab
 */
function renderHistoryTab(): void {
  const bodyEl = document.getElementById('gifts-body');
  if (!bodyEl) return;

  if (gifts.length === 0) {
    bodyEl.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6"/>
          <rect x="2" y="7" width="20" height="5" rx="2"/>
          <path d="M12 22V7"/>
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
        </svg>
        <p style="margin: 0 0 8px 0; font-size: 16px; color: var(--color-text-secondary);">No gifts recorded yet</p>
        <p style="margin: 0; font-size: 14px;">Start tracking gifts to never forget what you've given or received</p>
      </div>
      <button class="add-gift-btn" id="add-gift-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Record Your First Gift
      </button>
    `;

    bodyEl.querySelector('#add-gift-btn')?.addEventListener('click', () => {
      showGiftForm();
    });
    return;
  }

  // Sort by date, most recent first
  const sortedGifts = [...gifts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  bodyEl.innerHTML =
    sortedGifts
      .map(
        (gift) => `
      <div class="gift-item" data-gift-id="${gift.id}">
        <div class="gift-direction ${gift.direction}">
          ${
            gift.direction === 'given'
              ? `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 2 11 13"/>
              <path d="M22 2 15 22l-4-9-9-4z"/>
            </svg>
          `
              : `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8"/>
              <rect width="18" height="14" x="3" y="6" rx="2"/>
            </svg>
          `
          }
        </div>
        <div class="gift-info">
          <div class="gift-name">${escapeHtml(gift.item)}</div>
          <div class="gift-meta">
            ${gift.direction === 'given' ? 'To' : 'From'} ${escapeHtml(gift.contactName)} · ${escapeHtml(gift.occasion)} · ${formatDate(gift.date)}
            ${gift.price ? ` · $${gift.price}` : ''}
          </div>
          ${
            gift.direction === 'given'
              ? `
            <div class="gift-reaction">
              <button class="reaction-btn ${gift.reaction === 'loved' ? 'selected' : ''}" data-reaction="loved">Loved it</button>
              <button class="reaction-btn ${gift.reaction === 'liked' ? 'selected' : ''}" data-reaction="liked">Liked it</button>
              <button class="reaction-btn ${gift.reaction === 'neutral' ? 'selected' : ''}" data-reaction="neutral">Meh</button>
            </div>
          `
              : ''
          }
        </div>
      </div>
    `
      )
      .join('') +
    `
      <button class="add-gift-btn" id="add-gift-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Record a Gift
      </button>
    `;

  // Event listeners for reactions
  bodyEl.querySelectorAll('.gift-item').forEach((item) => {
    const giftId = item.getAttribute('data-gift-id');
    if (!giftId) return;

    item.querySelectorAll('.reaction-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const reaction = (btn as HTMLElement).getAttribute('data-reaction') as Gift['reaction'];
        const updated = await updateGiftReaction(giftId, reaction);
        if (updated) {
          const giftIndex = gifts.findIndex((g) => g.id === giftId);
          if (giftIndex >= 0) {
            gifts[giftIndex].reaction = reaction;
          }
          // Update UI
          item.querySelectorAll('.reaction-btn').forEach((b) => {
            b.classList.toggle('selected', b.getAttribute('data-reaction') === reaction);
          });
          toast.success('Reaction saved');
        }
      });
    });
  });

  bodyEl.querySelector('#add-gift-btn')?.addEventListener('click', () => {
    showGiftForm();
  });
}

/**
 * Render suggestions tab
 */
async function renderSuggestionsTab(prefilledOccasion?: string): Promise<void> {
  const bodyEl = document.getElementById('gifts-body');
  if (!bodyEl) return;

  // Show form to get suggestions
  bodyEl.innerHTML = `
    <div class="form-field">
      <label class="form-label">Who is the gift for?</label>
      <select class="form-input form-select" id="suggestion-contact">
        <option value="">Select a contact...</option>
        ${upcomingOccasions
          .map((o) => `<option value="${o.contactId}">${escapeHtml(o.contactName)}</option>`)
          .join('')}
      </select>
    </div>
    <div class="form-field">
      <label class="form-label">What's the occasion?</label>
      <input type="text" class="form-input" id="suggestion-occasion" value="${prefilledOccasion || ''}" placeholder="Birthday, Christmas, Anniversary..." />
    </div>
    <div class="form-row">
      <div class="form-field">
        <label class="form-label">Min Budget</label>
        <input type="number" class="form-input" id="suggestion-min-budget" placeholder="$25" />
      </div>
      <div class="form-field">
        <label class="form-label">Max Budget</label>
        <input type="number" class="form-input" id="suggestion-max-budget" placeholder="$100" />
      </div>
    </div>
    <button class="btn btn-primary" id="get-suggestions-btn" style="width: 100%; margin-top: 8px;">
      Get Gift Ideas
    </button>
    <div id="suggestions-results" style="margin-top: 24px;"></div>
  `;

  if (currentContactId) {
    const select = document.getElementById('suggestion-contact') as HTMLSelectElement;
    if (select) select.value = currentContactId;
  }

  bodyEl.querySelector('#get-suggestions-btn')?.addEventListener('click', async () => {
    const contactId = (document.getElementById('suggestion-contact') as HTMLSelectElement).value;
    const occasion = (document.getElementById('suggestion-occasion') as HTMLInputElement).value.trim();
    const minBudget = (document.getElementById('suggestion-min-budget') as HTMLInputElement).value;
    const maxBudget = (document.getElementById('suggestion-max-budget') as HTMLInputElement).value;

    if (!contactId) {
      toast.warning('Select a contact');
      return;
    }

    if (!occasion) {
      toast.warning('Enter an occasion');
      return;
    }

    const budget =
      minBudget && maxBudget ? { min: Number(minBudget), max: Number(maxBudget) } : undefined;

    const resultsEl = document.getElementById('suggestions-results');
    if (resultsEl) {
      resultsEl.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--color-text-muted);">
          Finding perfect gift ideas...
        </div>
      `;
    }

    const suggestions = await fetchGiftSuggestions(contactId, occasion, budget);

    if (resultsEl) {
      if (suggestions.length === 0) {
        resultsEl.innerHTML = `
          <div style="text-align: center; padding: 40px; color: var(--color-text-muted);">
            No suggestions available. Try different criteria.
          </div>
        `;
      } else {
        resultsEl.innerHTML = suggestions
          .map(
            (s) => `
          <div class="suggestion-card">
            <div class="suggestion-header">
              <span class="suggestion-idea">${escapeHtml(s.idea)}</span>
              <span class="suggestion-confidence ${s.confidence}">${s.confidence}</span>
            </div>
            <div class="suggestion-description">${escapeHtml(s.description)}</div>
            <div class="suggestion-price">${escapeHtml(s.priceRange)}</div>
            <div class="suggestion-reasoning">"${escapeHtml(s.reasoning)}"</div>
          </div>
        `
          )
          .join('');
      }
    }
  });
}

/**
 * Show gift form
 */
function showGiftForm(contactId?: string, contactName?: string, occasion?: string): void {
  const bodyEl = document.getElementById('gifts-body');
  if (!bodyEl) return;

  bodyEl.innerHTML = `
    <div style="max-width: 480px;">
      <div class="form-field">
        <label class="form-label">Contact Name</label>
        <input type="text" class="form-input" id="gift-contact-name" value="${contactName || ''}" placeholder="Who is this gift for/from?" />
      </div>

      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Direction</label>
          <select class="form-input form-select" id="gift-direction">
            <option value="given">I gave this gift</option>
            <option value="received">I received this gift</option>
          </select>
        </div>
        <div class="form-field">
          <label class="form-label">Date</label>
          <input type="date" class="form-input" id="gift-date" value="${new Date().toISOString().split('T')[0]}" />
        </div>
      </div>

      <div class="form-field">
        <label class="form-label">Gift Item</label>
        <input type="text" class="form-input" id="gift-item" placeholder="What was the gift?" />
      </div>

      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Occasion</label>
          <input type="text" class="form-input" id="gift-occasion" value="${occasion || ''}" placeholder="Birthday, Christmas..." />
        </div>
        <div class="form-field">
          <label class="form-label">Price (optional)</label>
          <input type="number" class="form-input" id="gift-price" placeholder="$0.00" />
        </div>
      </div>

      <div class="form-field">
        <label class="form-label">Description (optional)</label>
        <textarea class="form-input" id="gift-description" rows="2" placeholder="Any notes about the gift..."></textarea>
      </div>

      <div class="form-field">
        <label class="form-label">Tags (optional)</label>
        <div class="tags-input" id="tags-input">
          <input type="text" class="tag-input" id="gift-tags-input" placeholder="Type and press Enter..." />
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary" id="gift-cancel">Cancel</button>
        <button class="btn btn-primary" id="gift-save">Save Gift</button>
      </div>
    </div>
  `;

  // Store contactId in a data attribute if provided
  if (contactId) {
    bodyEl.setAttribute('data-contact-id', contactId);
  }

  // Tags functionality
  const tagsInput = document.getElementById('tags-input');
  const tagInputField = document.getElementById('gift-tags-input') as HTMLInputElement;
  const tags: string[] = [];

  tagInputField?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = tagInputField.value.trim();
      if (value && !tags.includes(value)) {
        tags.push(value);
        renderTags();
      }
      tagInputField.value = '';
    }
  });

  function renderTags(): void {
    if (!tagsInput) return;
    const tagElements = tags
      .map(
        (tag) => `
      <span class="tag">
        ${escapeHtml(tag)}
        <button class="tag-remove" data-tag="${escapeHtml(tag)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </span>
    `
      )
      .join('');
    tagsInput.innerHTML = tagElements + `<input type="text" class="tag-input" id="gift-tags-input" placeholder="Type and press Enter..." />`;

    // Re-attach event listener
    const newTagInput = document.getElementById('gift-tags-input') as HTMLInputElement;
    newTagInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = newTagInput.value.trim();
        if (value && !tags.includes(value)) {
          tags.push(value);
          renderTags();
        }
        newTagInput.value = '';
      }
    });

    // Remove tag event listeners
    tagsInput.querySelectorAll('.tag-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tagToRemove = btn.getAttribute('data-tag');
        if (tagToRemove) {
          const idx = tags.indexOf(tagToRemove);
          if (idx >= 0) tags.splice(idx, 1);
          renderTags();
        }
      });
    });
  }

  // Cancel
  bodyEl.querySelector('#gift-cancel')?.addEventListener('click', () => {
    renderTab('history');
  });

  // Save
  bodyEl.querySelector('#gift-save')?.addEventListener('click', async () => {
    const contactNameInput = (document.getElementById('gift-contact-name') as HTMLInputElement).value.trim();
    const direction = (document.getElementById('gift-direction') as HTMLSelectElement).value as 'given' | 'received';
    const date = (document.getElementById('gift-date') as HTMLInputElement).value;
    const item = (document.getElementById('gift-item') as HTMLInputElement).value.trim();
    const occasionInput = (document.getElementById('gift-occasion') as HTMLInputElement).value.trim();
    const price = (document.getElementById('gift-price') as HTMLInputElement).value;
    const description = (document.getElementById('gift-description') as HTMLTextAreaElement).value.trim();

    if (!contactNameInput) {
      toast.warning('Enter a contact name');
      return;
    }

    if (!item) {
      toast.warning('Enter the gift item');
      return;
    }

    if (!occasionInput) {
      toast.warning('Enter the occasion');
      return;
    }

    const giftData: Omit<Gift, 'id'> = {
      contactId: contactId || `contact_${Date.now()}`,
      contactName: contactNameInput,
      direction,
      item,
      occasion: occasionInput,
      date: new Date(date),
      price: price ? Number(price) : undefined,
      description: description || undefined,
      tags: tags.length > 0 ? tags : undefined,
    };

    const saved = await saveGift(giftData);
    if (saved) {
      toast.success('Gift recorded');
      gifts.push(saved);
      renderTab('history');
    } else {
      toast.error('Could not save gift');
    }
  });
}

/**
 * Render loading state
 */
function renderLoading(): void {
  const bodyEl = document.getElementById('gifts-body');
  if (!bodyEl) return;

  bodyEl.innerHTML = `
    <div style="text-align: center; padding: 60px; color: var(--color-text-muted);">
      Loading...
    </div>
  `;
}

// ============================================================================
// HELPERS
// ============================================================================

function cleanupOrphanedPanels(): void {
  document.querySelectorAll('.gifts-panel').forEach((el) => el.remove());
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initGiftsUI(): void {
  // Listen for open gifts event
  document.addEventListener('ferni:open-gifts', ((e: CustomEvent<{ contactId?: string }>) => {
    openGiftsPanel(e.detail?.contactId);
  }) as EventListener);

  log.debug('Gifts UI initialized');
}

export default {
  init: initGiftsUI,
  open: openGiftsPanel,
  close: closeGiftsPanel,
};

