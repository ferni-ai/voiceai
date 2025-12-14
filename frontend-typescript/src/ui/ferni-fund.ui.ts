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

import { t } from '../i18n/index.js';
import { DURATION } from '../config/animation-constants.js';
import { formatAmount, loadStripe } from '../services/monetization.service.js';
import { apiFetch } from '../utils/api-helpers.js';
import { createLogger } from '../utils/logger.js';
import type { GardenStatus, PlantSeedResponse, SubscriptionResponse, UserGarden } from '../types/seed-fund.types.js';
import { getStatusDisplayName } from '../types/seed-fund.types.js';
import { ferniFundStyles as styles, CLOSE_ICON, SEED_ICON, CHECK_ICON } from './ferni-fund.styles.js';
import { toast } from './toast.ui.js';

const log = createLogger('FerniFundUI');

// ============================================================================
// GARDEN API
// ============================================================================

/**
 * Fetch garden status from the API
 */
async function fetchGardenStatus(): Promise<GardenStatus | null> {
  try {
    const response = await apiFetch('/api/garden/status');
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to fetch garden status');
    return null;
  }
}

/**
 * Fetch user's garden data from the API
 */
async function fetchUserGarden(userId: string): Promise<UserGarden | null> {
  try {
    const response = await apiFetch(`/api/garden/user?userId=${userId}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to fetch user garden');
    return null;
  }
}

/**
 * Plant a one-time seed contribution
 */
async function plantSeed(amount: number): Promise<PlantSeedResponse> {
  const response = await apiFetch('/api/garden/plant', {
    method: 'POST',
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
  const response = await apiFetch('/api/garden/subscribe', {
    method: 'POST',
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
      <button class="ferni-fund-close" aria-label="${t('common.close')}">${CLOSE_ICON}</button>
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
      placeholder="${t('placeholders.customAmount')}"
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

    toast.error('Payment failed. Please try again.');
  }
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
// USER IMPACT VIEW
// ============================================================================

/**
 * Render the user impact view
 */
function renderUserImpact(
  userGarden: UserGarden | null,
  gardenStatus: GardenStatus | null
): string {
  const hasContributed = userGarden && userGarden.totalSeeds > 0;
  const statusName = userGarden ? getStatusDisplayName(userGarden.status) : 'New Gardener';
  const firstSeedDate = userGarden?.firstSeedDate
    ? new Date(userGarden.firstSeedDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  return `
    <div class="ferni-fund-impact-view">
      <button class="ferni-fund-close" aria-label="${t('common.close')}">${CLOSE_ICON}</button>

      <div class="ferni-fund-header">
        <h2>Your Garden Impact</h2>
        <p class="ferni-fund-subtitle">Thank you for keeping Ferni free</p>
      </div>

      ${hasContributed ? `
        <div class="ferni-fund-user-stats">
          <div class="ferni-fund-stat ferni-fund-stat--primary">
            <div class="ferni-fund-stat-value">${userGarden.totalSeeds}</div>
            <div class="ferni-fund-stat-label">Seeds Planted</div>
          </div>

          <div class="ferni-fund-stat">
            <div class="ferni-fund-stat-value ferni-fund-stat-value--status">${statusName}</div>
            <div class="ferni-fund-stat-label">Your Status</div>
          </div>

          ${userGarden.isMonthlyGardener ? `
            <div class="ferni-fund-stat">
              <div class="ferni-fund-stat-value">$${userGarden.monthlyAmount || 5}/mo</div>
              <div class="ferni-fund-stat-label">Monthly Support</div>
            </div>
          ` : ''}
        </div>

        ${firstSeedDate ? `
          <p class="ferni-fund-member-since">Growing with Ferni since ${firstSeedDate}</p>
        ` : ''}

        ${gardenStatus ? `
          <div class="ferni-fund-community">
            <h3>The Garden This Month</h3>
            <div class="ferni-fund-progress-container">
              <div class="ferni-fund-progress">
                <div class="ferni-fund-progress-bar" style="width: ${Math.min(gardenStatus.percentFunded, 100)}%"></div>
              </div>
              <div class="ferni-fund-progress-text">
                ${gardenStatus.percentFunded}% funded by ${gardenStatus.gardenersThisMonth} gardeners
              </div>
            </div>
          </div>
        ` : ''}

        <div class="ferni-fund-actions">
          <button class="ferni-fund-action-btn ferni-fund-action-btn--secondary" data-action="plant-more">
            ${SEED_ICON}
            <span>Plant More Seeds</span>
          </button>
        </div>
      ` : `
        <div class="ferni-fund-welcome">
          <div class="ferni-fund-welcome-icon">${SEED_ICON}</div>
          <h3>Start Your Garden</h3>
          <p>Ferni stays free because of gardeners like you. Plant your first seed and join a community keeping AI accessible for everyone.</p>

          ${gardenStatus ? `
            <div class="ferni-fund-community">
              <div class="ferni-fund-progress-container">
                <div class="ferni-fund-progress">
                  <div class="ferni-fund-progress-bar" style="width: ${Math.min(gardenStatus.percentFunded, 100)}%"></div>
                </div>
                <div class="ferni-fund-progress-text">
                  ${gardenStatus.gardenersThisMonth} gardeners have helped this month
                </div>
              </div>
            </div>
          ` : ''}

          <div class="ferni-fund-actions">
            <button class="ferni-fund-action-btn ferni-fund-action-btn--primary" data-action="plant-first">
              ${SEED_ICON}
              <span>Plant Your First Seed</span>
            </button>
          </div>
        </div>
      `}
    </div>
  `;
}

/**
 * Show user impact modal
 */
export async function showUserImpact(userId: string): Promise<void> {
  initStyles();

  if (!container) {
    container = await createModal();
  }

  currentUserId = userId;

  // Show loading state
  const content = container.querySelector('.ferni-fund-content');
  if (content) {
    content.innerHTML = `
      <div class="ferni-fund-loading">
        <div class="ferni-fund-spinner"></div>
        <p>Loading your garden...</p>
      </div>
    `;
  }

  container.classList.add('open');
  isOpen = true;

  // Fetch data in parallel
  const [userGarden, gardenStatus] = await Promise.all([
    fetchUserGarden(userId),
    fetchGardenStatus(),
  ]);

  // Render the impact view
  if (content) {
    content.innerHTML = renderUserImpact(userGarden, gardenStatus);

    // Attach event listeners
    const plantMoreBtn = content.querySelector('[data-action="plant-more"]');
    const plantFirstBtn = content.querySelector('[data-action="plant-first"]');
    const closeBtn = content.querySelector('.ferni-fund-close');

    if (plantMoreBtn) {
      plantMoreBtn.addEventListener('click', () => {
        // Switch to the main contribution view
        void open(userId);
      });
    }

    if (plantFirstBtn) {
      plantFirstBtn.addEventListener('click', () => {
        void open(userId);
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', close);
    }
  }

  log.debug({ userId }, 'User impact view shown');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ferniFundUI = {
  open,
  close,
  isOpen: isModalOpen,
  showThankYou,
  showUserImpact,
};

export default ferniFundUI;
