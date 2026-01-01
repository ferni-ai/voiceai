/**
 * Send Message UI
 *
 * Compose and send messages to people in Your People.
 * Supports call, text, email, and scheduling.
 *
 * @module ui/send-message
 */

import { createLogger } from '../utils/logger.js';
import { toast } from './whisper.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';

const log = createLogger('SendMessageUI');

// ============================================================================
// TYPES
// ============================================================================

export type MessageChannel = 'call' | 'text' | 'email';

export interface SendMessageOptions {
  contactId: string;
  contactName: string;
  phone?: string;
  email?: string;
  defaultChannel?: MessageChannel;
  suggestedMessage?: string;
  context?: string; // Why we're reaching out
  onSent?: () => void;
  onClose?: () => void;
}

// ============================================================================
// STATE
// ============================================================================

interface SendMessageState {
  isOpen: boolean;
  contactId: string;
  contactName: string;
  phone: string;
  email: string;
  channel: MessageChannel;
  message: string;
  subject: string; // For email
  isSending: boolean;
}

let state: SendMessageState = {
  isOpen: false,
  contactId: '',
  contactName: '',
  phone: '',
  email: '',
  channel: 'text',
  message: '',
  subject: '',
  isSending: false,
};

let modalContainer: HTMLElement | null = null;
let callbacks: { onSent?: () => void; onClose?: () => void } = {};

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  phone: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  message: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  mail: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  send: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
  externalLink: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`,
};

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('send-message-styles')) return;

  const style = document.createElement('style');
  style.id = 'send-message-styles';
  style.textContent = `
    /* =========================================================================
       SEND MESSAGE UI
       ========================================================================= */
    
    .send-message-overlay {
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

    .send-message-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .send-message-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .send-message-modal {
      position: relative;
      width: 94%;
      max-width: clamp(294px, 90vw, 420px);
      max-height: 85vh;
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

    .send-message-overlay.open .send-message-modal {
      transform: scale(1) translateY(0);
    }

    /* =========================================================================
       HEADER
       ========================================================================= */
    
    .sm-header {
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
    }

    .sm-header-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
    }

    .sm-eyebrow {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 0.25rem);
    }

    .sm-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
      line-height: 1.2;
    }

    .sm-close {
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

    .sm-close:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      color: var(--color-text-primary, #2C2520);
    }

    /* =========================================================================
       CONTENT
       ========================================================================= */
    
    .sm-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
    }

    /* =========================================================================
       CHANNEL SELECTOR
       ========================================================================= */
    
    .sm-channels {
      display: flex;
      gap: var(--space-2, 0.5rem);
      margin-bottom: var(--space-4, 1rem);
    }

    .sm-channel {
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

    .sm-channel:hover:not(:disabled) {
      border-color: var(--color-text-muted, #70605a);
    }

    .sm-channel.selected {
      border-color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
    }

    .sm-channel:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .sm-channel-icon {
      color: var(--color-text-muted, #70605a);
    }

    .sm-channel.selected .sm-channel-icon {
      color: var(--persona-primary, #4a6741);
    }

    .sm-channel-label {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 500;
      color: var(--color-text-muted, #70605a);
    }

    .sm-channel.selected .sm-channel-label {
      color: var(--persona-primary, #4a6741);
      font-weight: 600;
    }

    .sm-no-info {
      font-size: var(--text-xxs, 0.625rem);
      color: var(--color-text-muted, #70605a);
      margin-top: var(--space-1, 0.25rem);
    }

    /* =========================================================================
       FORM FIELDS
       ========================================================================= */
    
    .sm-section {
      margin-bottom: var(--space-4, 1rem);
    }

    .sm-label {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      color: var(--color-text-muted, #70605a);
      margin-bottom: var(--space-2, 0.5rem);
      display: block;
    }

    .sm-input {
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

    .sm-input:focus {
      border-color: var(--persona-primary, #4a6741);
      box-shadow: 0 0 0 3px var(--color-utility-focus-ring-subtle);
    }

    .sm-textarea {
      width: 100%;
      min-height: 120px;
      padding: var(--space-3, 0.75rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      font-family: inherit;
      background: var(--color-background-elevated, #FFFDFB);
      color: var(--color-text-primary, #2C2520);
      outline: none;
      resize: vertical;
      line-height: 1.5;
      transition: border-color ${DURATION.FAST}ms, box-shadow ${DURATION.FAST}ms;
    }

    .sm-textarea:focus {
      border-color: var(--persona-primary, #4a6741);
      box-shadow: 0 0 0 3px var(--color-utility-focus-ring-subtle);
    }

    .sm-textarea::placeholder {
      color: var(--color-text-muted, #70605a);
    }

    .sm-char-count {
      text-align: right;
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      margin-top: var(--space-1, 0.25rem);
    }

    .sm-char-count.warning {
      color: var(--nayan-primary, #b8956a);
    }

    .sm-char-count.over {
      color: var(--color-semantic-error, #c44);
    }

    /* =========================================================================
       CALL VIEW
       ========================================================================= */
    
    .sm-call-view {
      text-align: center;
      padding: var(--space-6, 1.5rem) 0;
    }

    .sm-call-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto var(--space-4, 1rem);
      border-radius: var(--radius-full, 50%);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      color: var(--persona-primary, #4a6741);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .sm-call-icon svg {
      width: 32px;
      height: 32px;
    }

    .sm-call-number {
      font-size: var(--text-lg, 1.125rem);
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin-bottom: var(--space-2, 0.5rem);
    }

    .sm-call-hint {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
    }

    /* =========================================================================
       FOOTER
       ========================================================================= */
    
    .sm-footer {
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
      border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
    }

    .sm-send-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 0.5rem);
      width: 100%;
      padding: var(--space-3, 0.75rem);
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      background: var(--persona-primary, #4a6741);
      border: 1px solid var(--persona-primary, #4a6741);
      color: white;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .sm-send-btn:hover:not(:disabled) {
      background: var(--persona-secondary, #3d5a35);
      border-color: var(--persona-secondary, #3d5a35);
    }

    .sm-send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .sm-send-btn svg {
      width: 18px;
      height: 18px;
    }

    /* =========================================================================
       RESPONSIVE
       ========================================================================= */
    
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .send-message-modal {
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
      .send-message-overlay,
      .send-message-modal,
      .sm-channel,
      .sm-send-btn {
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

  const modal = modalContainer.querySelector('.send-message-modal');
  if (!modal) return;

  modal.innerHTML = `
    <div class="sm-header">
      <div class="sm-header-row">
        <div>
          <div class="sm-eyebrow">Reach Out</div>
          <h2 class="sm-title">${escapeHtml(state.contactName)}</h2>
        </div>
        <button class="sm-close" aria-label="${t('accessibility.close')}">${ICONS.close}</button>
      </div>
    </div>
    
    <div class="sm-content">
      ${renderChannelSelector()}
      ${renderChannelContent()}
    </div>
    
    <div class="sm-footer">
      ${renderActionButton()}
    </div>
  `;

  bindEvents();
}

function renderChannelSelector(): string {
  const hasPhone = Boolean(state.phone);
  const hasEmail = Boolean(state.email);

  return `
    <div class="sm-channels">
      <button aria-label="${t('accessibility.moreInformation')}" class="sm-channel ${state.channel === 'call' ? 'selected' : ''}" data-channel="call" ${!hasPhone ? 'disabled' : ''}>
        <span class="sm-channel-icon">${ICONS.phone}</span>
        <span class="sm-channel-label">Call</span>
        ${!hasPhone ? '<span class="sm-no-info">No phone</span>' : ''}
      </button>
      <button aria-label="${t('accessibility.moreInformation')}" class="sm-channel ${state.channel === 'text' ? 'selected' : ''}" data-channel="text" ${!hasPhone ? 'disabled' : ''}>
        <span class="sm-channel-icon">${ICONS.message}</span>
        <span class="sm-channel-label">Text</span>
        ${!hasPhone ? '<span class="sm-no-info">No phone</span>' : ''}
      </button>
      <button aria-label="${t('accessibility.moreInformation')}" class="sm-channel ${state.channel === 'email' ? 'selected' : ''}" data-channel="email" ${!hasEmail ? 'disabled' : ''}>
        <span class="sm-channel-icon">${ICONS.mail}</span>
        <span class="sm-channel-label">Email</span>
        ${!hasEmail ? '<span class="sm-no-info">No email</span>' : ''}
      </button>
    </div>
  `;
}

function renderChannelContent(): string {
  switch (state.channel) {
    case 'call':
      return renderCallView();
    case 'text':
      return renderTextView();
    case 'email':
      return renderEmailView();
    default:
      return renderTextView();
  }
}

function renderCallView(): string {
  return `
    <div class="sm-call-view">
      <div class="sm-call-icon">${ICONS.phone}</div>
      <div class="sm-call-number">${formatPhone(state.phone)}</div>
      <p class="sm-call-hint">Tap the button below to call ${escapeHtml(state.contactName)}</p>
    </div>
  `;
}

function renderTextView(): string {
  const maxLength = 160;
  const charCount = state.message.length;
  const charClass = charCount > maxLength ? 'over' : charCount > maxLength - 20 ? 'warning' : '';

  return `
    <div class="sm-section">
      <label class="sm-label">Message</label>
      <textarea class="sm-textarea" id="sm-message" placeholder="What would you like to say?">${escapeHtml(state.message)}</textarea>
      <div class="sm-char-count ${charClass}">${charCount}/${maxLength}</div>
    </div>
  `;
}

function renderEmailView(): string {
  return `
    <div class="sm-section">
      <label class="sm-label">Subject</label>
      <input type="text" class="sm-input" id="sm-subject" placeholder="Subject line" value="${escapeHtml(state.subject)}" />
    </div>
    <div class="sm-section">
      <label class="sm-label">Message</label>
      <textarea class="sm-textarea" id="sm-message" placeholder="What would you like to say?">${escapeHtml(state.message)}</textarea>
    </div>
  `;
}

function renderActionButton(): string {
  const labels: Record<MessageChannel, string> = {
    call: `${ICONS.phone} Call ${state.contactName.split(' ')[0]}`,
    text: `${ICONS.send} Send Text`,
    email: `${ICONS.send} Send Email`,
  };

  const isDisabled = state.channel !== 'call' && !state.message.trim();

  return `
    <button class="sm-send-btn" id="sm-send" ${isDisabled || state.isSending ? 'disabled' : ''}>
      ${state.isSending ? 'Opening...' : labels[state.channel]}
      ${ICONS.externalLink}
    </button>
  `;
}

// ============================================================================
// EVENT BINDING
// ============================================================================

function bindEvents(): void {
  if (!modalContainer) return;

  // Close
  modalContainer.querySelector('.sm-close')?.addEventListener('click', closeSendMessage);
  modalContainer.querySelector('.send-message-backdrop')?.addEventListener('click', closeSendMessage);

  // Channel selection
  modalContainer.querySelectorAll('.sm-channel').forEach(btn => {
    btn.addEventListener('click', () => {
      const channel = btn.getAttribute('data-channel') as MessageChannel;
      if (channel && !(btn as HTMLButtonElement).disabled) {
        state.channel = channel;
        render();
      }
    });
  });

  // Message input
  const messageInput = modalContainer.querySelector('#sm-message') as HTMLTextAreaElement;
  messageInput?.addEventListener('input', (e) => {
    state.message = (e.target as HTMLTextAreaElement).value;
    updateCharCount();
  });

  // Subject input
  const subjectInput = modalContainer.querySelector('#sm-subject') as HTMLInputElement;
  subjectInput?.addEventListener('input', (e) => {
    state.subject = (e.target as HTMLInputElement).value;
  });

  // Send button
  modalContainer.querySelector('#sm-send')?.addEventListener('click', handleSend);

  // Escape key
  document.addEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && state.isOpen) {
    closeSendMessage();
  }
}

function updateCharCount(): void {
  if (!modalContainer) return;
  const counter = modalContainer.querySelector('.sm-char-count') as HTMLElement;
  if (!counter || state.channel !== 'text') return;

  const maxLength = 160;
  const charCount = state.message.length;
  counter.textContent = `${charCount}/${maxLength}`;
  counter.className = 'sm-char-count';
  if (charCount > maxLength) {
    counter.classList.add('over');
  } else if (charCount > maxLength - 20) {
    counter.classList.add('warning');
  }
}

// ============================================================================
// ACTIONS
// ============================================================================

function handleSend(): void {
  state.isSending = true;
  render();

  switch (state.channel) {
    case 'call':
      initiateCall();
      break;
    case 'text':
      initiateText();
      break;
    case 'email':
      initiateEmail();
      break;
  }
}

function initiateCall(): void {
  const phoneNumber = state.phone.replace(/[^0-9+]/g, '');
  window.open(`tel:${phoneNumber}`, '_self');
  
  toast.info(t('toasts.openingPhone'));
  
  setTimeout(() => {
    if (callbacks.onSent) {
      callbacks.onSent();
    }
    closeSendMessage();
  }, 500);
}

function initiateText(): void {
  const phoneNumber = state.phone.replace(/[^0-9+]/g, '');
  const encodedMessage = encodeURIComponent(state.message);
  
  // Use sms: protocol with body
  // Works on iOS and Android
  const smsUrl = `sms:${phoneNumber}${/iPhone|iPad|iPod/.test(navigator.userAgent) ? '&' : '?'}body=${encodedMessage}`;
  window.open(smsUrl, '_self');
  
  toast.info(t('toasts.openingMessages'));
  
  setTimeout(() => {
    if (callbacks.onSent) {
      callbacks.onSent();
    }
    closeSendMessage();
  }, 500);
}

function initiateEmail(): void {
  const subject = encodeURIComponent(state.subject || '');
  const body = encodeURIComponent(state.message);
  
  const mailtoUrl = `mailto:${state.email}?subject=${subject}&body=${body}`;
  window.open(mailtoUrl, '_self');
  
  toast.info(t('toasts.openingEmail'));
  
  setTimeout(() => {
    if (callbacks.onSent) {
      callbacks.onSent();
    }
    closeSendMessage();
  }, 500);
}

// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatPhone(phone: string): string {
  // Simple formatting for display
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the Send Message modal
 */
export function openSendMessage(options: SendMessageOptions): void {
  closeSendMessage();
  
  injectStyles();

  // Determine default channel
  let defaultChannel: MessageChannel = options.defaultChannel || 'text';
  if (!options.phone && options.email) {
    defaultChannel = 'email';
  } else if (!options.phone && !options.email) {
    // No contact methods - shouldn't happen but handle gracefully
    toast.warning(t('toasts.noContactInfoAvailable'));
    return;
  }

  state = {
    isOpen: true,
    contactId: options.contactId,
    contactName: options.contactName,
    phone: options.phone || '',
    email: options.email || '',
    channel: defaultChannel,
    message: options.suggestedMessage || '',
    subject: '',
    isSending: false,
  };

  callbacks = {
    onSent: options.onSent,
    onClose: options.onClose,
  };

  modalContainer = document.createElement('div');
  modalContainer.className = 'send-message-overlay';
  modalContainer.innerHTML = `
    <div class="send-message-backdrop"></div>
    <div class="send-message-modal" role="dialog" aria-modal="true" aria-label="${t('accessibility.sendMessage')}">
    </div>
  `;
  document.body.appendChild(modalContainer);

  render();

  requestAnimationFrame(() => {
    modalContainer?.classList.add('open');
  });

  log.info({ contactId: options.contactId, channel: defaultChannel }, 'Opened Send Message');
}

/**
 * Close the Send Message modal
 */
export function closeSendMessage(): void {
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
  log.info('Closed Send Message');
}

export const sendMessage = {
  open: openSendMessage,
  close: closeSendMessage,
};

export default sendMessage;

