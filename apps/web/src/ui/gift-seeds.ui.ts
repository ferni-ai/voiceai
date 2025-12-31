/**
 * Gift Seeds Modal UI
 *
 * Let users gift seeds to friends.
 * "Seeds grow when shared. Love multiplies."
 *
 * Features:
 * - Select friend from contacts/search
 * - Choose gift amount with multiplier preview
 * - Add personal message
 * - Celebratory animation on send
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { getSeedBalance } from '../services/cosmetics.service.js';
import { createLogger } from '../utils/logger.js';
import { apiFetch } from '../utils/api-helpers.js';
import { toast } from './toast.ui.js';
import { soundUI } from './sound.ui.js';
import { t } from '../i18n/index.js';

const log = createLogger('GiftSeedsUI');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Gift tiers with multipliers */
const GIFT_TIERS = [
  { amount: 10, receive: 12, bonus: 20 },
  { amount: 25, receive: 32, bonus: 28 },
  { amount: 50, receive: 70, bonus: 40 },
] as const;

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  gift: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="8" width="18" height="4" rx="1"/>
    <path d="M12 8v13"/>
    <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/>
    <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 4.8 0 0 1 12 8a4.8 4.8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>
  </svg>`,
  seed: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22c4-4 8-7.582 8-12a8 8 0 1 0-16 0c0 4.418 4 8 8 12z"/>
    <path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
  </svg>`,
  heart: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`,
  search: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <path d="m21 21-4.3-4.3"/>
  </svg>`,
};

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let isOpen = false;
let selectedAmount = 25;
let recipientId = '';
let recipientName = '';
let message = '';

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the gift seeds modal
 */
export function openGiftSeeds(preselectedRecipient?: { id: string; name: string }): void {
  if (isOpen) return;

  if (preselectedRecipient) {
    recipientId = preselectedRecipient.id;
    recipientName = preselectedRecipient.name;
  } else {
    recipientId = '';
    recipientName = '';
  }
  selectedAmount = 25;
  message = '';

  soundUI.play('switch');
  createModal();
  isOpen = true;

  log.info('Gift seeds modal opened');
}

/**
 * Close the gift seeds modal
 */
export function closeGiftSeeds(): void {
  if (!isOpen || !modal) return;

  soundUI.play('click');
  void animateOut(modal).then(() => {
    modal?.remove();
    modal = null;
    isOpen = false;
  });

  log.info('Gift seeds modal closed');
}

// ============================================================================
// MODAL
// ============================================================================

function createModal(): void {
  document.querySelector('.gift-seeds-modal')?.remove();

  modal = document.createElement('div');
  modal.className = 'gift-seeds-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', 'Share seeds with a friend');

  renderModalContent();
  injectStyles();

  // Event listeners
  modal.querySelector('.gift-seeds-backdrop')?.addEventListener('click', closeGiftSeeds);
  modal.querySelector('.gift-seeds-close')?.addEventListener('click', closeGiftSeeds);

  // Escape to close
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeGiftSeeds();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  document.body.appendChild(modal);
  void animateIn(modal);
}

function renderModalContent(): void {
  if (!modal) return;

  const balance = getSeedBalance();
  const selectedTier = GIFT_TIERS.find(t => t.amount === selectedAmount) || GIFT_TIERS[1];
  const canAfford = balance >= selectedAmount;

  modal.innerHTML = `
    <div class="gift-seeds-backdrop"></div>
    <div class="gift-seeds-content">
      <button class="gift-seeds-close" aria-label="${t('accessibility.close')}">
        ${ICONS.close}
      </button>

      <div class="gift-seeds-header">
        <span class="gift-seeds-icon">${ICONS.gift}</span>
        <h2 class="gift-seeds-title">Share Some Love</h2>
        <p class="gift-seeds-subtitle">Seeds grow when shared. Love multiplies.</p>
      </div>

      <!-- Recipient Input -->
      <div class="gift-seeds-field">
        <label class="gift-seeds-label">Send to</label>
        <div class="gift-seeds-input-wrap">
          <span class="gift-seeds-input-icon">${ICONS.search}</span>
          <input 
            type="text" 
            class="gift-seeds-input" 
            placeholder="Enter friend's email or username"
            value="${recipientName}"
            data-field="recipient"
          />
        </div>
      </div>

      <!-- Amount Selection -->
      <div class="gift-seeds-field">
        <label class="gift-seeds-label">Amount</label>
        <div class="gift-seeds-tiers">
          ${GIFT_TIERS.map(tier => `
            <button aria-label="${t('accessibility.goForward')}" 
              class="gift-seeds-tier ${tier.amount === selectedAmount ? 'gift-seeds-tier--selected' : ''} ${balance < tier.amount ? 'gift-seeds-tier--disabled' : ''}"
              data-amount="${tier.amount}"
              ${balance < tier.amount ? 'disabled' : ''}
            >
              <span class="gift-seeds-tier-amount">${tier.amount}</span>
              <span class="gift-seeds-tier-arrow">→</span>
              <span class="gift-seeds-tier-receive">${tier.receive}</span>
              <span class="gift-seeds-tier-bonus">+${tier.bonus}%</span>
            </button>
          `).join('')}
        </div>
        <p class="gift-seeds-multiplier">
          ${ICONS.heart}
          <span>You send ${selectedAmount}, they get ${selectedTier.receive} seeds</span>
        </p>
      </div>

      <!-- Message Input -->
      <div class="gift-seeds-field">
        <label class="gift-seeds-label">Add a note (optional)</label>
        <textarea 
          class="gift-seeds-textarea" 
          placeholder="Thinking of you 💚"
          maxlength="100"
          data-field="message"
        >${message}</textarea>
      </div>

      <!-- Send Button -->
      <button aria-label="${t('accessibility.sendGift')}" 
        class="gift-seeds-send ${!canAfford || !recipientId ? 'gift-seeds-send--disabled' : ''}"
        ${!canAfford || !recipientId ? 'disabled' : ''}
      >
        <span class="gift-seeds-send-icon">${ICONS.seed}</span>
        <span>Send Gift</span>
      </button>

      <!-- Balance -->
      <p class="gift-seeds-balance">
        Your balance: <strong>${balance.toLocaleString()}</strong> seeds
      </p>
    </div>
  `;

  // Bind events
  bindModalEvents();
}

function bindModalEvents(): void {
  if (!modal) return;

  // Tier selection
  modal.querySelectorAll('.gift-seeds-tier').forEach(btn => {
    btn.addEventListener('click', () => {
      const amount = parseInt((btn as HTMLElement).dataset.amount || '25', 10);
      selectedAmount = amount;
      renderModalContent();
    });
  });

  // Recipient input
  const recipientInput = modal.querySelector('[data-field="recipient"]') as HTMLInputElement;
  if (recipientInput) {
    recipientInput.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      recipientName = value;
      // For now, use the value as both name and ID
      // In production, this would search users and show autocomplete
      recipientId = value.trim();
    });
    recipientInput.addEventListener('blur', () => {
      renderModalContent();
    });
  }

  // Message input
  const messageInput = modal.querySelector('[data-field="message"]') as HTMLTextAreaElement;
  if (messageInput) {
    messageInput.addEventListener('input', (e) => {
      message = (e.target as HTMLTextAreaElement).value;
    });
  }

  // Send button
  const sendBtn = modal.querySelector('.gift-seeds-send');
  if (sendBtn) {
    sendBtn.addEventListener('click', handleSendGift);
  }
}

async function handleSendGift(): Promise<void> {
  if (!recipientId || getSeedBalance() < selectedAmount) {
    return;
  }

  const sendBtn = modal?.querySelector('.gift-seeds-send');
  if (sendBtn) {
    sendBtn.classList.add('gift-seeds-send--loading');
    (sendBtn as HTMLButtonElement).disabled = true;
  }

  try {
    const response = await apiFetch('/api/seeds/gift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toUserId: recipientId,
        amount: selectedAmount,
        message: message || undefined,
      }),
    });

    const result = await response.json();

    if (result.success) {
      const tier = GIFT_TIERS.find(t => t.amount === selectedAmount);
      soundUI.play('celebrate');
      toast.success(`Sent ${selectedAmount} seeds! They'll get ${tier?.receive || selectedAmount}`);
      
      // Dispatch event for balance update
      document.dispatchEvent(new CustomEvent('ferni:seeds-spent', {
        detail: { amount: selectedAmount, reason: 'gift' }
      }));

      closeGiftSeeds();
    } else {
      toast.error(result.error || "Couldn't send gift. Try again?");
    }
  } catch (error) {
    log.error({ error }, 'Failed to send gift');
    toast.error(t('toasts.somethingWentWrong'));
  } finally {
    if (sendBtn) {
      sendBtn.classList.remove('gift-seeds-send--loading');
      (sendBtn as HTMLButtonElement).disabled = false;
    }
  }
}

// ============================================================================
// ANIMATIONS
// ============================================================================

async function animateIn(modalEl: HTMLElement): Promise<void> {
  const backdrop = modalEl.querySelector('.gift-seeds-backdrop') as HTMLElement;
  const content = modalEl.querySelector('.gift-seeds-content') as HTMLElement;

  if (backdrop) {
    backdrop.animate([{ opacity: '0' }, { opacity: '1' }], {
      duration: DURATION.SLOW,
      easing: 'ease-out',
      fill: 'forwards',
    });
  }

  if (content) {
    content.animate(
      [
        { opacity: '0', transform: 'scale(0.95) translateY(20px)' },
        { opacity: '1', transform: 'scale(1) translateY(0)' },
      ],
      {
        duration: DURATION.DELIBERATE,
        easing: EASING.SPRING,
        fill: 'forwards',
      }
    );
  }
}

async function animateOut(modalEl: HTMLElement): Promise<void> {
  const backdrop = modalEl.querySelector('.gift-seeds-backdrop') as HTMLElement;
  const content = modalEl.querySelector('.gift-seeds-content') as HTMLElement;

  const animations: Animation[] = [];

  if (backdrop) {
    animations.push(
      backdrop.animate([{ opacity: '1' }, { opacity: '0' }], {
        duration: DURATION.NORMAL,
        easing: 'ease-out',
        fill: 'forwards',
      })
    );
  }

  if (content) {
    animations.push(
      content.animate(
        [
          { opacity: '1', transform: 'scale(1) translateY(0)' },
          { opacity: '0', transform: 'scale(0.98) translateY(-10px)' },
        ],
        {
          duration: DURATION.NORMAL,
          easing: EASING.GENTLE,
          fill: 'forwards',
        }
      )
    );
  }

  await Promise.all(animations.map((a) => a.finished));
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('gift-seeds-styles')) return;

  const style = document.createElement('style');
  style.id = 'gift-seeds-styles';
  style.textContent = `
    .gift-seeds-modal {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 10000);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
    }

    .gift-seeds-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .gift-seeds-content {
      position: relative;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      max-width: clamp(294px, 90vw, 420px);
      width: 100%;
      padding: var(--space-8, 32px);
    }

    .gift-seeds-close {
      position: absolute;
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
      background: none;
      border: none;
      padding: var(--space-2, 8px);
      cursor: pointer;
      color: var(--color-text-muted, #70605a);
      border-radius: var(--radius-full, 9999px);
      transition: transform 0.2s ease, opacity 0.2s ease;
    }

    .gift-seeds-close:hover {
      background: var(--color-background-hover, rgba(0, 0, 0, 0.05));
      color: var(--color-text-primary, #2c2520);
    }

    .gift-seeds-header {
      text-align: center;
      margin-bottom: var(--space-6, 24px);
    }

    .gift-seeds-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
      border-radius: 50%;
      color: white;
      margin-bottom: var(--space-4, 16px);
    }

    .gift-seeds-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #2c2520);
      margin: 0 0 var(--space-2, 8px);
    }

    .gift-seeds-subtitle {
      font-size: var(--text-base, 1rem);
      color: var(--color-text-muted, #70605a);
      margin: 0;
    }

    .gift-seeds-field {
      margin-bottom: var(--space-5, 20px);
    }

    .gift-seeds-label {
      display: block;
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      color: var(--color-text-secondary, #5a4d47);
      margin-bottom: var(--space-2, 8px);
    }

    .gift-seeds-input-wrap {
      position: relative;
    }

    .gift-seeds-input-icon {
      position: absolute;
      left: var(--space-3, 12px);
      top: 50%;
      transform: translateY(-50%);
      color: var(--color-text-muted, #70605a);
    }

    .gift-seeds-input {
      width: 100%;
      padding: var(--space-3, 12px) var(--space-3, 12px) var(--space-3, 12px) var(--space-10, 40px);
      border: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));
      border-radius: var(--radius-lg, 12px);
      font-size: var(--text-base, 1rem);
      color: var(--color-text-primary, #2c2520);
      background: var(--color-background-primary, white);
      transition: border-color 0.2s ease;
    }

    .gift-seeds-input:focus {
      outline: none;
      border-color: var(--persona-primary, #4a6741);
    }

    .gift-seeds-tiers {
      display: flex;
      gap: var(--space-2, 8px);
    }

    .gift-seeds-tier {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1, 4px);
      padding: var(--space-3, 12px) var(--space-2, 8px);
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.03));
      border: 2px solid transparent;
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      transition: transform 0.2s ease, opacity 0.2s ease;
    }

    .gift-seeds-tier:hover:not(:disabled) {
      background: var(--color-background-hover, rgba(0, 0, 0, 0.05));
    }

    .gift-seeds-tier--selected {
      border-color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
    }

    .gift-seeds-tier--disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .gift-seeds-tier-amount {
      font-size: var(--text-lg, 1.125rem);
      font-weight: 700;
      color: var(--color-text-primary, #2c2520);
    }

    .gift-seeds-tier-arrow {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
    }

    .gift-seeds-tier-receive {
      font-size: var(--text-base, 1rem);
      font-weight: 600;
      color: var(--persona-primary, #4a6741);
    }

    .gift-seeds-tier-bonus {
      font-size: var(--text-xs, 0.75rem);
      color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      padding: 2px 6px;
      border-radius: var(--radius-full, 9999px);
    }

    .gift-seeds-multiplier {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      margin-top: var(--space-3, 12px);
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
    }

    .gift-seeds-multiplier svg {
      color: var(--persona-primary, #4a6741);
    }

    .gift-seeds-textarea {
      width: 100%;
      min-height: 80px;
      padding: var(--space-3, 12px);
      border: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));
      border-radius: var(--radius-lg, 12px);
      font-size: var(--text-base, 1rem);
      font-family: inherit;
      color: var(--color-text-primary, #2c2520);
      background: var(--color-background-primary, white);
      resize: none;
      transition: border-color 0.2s ease;
    }

    .gift-seeds-textarea:focus {
      outline: none;
      border-color: var(--persona-primary, #4a6741);
    }

    .gift-seeds-send {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      padding: var(--space-4, 16px);
      background: var(--persona-primary, #4a6741);
      color: white;
      border: none;
      border-radius: var(--radius-lg, 12px);
      font-size: var(--text-base, 1rem);
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s ease, opacity 0.2s ease;
    }

    .gift-seeds-send:hover:not(:disabled) {
      background: var(--persona-secondary, #3d5a35);
      transform: translateY(-1px);
    }

    .gift-seeds-send--disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .gift-seeds-send--loading {
      pointer-events: none;
    }

    .gift-seeds-send-icon {
      display: flex;
    }

    .gift-seeds-balance {
      text-align: center;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      margin: var(--space-4, 16px) 0 0;
    }

    .gift-seeds-balance strong {
      color: var(--color-text-primary, #2c2520);
    }

    /* Dark theme */
    [data-theme="midnight"] .gift-seeds-backdrop {
      background: rgba(8, 8, 12, 0.8);
    }

    [data-theme="midnight"] .gift-seeds-content {
      background: var(--color-background-elevated, #1a1a1f);
    }

    [data-theme="midnight"] .gift-seeds-input,
    [data-theme="midnight"] .gift-seeds-textarea {
      background: var(--color-background-secondary, #252528);
      border-color: var(--color-border, rgba(255, 255, 255, 0.1));
    }

    /* Mobile */
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .gift-seeds-modal {
        padding: 0;
        align-items: flex-end;
      }

      .gift-seeds-content {
        border-radius: var(--radius-2xl, 20px) var(--radius-2xl, 20px) 0 0;
        padding: var(--space-6, 24px);
        max-width: none;
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .gift-seeds-tier,
      .gift-seeds-send {
        transition: none;
      }
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const giftSeedsUI = {
  open: openGiftSeeds,
  close: closeGiftSeeds,
  isOpen: () => isOpen,
};

export default giftSeedsUI;

