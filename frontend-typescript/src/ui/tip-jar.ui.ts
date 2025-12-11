/**
 * Tip Jar UI Component
 *
 * A warm, non-intrusive way for users to show appreciation.
 * This is NOT a paywall - it's a thank-you button.
 *
 * Design principles:
 * - Never pushy or guilt-inducing
 * - Appears organically, not on every conversation
 * - Celebrates the user's generosity, not our need
 * - Beautiful, brand-compliant UI
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createTip, formatAmount, loadStripe } from '../services/monetization.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('TipJarUI');

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_AMOUNTS = [100, 300, 500, 1000]; // $1, $3, $5, $10

// ============================================================================
// STATE
// ============================================================================

let isOpen = false;
let container: HTMLElement | null = null;
let currentUserId: string | null = null;

// ============================================================================
// STYLES
// ============================================================================

const styles = `
.tip-jar-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  opacity: 0;
  pointer-events: none;
  transition: opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
}

.tip-jar-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.tip-jar-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(44, 37, 32, 0.4);
  backdrop-filter: blur(20px);
}

.tip-jar-card {
  position: relative;
  background: var(--color-background-elevated, #FFFDFB);
  border-radius: var(--radius-2xl, 24px);
  padding: var(--space-8, 32px);
  max-width: 400px;
  width: calc(100% - 32px);
  box-shadow: var(--shadow-2xl);
  transform: scale(0.9);
  transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING};
}

.tip-jar-overlay.open .tip-jar-card {
  transform: scale(1);
}

.tip-jar-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  color: var(--color-text-muted);
  transition: background ${DURATION.FAST}ms;
}

.tip-jar-close:hover {
  background: rgba(0, 0, 0, 0.05);
}

.tip-jar-header {
  text-align: center;
  margin-bottom: var(--space-6, 24px);
}

.tip-jar-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto var(--space-3, 12px);
  color: var(--persona-primary, #4a6741);
}

.tip-jar-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 8px 0;
}

.tip-jar-subtitle {
  font-size: 0.95rem;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.5;
}

.tip-jar-amounts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-3, 12px);
  margin-bottom: var(--space-6, 24px);
}

.tip-amount-btn {
  padding: var(--space-4, 16px) var(--space-2, 8px);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  background: transparent;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
}

.tip-amount-btn:hover {
  border-color: var(--persona-primary, #4a6741);
  background: rgba(74, 103, 65, 0.05);
}

.tip-amount-btn.selected {
  border-color: var(--persona-primary, #4a6741);
  background: var(--persona-primary, #4a6741);
  color: white;
}

.tip-custom-input {
  width: 100%;
  padding: var(--space-4, 16px);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  font-size: 1rem;
  margin-bottom: var(--space-4, 16px);
  text-align: center;
}

.tip-custom-input:focus {
  outline: none;
  border-color: var(--persona-primary, #4a6741);
}

.tip-message-input {
  width: 100%;
  padding: var(--space-3, 12px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  font-size: 0.9rem;
  margin-bottom: var(--space-4, 16px);
  resize: none;
  font-family: inherit;
}

.tip-message-input::placeholder {
  color: var(--color-text-muted);
}

.tip-submit-btn {
  width: 100%;
  padding: var(--space-4, 16px);
  background: var(--persona-primary, #4a6741);
  color: white;
  border: none;
  border-radius: var(--radius-lg, 12px);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
}

.tip-submit-btn:hover:not(:disabled) {
  background: var(--persona-secondary, #3d5a35);
  transform: translateY(-1px);
}

.tip-submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tip-footer {
  text-align: center;
  margin-top: var(--space-4, 16px);
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

/* Thank You State */
.tip-thank-you {
  text-align: center;
  padding: var(--space-8, 32px) 0;
}

.tip-thank-you-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto var(--space-4, 16px);
  color: var(--persona-primary, #4a6741);
  animation: tip-bounce 0.6s ${EASING.SPRING};
}

@keyframes tip-bounce {
  0% { transform: scale(0); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.tip-thank-you-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 12px 0;
}

.tip-thank-you-message {
  font-size: 1rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0;
}

/* Loading State */
.tip-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-8, 32px) 0;
}

.tip-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--persona-primary, #4a6741);
  border-radius: 50%;
  animation: tip-spin 1s linear infinite;
  margin-bottom: var(--space-4, 16px);
}

@keyframes tip-spin {
  to { transform: rotate(360deg); }
}
`;

// ============================================================================
// ICONS
// ============================================================================

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

// Lucide coffee icon
const COFFEE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>`;

// Lucide heart icon for thank you
const HEART_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Initialize tip jar styles
 */
function initStyles(): void {
  if (document.getElementById('tip-jar-styles')) return;

  const styleEl = document.createElement('style');
  styleEl.id = 'tip-jar-styles';
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

/**
 * Create the tip jar modal
 */
function createModal(): HTMLElement {
  initStyles();

  // Clean up any existing modals
  document.querySelectorAll('.tip-jar-overlay').forEach((el) => el.remove());

  const overlay = document.createElement('div');
  overlay.className = 'tip-jar-overlay';
  overlay.innerHTML = `
    <div class="tip-jar-backdrop"></div>
    <div class="tip-jar-card" role="dialog" aria-labelledby="tip-jar-title">
      <button class="tip-jar-close" aria-label="Close">${CLOSE_ICON}</button>
      <div class="tip-jar-content">
        ${renderAmountSelection()}
      </div>
    </div>
  `;

  // Event listeners
  overlay.querySelector('.tip-jar-backdrop')?.addEventListener('click', close);
  overlay.querySelector('.tip-jar-close')?.addEventListener('click', close);

  // Prevent card clicks from closing
  overlay.querySelector('.tip-jar-card')?.addEventListener('click', (e) => e.stopPropagation());

  document.body.appendChild(overlay);

  return overlay;
}

/**
 * Render amount selection view
 */
function renderAmountSelection(): string {
  return `
    <div class="tip-jar-header">
      <div class="tip-jar-icon">${COFFEE_ICON}</div>
      <h2 class="tip-jar-title" id="tip-jar-title">Support Ferni</h2>
      <p class="tip-jar-subtitle">
        Ferni is free forever. If I've helped you, you can buy me a coffee.
        No pressure at all.
      </p>
    </div>

    <div class="tip-jar-amounts">
      ${DEFAULT_AMOUNTS.map(
        (amount) => `
        <button class="tip-amount-btn" data-amount="${amount}">
          ${formatAmount(amount)}
        </button>
      `
      ).join('')}
    </div>

    <input
      type="text"
      class="tip-custom-input"
      placeholder="Or enter custom amount"
      inputmode="decimal"
    />

    <textarea
      class="tip-message-input"
      placeholder="Add a message (optional)"
      rows="2"
    ></textarea>

    <button class="tip-submit-btn" disabled>
      Continue to Payment
    </button>

    <p class="tip-footer">
      Payments processed securely by Stripe
    </p>
  `;
}

/**
 * Render loading state
 */
function renderLoading(): string {
  return `
    <div class="tip-loading">
      <div class="tip-spinner"></div>
      <p>Processing your tip...</p>
    </div>
  `;
}

/**
 * Render thank you state
 */
function renderThankYou(message: string): string {
  return `
    <div class="tip-thank-you">
      <div class="tip-thank-you-icon">${HEART_ICON}</div>
      <h2 class="tip-thank-you-title">Thank You!</h2>
      <p class="tip-thank-you-message">${message}</p>
    </div>
  `;
}

/**
 * Set up event listeners for amount selection
 */
function setupAmountListeners(): void {
  if (!container) return;

  const buttons = container.querySelectorAll('.tip-amount-btn');
  const customInput = container.querySelector('.tip-custom-input') as HTMLInputElement;
  const submitBtn = container.querySelector('.tip-submit-btn') as HTMLButtonElement;
  const messageInput = container.querySelector('.tip-message-input') as HTMLTextAreaElement;

  let selectedAmount = 0;

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedAmount = parseInt(btn.getAttribute('data-amount') || '0', 10);
      customInput.value = '';
      submitBtn.disabled = false;
    });
  });

  customInput.addEventListener('input', () => {
    buttons.forEach((b) => b.classList.remove('selected'));
    const value = customInput.value.replace(/[^0-9.]/g, '');
    const cents = Math.round(parseFloat(value) * 100) || 0;
    selectedAmount = cents;
    submitBtn.disabled = cents < 100;
  });

  submitBtn.addEventListener('click', async () => {
    if (selectedAmount < 100 || !currentUserId) return;

    const message = messageInput?.value || '';
    await processTip(selectedAmount, message);
  });
}

/**
 * Process the tip payment
 */
async function processTip(amountCents: number, message: string): Promise<void> {
  if (!container || !currentUserId) return;

  const content = container.querySelector('.tip-jar-content');
  if (content) {
    content.innerHTML = renderLoading();
  }

  try {
    // Create tip and get payment intent
    const { clientSecret } = await createTip({
      userId: currentUserId,
      amountCents,
      message,
    });

    // Load Stripe
    const stripe = await loadStripe();
    if (!stripe) {
      throw new Error('Stripe not available');
    }

    // For now, redirect to Stripe Checkout
    // In production, you'd use Stripe Elements here
    // @ts-expect-error - Stripe types
    const { error } = await stripe.confirmPayment({
      clientSecret,
      confirmParams: {
        return_url: `${window.location.origin}/tip/complete`,
      },
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Tip payment failed');

    // Show error state
    if (content) {
      content.innerHTML = renderAmountSelection();
      setupAmountListeners();
    }

    // Show toast or error message
    const toast = document.createElement('div');
    toast.textContent = 'Payment failed. Please try again.';
    toast.style.cssText = `
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: #e74c3c;
      color: white;
      padding: 12px 24px;
      border-radius: 999px;
      z-index: 10001;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
}

/**
 * Show thank you after successful payment
 */
export function showThankYou(message?: string): void {
  if (!container) {
    container = createModal();
  }

  const content = container.querySelector('.tip-jar-content');
  if (content) {
    content.innerHTML = renderThankYou(
      message || "That means so much. I'll keep being here for you - and everyone."
    );
  }

  container.classList.add('open');
  isOpen = true;

  // Auto-close after 5 seconds
  setTimeout(close, 5000);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the tip jar modal
 */
export function open(userId: string): void {
  if (isOpen) return;

  currentUserId = userId;
  container = createModal();

  // Trigger open animation
  requestAnimationFrame(() => {
    container?.classList.add('open');
    isOpen = true;
    setupAmountListeners();
  });

  log.debug({ userId }, 'Tip jar opened');
}

/**
 * Close the tip jar modal
 */
export function close(): void {
  if (!isOpen || !container) return;

  container.classList.remove('open');
  isOpen = false;

  // Remove after animation
  setTimeout(() => {
    container?.remove();
    container = null;
  }, DURATION.MODERATE);

  log.debug('Tip jar closed');
}

/**
 * Check if tip jar is open
 */
export function isModalOpen(): boolean {
  return isOpen;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const tipJarUI = {
  open,
  close,
  isOpen: isModalOpen,
  showThankYou,
};

export default tipJarUI;
