/**
 * Proactive Messages UI
 *
 * > "We reach out. Not because you asked. Because we noticed."
 *
 * Displays in-app messages from Ferni's intelligent outreach system:
 * - Onboarding check-ins
 * - Thinking of you moments
 * - Milestone celebrations
 * - Gentle re-engagement nudges
 *
 * Design: Warm floating card in bottom-right, non-intrusive,
 * feels like a note from a friend - not a notification.
 *
 * @module ProactiveMessagesUI
 */

import { apiGet, apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { t } from '../i18n/index.js';
import { requestAttention } from '../services/attention-queue.js';
import { PROACTIVE_MESSAGES_CSS } from './proactive-messages.styles.js';

const log = createLogger('ProactiveMessagesUI');

// ============================================================================
// TYPES
// ============================================================================

interface PendingMessage {
  id: string;
  type: string;
  personaId: string;
  text: string;
  ssml: string;
  reason: string;
  read: boolean;
  createdAt: string;
  /** A coaching pick's answer card (/a/:id): why it was picked and where it came from. */
  answerCardId?: string;
}

/** The card page for a message, or null when it has no well-formed card id. */
export function answerCardHref(message: Pick<PendingMessage, 'answerCardId'>): string | null {
  const id = message.answerCardId;
  return typeof id === 'string' && /^[A-Za-z0-9_-]{43}$/.test(id) ? `/a/${id}` : null;
}

interface ProactiveMessagesState {
  messages: PendingMessage[];
  currentIndex: number;
  isVisible: boolean;
  isExpanded: boolean;
  hasUnread: boolean;
}

// ============================================================================
// STATE
// ============================================================================

const state: ProactiveMessagesState = {
  messages: [],
  currentIndex: 0,
  isVisible: false,
  isExpanded: false,
  hasUnread: false,
};

let container: HTMLElement | null = null;
let indicator: HTMLElement | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the proactive messages UI
 */
export function initProactiveMessages(): void {
  // Clean up any existing instances
  document.querySelectorAll('.proactive-messages-container').forEach((el) => el.remove());
  document.querySelectorAll('.proactive-indicator').forEach((el) => el.remove());

  // Create unread indicator (small dot that shows when there are messages)
  indicator = document.createElement('div');
  indicator.className = 'proactive-indicator';
  indicator.innerHTML = `
    <button class="indicator-btn" aria-label="${t('proactiveMessages.indicatorLabel')}">
      <span class="indicator-dot"></span>
      <span class="indicator-count">0</span>
    </button>
  `;
  indicator.style.cssText = `
    position: fixed;
    bottom: var(--space-20, 80px);
    right: var(--space-6, 24px);
    z-index: var(--z-toast);
    opacity: 0;
    visibility: hidden;
    transition: opacity var(--duration-normal, 200ms) var(--ease-standard, ease-out),
                transform var(--duration-normal, 200ms) var(--ease-spring, ease);
    transform: scale(0.8);
  `;
  document.body.appendChild(indicator);

  const style = document.createElement('style');
  style.textContent = PROACTIVE_MESSAGES_CSS;
  document.head.appendChild(style);

  // Create message container (hidden initially)
  container = document.createElement('div');
  container.className = 'proactive-messages-container';
  document.body.appendChild(container);

  // Set up event listeners
  indicator.querySelector('.indicator-btn')?.addEventListener('click', toggleMessages);

  // Load messages on init
  void loadMessages();
}

// ============================================================================
// MESSAGE LOADING
// ============================================================================

/**
 * Load pending messages from the API
 */
async function loadMessages(): Promise<void> {
  try {
    const userId = getUserId();
    if (!userId) {
      log.debug('No user ID, skipping message load');
      return;
    }

    const response = await apiGet<{ messages?: PendingMessage[] }>(
      `/api/outreach/pending-messages?userId=${userId}`
    );
    if (!response.ok || !response.data) {
      log.warn('Failed to fetch messages', { status: response.status });
      return;
    }

    state.messages = response.data.messages || [];
    state.hasUnread = state.messages.length > 0;

    requestAttention('proactive-messages', updateIndicator, state.hasUnread);

    if (state.hasUnread) {
      log.info({ count: state.messages.length }, 'Loaded pending messages');
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Error loading messages');
  }
}

/**
 * Get current user ID from various sources
 */
function getUserId(): string | null {
  // Check localStorage
  const stored = localStorage.getItem('ferniUserId');
  if (stored) return stored;

  // Check URL params (dev mode)
  const params = new URLSearchParams(window.location.search);
  const urlUserId = params.get('userId');
  if (urlUserId) return urlUserId;

  return null;
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Update the indicator visibility and count
 */
function updateIndicator(): void {
  if (!indicator) return;

  const countEl = indicator.querySelector('.indicator-count');
  if (countEl) {
    countEl.textContent = state.messages.length.toString();
  }

  // is-visible also lets the dot's pulse run (paused-when-hidden.css)
  const show = state.hasUnread && !state.isVisible;
  indicator.classList.toggle('is-visible', show);
  indicator.style.opacity = show ? '1' : '0';
  indicator.style.visibility = show ? 'visible' : 'hidden';
  indicator.style.transform = show ? 'scale(1)' : 'scale(0.8)';
}

/**
 * Render the current message
 */
function renderMessage(): void {
  if (!container || state.messages.length === 0) return;

  const message = state.messages[state.currentIndex];
  if (!message) return;

  const personaName = getPersonaDisplayName(message.personaId);
  // The card opens in its own tab so a call in this one keeps going.
  const cardHref = answerCardHref(message);
  const cardLink = cardHref
    ? `<a class="message-card-link" href="${cardHref}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('answerCard.seeSources'))}</a>`
    : '';

  container.innerHTML = `
    <div class="message-card">
      <div class="message-header">
        <div class="message-sender">
          <div class="sender-avatar" style="background: var(--color-${message.personaId}, var(--persona-primary))">
            ${getPersonaIcon(message.personaId)}
          </div>
          <div class="sender-info">
            <span class="sender-name">${personaName}</span>
            <span class="sender-reason">${getReasonText(message.reason)}</span>
          </div>
        </div>
        <button class="close-btn" aria-label="${t('common.close')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="message-body">
        <p class="message-text">${escapeHtml(message.text)}</p>
        ${cardLink}
      </div>
      <div class="message-actions">
        <button class="action-btn" data-action="dismiss">${t('common.maybeLater')}</button>
        <button class="action-btn primary" data-action="respond">${t('proactiveMessages.respond')}</button>
      </div>
      ${
        state.messages.length > 1
          ? `
        <div class="message-pagination">
          ${state.messages
            .map(
              (_, i) => `
            <div class="pagination-dot ${i === state.currentIndex ? 'active' : ''}" data-index="${i}"></div>
          `
            )
            .join('')}
        </div>
      `
          : ''
      }
    </div>
  `;

  // Bind events
  container.querySelector('.close-btn')?.addEventListener('click', () => dismissMessage());
  container
    .querySelector('[data-action="dismiss"]')
    ?.addEventListener('click', () => dismissMessage());
  container
    .querySelector('[data-action="respond"]')
    ?.addEventListener('click', () => respondToMessage());

  container.querySelectorAll('.pagination-dot').forEach((dot) => {
    dot.addEventListener('click', (e) => {
      const index = parseInt((e.target as HTMLElement).dataset.index || '0', 10);
      state.currentIndex = index;
      renderMessage();
    });
  });
}

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Toggle message visibility
 */
function toggleMessages(): void {
  if (state.isVisible) {
    hideMessages();
  } else {
    showMessages();
  }
}

/**
 * Show messages panel
 */
function showMessages(): void {
  if (!container || state.messages.length === 0) return;

  state.isVisible = true;
  state.currentIndex = 0;

  renderMessage();
  container.classList.add('visible');
  updateIndicator();
}

/**
 * Hide messages panel
 */
function hideMessages(): void {
  if (!container) return;

  state.isVisible = false;
  container.classList.remove('visible');
  updateIndicator();
}

/**
 * Dismiss current message
 */
async function dismissMessage(): Promise<void> {
  const message = state.messages[state.currentIndex];
  if (!message) return;

  // Mark as read in backend
  try {
    const userId = getUserId();
    await apiPost(`/api/outreach/messages/${message.id}/read?userId=${userId}`, {});
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to mark message as read');
  }

  // Remove from local state
  state.messages = state.messages.filter((m) => m.id !== message.id);
  state.hasUnread = state.messages.length > 0;

  if (state.messages.length === 0) {
    hideMessages();
  } else {
    state.currentIndex = Math.min(state.currentIndex, state.messages.length - 1);
    renderMessage();
  }

  updateIndicator();
}

/**
 * Respond to current message (opens main chat)
 */
function respondToMessage(): void {
  const message = state.messages[state.currentIndex];
  if (!message) return;

  // Dispatch event to open conversation with context
  window.dispatchEvent(
    new CustomEvent('ferni:start-conversation', {
      detail: {
        personaId: message.personaId,
        context: message.reason,
        messageId: message.id,
      },
    })
  );

  // Mark as read and dismiss
  void dismissMessage();
}

// ============================================================================
// HELPERS
// ============================================================================

function getPersonaDisplayName(personaId: string): string {
  const names: Record<string, string> = {
    ferni: 'Ferni',
    maya: 'Maya',
    peter: 'Peter',
    alex: 'Alex',
    jordan: 'Jordan',
    nayan: 'Nayan',
  };
  return names[personaId] || 'Ferni';
}

function getReasonText(reason: string): string {
  const reasonKeys: Record<string, string> = {
    welcome_followup: 'proactiveMessages.reasons.welcomeFollowup',
    next_day_check: 'proactiveMessages.reasons.nextDayCheck',
    topic_deepdive: 'proactiveMessages.reasons.topicDeepdive',
    first_week_reflection: 'proactiveMessages.reasons.firstWeekReflection',
    momentum_check: 'proactiveMessages.reasons.momentumCheck',
    two_week_celebration: 'proactiveMessages.reasons.twoWeekCelebration',
    thinking_of_you: 'proactiveMessages.reasons.thinkingOfYou',
    habit_nudge: 'proactiveMessages.reasons.habitNudge',
    win_celebration: 'proactiveMessages.reasons.winCelebration',
    setback_support: 'proactiveMessages.reasons.setbackSupport',
    reengagement_gentle: 'proactiveMessages.reasons.reengagementGentle',
    reengagement_warmth: 'proactiveMessages.reasons.reengagementWarmth',
    life_event_followup: 'proactiveMessages.reasons.lifeEventFollowup',
  };
  return t(reasonKeys[reason] ?? 'proactiveMessages.reasons.default');
}

function getPersonaIcon(_personaId: string): string {
  // Simple icon for all personas (could be customized per persona)
  return `<svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm0 14c-2.03 0-4.43-.82-6.14-2.88C7.55 15.8 9.68 15 12 15s4.45.8 6.14 2.12C16.43 19.18 14.03 20 12 20z"/>
  </svg>`;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Refresh messages (call after a conversation or on reconnect)
 */
export function refreshProactiveMessages(): void {
  void loadMessages();
}

/**
 * Show a specific message (for testing)
 */
export function showTestMessage(message: Partial<PendingMessage>): void {
  state.messages = [
    {
      id: 'test-' + Date.now(),
      type: 'thinking_of_you',
      personaId: 'ferni',
      text: 'Hey. Just thinking of you. How are things going?',
      ssml: '',
      reason: 'thinking_of_you',
      read: false,
      createdAt: new Date().toISOString(),
      ...message,
    },
  ];
  state.hasUnread = true;
  updateIndicator();
  showMessages();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const proactiveMessagesUI = {
  init: initProactiveMessages,
  refresh: refreshProactiveMessages,
  showTestMessage,
};

export default proactiveMessagesUI;
