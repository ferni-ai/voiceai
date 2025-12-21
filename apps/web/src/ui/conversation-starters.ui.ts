/**
 * Conversation Starters UI
 *
 * Get thoughtful conversation starters and topics
 * to reconnect with someone.
 *
 * @module ui/conversation-starters
 */

import { createLogger } from '../utils/logger.js';
import { toast } from './toast.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiFetch } from '../utils/api-helpers.js';
import { shouldUseDemoData } from '../utils/environment.js';
import { getMockConversationStarters } from '../data/mock-contacts.js';

const log = createLogger('ConversationStartersUI');

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationStarter {
  id: string;
  topic: string;
  opener: string;
  context: string;
  tone: 'casual' | 'supportive' | 'celebratory' | 'curious';
}

export interface ConversationStartersOptions {
  contactId: string;
  contactName: string;
  lastContact?: string; // ISO date
  sharedInterests?: string[];
  recentEvents?: string[];
  onSelect?: (starter: ConversationStarter) => void;
  onClose?: () => void;
}

// ============================================================================
// STATE
// ============================================================================

interface ConversationStartersState {
  isOpen: boolean;
  contactId: string;
  contactName: string;
  lastContact: string;
  starters: ConversationStarter[];
  isLoading: boolean;
  hasGenerated: boolean;
  error: string | null;
  selectedStarter: ConversationStarter | null;
}

let state: ConversationStartersState = {
  isOpen: false,
  contactId: '',
  contactName: '',
  lastContact: '',
  starters: [],
  isLoading: false,
  hasGenerated: false,
  error: null,
  selectedStarter: null,
};

let modalContainer: HTMLElement | null = null;
let callbacks: { onSelect?: (starter: ConversationStarter) => void; onClose?: () => void } = {};

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  messageCircle: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`,
  sparkles: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
  coffee: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>`,
  heart: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  party: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12v0c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11v0c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98v0C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/></svg>`,
  lightbulb: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  loader: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cs-spinner"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
  refresh: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  copy: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  check: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
};

// Tone icons
const TONE_ICONS: Record<ConversationStarter['tone'], string> = {
  casual: ICONS.coffee,
  supportive: ICONS.heart,
  celebratory: ICONS.party,
  curious: ICONS.lightbulb,
};

const TONE_LABELS: Record<ConversationStarter['tone'], string> = {
  casual: 'Casual',
  supportive: 'Supportive',
  celebratory: 'Celebratory',
  curious: 'Curious',
};

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('conversation-starters-styles')) return;

  const style = document.createElement('style');
  style.id = 'conversation-starters-styles';
  style.textContent = `
    /* =========================================================================
       CONVERSATION STARTERS UI
       ========================================================================= */
    
    .conversation-starters-overlay {
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

    .conversation-starters-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .conversation-starters-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy, rgba(44, 37, 32, 0.5));
      backdrop-filter: blur(var(--glass-blur-strong, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-strong, 24px));
    }

    .conversation-starters-modal {
      position: relative;
      width: 94%;
      max-width: 480px;
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

    .conversation-starters-overlay.open .conversation-starters-modal {
      transform: scale(1) translateY(0);
    }

    /* =========================================================================
       HEADER
       ========================================================================= */
    
    .cs-header {
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
    }

    .cs-header-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
    }

    .cs-header-title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }

    .cs-icon {
      color: var(--persona-primary, #4a6741);
    }

    .cs-eyebrow {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 0.25rem);
    }

    .cs-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
      line-height: 1.2;
    }

    .cs-subtitle {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      margin-top: var(--space-1, 0.25rem);
    }

    .cs-close {
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

    .cs-close:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      color: var(--color-text-primary, #2C2520);
    }

    /* =========================================================================
       CONTENT
       ========================================================================= */
    
    .cs-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
    }

    /* =========================================================================
       LOADING STATE
       ========================================================================= */
    
    .cs-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-12, 3rem) var(--space-4, 1rem);
      text-align: center;
    }

    .cs-loading-icon {
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-3, 0.75rem);
    }

    .cs-spinner {
      animation: cs-spin 1s linear infinite;
    }

    @keyframes cs-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .cs-loading-text {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
    }

    /* =========================================================================
       INITIAL STATE
       ========================================================================= */
    
    .cs-initial {
      text-align: center;
      padding: var(--space-8, 2rem) var(--space-4, 1rem);
    }

    .cs-initial-icon {
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

    .cs-initial-icon svg {
      width: 28px;
      height: 28px;
    }

    .cs-initial-title {
      font-size: var(--text-base, 1rem);
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin-bottom: var(--space-2, 0.5rem);
    }

    .cs-initial-text {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      line-height: 1.5;
      margin-bottom: var(--space-4, 1rem);
    }

    .cs-generate-btn {
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

    .cs-generate-btn:hover {
      background: var(--persona-secondary, #3d5a35);
      border-color: var(--persona-secondary, #3d5a35);
    }

    /* =========================================================================
       STARTERS LIST
       ========================================================================= */
    
    .cs-starters {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 0.75rem);
    }

    .cs-starter {
      background: var(--color-bg-secondary, rgba(250, 248, 245, 0.5));
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-lg, 1rem);
      padding: var(--space-4, 1rem);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .cs-starter:hover {
      border-color: var(--persona-primary, #4a6741);
      background: var(--color-background-elevated, #FFFDFB);
    }

    .cs-starter.selected {
      border-color: var(--persona-primary, #4a6741);
      border-width: 2px;
      background: var(--persona-tint, rgba(74, 103, 65, 0.05));
    }

    .cs-starter-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-2, 0.5rem);
    }

    .cs-starter-topic {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      font-weight: 600;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-primary, #2C2520);
    }

    .cs-tone-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1, 0.25rem);
      font-size: var(--text-xxs, 0.625rem);
      font-weight: 500;
      color: var(--persona-primary, #4a6741);
      padding: var(--space-0-5, 0.125rem) var(--space-2, 0.5rem);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-full, 9999px);
    }

    .cs-tone-badge svg {
      width: 10px;
      height: 10px;
    }

    .cs-starter-opener {
      font-size: var(--text-base, 1rem);
      color: var(--color-text-secondary, #5a4a42);
      font-style: italic;
      line-height: 1.5;
      margin-bottom: var(--space-2, 0.5rem);
      padding-left: var(--space-3, 0.75rem);
      border-left: 2px solid var(--color-border, rgba(44, 37, 32, 0.12));
    }

    .cs-starter-context {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
    }

    /* =========================================================================
       ERROR STATE
       ========================================================================= */
    
    .cs-error {
      text-align: center;
      padding: var(--space-8, 2rem) var(--space-4, 1rem);
      color: var(--color-semantic-error, #c44);
    }

    .cs-error-text {
      font-size: var(--text-sm, 0.875rem);
      margin-bottom: var(--space-3, 0.75rem);
    }

    .cs-retry-btn {
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

    .cs-retry-btn:hover {
      border-color: var(--color-text-muted, #70605a);
    }

    /* =========================================================================
       FOOTER
       ========================================================================= */
    
    .cs-footer {
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
      border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      display: flex;
      gap: var(--space-2, 0.5rem);
    }

    .cs-footer-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-1-5, 0.375rem);
      padding: var(--space-2-5, 0.625rem) var(--space-3, 0.75rem);
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .cs-footer-btn-secondary {
      background: transparent;
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.15));
      color: var(--color-text-secondary, #5a4a42);
    }

    .cs-footer-btn-secondary:hover {
      border-color: var(--color-text-muted, #70605a);
    }

    .cs-footer-btn-primary {
      background: var(--persona-primary, #4a6741);
      border: 1px solid var(--persona-primary, #4a6741);
      color: white;
    }

    .cs-footer-btn-primary:hover {
      background: var(--persona-secondary, #3d5a35);
    }

    .cs-footer-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .cs-footer-btn svg {
      width: 16px;
      height: 16px;
    }

    /* =========================================================================
       RESPONSIVE
       ========================================================================= */
    
    @media (max-width: 480px) {
      .conversation-starters-modal {
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
      .conversation-starters-overlay,
      .conversation-starters-modal,
      .cs-starter,
      .cs-generate-btn,
      .cs-spinner {
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

  const modal = modalContainer.querySelector('.conversation-starters-modal');
  if (!modal) return;

  const lastContactText = state.lastContact ? formatLastContact(state.lastContact) : null;

  modal.innerHTML = `
    <div class="cs-header">
      <div class="cs-header-row">
        <div class="cs-header-title">
          <span class="cs-icon">${ICONS.messageCircle}</span>
          <div>
            <div class="cs-eyebrow">Conversation Starters</div>
            <h2 class="cs-title">${escapeHtml(state.contactName)}</h2>
            ${lastContactText ? `<p class="cs-subtitle">Last talked ${lastContactText}</p>` : ''}
          </div>
        </div>
        <button class="cs-close" aria-label="Close">${ICONS.close}</button>
      </div>
    </div>
    
    <div class="cs-content">
      ${renderContent()}
    </div>
    
    ${state.hasGenerated && state.starters.length > 0 ? `
      <div class="cs-footer">
        <button class="cs-footer-btn cs-footer-btn-secondary" id="cs-regenerate">
          ${ICONS.refresh} New ideas
        </button>
        <button class="cs-footer-btn cs-footer-btn-primary" id="cs-copy" ${!state.selectedStarter ? 'disabled' : ''}>
          ${ICONS.copy} Copy opener
        </button>
      </div>
    ` : ''}
  `;

  bindEvents();
}

function renderContent(): string {
  if (state.isLoading) {
    return `
      <div class="cs-loading">
        <div class="cs-loading-icon">${ICONS.loader}</div>
        <p class="cs-loading-text">Thinking of things to talk about...</p>
      </div>
    `;
  }

  if (state.error) {
    return `
      <div class="cs-error">
        <p class="cs-error-text">${escapeHtml(state.error)}</p>
        <button class="cs-retry-btn" id="cs-retry">
          ${ICONS.refresh} Try again
        </button>
      </div>
    `;
  }

  if (!state.hasGenerated) {
    return `
      <div class="cs-initial">
        <div class="cs-initial-icon">${ICONS.messageCircle}</div>
        <h3 class="cs-initial-title">Start a great conversation</h3>
        <p class="cs-initial-text">
          Based on what you've talked about before, Ferni will suggest
          thoughtful ways to reconnect.
        </p>
        <button class="cs-generate-btn" id="cs-generate">
          ${ICONS.sparkles} Get Ideas
        </button>
      </div>
    `;
  }

  if (state.starters.length === 0) {
    return `
      <div class="cs-initial">
        <div class="cs-initial-icon">${ICONS.messageCircle}</div>
        <h3 class="cs-initial-title">No suggestions yet</h3>
        <p class="cs-initial-text">Try adding more context about your relationship.</p>
      </div>
    `;
  }

  return `
    <div class="cs-starters">
      ${state.starters.map(starter => `
        <div class="cs-starter ${state.selectedStarter?.id === starter.id ? 'selected' : ''}" data-id="${starter.id}">
          <div class="cs-starter-header">
            <span class="cs-starter-topic">${escapeHtml(starter.topic)}</span>
            <span class="cs-tone-badge">${TONE_ICONS[starter.tone]} ${TONE_LABELS[starter.tone]}</span>
          </div>
          <div class="cs-starter-opener">"${escapeHtml(starter.opener)}"</div>
          <div class="cs-starter-context">${escapeHtml(starter.context)}</div>
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
  modalContainer.querySelector('.cs-close')?.addEventListener('click', closeConversationStarters);
  modalContainer.querySelector('.conversation-starters-backdrop')?.addEventListener('click', closeConversationStarters);

  // Generate button
  modalContainer.querySelector('#cs-generate')?.addEventListener('click', generateStarters);
  modalContainer.querySelector('#cs-regenerate')?.addEventListener('click', generateStarters);
  modalContainer.querySelector('#cs-retry')?.addEventListener('click', generateStarters);

  // Copy button
  modalContainer.querySelector('#cs-copy')?.addEventListener('click', copySelectedStarter);

  // Starter selection
  modalContainer.querySelectorAll('.cs-starter').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      const starter = state.starters.find(s => s.id === id);
      if (starter) {
        state.selectedStarter = starter;
        render();
      }
    });
  });

  // Escape key
  document.addEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && state.isOpen) {
    closeConversationStarters();
  }
}

// ============================================================================
// ACTIONS
// ============================================================================

async function generateStarters(): Promise<void> {
  state.isLoading = true;
  state.error = null;
  state.selectedStarter = null;
  render();

  try {
    const response = await apiFetch(`/api/contacts/${state.contactId}/conversation-starters`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error('Failed to generate starters');
    }

    const data = await response.json();
    state.starters = data.starters || [];
    state.hasGenerated = true;
    state.isLoading = false;
    
    // Auto-select first if available
    if (state.starters.length > 0) {
      state.selectedStarter = state.starters[0];
    }
    
    render();

    if (state.starters.length > 0) {
      toast.success(`${state.starters.length} ideas ready!`);
    }
  } catch (error) {
    log.error('Failed to generate conversation starters:', error);
    
    // In dev mode, fall back to mock starters
    if (shouldUseDemoData()) {
      const mockStarters = getMockConversationStarters(state.contactId);
      state.starters = mockStarters.map(s => ({
        id: s.id,
        topic: s.topic,
        opener: s.opener,
        context: s.context || '',
        tone: 'casual' as const,
      }));
      state.hasGenerated = true;
      state.isLoading = false;
      
      if (state.starters.length > 0) {
        state.selectedStarter = state.starters[0];
      }
      
      render();
      log.debug('Using mock conversation starters');
      toast.success(`${state.starters.length} ideas ready! (mock)`);
      return;
    }
    
    state.error = 'Could not generate ideas. Try again?';
    state.isLoading = false;
    render();
  }
}

function copySelectedStarter(): void {
  if (!state.selectedStarter) return;

  navigator.clipboard.writeText(state.selectedStarter.opener)
    .then(() => {
      toast.success('Copied!');
      
      if (callbacks.onSelect) {
        callbacks.onSelect(state.selectedStarter!);
      }
    })
    .catch(() => {
      toast.error('Could not copy');
    });
}

// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatLastContact(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return 'over a year ago';
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the Conversation Starters modal
 */
export function openConversationStarters(options: ConversationStartersOptions): void {
  closeConversationStarters();
  
  injectStyles();

  state = {
    isOpen: true,
    contactId: options.contactId,
    contactName: options.contactName,
    lastContact: options.lastContact || '',
    starters: [],
    isLoading: false,
    hasGenerated: false,
    error: null,
    selectedStarter: null,
  };

  callbacks = {
    onSelect: options.onSelect,
    onClose: options.onClose,
  };

  modalContainer = document.createElement('div');
  modalContainer.className = 'conversation-starters-overlay';
  modalContainer.innerHTML = `
    <div class="conversation-starters-backdrop"></div>
    <div class="conversation-starters-modal" role="dialog" aria-modal="true" aria-label="Conversation starters">
    </div>
  `;
  document.body.appendChild(modalContainer);

  render();

  requestAnimationFrame(() => {
    modalContainer?.classList.add('open');
  });

  log.info({ contactId: options.contactId }, 'Opened Conversation Starters');
}

/**
 * Close the Conversation Starters modal
 */
export function closeConversationStarters(): void {
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
  log.info('Closed Conversation Starters');
}

export const conversationStarters = {
  open: openConversationStarters,
  close: closeConversationStarters,
};

export default conversationStarters;

