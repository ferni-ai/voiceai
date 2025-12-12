/**
 * Seed Fund UI Component (formerly Ferni Fund)
 *
 * "Ferni doesn't have a paywall. It has a community."
 *
 * Community-funded model where contributions ("seeds") keep Ferni
 * free for everyone. When enough seeds are planted, everyone benefits.
 *
 * Design principles:
 * - Transparent fund progress (show the goal)
 * - Seeds, not transactions
 * - Community, not customers
 * - Never guilt-inducing
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { formatAmount, loadStripe } from '../services/monetization.service.js';
import { createLogger } from '../utils/logger.js';
import type { GardenStatus, PlantSeedResponse, SubscriptionResponse } from '../../../src/types/seed-fund.types.js';

const log = createLogger('FerniFundUI');

// ============================================================================
// GARDEN API
// ============================================================================

/**
 * Fetch garden status from the API
 */
async function fetchGardenStatus(): Promise<GardenStatus | null> {
  try {
    const response = await fetch('/api/garden/status');
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to fetch garden status');
    return null;
  }
}

/**
 * Plant a one-time seed contribution
 */
async function plantSeed(amount: number): Promise<PlantSeedResponse> {
  const response = await fetch('/api/garden/plant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }
  return response.json();
}

/**
 * Start a monthly subscription
 */
async function startMonthlySubscription(amount: number): Promise<SubscriptionResponse> {
  const response = await fetch('/api/garden/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }
  return response.json();
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SUGGESTED_AMOUNTS = [300, 500, 1000, 2500]; // $3, $5, $10, $25 (1 seed = $1)
const MONTHLY_GOAL_CENTS = 350000; // $3,500/month to keep Ferni free

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
.ferni-fund-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  opacity: 0;
  pointer-events: none;
  transition: opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
}

.ferni-fund-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.ferni-fund-backdrop {
  position: absolute;
  inset: 0;
  background: var(--color-bg-glass);
  backdrop-filter: blur(20px);
}

.ferni-fund-card {
  position: relative;
  background: var(--color-background-elevated, #FFFDFB);
  border-radius: var(--radius-2xl, 24px);
  padding: var(--space-8, 32px);
  max-width: 440px;
  width: calc(100% - 32px);
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-2xl);
  transform: scale(0.9);
  transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING};
}

.ferni-fund-overlay.open .ferni-fund-card {
  transform: scale(1);
}

.ferni-fund-close {
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

.ferni-fund-close:hover {
  background: var(--color-bg-secondary);
}

.ferni-fund-header {
  text-align: center;
  margin-bottom: var(--space-6, 24px);
}

.ferni-fund-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto var(--space-4, 16px);
  background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ferni-fund-icon svg {
  width: 32px;
  height: 32px;
  color: white;
}

.ferni-fund-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 8px 0;
}

.ferni-fund-subtitle {
  font-size: 0.95rem;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.6;
}

/* Progress Bar - Transparent Fund */
.ferni-fund-progress {
  margin-bottom: var(--space-6, 24px);
  text-align: center;
}

.ferni-fund-progress-header {
  margin-bottom: var(--space-2, 8px);
}

.ferni-fund-progress-current {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.ferni-fund-progress-goal {
  font-size: 1.1rem;
  color: var(--color-text-muted);
}

.ferni-fund-progress-bar-container {
  height: 12px;
  background: var(--color-bg-secondary);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: var(--space-3, 12px);
}

.ferni-fund-progress-bar {
  height: 100%;
  border-radius: 999px;
  transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
}

.ferni-fund-progress-message {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.5;
}

/* Community Stats */
.ferni-fund-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3, 12px);
  margin-bottom: var(--space-6, 24px);
  padding: var(--space-4, 16px);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-lg, 12px);
}

.ferni-fund-stat {
  text-align: center;
}

.ferni-fund-stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--persona-primary, #4a6741);
}

.ferni-fund-stat-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Amount Selection */
.ferni-fund-amounts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-3, 12px);
  margin-bottom: var(--space-4, 16px);
}

.ferni-fund-amount-btn {
  padding: var(--space-4, 16px) var(--space-2, 8px);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  background: transparent;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary);
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.ferni-fund-amount-btn:hover {
  border-color: var(--persona-primary, #4a6741);
  background: var(--color-bg-tertiary);
}

.ferni-fund-amount-btn.selected {
  border-color: var(--persona-primary, #4a6741);
  background: var(--persona-primary, #4a6741);
  color: white;
}

.ferni-fund-amount-btn .impact {
  font-size: 0.7rem;
  font-weight: 400;
  opacity: 0.8;
}

.ferni-fund-amount-btn.selected .impact {
  opacity: 1;
}

.ferni-fund-custom-input {
  width: 100%;
  padding: var(--space-4, 16px);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  font-size: 1rem;
  margin-bottom: var(--space-4, 16px);
  text-align: center;
}

.ferni-fund-custom-input:focus {
  outline: none;
  border-color: var(--persona-primary, #4a6741);
}

/* Message Input */
.ferni-fund-message-section {
  margin-bottom: var(--space-4, 16px);
}

.ferni-fund-message-label {
  display: block;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-2, 8px);
}

.ferni-fund-message-input {
  width: 100%;
  padding: var(--space-3, 12px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  font-size: 0.9rem;
  resize: none;
  font-family: inherit;
}

.ferni-fund-message-input::placeholder {
  color: var(--color-text-muted);
}

/* Recurring Toggle */
.ferni-fund-recurring {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md, 8px);
  margin-bottom: var(--space-4, 16px);
}

.ferni-fund-recurring-toggle {
  position: relative;
  width: 44px;
  height: 24px;
  background: var(--color-border);
  border-radius: 12px;
  cursor: pointer;
  transition: background ${DURATION.FAST}ms;
}

.ferni-fund-recurring-toggle.active {
  background: var(--persona-primary, #4a6741);
}

.ferni-fund-recurring-toggle::after {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
}

.ferni-fund-recurring-toggle.active::after {
  transform: translateX(20px);
}

.ferni-fund-recurring-text {
  flex: 1;
}

.ferni-fund-recurring-title {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-text-primary);
}

.ferni-fund-recurring-desc {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

/* Submit Button */
.ferni-fund-submit-btn {
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

.ferni-fund-submit-btn:hover:not(:disabled) {
  background: var(--persona-secondary, #3d5a35);
  transform: translateY(-1px);
}

.ferni-fund-submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ferni-fund-footer {
  text-align: center;
  margin-top: var(--space-4, 16px);
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

/* Impact Preview */
.ferni-fund-impact {
  text-align: center;
  padding: var(--space-4, 16px);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-lg, 12px);
  margin-bottom: var(--space-4, 16px);
}

.ferni-fund-impact-number {
  font-size: 2rem;
  font-weight: 700;
  color: var(--persona-primary, #4a6741);
}

.ferni-fund-impact-text {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}

/* Thank You State */
.ferni-fund-thank-you {
  text-align: center;
  padding: var(--space-8, 32px) 0;
}

.ferni-fund-thank-you-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto var(--space-4, 16px);
  background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fund-pulse 1s ${EASING.SPRING};
}

@keyframes fund-pulse {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); opacity: 1; }
}

.ferni-fund-thank-you-icon svg {
  width: 40px;
  height: 40px;
  color: white;
}

.ferni-fund-thank-you-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 12px 0;
}

.ferni-fund-thank-you-message {
  font-size: 1rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0 0 var(--space-4, 16px) 0;
}

.ferni-fund-impact-summary {
  padding: var(--space-4, 16px);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-lg, 12px);
}

.ferni-fund-impact-summary-title {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-2, 8px);
}

.ferni-fund-impact-summary-value {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--persona-primary, #4a6741);
}

/* Loading State */
.ferni-fund-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-8, 32px) 0;
}

.ferni-fund-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid var(--color-border);
  border-top-color: var(--persona-primary, #4a6741);
  border-radius: 50%;
  animation: fund-spin 1s linear infinite;
  margin-bottom: var(--space-4, 16px);
}

@keyframes fund-spin {
  to { transform: rotate(360deg); }
}
`;

// ============================================================================
// ICONS
// ============================================================================

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

// Seed/sprout icon for the new branding
const SEED_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>`;

const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

// ============================================================================
// COMPONENT
// ============================================================================

function initStyles(): void {
  if (document.getElementById('ferni-fund-styles')) return;

  const styleEl = document.createElement('style');
  styleEl.id = 'ferni-fund-styles';
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

async function createModal(): Promise<HTMLElement> {
  initStyles();

  // Clean up any existing modals
  document.querySelectorAll('.ferni-fund-overlay').forEach((el) => el.remove());

  // Fetch garden status from the new API
  const gardenStatus = await fetchGardenStatus();

  const overlay = document.createElement('div');
  overlay.className = 'ferni-fund-overlay';
  overlay.innerHTML = `
    <div class="ferni-fund-backdrop"></div>
    <div class="ferni-fund-card" role="dialog" aria-labelledby="ferni-fund-title">
      <button class="ferni-fund-close" aria-label="Close">${CLOSE_ICON}</button>
      <div class="ferni-fund-content">
        ${renderContributionForm(gardenStatus)}
      </div>
    </div>
  `;

  // Event listeners
  overlay.querySelector('.ferni-fund-backdrop')?.addEventListener('click', close);
  overlay.querySelector('.ferni-fund-close')?.addEventListener('click', close);
  overlay.querySelector('.ferni-fund-card')?.addEventListener('click', (e) => e.stopPropagation());

  document.body.appendChild(overlay);

  return overlay;
}

function renderContributionForm(gardenStatus: GardenStatus | null): string {
  // Use garden status data or defaults
  const currentDollars = gardenStatus?.currentMonth ?? 0;
  const goalDollars = gardenStatus?.monthlyGoal ?? MONTHLY_GOAL_CENTS / 100;
  const percentFunded = gardenStatus?.percentFunded ?? 0;
  const gardenersThisMonth = gardenStatus?.gardenersThisMonth ?? 0;
  const seedsThisMonth = gardenStatus?.seedsThisMonth ?? 0;
  const health = gardenStatus?.health ?? 'needs-water';

  const healthColors: Record<string, string> = {
    thriving: 'var(--color-semantic-success, #22c55e)',
    growing: 'var(--color-accent-warm, #f59e0b)',
    'needs-water': 'var(--color-semantic-warning, #eab308)',
  };

  const healthMessage = health === 'thriving'
    ? `Ferni is free because ${gardenersThisMonth} people planted seeds.`
    : health === 'growing'
    ? `${percentFunded}% funded. Every seed helps keep Ferni free.`
    : `The garden needs some love. Can you help?`;

  return `
    <div class="ferni-fund-header">
      <div class="ferni-fund-icon">${SEED_ICON}</div>
      <h2 class="ferni-fund-title" id="ferni-fund-title">Ferni's Garden</h2>
      <p class="ferni-fund-subtitle">
        Ferni doesn't have a paywall. It has a community.
      </p>
    </div>

    <!-- Progress Bar -->
    <div class="ferni-fund-progress">
      <div class="ferni-fund-progress-header">
        <span class="ferni-fund-progress-current">$${currentDollars.toLocaleString()}</span>
        <span class="ferni-fund-progress-goal">/ $${goalDollars.toLocaleString()}</span>
      </div>
      <div class="ferni-fund-progress-bar-container">
        <div class="ferni-fund-progress-bar" style="width: ${percentFunded}%; background: ${healthColors[health]}"></div>
      </div>
      <p class="ferni-fund-progress-message">${healthMessage}</p>
    </div>

    <div class="ferni-fund-stats">
      <div class="ferni-fund-stat">
        <div class="ferni-fund-stat-value">${gardenersThisMonth.toLocaleString()}</div>
        <div class="ferni-fund-stat-label">Gardeners</div>
      </div>
      <div class="ferni-fund-stat">
        <div class="ferni-fund-stat-value">${seedsThisMonth.toLocaleString()}</div>
        <div class="ferni-fund-stat-label">Seeds Planted</div>
      </div>
      <div class="ferni-fund-stat">
        <div class="ferni-fund-stat-value">${percentFunded}%</div>
        <div class="ferni-fund-stat-label">This Month</div>
      </div>
    </div>

    <div class="ferni-fund-amounts">
      ${SUGGESTED_AMOUNTS.map(
        (amount) => `
        <button class="ferni-fund-amount-btn" data-amount="${amount}">
          ${formatAmount(amount)}
          <span class="impact">${Math.round(amount / 100)} seeds</span>
        </button>
      `
      ).join('')}
    </div>

    <input
      type="text"
      class="ferni-fund-custom-input"
      placeholder="Or enter custom amount"
      inputmode="decimal"
    />

    <div class="ferni-fund-impact" style="display: none;">
      <div class="ferni-fund-impact-number">0</div>
      <div class="ferni-fund-impact-text">seeds you'll plant</div>
    </div>

    <div class="ferni-fund-recurring">
      <div class="ferni-fund-recurring-toggle" data-active="false"></div>
      <div class="ferni-fund-recurring-text">
        <div class="ferni-fund-recurring-title">Become a monthly Gardener</div>
        <div class="ferni-fund-recurring-desc">Plant seeds automatically each month</div>
      </div>
    </div>

    <button class="ferni-fund-submit-btn" disabled>
      Plant Seeds
    </button>

    <p class="ferni-fund-footer">
      When enough people give, everyone benefits. That's the whole point.
    </p>
  `;
}

function renderLoading(): string {
  return `
    <div class="ferni-fund-loading">
      <div class="ferni-fund-spinner"></div>
      <p>Processing your contribution...</p>
    </div>
  `;
}

function renderThankYou(impact: { conversationsSponsored: number; message: string; seedsPlanted?: number }): string {
  const seeds = impact.seedsPlanted || impact.conversationsSponsored;
  return `
    <div class="ferni-fund-thank-you">
      <div class="ferni-fund-thank-you-icon">${CHECK_ICON}</div>
      <h2 class="ferni-fund-thank-you-title">Your seed is planted</h2>
      <p class="ferni-fund-thank-you-message">
        Thanks for helping Ferni grow. You're now one of the gardeners keeping Ferni free for everyone.
      </p>
      <div class="ferni-fund-impact-summary">
        <div class="ferni-fund-impact-summary-title">Your Impact</div>
        <div class="ferni-fund-impact-summary-value">
          ${seeds} seed${seeds === 1 ? '' : 's'} planted
        </div>
      </div>
    </div>
  `;
}

function setupFormListeners(): void {
  if (!container) return;

  const buttons = container.querySelectorAll('.ferni-fund-amount-btn');
  const customInput = container.querySelector('.ferni-fund-custom-input') as HTMLInputElement;
  const submitBtn = container.querySelector('.ferni-fund-submit-btn') as HTMLButtonElement;
  const impactDiv = container.querySelector('.ferni-fund-impact') as HTMLElement;
  const impactNumber = container.querySelector('.ferni-fund-impact-number') as HTMLElement;
  const recurringToggle = container.querySelector('.ferni-fund-recurring-toggle') as HTMLElement;
  const messageInput = container.querySelector('.ferni-fund-message-input') as HTMLTextAreaElement;

  let selectedAmount = 0;
  let isRecurring = false;

  function updateImpact(amountCents: number): void {
    // 1 seed = $1 = 100 cents
    const seeds = Math.floor(amountCents / 100);
    if (amountCents > 0 && impactDiv && impactNumber) {
      impactDiv.style.display = 'block';
      impactNumber.textContent = String(seeds);
    } else if (impactDiv) {
      impactDiv.style.display = 'none';
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedAmount = parseInt(btn.getAttribute('data-amount') || '0', 10);
      customInput.value = '';
      submitBtn.disabled = false;
      updateImpact(selectedAmount);
    });
  });

  customInput.addEventListener('input', () => {
    buttons.forEach((b) => b.classList.remove('selected'));
    const value = customInput.value.replace(/[^0-9.]/g, '');
    const cents = Math.round(parseFloat(value) * 100) || 0;
    selectedAmount = cents;
    submitBtn.disabled = cents < 100;
    updateImpact(selectedAmount);
  });

  recurringToggle?.addEventListener('click', () => {
    isRecurring = !isRecurring;
    recurringToggle.classList.toggle('active', isRecurring);
    recurringToggle.setAttribute('data-active', String(isRecurring));
  });

  submitBtn.addEventListener('click', async () => {
    if (selectedAmount < 100 || !currentUserId) return;

    const message = messageInput?.value || '';
    await processContribution(selectedAmount, message, isRecurring);
  });
}

async function processContribution(
  amountCents: number,
  _message: string,
  isRecurring: boolean
): Promise<void> {
  if (!container || !currentUserId) return;

  const content = container.querySelector('.ferni-fund-content');
  if (content) {
    content.innerHTML = renderLoading();
  }

  // Convert cents to dollars (garden API uses dollars)
  const amountDollars = Math.round(amountCents / 100);

  try {
    if (isRecurring) {
      // Monthly subscription - redirect to Stripe Checkout
      const result = await startMonthlySubscription(amountDollars);

      if (!result.success || !result.checkoutUrl) {
        throw new Error(result.error || 'Failed to start subscription');
      }

      // Redirect to Stripe Checkout
      window.location.href = result.checkoutUrl;
      return;
    } else {
      // One-time payment - use Stripe.js with client secret
      const result = await plantSeed(amountDollars);

      if (!result.success || !result.clientSecret) {
        throw new Error(result.error || 'Failed to create payment');
      }

      // Load Stripe and process payment
      const stripe = await loadStripe();
      if (!stripe) {
        throw new Error('Stripe not available');
      }

      // @ts-expect-error - Stripe types
      const { error } = await stripe.confirmPayment({
        clientSecret: result.clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/garden/success`,
        },
      });

      if (error) {
        throw new Error(error.message);
      }
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Fund contribution failed');

    // Show error and reset form
    if (content) {
      const gardenStatus = await fetchGardenStatus();
      content.innerHTML = renderContributionForm(gardenStatus);
      setupFormListeners();
    }

    showToast('Payment failed. Please try again.', 'error');
  }
}

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'error' ? 'var(--color-semantic-error)' : 'var(--persona-primary)'};
    color: white;
    padding: 12px 24px;
    border-radius: 999px;
    z-index: var(--z-notification);
    font-size: 0.9rem;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the Ferni Fund modal
 */
export async function open(userId: string): Promise<void> {
  if (isOpen) return;

  currentUserId = userId;
  container = await createModal();

  // Trigger open animation
  requestAnimationFrame(() => {
    container?.classList.add('open');
    isOpen = true;
    setupFormListeners();
  });

  log.debug({ userId }, 'Ferni Fund opened');
}

/**
 * Close the Ferni Fund modal
 */
export function close(): void {
  if (!isOpen || !container) return;

  container.classList.remove('open');
  isOpen = false;

  setTimeout(() => {
    container?.remove();
    container = null;
  }, DURATION.MODERATE);

  log.debug('Ferni Fund closed');
}

/**
 * Show thank you after successful contribution
 */
export function showThankYou(impact: { conversationsSponsored: number; message: string }): void {
  if (!container) {
    createModal().then((el) => {
      container = el;
      showThankYouContent(impact);
    });
    return;
  }
  showThankYouContent(impact);
}

function showThankYouContent(impact: { conversationsSponsored: number; message: string }): void {
  if (!container) return;

  const content = container.querySelector('.ferni-fund-content');
  if (content) {
    content.innerHTML = renderThankYou(impact);
  }

  container.classList.add('open');
  isOpen = true;

  // Auto-close after 6 seconds
  setTimeout(close, 6000);
}

/**
 * Check if modal is open
 */
export function isModalOpen(): boolean {
  return isOpen;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ferniFundUI = {
  open,
  close,
  isOpen: isModalOpen,
  showThankYou,
};

export default ferniFundUI;
