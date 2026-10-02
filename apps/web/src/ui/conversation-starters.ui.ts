/**
 * Conversation Starters UI
 *
 * Get thoughtful conversation starters and topics
 * to reconnect with someone.
 *
 * @module ui/conversation-starters
 */

import { createLogger } from '../utils/logger.js';
import { toast } from './whisper.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiFetch } from '../utils/api-helpers.js';
import { shouldUseDemoData } from '../utils/environment.js';
import { getMockConversationStarters } from '../data/mock-contacts.js';
import { t } from '../i18n/index.js';
import {
  type ConversationStarter,
  type ConversationStartersOptions,
  type ConversationStartersState,
  ICONS,
  TONE_ICONS,
  TONE_LABELS,
  escapeHtml,
  formatLastContact,
} from './conversation-starters-config.js';
export type {
  ConversationStarter,
  ConversationStartersOptions,
} from './conversation-starters-config.js';

const log = createLogger('ConversationStartersUI');

// ============================================================================
// STATE
// ============================================================================

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
      background: rgba(44, 37, 32, 0.75);
    }

    .conversation-starters-modal {
      position: relative;
      width: 94%;
      max-width: clamp(336px, 90vw, 480px);
      max-height: 85vh;
      background: var(--color-bg-elevated, var(--color-white));
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 8px 32px color-mix(in srgb, var(--color-black) 12%, transparent), 0 2px 8px color-mix(in srgb, var(--color-black) 6%, transparent);
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
      color: var(--persona-ink);
    }

    .cs-eyebrow {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--persona-ink);
      margin-bottom: var(--space-1, 0.25rem);
    }

    .cs-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
      line-height: 1.2;
    }

    .cs-subtitle {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted);
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
      color: var(--color-text-muted);
      transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
      margin: calc(-1 * var(--space-2, 0.5rem)) calc(-1 * var(--space-2, 0.5rem)) 0 0;
    }

    .cs-close:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      color: var(--color-text-primary);
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
      color: var(--persona-ink);
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
      color: var(--color-text-muted);
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
      background: var(--persona-tint, color-mix(in srgb, var(--color-ferni) 10%, transparent));
      color: var(--persona-ink);
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
      color: var(--color-text-primary);
      margin-bottom: var(--space-2, 0.5rem);
    }

    .cs-initial-text {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted);
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
      background: var(--persona-primary, var(--color-ferni));
      border: 1px solid var(--persona-primary, var(--color-ferni));
      color: var(--color-white);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .cs-generate-btn:hover {
      background: var(--persona-secondary, var(--color-ferni-secondary));
      border-color: var(--persona-secondary, var(--color-ferni-secondary));
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
      background: var(--color-bg-secondary, color-mix(in srgb, var(--color-white) 50%, transparent));
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-lg, 1rem);
      padding: var(--space-4, 1rem);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .cs-starter:hover {
      border-color: var(--persona-primary, var(--color-ferni));
      background: var(--color-background-elevated);
    }

    .cs-starter.selected {
      border-color: var(--persona-primary, var(--color-ferni));
      border-width: 2px;
      background: var(--persona-tint, color-mix(in srgb, var(--color-ferni) 5%, transparent));
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
      color: var(--color-text-primary);
    }

    .cs-tone-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1, 0.25rem);
      font-size: var(--text-xxs, 0.625rem);
      font-weight: 500;
      color: var(--persona-ink);
      padding: var(--space-0-5, 0.125rem) var(--space-2, 0.5rem);
      background: var(--persona-tint, color-mix(in srgb, var(--color-ferni) 10%, transparent));
      border-radius: var(--radius-full, 9999px);
    }

    .cs-tone-badge svg {
      width: 10px;
      height: 10px;
    }

    .cs-starter-opener {
      font-size: var(--text-base, 1rem);
      color: var(--color-text-secondary);
      font-style: italic;
      line-height: 1.5;
      margin-bottom: var(--space-2, 0.5rem);
      padding-left: var(--space-3, 0.75rem);
      border-left: 2px solid var(--color-border, rgba(44, 37, 32, 0.12));
    }

    .cs-starter-context {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted);
    }

    /* =========================================================================
       ERROR STATE
       ========================================================================= */
    
    .cs-error {
      text-align: center;
      padding: var(--space-8, 2rem) var(--space-4, 1rem);
      color: var(--color-semantic-error-text);
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
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .cs-retry-btn:hover {
      border-color: var(--color-text-muted);
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
      background: var(--tonal-surface-2);
      border: none;
      color: var(--color-text-secondary);
    }

    .cs-footer-btn-secondary:hover {
      background: var(--tonal-surface-3);
    }

    .cs-footer-btn-secondary:active {
      background: var(--tonal-surface-active);
    }

    .cs-footer-btn-primary {
      background: var(--persona-primary, var(--color-ferni));
      border: 1px solid var(--persona-primary, var(--color-ferni));
      color: var(--color-white);
    }

    .cs-footer-btn-primary:hover {
      background: var(--persona-secondary, var(--color-ferni-secondary));
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
    
    @media (max-width: clamp(336px, 90vw, 480px)) {
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
        <button class="cs-close" aria-label="${t('accessibility.close')}">${ICONS.close}</button>
      </div>
    </div>
    
    <div class="cs-content">
      ${renderContent()}
    </div>
    
    ${state.hasGenerated && state.starters.length > 0 ? `
      <div class="cs-footer">
        <button aria-label="${t('accessibility.refresh')}" class="cs-footer-btn cs-footer-btn-secondary" id="cs-regenerate">
          ${ICONS.refresh} New ideas
        </button>
        <button aria-label="${t('accessibility.copy')}" class="cs-footer-btn cs-footer-btn-primary" id="cs-copy" ${!state.selectedStarter ? 'disabled' : ''}>
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
        <button aria-label="${t('accessibility.refresh')}" class="cs-retry-btn" id="cs-retry">
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
        <button aria-label="${t('accessibility.getIdeas')}" class="cs-generate-btn" id="cs-generate">
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
  modalContainer.querySelector('#cs-generate')?.addEventListener('click', () => { void generateStarters(); });
  modalContainer.querySelector('#cs-regenerate')?.addEventListener('click', () => { void generateStarters(); });
  modalContainer.querySelector('#cs-retry')?.addEventListener('click', () => { void generateStarters(); });

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
    // Topics this person cares about (src/api/contacts-routes.ts GET /:id/topics)
    const response = await apiFetch(
      `/api/contacts/${encodeURIComponent(state.contactId)}/topics`
    );

    if (!response.ok) {
      throw new Error('Failed to generate starters');
    }

    const data = (await response.json()) as {
      topics?: Array<{
        topic: string;
        lastDiscussed: string;
        sentiment: string;
        suggestion: string;
      }>;
    };
    const toneFor = (sentiment: string): ConversationStarter['tone'] =>
      sentiment === 'negative'
        ? 'supportive'
        : sentiment === 'positive'
          ? 'celebratory'
          : 'curious';
    state.starters = (data.topics || []).map((topic, i) => ({
      id: `topic_${i}`,
      topic: topic.topic,
      opener: topic.suggestion,
      context: topic.lastDiscussed
        ? `Last came up ${new Date(topic.lastDiscussed).toLocaleDateString()}`
        : '',
      tone: toneFor(topic.sentiment),
    }));
    state.hasGenerated = true;
    state.isLoading = false;
    
    // Auto-select first if available
    if (state.starters.length > 0) {
      state.selectedStarter = state.starters[0] ?? null;
    }
    
    render();

    if (state.starters.length > 0) {
      toast.success(t('toasts.statestarterslengthIdeasReady', { count: state.starters.length }));
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
        state.selectedStarter = state.starters[0] ?? null;
      }
      
      render();
      log.debug('Using mock conversation starters');
      toast.success(t('toasts.statestarterslengthIdeasReadyMock', { count: state.starters.length }));
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
      toast.success(t('toasts.copied'));
      
      if (callbacks.onSelect) {
        callbacks.onSelect(state.selectedStarter!);
      }
    })
    .catch(() => {
      toast.error(t('toasts.couldNotCopy'));
    });
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
    <div class="conversation-starters-modal" role="dialog" aria-modal="true" aria-label="${t('accessibility.conversationStarters')}">
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
