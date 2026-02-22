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
    <button class="indicator-btn" aria-label="Messages from Ferni">
      <span class="indicator-dot"></span>
      <span class="indicator-count">0</span>
    </button>
  `;
  indicator.style.cssText = `
    position: fixed;
    bottom: var(--space-20, 80px);
    right: var(--space-6, 24px);
    z-index: var(--z-toast, 999);
    opacity: 0;
    visibility: hidden;
    transition: opacity var(--duration-normal, 200ms) var(--ease-standard, ease-out),
                transform var(--duration-normal, 200ms) var(--ease-spring, ease);
    transform: scale(0.8);
  `;
  document.body.appendChild(indicator);

  // Add indicator styles
  const style = document.createElement('style');
  style.textContent = `
    .indicator-btn {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-3, 12px) var(--space-4, 16px);
      background: var(--color-background-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-full, 9999px);
      box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0,0,0,0.1));
      cursor: pointer;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 14px;
      color: var(--color-text-secondary, #5C544A);
      transition: all var(--duration-fast, 100ms) ease;
    }
    
    .indicator-btn:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0,0,0,0.1));
      color: var(--persona-primary, #4a6741);
    }
    
    .indicator-dot {
      width: 10px;
      height: 10px;
      background: var(--persona-primary, #4a6741);
      border-radius: 50%;
      animation: pulse-gentle 2s infinite;
    }
    
    @keyframes pulse-gentle {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(0.9); }
    }
    
    .indicator-count {
      font-weight: 600;
    }
    
    .proactive-messages-container {
      position: fixed;
      bottom: var(--space-20, 80px);
      right: var(--space-6, 24px);
      z-index: var(--z-toast, 1000);
      max-width: 380px;
      width: calc(100vw - 48px);
      opacity: 0;
      visibility: hidden;
      transform: translateY(20px) scale(0.95);
      transition: opacity var(--duration-slow, 300ms) var(--ease-standard, ease-out),
                  transform var(--duration-slow, 300ms) var(--ease-spring, ease),
                  visibility var(--duration-slow, 300ms);
    }
    
    .proactive-messages-container.visible {
      opacity: 1;
      visibility: visible;
      transform: translateY(0) scale(1);
    }
    
    .message-card {
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0,0,0,0.25));
      overflow: hidden;
    }
    
    .message-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4, 16px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
    }
    
    .message-sender {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
    }
    
    .sender-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--persona-primary, #4a6741);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .sender-avatar svg {
      width: 20px;
      height: 20px;
      fill: white;
    }
    
    .sender-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    
    .sender-name {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-weight: 600;
      font-size: 14px;
      color: var(--color-text-primary, #2C2520);
    }
    
    .sender-reason {
      font-size: 12px;
      color: var(--color-text-muted, #756A5E);
    }
    
    .close-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: none;
      background: var(--color-background-secondary, #F5F1E8);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background var(--duration-fast, 100ms) ease;
    }
    
    .close-btn:hover {
      background: var(--color-border-medium, rgba(44, 37, 32, 0.1));
    }
    
    .close-btn svg {
      width: 16px;
      height: 16px;
      stroke: var(--color-text-muted, #756A5E);
    }
    
    .message-body {
      padding: var(--space-5, 20px);
    }
    
    .message-text {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 15px;
      line-height: 1.6;
      color: var(--color-text-secondary, #5C544A);
      white-space: pre-wrap;
    }
    
    .message-actions {
      display: flex;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px);
      padding-top: 0;
    }
    
    .action-btn {
      flex: 1;
      padding: var(--space-3, 12px);
      border-radius: var(--radius-lg, 12px);
      border: 1px solid var(--color-border-medium, rgba(44, 37, 32, 0.1));
      background: transparent;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 14px;
      font-weight: 500;
      color: var(--color-text-secondary, #5C544A);
      cursor: pointer;
      transition: all var(--duration-fast, 100ms) ease;
    }
    
    .action-btn:hover {
      background: var(--color-background-secondary, #F5F1E8);
    }
    
    .action-btn.primary {
      background: var(--persona-primary, #4a6741);
      border-color: var(--persona-primary, #4a6741);
      color: white;
    }
    
    .action-btn.primary:hover {
      background: var(--persona-secondary, #3d5a35);
      border-color: var(--persona-secondary, #3d5a35);
    }
    
    .message-pagination {
      display: flex;
      justify-content: center;
      gap: var(--space-2, 8px);
      padding-bottom: var(--space-4, 16px);
    }
    
    .pagination-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-border-medium, rgba(44, 37, 32, 0.15));
      transition: all var(--duration-fast, 100ms) ease;
    }
    
    .pagination-dot.active {
      width: 20px;
      border-radius: 3px;
      background: var(--persona-primary, #4a6741);
    }
    
    @media (max-width: 480px) {
      .proactive-messages-container {
        bottom: var(--space-16, 64px);
        right: var(--space-3, 12px);
        left: var(--space-3, 12px);
        width: auto;
        max-width: none;
      }
      
      .proactive-indicator {
        bottom: var(--space-16, 64px);
        right: var(--space-3, 12px);
      }
    }
  `;
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

    updateIndicator();

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

  if (state.hasUnread && !state.isVisible) {
    indicator.style.opacity = '1';
    indicator.style.visibility = 'visible';
    indicator.style.transform = 'scale(1)';
  } else {
    indicator.style.opacity = '0';
    indicator.style.visibility = 'hidden';
    indicator.style.transform = 'scale(0.8)';
  }
}

/**
 * Render the current message
 */
function renderMessage(): void {
  if (!container || state.messages.length === 0) return;

  const message = state.messages[state.currentIndex];
  if (!message) return;

  const personaName = getPersonaDisplayName(message.personaId);
  const reasonText = getReasonText(message.reason);

  container.innerHTML = `
    <div class="message-card">
      <div class="message-header">
        <div class="message-sender">
          <div class="sender-avatar" style="background: var(--color-${message.personaId}, var(--persona-primary))">
            ${getPersonaIcon(message.personaId)}
          </div>
          <div class="sender-info">
            <span class="sender-name">${personaName}</span>
            <span class="sender-reason">${reasonText}</span>
          </div>
        </div>
        <button class="close-btn" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="message-body">
        <p class="message-text">${escapeHtml(message.text)}</p>
      </div>
      <div class="message-actions">
        <button class="action-btn" data-action="dismiss">Later</button>
        <button class="action-btn primary" data-action="respond">Respond</button>
      </div>
      ${state.messages.length > 1 ? `
        <div class="message-pagination">
          ${state.messages.map((_, i) => `
            <div class="pagination-dot ${i === state.currentIndex ? 'active' : ''}" data-index="${i}"></div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;

  // Bind events
  container.querySelector('.close-btn')?.addEventListener('click', () => dismissMessage());
  container.querySelector('[data-action="dismiss"]')?.addEventListener('click', () => dismissMessage());
  container.querySelector('[data-action="respond"]')?.addEventListener('click', () => respondToMessage());

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
  const reasonMap: Record<string, string> = {
    welcome_followup: 'Checking in',
    next_day_check: 'Following up',
    topic_deepdive: 'Thinking about you',
    first_week_reflection: 'Week reflection',
    momentum_check: 'Momentum check',
    two_week_celebration: 'Celebrating you',
    thinking_of_you: 'Just thinking of you',
    habit_nudge: 'Gentle reminder',
    win_celebration: 'Celebrating your win',
    setback_support: 'Here for you',
    reengagement_gentle: 'Missing you',
    reengagement_warmth: 'Still here',
    life_event_followup: 'Following up',
  };
  return reasonMap[reason] || 'A message for you';
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
