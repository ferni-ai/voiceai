/**
 * Payment Completion Pages
 *
 * Landing pages for Stripe redirect after successful payments:
 * - /fund/complete - Ferni Fund contribution
 * - /value/complete - Value capture contribution
 * - /tip/complete - Tip jar contribution
 *
 * These pages show a warm thank-you and auto-redirect back to the app.
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('PaymentComplete');

// ============================================================================
// STYLES
// ============================================================================

const styles = `
.payment-complete-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #FFFDFB 0%, #f5f2ed 100%);
  padding: 20px;
  font-family: var(--font-body, 'Inter', system-ui, sans-serif);
}

.payment-complete-card {
  background: white;
  border-radius: 24px;
  padding: 48px;
  max-width: 480px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
  animation: payment-card-in 0.6s ease-out;
}

@keyframes payment-card-in {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.payment-complete-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 24px;
  background: linear-gradient(135deg, #4a6741, #3d5a35);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: payment-icon-in 0.8s ease-out 0.2s backwards;
}

@keyframes payment-icon-in {
  from {
    opacity: 0;
    transform: scale(0);
  }
  50% {
    transform: scale(1.1);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.payment-complete-icon svg {
  width: 40px;
  height: 40px;
  color: white;
}

.payment-complete-title {
  font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.75rem;
  font-weight: 700;
  color: #2C2520;
  margin: 0 0 12px 0;
  animation: payment-text-in 0.6s ease-out 0.3s backwards;
}

@keyframes payment-text-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.payment-complete-message {
  font-size: 1.1rem;
  color: #5a4a42;
  line-height: 1.6;
  margin: 0 0 24px 0;
  animation: payment-text-in 0.6s ease-out 0.4s backwards;
}

.payment-complete-impact {
  background: rgba(74, 103, 65, 0.08);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
  animation: payment-text-in 0.6s ease-out 0.5s backwards;
}

.payment-complete-impact-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #8a7a72;
  margin-bottom: 8px;
}

.payment-complete-impact-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #4a6741;
}

.payment-complete-redirect {
  font-size: 0.9rem;
  color: #8a7a72;
  margin-bottom: 16px;
  animation: payment-text-in 0.6s ease-out 0.6s backwards;
}

.payment-complete-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 32px;
  background: #4a6741;
  color: white;
  border: none;
  border-radius: 999px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.2s ease;
  animation: payment-text-in 0.6s ease-out 0.7s backwards;
}

.payment-complete-btn:hover {
  background: #3d5a35;
  transform: translateY(-2px);
}

/* Confetti */
.payment-confetti {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.confetti {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #4a6741;
  animation: confetti-fall 3s ease-out forwards;
}

@keyframes confetti-fall {
  0% {
    opacity: 1;
    transform: translateY(-100px) rotate(0deg);
  }
  100% {
    opacity: 0;
    transform: translateY(100vh) rotate(720deg);
  }
}

/* Loading state */
.payment-complete-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.payment-complete-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid #e8e2da;
  border-top-color: #4a6741;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Error state */
.payment-complete-error {
  color: #e74c3c;
}

.payment-complete-error .payment-complete-icon {
  background: #e74c3c;
}
`;

// ============================================================================
// ICONS
// ============================================================================

const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

const HEART_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;

const STAR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;

const ERROR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;

// ============================================================================
// PAGE CONFIGS
// ============================================================================

interface PageConfig {
  icon: string;
  title: string;
  message: string;
  impactLabel?: string;
  getImpact?: (params: URLSearchParams) => string | null;
}

const PAGE_CONFIGS: Record<string, PageConfig> = {
  fund: {
    icon: HEART_ICON,
    title: "You're Amazing",
    message:
      'Your generosity is already making a difference. Someone who needs support will be able to talk to Ferni because of you.',
    impactLabel: 'Your Impact',
    getImpact: (params) => {
      const amount = params.get('amount');
      if (amount) {
        const cents = parseInt(amount, 10);
        const conversations = Math.floor(cents / 50); // $0.50 per conversation
        return `${conversations} conversation${conversations === 1 ? '' : 's'} sponsored`;
      }
      return null;
    },
  },
  value: {
    icon: STAR_ICON,
    title: "You're Incredible",
    message:
      "You didn't just achieve something great—you chose to share it. That's the kind of generosity that changes the world.",
    impactLabel: 'Your Contribution',
    getImpact: (params) => {
      const amount = params.get('amount');
      if (amount) {
        const cents = parseInt(amount, 10);
        return `$${(cents / 100).toFixed(2)}`;
      }
      return null;
    },
  },
  tip: {
    icon: CHECK_ICON,
    title: 'Thank You',
    message:
      "Your support means everything. It's people like you who make Ferni possible for everyone.",
    impactLabel: 'Your Tip',
    getImpact: (params) => {
      const amount = params.get('amount');
      if (amount) {
        const cents = parseInt(amount, 10);
        return `$${(cents / 100).toFixed(2)}`;
      }
      return null;
    },
  },
};

// ============================================================================
// RENDER
// ============================================================================

function createConfetti(): string {
  const colors = ['#4a6741', '#3d5a35', '#6b8e23', '#87ae73', '#c4856a', '#f4a460'];
  const pieces: string[] = [];

  for (let i = 0; i < 50; i++) {
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left = Math.random() * 100;
    const delay = Math.random() * 0.5;
    const size = 5 + Math.random() * 10;

    pieces.push(`
      <div class="confetti" style="
        left: ${left}%;
        background: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        animation-delay: ${delay}s;
      "></div>
    `);
  }

  return pieces.join('');
}

function renderSuccessPage(type: string, params: URLSearchParams): string {
  // tip is guaranteed to exist as fallback
  const config = (PAGE_CONFIGS[type] ?? PAGE_CONFIGS.tip);
  const impact = config.getImpact?.(params);

  return `
    <div class="payment-complete-page">
      <div class="payment-confetti">${createConfetti()}</div>
      <div class="payment-complete-card">
        <div class="payment-complete-icon">${config.icon}</div>
        <h1 class="payment-complete-title">${config.title}</h1>
        <p class="payment-complete-message">${config.message}</p>
        
        ${
          impact
            ? `
          <div class="payment-complete-impact">
            <div class="payment-complete-impact-label">${config.impactLabel}</div>
            <div class="payment-complete-impact-value">${impact}</div>
          </div>
        `
            : ''
        }
        
        <p class="payment-complete-redirect">Redirecting you back to Ferni...</p>
        <a href="/" class="payment-complete-btn">
          Return to Ferni
        </a>
      </div>
    </div>
  `;
}

function renderErrorPage(message?: string): string {
  return `
    <div class="payment-complete-page">
      <div class="payment-complete-card payment-complete-error">
        <div class="payment-complete-icon">${ERROR_ICON}</div>
        <h1 class="payment-complete-title">Something Went Wrong</h1>
        <p class="payment-complete-message">
          ${message || "We couldn't verify your payment. Don't worry—if you were charged, we'll sort it out."}
        </p>
        <a href="/" class="payment-complete-btn">
          Return to Ferni
        </a>
      </div>
    </div>
  `;
}

function renderLoadingPage(): string {
  return `
    <div class="payment-complete-page">
      <div class="payment-complete-card">
        <div class="payment-complete-loading">
          <div class="payment-complete-spinner"></div>
          <p>Confirming your payment...</p>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// INIT
// ============================================================================

/**
 * Initialize payment completion page
 */
export async function initPaymentCompletePage(): Promise<void> {
  // Add styles
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  // Get page type from path
  const path = window.location.pathname;
  const type = path.includes('/fund/')
    ? 'fund'
    : path.includes('/value/')
      ? 'value'
      : path.includes('/tip/')
        ? 'tip'
        : 'tip';

  const params = new URLSearchParams(window.location.search);
  const paymentIntent = params.get('payment_intent');
  const redirectStatus = params.get('redirect_status');

  // Find or create root element
  let root = document.getElementById('payment-complete-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'payment-complete-root';
    document.body.appendChild(root);
  }

  // Show loading initially
  root.innerHTML = renderLoadingPage();

  // Check payment status
  if (redirectStatus === 'succeeded') {
    // Payment succeeded - show success page
    root.innerHTML = renderSuccessPage(type, params);

    // Auto-redirect after 5 seconds
    setTimeout(() => {
      window.location.href = '/';
    }, 5000);

    log.info({ type, paymentIntent }, 'Payment completion page shown');
  } else if (redirectStatus === 'failed' || redirectStatus === 'requires_payment_method') {
    // Payment failed
    root.innerHTML = renderErrorPage(
      'Your payment was declined. Please try again with a different payment method.'
    );
    log.warn({ type, redirectStatus }, 'Payment failed');
  } else if (paymentIntent) {
    // Verify payment status via API
    try {
      const response = await fetch(
        `/api/monetization/${type}/verify?payment_intent=${paymentIntent}`
      );
      const result = await response.json();

      if (result.success) {
        root.innerHTML = renderSuccessPage(type, params);
        setTimeout(() => {
          window.location.href = '/';
        }, 5000);
      } else {
        root.innerHTML = renderErrorPage(result.message);
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to verify payment');
      // Assume success if we can't verify - user will see their account status
      root.innerHTML = renderSuccessPage(type, params);
      setTimeout(() => {
        window.location.href = '/';
      }, 5000);
    }
  } else {
    // No payment info - show success anyway (they navigated here directly)
    root.innerHTML = renderSuccessPage(type, params);
    setTimeout(() => {
      window.location.href = '/';
    }, 5000);
  }
}

/**
 * Check if current path is a payment completion page
 */
export function isPaymentCompletePage(): boolean {
  const path = window.location.pathname;
  return (
    path.includes('/fund/complete') ||
    path.includes('/value/complete') ||
    path.includes('/tip/complete')
  );
}
